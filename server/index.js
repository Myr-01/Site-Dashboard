import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

import { initDb, backfillMultiUser, dbRun, dbGet, dbAll } from './db.js';
import { getCurrentCode, verifyCode, isLockedOut, recordFailedAttempt, clearFailedAttempts } from './sensitiveCode.js';
import { isSafeFilename, createRequireAuth, verifyPassword, hashPassword, signAdminToken, signUserToken, verifyToken, isValidAdminToken, normalizeAlertDays } from './utils.js';
import { getAllSitesWithLatestCheck, startMonitoring } from './monitor.js';
import { sendTestEmail } from './mailer.js';
import { createBackup, listBackups, restoreBackup, deleteBackup, startAutoBackup, BACKUPS_PATH } from './backup.js';
import { analyzeBackup } from './backup-analyzer.js';
import { generateSiteReportPDF } from './pdfReport.js';
import { initPush, isPushEnabled, sendPushNotification } from './push.js';
import { initOffsiteBackup } from './offsiteBackup.js';
import { DATA_DIR } from './db.js';

// Admin şifrəsi artıq plain text saxlanılmır — yalnız bcrypt hash-i.
// Hash yaratmaq üçün: node scripts/hash-password.js
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-dəyiş-bunu-production-da';

if (!ADMIN_PASSWORD_HASH) {
  console.warn('XƏBƏRDARLIQ: ADMIN_PASSWORD_HASH təyin edilməyib — admin girişi mümkün olmayacaq. `node scripts/hash-password.js` işlədib .env-ə yaz.');
}
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  console.warn('XƏBƏRDARLIQ: JWT_SECRET təyin edilməyib — production-da mütləq təsadüfi uzun bir dəyər təyin et.');
}

// Brute-force qorunması — login cəhdlərini limitlə
const authLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 dəqiqə
  max: 10,
  message: { error: 'Çox sayda cəhd. Bir az sonra yenidən cəhd edin.' },
});

// Frontend origin: Vercel deploy URL və ya localhost
const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:3001',
  ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : []),
];

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      // Vercel preview URL-lərini də qəbul et (*.vercel.app)
      if (!origin || ALLOWED_ORIGINS.includes(origin) || /\.vercel\.app$/.test(origin)) {
        callback(null, true);
      } else {
        callback(new Error('CORS: Bu origin-ə icazə yoxdur'));
      }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
  },
});

// Müvəqqəti upload qovluqları DATA_DIR altındadır (nisbi yol deyil).
// Səbəb: hədəf qovluq da DATA_DIR-dədir və `fs.renameSync` yalnız EYNİ faylsistem
// daxilində işləyir. Fly.io/Docker kimi mühitlərdə konteyner diski ilə mount olunmuş
// volume ayrı faylsistemlərdir — nisbi yol saxlanılsa rename `EXDEV` xətası verər.
const TMP_UPLOAD_DIR = path.join(DATA_DIR, 'tmp', 'uploads');
const TMP_SITE_BACKUP_DIR = path.join(DATA_DIR, 'tmp', 'site-backups');
for (const dir of [TMP_UPLOAD_DIR, TMP_SITE_BACKUP_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const upload = multer({ dest: TMP_UPLOAD_DIR, limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB
const siteBackupUpload = multer({
  dest: TMP_SITE_BACKUP_DIR,
  limits: { fileSize: 500 * 1024 * 1024 }, // Max 500MB
});

/**
 * Faylı köçür. Fərqli faylsistemlər arasında `rename` EXDEV verir —
 * o halda kopyala + sil ilə davam et.
 */
function moveFileSync(from, to) {
  try {
    fs.renameSync(from, to);
  } catch (err) {
    if (err.code !== 'EXDEV') throw err;
    fs.copyFileSync(from, to);
    fs.unlinkSync(from);
  }
}

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin) || /\.vercel\.app$/.test(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS: Bu origin-ə icazə yoxdur'));
    }
  },
  credentials: true,
}));
app.use(helmet({
  contentSecurityPolicy: false, // React app üçün CSP ayrıca konfiqurasiya tələb edir
}));
app.use(express.json());

// Health check — Fly.io/Railway kimi platformalar bunu yoxlayıb konteyneri
// yenidən başlatmağa qərar verir. Auth tələb etmir və yüngül olmalıdır:
// `/api/sites` bütün saytlar üzrə N+1 sorğu edir, health üçün uyğun deyil.
app.get('/api/health', async (req, res) => {
  try {
    await dbGet('SELECT 1 AS ok');
    res.json({
      status: 'ok',
      uptime_seconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(503).json({ status: 'error', error: err.message });
  }
});

// Public status page — React-dən tamamilə ayrı statik HTML.
// Statik client servisindən ƏVVƏL elan olunur ki, sonda gələn catch-all
// route-a düşməsin. Auth tələb etmir.
app.get('/status', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'status.html'));
});

// Serve static files (production build)
const clientDistPath = path.join(__dirname, '../client/dist');
if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
  console.log('Serving client from:', clientDistPath);
}

// === AUTH ===

import { 
  generateTOTPSecret, 
  generateQRCode, 
  enable2FA, 
  disable2FA, 
  get2FAStatus, 
  verify2FA,
  is2FAEnabled 
} from './totp.js';

// Sadə email format yoxlaması
function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

// === QEYDİYYAT ===
// Yeni istifadəçi qeydiyyatı — email + password. Uğurlu olduqda avtomatik login (JWT).
app.post('/api/auth/register', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Düzgün email ünvanı daxil edin' });
    }
    if (typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: 'Şifrə ən azı 8 simvol olmalıdır' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Unikallıq yoxlaması
    const existing = await dbGet('SELECT id FROM users WHERE email = ?', [normalizedEmail]);
    if (existing) {
      return res.status(409).json({ error: 'Bu email artıq qeydiyyatdan keçib' });
    }

    const passwordHash = await hashPassword(password);
    // username köhnə schema-da NOT NULL/UNIQUE ola bilər — email-i username kimi də veririk
    const result = await dbRun(
      "INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, 'user')",
      [normalizedEmail, normalizedEmail, passwordHash]
    );

    const user = { id: result.lastID, email: normalizedEmail, role: 'user' };
    const token = signUserToken(user, JWT_SECRET);
    res.status(201).json({ success: true, token, user: { id: user.id, email: user.email, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === GİRİŞ ===
// Email + password ilə giriş. Hər user-ə qarşı yoxlanılır (təkcə admin yox).
app.post('/api/auth/login', authLimiter, async (req, res) => {
  try {
    const { email, password, totp_token } = req.body;

    if (!isValidEmail(email) || typeof password !== 'string' || !password) {
      return res.status(400).json({ error: 'Email və şifrə tələb olunur' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await dbGet(
      'SELECT id, email, username, password_hash, role FROM users WHERE email = ?',
      [normalizedEmail]
    );

    // Timing-safe olmasa da, mesajı ümumi saxlayırıq ki user enumeration olmasın
    if (!user || !user.password_hash) {
      return res.status(401).json({ error: 'Email və ya şifrə yanlışdır' });
    }

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Email və ya şifrə yanlışdır' });
    }

    // 2FA (yalnız username-i olan admin user üçün konfiqurasiya olunub)
    if (user.username) {
      const needs2FA = await is2FAEnabled(user.username);
      if (needs2FA) {
        if (!totp_token) {
          return res.json({ success: false, requires2FA: true });
        }
        const totpValid = await verify2FA(user.username, totp_token);
        if (!totpValid) {
          return res.status(401).json({ error: '2FA kod yanlışdır' });
        }
      }
    }

    const token = signUserToken(user, JWT_SECRET);
    res.json({ success: true, token, user: { id: user.id, email: user.email, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === QONAQ (GUEST) GİRİŞİ ===
// Hesab siyahısı — qonaq hansı istifadəçinin saytlarını görmək istədiyini seçir.
// Public (auth tələb etmir), amma yalnız təhlükəsiz sahələr: id + label. Email tam göstərilmir.
app.get('/api/auth/accounts', async (req, res) => {
  try {
    // Yalnız ən azı bir saytı olan hesabları göstər (boş hesablar qonaq üçün mənasızdır)
    const users = await dbAll(`
      SELECT u.id, u.email, u.role, COUNT(s.id) AS site_count
      FROM users u
      LEFT JOIN sites s ON s.user_id = u.id
      GROUP BY u.id
      HAVING site_count > 0
      ORDER BY u.role = 'admin' DESC, u.email
    `);
    // Email-i qismən maskala (privacy) — qonaq tam email görməsin
    const accounts = users.map(u => {
      let label = u.email || 'İstifadəçi';
      if (u.email && u.email.includes('@')) {
        const [local, domain] = u.email.split('@');
        const maskedLocal = local.length <= 2 ? local[0] + '•' : local.slice(0, 2) + '•••';
        label = `${maskedLocal}@${domain}`;
      }
      return { id: u.id, label, is_admin: u.role === 'admin', site_count: u.site_count };
    });
    res.json(accounts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Qonaq girişi — seçilmiş istifadəçinin saytlarını read-only görmək üçün token verir
app.post('/api/auth/guest', authLimiter, async (req, res) => {
  try {
    const targetId = parseInt(req.body?.user_id, 10);
    if (!Number.isInteger(targetId)) {
      return res.status(400).json({ error: 'Hesab seçilməlidir' });
    }
    const target = await dbGet('SELECT id FROM users WHERE id = ?', [targetId]);
    if (!target) {
      return res.status(404).json({ error: 'Hesab tapılmadı' });
    }
    // Qonaq token: role='guest', guest_target=seçilmiş user. Öz user_id-si yoxdur.
    const token = signUserToken(
      { id: null, role: 'guest', email: null, guest_target: targetId },
      JWT_SECRET,
      '1d' // qonaq sessiyası qısa müddətli
    );
    res.json({ success: true, token, user: { id: null, email: null, role: 'guest' } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === KÖHNƏ ADMIN GİRİŞİ (geriyə uyğunluq) ===
// Yalnız password ilə admin girişi. Multi-user-ə keçidə qədər saxlanılır.
app.post('/api/auth/verify', authLimiter, async (req, res) => {
  try {
    const { password, totp_token } = req.body;
    if (!ADMIN_PASSWORD_HASH) {
      return res.status(500).json({ error: 'Server konfiqurasiyası tamamlanmayıb (ADMIN_PASSWORD_HASH yoxdur)' });
    }

    const valid = await verifyPassword(password, ADMIN_PASSWORD_HASH);
    if (!valid) {
      return res.status(401).json({ error: 'Şifrə yanlışdır' });
    }

    // 2FA enabled-dirsə, TOTP token-i yoxla
    const needs2FA = await is2FAEnabled('admin');
    if (needs2FA) {
      if (!totp_token) {
        return res.json({ success: false, requires2FA: true });
      }

      const totpValid = await verify2FA('admin', totp_token);
      if (!totpValid) {
        return res.status(401).json({ error: '2FA kod yanlışdır' });
      }
    }

    // Admin user-i tap və user token ver (user_id ilə)
    const adminUser = await dbGet("SELECT id, email, role FROM users WHERE username = 'admin'");
    const token = adminUser
      ? signUserToken({ id: adminUser.id, email: adminUser.email, role: adminUser.role || 'admin' }, JWT_SECRET)
      : signAdminToken(JWT_SECRET);
    res.json({ success: true, token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin əməliyyatları üçün middleware — JWT sessiya token-i yoxlanılır
const requireAuth = createRequireAuth(JWT_SECRET);

/**
 * Həssas əməliyyatlar (sayt əlavə etmə, credential-lara baxış) üçün rotating passcode yoxlaması.
 * Admin (role='admin') tam istisnadır — passcode tələb olunmur.
 * Non-admin: `x-sensitive-code` header (və ya body.code) cari passcode ilə uyğun olmalıdır.
 * requireAuth-dan SONRA istifadə edilməlidir (req.user lazımdır).
 */
async function requireSensitiveAccess(req, res, next) {
  try {
    if (req.user?.role === 'admin') return next();

    const userId = req.user?.id ?? 'anon';
    if (isLockedOut(userId)) {
      return res.status(429).json({ error: 'Çox sayda yanlış kod. 10 dəqiqə sonra yenidən cəhd edin.' });
    }

    const candidate = req.headers['x-sensitive-code'] || req.body?.code || req.query?.code;
    const ok = await verifyCode(candidate);
    if (!ok) {
      recordFailedAttempt(userId);
      return res.status(403).json({ error: 'Giriş kodu yanlışdır', requiresCode: true });
    }

    clearFailedAttempts(userId);
    next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// Cari istifadəçi məlumatı (JWT-dən)
app.get('/api/auth/me', requireAuth, async (req, res) => {
  try {
    // Qonaq — DB user-i yoxdur, guest_target daşıyır
    if (req.user.role === 'guest') {
      return res.json({ id: null, email: null, role: 'guest', guest_target: req.user.guestTarget });
    }
    if (req.user.id) {
      const user = await dbGet('SELECT id, email, username, role, created_at FROM users WHERE id = ?', [req.user.id]);
      if (user) {
        return res.json({ id: user.id, email: user.email, username: user.username, role: user.role, created_at: user.created_at });
      }
    }
    // Köhnə admin token (user_id yox)
    res.json({ id: null, email: null, role: req.user.role || 'admin' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Logout — JWT stateless olduğu üçün server tərəfdə iş yoxdur; klient token-i silir.
app.post('/api/auth/logout', (req, res) => {
  res.json({ success: true });
});

// === ROTATING PASSCODE (admin-only) ===
// Cari həssas-əməliyyat kodunu qaytar. Yalnız admin görə bilər.
app.get('/api/admin/sensitive-code', requireAuth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Yalnız admin üçün' });
    }
    const { code, generated_at, expires_at } = await getCurrentCode();
    res.json({ code, generated_at, expires_at });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Opsional auth yoxlaması (401 qaytarmır) — cavabı admin/qonaq üçün fərqləndirmək lazım olanda
const hasValidAdminToken = (req) => isValidAdminToken(req.headers['x-admin-token'], JWT_SECRET);

/**
 * Sayt datası dəyişdikdən sonra qoşulu klientlərə "yenilə" siqnalı göndər.
 *
 * Multi-user: artıq bütün saytları broadcast ETMİRİK (data leak olardı).
 * Sadəcə `sites-changed` siqnalı göndəririk — hər klient öz auth-lu
 * `GET /api/sites` sorğusunu təkrar edib yalnız öz saytlarını alır.
 */
function emitSitesUpdated() {
  try {
    io.emit('sites-changed');
  } catch (err) {
    console.error('sites-changed yayımlanmadı:', err.message);
  }
}

/**
 * Sayt-ın verilmiş user-ə aid olub-olmadığını yoxla.
 * Admin (role='admin') istənilən sayta çıxış əldə edir.
 * Sahibi başqasıdırsa null qaytarır (çağıran 404 verməlidir — mövcudluğu leak etməmək üçün).
 * @returns {Promise<object|null>} sayt sətri (bütün sütunlar) və ya null
 */
async function getOwnedSite(siteId, user) {
  const site = await dbGet('SELECT * FROM sites WHERE id = ?', [siteId]);
  if (!site) return null;
  if (user?.role === 'admin') return site;
  // Qonaq: yalnız seçdiyi hesabın saytlarını OXUYA bilər (write ayrıca bloklanır)
  if (user?.role === 'guest') {
    return site.user_id != null && site.user_id === user.guestTarget ? site : null;
  }
  if (site.user_id != null && site.user_id === user?.id) return site;
  // Sahibsiz (köhnə) saytlar yalnız admin üçün — normal user görməməlidir
  return null;
}

// Qonaq üçün icazə verilən "təhlükəsiz" sayt sahələri (həssas datanı çıxarır)
function toGuestSafeSite(site) {
  const lc = site.latestCheck || {};
  return {
    id: site.id,
    name: site.name,
    url: site.url,
    group_name: site.group_name,
    color_tag: site.color_tag,
    uptime: site.uptime,
    maintenance_mode: site.maintenance_mode,
    // Domain bitmə vaxtı qonaq üçün icazəlidir
    manual_domain_expiry: site.manual_domain_expiry,
    latestCheck: {
      status: lc.status ?? null,
      response_time: lc.response_time ?? null,
      ssl_valid: lc.ssl_valid ?? null,
      ssl_days_remaining: lc.ssl_days_remaining ?? null,
      ssl_expiry: lc.ssl_expiry ?? null,
      domain_expiry: lc.domain_expiry ?? null,
      domain_days_remaining: lc.domain_days_remaining ?? null,
      checked_at: lc.checked_at ?? null,
    },
  };
}

// Guest write əməliyyatlarını bloklayan middleware (403). requireAuth-dan sonra istifadə et.
function blockGuestWrite(req, res, next) {
  if (req.user?.role === 'guest') {
    return res.status(403).json({ error: 'Qonaq rejimində bu əməliyyat mümkün deyil' });
  }
  next();
}

// Fayl endirmə endpoint-ləri üçün: brauzerin `window.open`-i custom header göndərə bilmir,
// ona görə token query parametrindən də qəbul edilir.
// Kompromis: query-dəki token proxy/server log-larında görünə bilər — qısamüddətli JWT üçün
// adətən qəbul edilən bir tradeoff-dur, amma header variantı üstünlük təşkil edir.
function requireAuthFlexible(req, res, next) {
  const token = req.headers['x-admin-token'] || req.query.token;
  const payload = verifyToken(token, JWT_SECRET);
  if (!payload) {
    return res.status(401).json({ error: 'İcazə yoxdur və ya sessiya bitib' });
  }
  req.user = {
    id: payload.user_id ?? null,
    role: payload.role || 'user',
    email: payload.email ?? null,
    guestTarget: payload.guest_target ?? null,
  };
  next();
}

// Get all sites with latest check — role-a görə scope
app.get('/api/sites', requireAuth, async (req, res) => {
  try {
    // Qonaq: seçdiyi hesabın saytları, YALNIZ təhlükəsiz sahələr
    if (req.user.role === 'guest') {
      const sites = await getAllSitesWithLatestCheck(req.user.guestTarget);
      return res.json(sites.map(toGuestSafeSite));
    }
    // Admin: bütün saytlar. Normal user: yalnız öz saytları.
    const sites = req.user.role === 'admin'
      ? await getAllSitesWithLatestCheck()
      : await getAllSitesWithLatestCheck(req.user.id);
    res.json(sites);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add a site — sahibi cari user olur (rotating passcode yoxlaması aşağıda middleware ilə)
app.post('/api/sites', requireAuth, blockGuestWrite, requireSensitiveAccess, async (req, res) => {
  try {
    const { name, url, color_tag, alert_days } = req.body;
    if (!name || !url) {
      return res.status(400).json({ error: 'Name and URL are required' });
    }
    const result = await dbRun(
      'INSERT INTO sites (name, url, color_tag, alert_days, user_id) VALUES (?, ?, ?, ?, ?)',
      [name, url, color_tag || null, normalizeAlertDays(alert_days), req.user.id]
    );
    const site = await dbGet('SELECT * FROM sites WHERE id = ?', [result.lastID]);
    res.status(201).json(site);
    emitSitesUpdated();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a site — yalnız sahibi (və ya admin)
app.delete('/api/sites/:id', requireAuth, blockGuestWrite, async (req, res) => {
  try {
    const { id } = req.params;
    const owned = await getOwnedSite(id, req.user);
    if (!owned) return res.status(404).json({ error: 'Sayt tapılmadı' });
    await dbRun('DELETE FROM checks WHERE site_id = ?', [id]);
    await dbRun('DELETE FROM sites WHERE id = ?', [id]);
    res.json({ success: true });
    emitSitesUpdated();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update manual dates for a site
app.post('/api/sites/:id/manual-dates', requireAuth, blockGuestWrite, async (req, res) => {
  try {
    const { id } = req.params;
    const owned = await getOwnedSite(id, req.user);
    if (!owned) return res.status(404).json({ error: 'Sayt tapılmadı' });
    const { manual_domain_registrar, manual_domain_expiry, manual_hosting_expiry } = req.body;
    await dbRun(
      'UPDATE sites SET manual_domain_registrar = ?, manual_domain_expiry = ?, manual_hosting_expiry = ? WHERE id = ?',
      [manual_domain_registrar, manual_domain_expiry, manual_hosting_expiry, id]
    );
    res.json({ success: true });
    emitSitesUpdated();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Baxım rejimini aç/bağla
app.patch('/api/sites/:id/maintenance', requireAuth, blockGuestWrite, async (req, res) => {
  try {
    const { id } = req.params;
    const owned = await getOwnedSite(id, req.user);
    if (!owned) return res.status(404).json({ error: 'Sayt tapılmadı' });
    const { maintenance_mode } = req.body;
    await dbRun('UPDATE sites SET maintenance_mode = ? WHERE id = ?', [maintenance_mode ? 1 : 0, id]);
    res.json({ success: true, maintenance_mode: !!maintenance_mode });
    emitSitesUpdated();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Yoxlama intervalını dəyiş (dəqiqə)
app.patch('/api/sites/:id/interval', requireAuth, blockGuestWrite, async (req, res) => {
  try {
    const { id } = req.params;
    const owned = await getOwnedSite(id, req.user);
    if (!owned) return res.status(404).json({ error: 'Sayt tapılmadı' });
    const minutes = Number(req.body.check_interval_minutes);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
      return res.status(400).json({ error: 'İnterval 1 ilə 1440 dəqiqə arasında tam ədəd olmalıdır' });
    }
    await dbRun('UPDATE sites SET check_interval_minutes = ? WHERE id = ?', [minutes, id]);
    res.json({ success: true, check_interval_minutes: minutes });
    emitSitesUpdated();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Hadisə üçün postmortem qeydi — incident-in aid olduğu sayt cari user-ə aid olmalıdır
app.patch('/api/incidents/:id/note', requireAuth, blockGuestWrite, async (req, res) => {
  try {
    const { id } = req.params;
    // Incident-in sahibliyini yoxla (sites.user_id üzərindən)
    const incident = await dbGet(
      `SELECT i.id, s.user_id FROM incidents i JOIN sites s ON i.site_id = s.id WHERE i.id = ?`,
      [id]
    );
    if (!incident) return res.status(404).json({ error: 'Hadisə tapılmadı' });
    if (req.user.role !== 'admin' && incident.user_id !== req.user.id) {
      return res.status(404).json({ error: 'Hadisə tapılmadı' });
    }
    const { resolution_note } = req.body;
    const note = typeof resolution_note === 'string' && resolution_note.trim()
      ? resolution_note.trim().slice(0, 2000)
      : null;
    await dbRun('UPDATE incidents SET resolution_note = ? WHERE id = ?', [note, id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Göndərilmiş bildirişlərin tarixçəsi — yalnız cari user-in saytları (admin hamısını görür; guest bloklanır)
app.get('/api/notifications', requireAuth, blockGuestWrite, async (req, res) => {
  try {
    const { site_id } = req.query;
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const isAdmin = req.user.role === 'admin';

    let query = `SELECT nl.id, nl.site_id, nl.channel, nl.message, nl.sent_at, s.name AS site_name
                 FROM notification_log nl
                 JOIN sites s ON nl.site_id = s.id`;
    const params = [];
    const where = [];

    if (!isAdmin) {
      where.push('s.user_id = ?');
      params.push(req.user.id);
    }
    if (site_id) {
      where.push('nl.site_id = ?');
      params.push(site_id);
    }
    if (where.length) query += ' WHERE ' + where.join(' AND ');
    query += ' ORDER BY nl.sent_at DESC, nl.id DESC LIMIT ?';
    params.push(limit);

    const logs = await dbAll(query, params);
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === PUSH BİLDİRİŞLƏRİ ===

app.get('/api/push/vapid-public-key', (req, res) => {
  if (!isPushEnabled()) {
    return res.status(503).json({ error: 'Push bildirişləri konfiqurasiya edilməyib' });
  }
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

app.post('/api/push/subscribe', requireAuth, async (req, res) => {
  try {
    const subscription = req.body;
    if (!subscription?.endpoint || typeof subscription.endpoint !== 'string') {
      return res.status(400).json({ error: 'Yanlış abunəlik məlumatı' });
    }
    await dbRun(
      'INSERT OR REPLACE INTO push_subscriptions (endpoint, subscription_json) VALUES (?, ?)',
      [subscription.endpoint, JSON.stringify(subscription)]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/push/unsubscribe', requireAuth, async (req, res) => {
  try {
    const { endpoint } = req.body;
    if (!endpoint) return res.status(400).json({ error: 'endpoint tələb olunur' });
    await dbRun('DELETE FROM push_subscriptions WHERE endpoint = ?', [endpoint]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Abunəliyin işlədiyini yoxlamaq üçün test bildirişi
app.post('/api/push/test', requireAuth, async (req, res) => {
  try {
    if (!isPushEnabled()) {
      return res.status(503).json({ error: 'Push bildirişləri konfiqurasiya edilməyib' });
    }
    const total = await dbGet('SELECT COUNT(*) AS n FROM push_subscriptions');
    if (!total.n) {
      return res.status(400).json({ error: 'Aktiv abunəlik yoxdur. Əvvəlcə bildirişləri aktivləşdirin.' });
    }

    const sent = await sendPushNotification(
      'Test bildirişi',
      'Brauzer bildirişləri düzgün işləyir.'
    );
    if (sent === 0) {
      return res.status(502).json({
        error: `${total.n} abunəlik var, amma heç birinə çatdırılmadı. Bildirişləri yenidən aktivləşdirməyi sınayın.`,
      });
    }
    res.json({ success: true, sent });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === TREND (uzunmüddətli aggregate statistika) ===

app.get('/api/sites/:id/trend', requireAuth, blockGuestWrite, async (req, res) => {
  try {
    const { id } = req.params;
    const owned = await getOwnedSite(id, req.user);
    if (!owned) return res.status(404).json({ error: 'Sayt tapılmadı' });
    const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 365);
    const stats = await dbAll(
      `SELECT date, avg_response_time, uptime_percent, total_checks
       FROM daily_stats
       WHERE site_id = ? AND date > date('now', '-' || ? || ' days')
       ORDER BY date ASC`,
      [id, days]
    );
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Son 30 günün uptime faizini hesabla (null = kifayət qədər məlumat yoxdur)
async function uptime30d(siteId) {
  const row = await dbGet(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN status = 'online' THEN 1 ELSE 0 END) AS online
     FROM checks
     WHERE site_id = ? AND checked_at > datetime('now', '-30 days')`,
    [siteId]
  );
  if (!row || !row.total) return null;
  return ((row.online / row.total) * 100).toFixed(2);
}

// === PUBLIC STATUS PAGE ===

// Auth tələb etmir. Minimal ifşa prinsipi: yalnız ad + status + uptime.
// `url` QƏSDƏN göndərilmir — daxili URL strukturunu public səhifədə açmağa ehtiyac yoxdur.
app.get('/api/public/status', async (req, res) => {
  try {
    const sites = await dbAll('SELECT id, name, maintenance_mode FROM sites ORDER BY name');
    const result = [];

    for (const site of sites) {
      const latestCheck = await dbGet(
        'SELECT status, ssl_valid, checked_at FROM checks WHERE site_id = ? ORDER BY checked_at DESC LIMIT 1',
        [site.id]
      );
      result.push({
        name: site.name,
        status: site.maintenance_mode ? 'maintenance' : (latestCheck?.status || 'unknown'),
        ssl_valid: latestCheck?.ssl_valid ?? null,
        uptime_30d: await uptime30d(site.id),
        last_checked: latestCheck?.checked_at || null,
      });
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === EXPORT ===

// CSV export — fayl endirmə olduğuna görə token header-də və ya ?token= query-də
app.get('/api/export/csv', requireAuthFlexible, blockGuestWrite, async (req, res) => {
  try {
    const isAdmin = req.user.role === 'admin';
    const sites = isAdmin
      ? await dbAll('SELECT * FROM sites ORDER BY name')
      : await dbAll('SELECT * FROM sites WHERE user_id = ? ORDER BY name', [req.user.id]);
    const rows = [['Ad', 'URL', 'Status', 'Uptime (30g)', 'SSL', 'Domain Bitmə', 'Hosting', 'Qrup', 'İnterval (dəq)']];

    for (const site of sites) {
      const latestCheck = await dbGet(
        'SELECT status, ssl_valid, domain_expiry, hosting_provider FROM checks WHERE site_id = ? ORDER BY checked_at DESC LIMIT 1',
        [site.id]
      );
      const uptimePercent = (await uptime30d(site.id)) ?? 'N/A';

      rows.push([
        site.name,
        site.url,
        site.maintenance_mode ? 'baxımda' : (latestCheck?.status || 'N/A'),
        uptimePercent,
        latestCheck?.ssl_valid == null ? 'N/A' : (latestCheck.ssl_valid ? 'Keçərli' : 'Keçərsiz'),
        site.manual_domain_expiry || latestCheck?.domain_expiry || 'N/A',
        latestCheck?.hosting_provider || 'N/A',
        site.group_name || '',
        site.check_interval_minutes ?? 30,
      ]);
    }

    // Ayırıcı: nöqtəli vergül (;) — Azərbaycan/Avropa Excel lokalının default ayırıcısıdır.
    // Vergül (,) istifadə etsək, həmin lokalda Excel bütün sətri tək xanaya yığır.
    const DELIM = ';';
    const csv = rows
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(DELIM))
      .join('\r\n');

    // QEYD: "sep=;" sətri İSTİFADƏ EDİLMİR — o, UTF-8 BOM-un tanınmasına mane olur və
    // Azərbaycan hərfləri (ə, ş, ç, ğ) korlanır. Bunun əvəzinə:
    //   - UTF-8 BOM (\uFEFF) → Excel faylı UTF-8 kimi oxuyur (hərflər düzgün)
    //   - ; ayırıcısı → AZ/Avropa lokalında Excel avtomatik tanıyır
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="sites-export.csv"');
    res.send('\uFEFF' + csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Konfiqurasiya export — fayl endirmə, ona görə flexible auth
app.get('/api/config/export', requireAuthFlexible, blockGuestWrite, async (req, res) => {
  try {
    // DİQQƏT: giriş məlumatları (domain_username/password, hosting_username/password,
    // login URL-ləri) BİLƏRƏKDƏN daxil edilmir — bu fayl disk/email vasitəsilə paylaşıla bilər.
    const isAdmin = req.user.role === 'admin';
    const sites = isAdmin
      ? await dbAll(`
          SELECT name, url, group_name, notes, color_tag, alert_days, check_interval_minutes,
                 manual_domain_expiry, manual_domain_registrar, manual_hosting_expiry
          FROM sites ORDER BY name
        `)
      : await dbAll(`
          SELECT name, url, group_name, notes, color_tag, alert_days, check_interval_minutes,
                 manual_domain_expiry, manual_domain_registrar, manual_hosting_expiry
          FROM sites WHERE user_id = ? ORDER BY name
        `, [req.user.id]);

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="sites-config.json"');
    res.json({ exported_at: new Date().toISOString(), version: 1, sites });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Konfiqurasiya import
app.post('/api/config/import', requireAuth, blockGuestWrite, async (req, res) => {
  try {
    const { sites } = req.body;
    if (!Array.isArray(sites)) {
      return res.status(400).json({ error: 'Yanlış format — "sites" array olmalıdır' });
    }
    if (sites.length > 500) {
      return res.status(400).json({ error: 'Bir dəfədə maksimum 500 sayt import edilə bilər' });
    }

    // Mövcud URL-ləri əvvəlcədən oxu (yalnız cari user-in) — dublikat yaratmayaq
    const existing = await dbAll('SELECT url FROM sites WHERE user_id = ?', [req.user.id]);
    const existingUrls = new Set(existing.map(s => String(s.url).trim().toLowerCase()));

    let imported = 0;
    let skipped = 0;

    for (const site of sites) {
      const name = typeof site?.name === 'string' ? site.name.trim() : '';
      const url = typeof site?.url === 'string' ? site.url.trim() : '';

      if (!name || !url) { skipped++; continue; }
      if (!/^https?:\/\//i.test(url)) { skipped++; continue; }
      if (existingUrls.has(url.toLowerCase())) { skipped++; continue; }

      const interval = Number(site.check_interval_minutes);
      await dbRun(
        `INSERT INTO sites (name, url, group_name, notes, color_tag, alert_days, check_interval_minutes,
         manual_domain_expiry, manual_domain_registrar, manual_hosting_expiry, user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          name,
          url,
          site.group_name || null,
          site.notes || null,
          site.color_tag || null,
          normalizeAlertDays(site.alert_days),
          Number.isInteger(interval) && interval >= 1 && interval <= 1440 ? interval : 30,
          site.manual_domain_expiry || null,
          site.manual_domain_registrar || null,
          site.manual_hosting_expiry || null,
          req.user.id,
        ]
      );
      existingUrls.add(url.toLowerCase());
      imported++;
    }

    res.json({ success: true, imported, skipped });
    if (imported > 0) emitSitesUpdated();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get access credentials for a site (READ) — həssas: guest bloklanır + ownership + rotating passcode
app.get('/api/sites/:id/credentials', requireAuth, blockGuestWrite, requireSensitiveAccess, async (req, res) => {
  try {
    const { id } = req.params;
    const owned = await getOwnedSite(id, req.user);
    if (!owned) return res.status(404).json({ error: 'Sayt tapılmadı' });
    res.json({
      domain_username: owned.domain_username,
      domain_password: owned.domain_password,
      hosting_username: owned.hosting_username,
      hosting_password: owned.hosting_password,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update access credentials for a site — ownership yoxlanılır
app.post('/api/sites/:id/credentials', requireAuth, blockGuestWrite, async (req, res) => {
  try {
    const { id } = req.params;
    const owned = await getOwnedSite(id, req.user);
    if (!owned) return res.status(404).json({ error: 'Sayt tapılmadı' });
    const {
      domain_login_url, domain_username, domain_password,
      hosting_login_url, hosting_username, hosting_password,
    } = req.body;

    // Yalnız göndərilən sahələri yenilə (undefined olanları saxla)
    const fields = [];
    const values = [];

    if (domain_login_url !== undefined)   { fields.push('domain_login_url = ?');   values.push(domain_login_url); }
    if (domain_username !== undefined)    { fields.push('domain_username = ?');    values.push(domain_username); }
    if (domain_password !== undefined)    { fields.push('domain_password = ?');    values.push(domain_password); }
    if (hosting_login_url !== undefined)  { fields.push('hosting_login_url = ?');  values.push(hosting_login_url); }
    if (hosting_username !== undefined)   { fields.push('hosting_username = ?');   values.push(hosting_username); }
    if (hosting_password !== undefined)   { fields.push('hosting_password = ?');   values.push(hosting_password); }

    if (fields.length === 0) return res.json({ success: true });

    values.push(id);
    await dbRun(`UPDATE sites SET ${fields.join(', ')} WHERE id = ?`, values);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get check history for a site — ownership yoxlanılır (guest üçün bloklanır: server_ip/hosting həssasdır)
app.get('/api/sites/:id/history', requireAuth, blockGuestWrite, async (req, res) => {
  try {
    const { id } = req.params;
    const owned = await getOwnedSite(id, req.user);
    if (!owned) return res.status(404).json({ error: 'Sayt tapılmadı' });
    const history = await dbAll(
      'SELECT * FROM checks WHERE site_id = ? ORDER BY checked_at DESC LIMIT 50',
      [id]
    );
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Incident log for a site — ownership yoxlanılır (guest üçün bloklanır)
app.get('/api/sites/:id/incidents', requireAuth, blockGuestWrite, async (req, res) => {
  try {
    const { id } = req.params;
    const owned = await getOwnedSite(id, req.user);
    if (!owned) return res.status(404).json({ error: 'Sayt tapılmadı' });
    const incidents = await dbAll(
      'SELECT * FROM incidents WHERE site_id = ? ORDER BY started_at DESC LIMIT 50',
      [id]
    );
    res.json(incidents);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update site notes and group — ownership yoxlanılır
app.post('/api/sites/:id/meta', requireAuth, blockGuestWrite, async (req, res) => {
  try {
    const { id } = req.params;
    const owned = await getOwnedSite(id, req.user);
    if (!owned) return res.status(404).json({ error: 'Sayt tapılmadı' });
    const { notes, group_name, color_tag, alert_days } = req.body;
    await dbRun(
      'UPDATE sites SET notes = ?, group_name = ?, color_tag = ?, alert_days = ? WHERE id = ?',
      [notes || null, group_name || null, color_tag || null, normalizeAlertDays(alert_days), id]
    );
    res.json({ success: true });
    emitSitesUpdated();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Monthly uptime report for a site — ownership yoxlanılır (guest üçün bloklanır)
app.get('/api/sites/:id/report', requireAuth, blockGuestWrite, async (req, res) => {
  try {
    const { id } = req.params;
    const owned = await getOwnedSite(id, req.user);
    if (!owned) return res.status(404).json({ error: 'Sayt tapılmadı' });
    const { month } = req.query; // format: YYYY-MM

    const start = month ? `${month}-01` : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const end = month ? `${month}-31` : new Date().toISOString().split('T')[0];

    const total = await dbGet(
      "SELECT COUNT(*) as count FROM checks WHERE site_id = ? AND checked_at >= ? AND checked_at <= ?",
      [id, start, end + 'T23:59:59']
    );
    const online = await dbGet(
      "SELECT COUNT(*) as count FROM checks WHERE site_id = ? AND status = 'online' AND checked_at >= ? AND checked_at <= ?",
      [id, start, end + 'T23:59:59']
    );
    const incidents = await dbAll(
      "SELECT * FROM incidents WHERE site_id = ? AND started_at >= ? AND started_at <= ? ORDER BY started_at DESC",
      [id, start, end + 'T23:59:59']
    );
    const avgResponse = await dbGet(
      "SELECT AVG(response_time) as avg FROM checks WHERE site_id = ? AND status = 'online' AND response_time IS NOT NULL AND checked_at >= ? AND checked_at <= ?",
      [id, start, end + 'T23:59:59']
    );

    const uptimePct = total.count > 0 ? ((online.count / total.count) * 100).toFixed(2) : null;
    const totalDowntime = incidents.reduce((s, i) => s + (i.duration_seconds || 0), 0);

    res.json({
      period: month || 'last30days',
      total_checks: total.count,
      online_checks: online.count,
      uptime_percent: uptimePct ? parseFloat(uptimePct) : null,
      incident_count: incidents.length,
      total_downtime_seconds: totalDowntime,
      avg_response_time: avgResponse?.avg ? Math.round(avgResponse.avg) : null,
      incidents,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PDF hesabat (fayl endirmə — token header-də və ya ?token= query-də ola bilər)
app.get('/api/sites/:id/report/pdf', requireAuthFlexible, blockGuestWrite, async (req, res) => {
  try {
    const { id } = req.params;
    const site = await getOwnedSite(id, req.user);
    if (!site) return res.status(404).json({ error: 'Sayt tapılmadı' });

    const checks = await dbAll(
      'SELECT * FROM checks WHERE site_id = ? ORDER BY checked_at DESC LIMIT 500',
      [id]
    );
    const incidents = await dbAll(
      'SELECT * FROM incidents WHERE site_id = ? ORDER BY started_at DESC LIMIT 20',
      [id]
    );

    generateSiteReportPDF(site, checks, incidents, res);
  } catch (err) {
    // Stream başlamışsa header göndərmək mümkün deyil
    if (res.headersSent) {
      res.end();
    } else {
      res.status(500).json({ error: err.message });
    }
  }
});

// CSV import
app.post('/api/import', requireAuth, blockGuestWrite, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const fileContent = fs.readFileSync(req.file.path, 'utf-8');
    fs.unlinkSync(req.file.path);

    const records = parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    let success = 0;
    let errors = 0;

    for (const record of records) {
      try {
        const name = record.name || record.Name;
        const url = record.url || record.URL || record.Url;
        if (name && url) {
          await dbRun('INSERT INTO sites (name, url, user_id) VALUES (?, ?, ?)', [name, url, req.user.id]);
          success++;
        } else {
          errors++;
        }
      } catch {
        errors++;
      }
    }

    res.json({ success, errors, total: records.length });
    if (success > 0) emitSitesUpdated();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Save email settings
app.post('/api/settings/email', requireAuth, async (req, res) => {
  try {
    const { host, port, user, pass, recipient } = req.body;
    const settings = JSON.stringify({ host, port, user, pass, recipient });
    await dbRun(
      "INSERT OR REPLACE INTO settings (key, value) VALUES ('smtp', ?)",
      [settings]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get email settings
app.get('/api/settings/email', async (req, res) => {
  try {
    const row = await dbGet("SELECT value FROM settings WHERE key = 'smtp'");
    if (row) {
      const settings = JSON.parse(row.value);
      // Mask the password
      settings.pass = settings.pass ? '••••••••' : '';
      res.json(settings);
    } else {
      res.json({});
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Send test email
app.post('/api/settings/test-email', requireAuth, async (req, res) => {
  try {
    await sendTestEmail();
    res.json({ success: true, message: 'Test email sent successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Test webhook
app.post('/api/settings/test-webhook', requireAuth, async (req, res) => {
  try {
    const { telegram_webhook, discord_webhook, discord_user_id, slack_webhook } = req.body;
    const testMessage = '🧪 **Test Mesajı**\n\nWebhook konfiqurasiyası düzgün işləyir! ✅';
    
    let telegramSuccess = false;
    let discordSuccess = false;
    let slackSuccess = false;
    let errors = [];

    // Telegram test
    if (telegram_webhook && telegram_webhook.trim()) {
      try {
        const response = await axios.post(telegram_webhook, {
          text: testMessage,
          parse_mode: 'Markdown'
        });
        telegramSuccess = true;
        console.log('Telegram test successful:', response.status);
      } catch (err) {
        const errMsg = err.response?.data?.description || err.message;
        console.error('Telegram test failed:', errMsg);
        errors.push(`Telegram: ${errMsg}`);
      }
    }

    // Discord test - with optional user ping
    if (discord_webhook && discord_webhook.trim()) {
      try {
        let discordContent = testMessage;
        if (discord_user_id && discord_user_id.trim()) {
          discordContent = `<@${discord_user_id.trim()}> ${testMessage}`;
        }
        const response = await axios.post(discord_webhook, {
          content: discordContent,
          allowed_mentions: {
            parse: ['users']
          }
        });
        discordSuccess = true;
        console.log('Discord test successful:', response.status);
      } catch (err) {
        const errMsg = err.response?.data?.message || err.message;
        console.error('Discord test failed:', errMsg);
        errors.push(`Discord: ${errMsg}`);
      }
    }

    // Slack test
    if (slack_webhook && slack_webhook.trim()) {
      try {
        const response = await axios.post(slack_webhook, { text: testMessage });
        slackSuccess = true;
        console.log('Slack test successful:', response.status);
      } catch (err) {
        const errMsg = err.response?.data || err.message;
        console.error('Slack test failed:', errMsg);
        errors.push(`Slack: ${typeof errMsg === 'string' ? errMsg : err.message}`);
      }
    }

    if (telegramSuccess || discordSuccess || slackSuccess) {
      const sent = [
        telegramSuccess && 'Telegram ✓',
        discordSuccess && 'Discord ✓',
        slackSuccess && 'Slack ✓',
      ].filter(Boolean).join(' ');
      res.json({ success: true, message: `Test mesajı göndərildi: ${sent}` });
    } else {
      res.status(500).json({ error: errors.join(', ') || 'Heç bir webhook konfiqurasiya edilməyib' });
    }
  } catch (err) {
    console.error('Test webhook error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Save webhook settings
app.post('/api/settings/webhooks', requireAuth, async (req, res) => {
  try {
    const { telegram_webhook, discord_webhook, discord_user_id, slack_webhook, message_template } = req.body;
    const settings = JSON.stringify({ telegram_webhook, discord_webhook, discord_user_id, slack_webhook, message_template });
    await dbRun(
      "INSERT OR REPLACE INTO settings (key, value) VALUES ('webhooks', ?)",
      [settings]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Webhook save error:', err);
    res.status(500).json({ error: err.message });
  }
});

// URL maskalama funksiyası
function maskUrl(url) {
  if (!url || url.length < 10) return url ? '••••••••' : '';
  return url.slice(0, 20) + '••••••••' + url.slice(-6);
}

// Get webhook settings
app.get('/api/settings/webhooks', async (req, res) => {
  try {
    const row = await dbGet("SELECT value FROM settings WHERE key = 'webhooks'");
    if (row) {
      const data = JSON.parse(row.value);
      // Admin auth varsa tam URL göstər, yoxsa maskala
      if (hasValidAdminToken(req)) {
        res.json(data);
      } else {
        res.json({
          ...data,
          telegram_webhook: maskUrl(data.telegram_webhook),
          discord_webhook: maskUrl(data.discord_webhook),
          slack_webhook: maskUrl(data.slack_webhook),
        });
      }
    } else {
      res.json({ telegram_webhook: '', discord_webhook: '', discord_user_id: '', message_template: '' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all site locations for map — admin hamısını, user öz saytları, guest seçdiyi hesabın
// (guest üçün server_ip/hosting çıxarılır — yalnız xəritə koordinatları)
app.get('/api/sites/locations', requireAuth, async (req, res) => {
  try {
    const isAdmin = req.user.role === 'admin';
    const isGuest = req.user.role === 'guest';
    const scopeId = isGuest ? req.user.guestTarget : req.user.id;
    const locations = await dbAll(`
      SELECT 
        s.id, s.name, s.url,
        c.server_ip, c.hosting_provider, c.status,
        l.latitude, l.longitude, l.country, l.city
      FROM sites s
      LEFT JOIN checks c ON s.id = c.site_id 
        AND c.id = (SELECT id FROM checks WHERE site_id = s.id ORDER BY checked_at DESC LIMIT 1)
      LEFT JOIN site_locations l ON s.id = l.site_id
      WHERE l.latitude IS NOT NULL AND l.longitude IS NOT NULL
      ${isAdmin ? '' : 'AND s.user_id = ?'}
    `, isAdmin ? [] : [scopeId]);
    // Qonaq üçün həssas sahələri (IP, hosting, url) çıxar — yalnız xəritə + ad + status
    const result = isGuest
      ? locations.map(l => ({
          id: l.id, name: l.name, status: l.status,
          latitude: l.latitude, longitude: l.longitude, country: l.country, city: l.city,
        }))
      : locations;
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Multi-region check results for a site — ownership yoxlanılır (guest üçün bloklanır)
app.get('/api/sites/:id/region-checks', requireAuth, blockGuestWrite, async (req, res) => {
  try {
    const siteId = parseInt(req.params.id, 10);
    const owned = await getOwnedSite(siteId, req.user);
    if (!owned) return res.status(404).json({ error: 'Sayt tapılmadı' });

    // Son 24 saatın region check-lərini götür
    const checks = await dbAll(
      `SELECT region, status, http_code, response_time, error, checked_at 
       FROM region_checks 
       WHERE site_id = ? AND checked_at > datetime('now', '-24 hours')
       ORDER BY checked_at DESC`,
      [siteId]
    );

    // Region-a görə qruplaşdır — son status
    const byRegion = {};
    checks.forEach(c => {
      if (!byRegion[c.region]) {
        byRegion[c.region] = { latest: c, history: [] };
      }
      byRegion[c.region].history.push(c);
    });

    res.json({ checks, byRegion });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === ESCALATION POLICY ENDPOINTS ===

// Get escalation settings
app.get('/api/settings/escalation', requireAuth, blockGuestWrite, async (req, res) => {
  try {
    const row = await dbGet("SELECT value FROM settings WHERE key = 'escalation'");
    const settings = row ? JSON.parse(row.value) : { primary: '', secondary: '', escalation_delay_minutes: 5 };
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Save escalation settings
app.post('/api/settings/escalation', requireAuth, async (req, res) => {
  try {
    const { primary, secondary, escalation_delay_minutes } = req.body;
    const settings = JSON.stringify({ primary, secondary, escalation_delay_minutes });
    await dbRun(
      "INSERT OR REPLACE INTO settings (key, value) VALUES ('escalation', ?)",
      [settings]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get alert escalation history — yalnız cari user-in saytları (admin hamısını görür; guest bloklanır)
app.get('/api/escalations', requireAuth, blockGuestWrite, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 50;
    const isAdmin = req.user.role === 'admin';
    const escalations = isAdmin
      ? await dbAll(
          `SELECT e.*, s.name as site_name, s.url
           FROM alert_escalations e
           JOIN sites s ON e.site_id = s.id
           ORDER BY e.sent_at DESC LIMIT ?`,
          [limit]
        )
      : await dbAll(
          `SELECT e.*, s.name as site_name, s.url
           FROM alert_escalations e
           JOIN sites s ON e.site_id = s.id
           WHERE s.user_id = ?
           ORDER BY e.sent_at DESC LIMIT ?`,
          [req.user.id, limit]
        );
    res.json(escalations);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Acknowledge an alert
app.post('/api/escalations/:id/acknowledge', requireAuth, async (req, res) => {
  try {
    const escalationId = parseInt(req.params.id, 10);
    const { acknowledged_by } = req.body;
    
    await dbRun(
      `UPDATE alert_escalations SET acknowledged_at = datetime('now'), acknowledged_by = ? WHERE id = ?`,
      [acknowledged_by || 'admin', escalationId]
    );
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === 2FA (TOTP) ENDPOINTS ===

// Get 2FA status
app.get('/api/auth/2fa/status', requireAuth, async (req, res) => {
  try {
    // Hal-hazırda yalnız 'admin' user var
    const user = await dbGet(`SELECT id, totp_enabled FROM users WHERE username = 'admin'`);
    if (!user) {
      return res.json({ enabled: false });
    }
    
    const status = await get2FAStatus(user.id);
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Setup 2FA — QR kod və secret generate et
app.post('/api/auth/2fa/setup', requireAuth, async (req, res) => {
  try {
    const user = await dbGet(`SELECT id FROM users WHERE username = 'admin'`);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { secret, otpauth_url } = await generateTOTPSecret('admin');
    const qrCode = await generateQRCode(otpauth_url);

    // Secret-i temporarily DB-yə yaz (enabled=0 olaraq)
    await dbRun(`UPDATE users SET totp_secret = ? WHERE id = ?`, [secret, user.id]);

    res.json({ secret, qrCode, otpauth_url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Enable 2FA — verification token ilə
app.post('/api/auth/2fa/enable', requireAuth, async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ error: 'TOTP token tələb olunur' });
    }

    const user = await dbGet(`SELECT id, totp_secret FROM users WHERE username = 'admin'`);
    if (!user || !user.totp_secret) {
      return res.status(400).json({ error: 'Əvvəlcə 2FA setup edin' });
    }

    // Token-i verify et
    const valid = await verify2FA('admin', token);
    if (!valid) {
      return res.status(401).json({ error: '2FA kod yanlışdır' });
    }

    // Enable et
    await enable2FA(user.id, user.totp_secret);
    res.json({ success: true, message: '2FA aktivləşdirildi' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Disable 2FA
app.post('/api/auth/2fa/disable', requireAuth, async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ error: 'TOTP token tələb olunur (disable etmək üçün)' });
    }

    // Disable etməzdən əvvəl son bir dəfə verify et
    const valid = await verify2FA('admin', token);
    if (!valid) {
      return res.status(401).json({ error: '2FA kod yanlışdır' });
    }

    const user = await dbGet(`SELECT id FROM users WHERE username = 'admin'`);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    await disable2FA(user.id);
    res.json({ success: true, message: '2FA söndürüldü' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === API KEY MANAGEMENT ENDPOINTS ===

import { createAPIKey, verifyAPIKey, listAPIKeys, deleteAPIKey, requireAPIKey, requirePermission } from './apiKey.js';

// API rate limiter — API key-ə görə fərqli limitlər (hal-hazırda ümumi)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 dəqiqə
  max: 100, // 100 request per window
  message: 'Çox çox request göndərildi, bir az sonra yenidən cəhd edin',
  standardHeaders: true,
  legacyHeaders: false,
});

// Create API key (admin auth tələb edir)
app.post('/api/admin/api-keys', requireAuth, async (req, res) => {
  try {
    const { name, permissions, rate_limit, expires_in_days } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'API key adı tələb olunur' });
    }

    const result = await createAPIKey(
      name,
      permissions || 'read',
      rate_limit || 100,
      expires_in_days || null
    );

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List API keys (admin auth tələb edir)
app.get('/api/admin/api-keys', requireAuth, async (req, res) => {
  try {
    const keys = await listAPIKeys();
    res.json(keys);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete API key (admin auth tələb edir)
app.delete('/api/admin/api-keys/:id', requireAuth, async (req, res) => {
  try {
    const keyId = parseInt(req.params.id, 10);
    const result = await deleteAPIKey(keyId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === PUBLIC REST API (v1) ===

// API documentation endpoint
app.get('/api/v1', (req, res) => {
  res.json({
    version: '1.0.0',
    name: 'Site Monitoring API',
    documentation: 'https://github.com/yourusername/site-monitoring',
    endpoints: {
      'GET /api/v1/sites': 'Bütün saytları listələ',
      'GET /api/v1/sites/:id': 'Konkret saytın məlumatı',
      'GET /api/v1/sites/:id/checks': 'Saytın yoxlama tarixçəsi',
      'GET /api/v1/sites/:id/stats': 'Saytın statistika məlumatları',
      'POST /api/v1/sites': 'Yeni sayt əlavə et (write permission lazımdır)',
      'PUT /api/v1/sites/:id': 'Saytı yenilə (write permission lazımdır)',
      'DELETE /api/v1/sites/:id': 'Saytı sil (write permission lazımdır)',
    },
    authentication: 'x-api-key header və ya ?api_key=xxx query parameter',
    rateLimit: '100 requests per 15 minutes',
  });
});

// GET /api/v1/sites — Bütün saytları listələ
app.get('/api/v1/sites', apiLimiter, requireAPIKey, async (req, res) => {
  try {
    const sites = await dbAll(`
      SELECT 
        s.*,
        c.status, c.http_code, c.response_time, c.checked_at,
        c.ssl_valid, c.ssl_days_remaining
      FROM sites s
      LEFT JOIN checks c ON s.id = c.site_id 
        AND c.id = (SELECT id FROM checks WHERE site_id = s.id ORDER BY checked_at DESC LIMIT 1)
      ORDER BY s.name
    `);
    res.json({ success: true, data: sites, count: sites.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/sites/:id — Konkret saytın məlumatı
app.get('/api/v1/sites/:id', apiLimiter, requireAPIKey, async (req, res) => {
  try {
    const siteId = parseInt(req.params.id, 10);
    const site = await dbGet(`SELECT * FROM sites WHERE id = ?`, [siteId]);
    
    if (!site) {
      return res.status(404).json({ error: 'Sayt tapılmadı' });
    }

    // Son yoxlamanı əlavə et
    const lastCheck = await dbGet(
      `SELECT * FROM checks WHERE site_id = ? ORDER BY checked_at DESC LIMIT 1`,
      [siteId]
    );

    res.json({ success: true, data: { ...site, lastCheck } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/sites/:id/checks — Saytın yoxlama tarixçəsi
app.get('/api/v1/sites/:id/checks', apiLimiter, requireAPIKey, async (req, res) => {
  try {
    const siteId = parseInt(req.params.id, 10);
    const limit = parseInt(req.query.limit, 10) || 100;
    
    const checks = await dbAll(
      `SELECT * FROM checks WHERE site_id = ? ORDER BY checked_at DESC LIMIT ?`,
      [siteId, limit]
    );

    res.json({ success: true, data: checks, count: checks.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/sites/:id/stats — Saytın statistika məlumatları
app.get('/api/v1/sites/:id/stats', apiLimiter, requireAPIKey, async (req, res) => {
  try {
    const siteId = parseInt(req.params.id, 10);
    const days = parseInt(req.query.days, 10) || 30;

    // Uptime hesabla
    const checks = await dbAll(
      `SELECT status FROM checks WHERE site_id = ? AND checked_at > datetime('now', '-${days} days')`,
      [siteId]
    );

    const total = checks.length;
    const online = checks.filter(c => c.status === 'online').length;
    const uptimePercent = total > 0 ? ((online / total) * 100).toFixed(2) : 0;

    // Orta response time
    const avgResponseTime = await dbGet(
      `SELECT AVG(response_time) as avg FROM checks WHERE site_id = ? AND status = 'online' AND checked_at > datetime('now', '-${days} days')`,
      [siteId]
    );

    res.json({
      success: true,
      data: {
        period_days: days,
        total_checks: total,
        online_checks: online,
        uptime_percent: parseFloat(uptimePercent),
        avg_response_time: avgResponseTime?.avg ? Math.round(avgResponseTime.avg) : null,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/sites — Yeni sayt əlavə et (write permission)
app.post('/api/v1/sites', apiLimiter, requireAPIKey, requirePermission('write'), async (req, res) => {
  try {
    const { name, url } = req.body;
    
    if (!name || !url) {
      return res.status(400).json({ error: 'name və url tələb olunur' });
    }

    const result = await dbRun(
      `INSERT INTO sites (name, url) VALUES (?, ?)`,
      [name, url]
    );

    res.json({ success: true, id: result.lastID, message: 'Sayt əlavə edildi' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/v1/sites/:id — Saytı yenilə (write permission)
app.put('/api/v1/sites/:id', apiLimiter, requireAPIKey, requirePermission('write'), async (req, res) => {
  try {
    const siteId = parseInt(req.params.id, 10);
    const { name, url } = req.body;

    if (!name && !url) {
      return res.status(400).json({ error: 'Heç olmasa name və ya url göndərin' });
    }

    const updates = [];
    const values = [];

    if (name) {
      updates.push('name = ?');
      values.push(name);
    }
    if (url) {
      updates.push('url = ?');
      values.push(url);
    }

    values.push(siteId);

    await dbRun(
      `UPDATE sites SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    res.json({ success: true, message: 'Sayt yeniləndi' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/v1/sites/:id — Saytı sil (write permission)
app.delete('/api/v1/sites/:id', apiLimiter, requireAPIKey, requirePermission('write'), async (req, res) => {
  try {
    const siteId = parseInt(req.params.id, 10);
    
    await dbRun(`DELETE FROM sites WHERE id = ?`, [siteId]);
    
    res.json({ success: true, message: 'Sayt silindi' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === BACKUP ENDPOINTS ===

// Backup siyahısı
app.get('/api/backups', (req, res) => {
  try {
    const backups = listBackups();
    res.json(backups);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Manual backup yarat
// createBackup artıq async-dır (R2-ə köçürmə üçün) — await olunmalıdır,
// əks halda cavabda Promise serializə olunub boş obyekt kimi gedər.
app.post('/api/backups', requireAuth, async (req, res) => {
  try {
    const result = await createBackup();
    if (result) {
      res.json({ success: true, backup: result });
    } else {
      res.status(500).json({ error: 'Backup yaradıla bilmədi' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Backup endir
app.get('/api/backups/:name/download', requireAuth, (req, res) => {
  try {
    if (!isSafeFilename(req.params.name)) {
      return res.status(400).json({ error: 'Yanlış fayl adı' });
    }
    const filePath = path.join(BACKUPS_PATH, req.params.name);
    // Əlavə təhlükəsizlik: real path-in hələ də BACKUPS_PATH daxilində olduğunu təsdiqlə
    if (!path.resolve(filePath).startsWith(path.resolve(BACKUPS_PATH))) {
      return res.status(400).json({ error: 'Yanlış fayl yolu' });
    }
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Backup tapılmadı' });
    }
    res.download(filePath, req.params.name);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Backup-dan bərpa et
app.post('/api/backups/:name/restore', requireAuth, (req, res) => {
  try {
    if (!isSafeFilename(req.params.name)) {
      return res.status(400).json({ error: 'Yanlış fayl adı' });
    }
    const result = restoreBackup(req.params.name);
    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json({ error: result.message });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Backup sil
app.delete('/api/backups/:name', requireAuth, (req, res) => {
  try {
    if (!isSafeFilename(req.params.name)) {
      return res.status(400).json({ error: 'Yanlış fayl adı' });
    }
    const result = deleteBackup(req.params.name);
    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json({ error: result.message });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === SITE BACKUP (UPLOAD/DOWNLOAD) ENDPOINTS ===

const SITE_BACKUPS_DIR = path.join(DATA_DIR, 'site-backups');
if (!fs.existsSync(SITE_BACKUPS_DIR)) {
  fs.mkdirSync(SITE_BACKUPS_DIR, { recursive: true });
}

// Sayt backup-ı yüklə (upload) — avtomatik analiz edir
app.post('/api/sites/:id/backups', requireAuth, siteBackupUpload.single('file'), async (req, res) => {
  try {
    const { id } = req.params;
    if (!req.file) {
      return res.status(400).json({ error: 'Fayl yüklənmədi' });
    }

    // Saytın mövcudluğunu yoxla
    const site = await dbGet('SELECT * FROM sites WHERE id = ?', [id]);
    if (!site) {
      fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: 'Sayt tapılmadı' });
    }

    // Sayt üçün qovluq yarat
    const siteDir = path.join(SITE_BACKUPS_DIR, `site_${id}`);
    if (!fs.existsSync(siteDir)) {
      fs.mkdirSync(siteDir, { recursive: true });
    }

    // Faylı düzgün adla köçür
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const ext = path.extname(req.file.originalname) || '.zip';
    const fileName = `${site.name.replace(/[^a-zA-Z0-9-_]/g, '_')}_${timestamp}${ext}`;
    const destPath = path.join(siteDir, fileName);

    moveFileSync(req.file.path, destPath);

    // ZIP/WPRESS faylı analiz et
    let analysis = null;
    if (ext === '.zip' || ext === '.wpress') {
      try {
        analysis = analyzeBackup(destPath);
        // Analiz nəticəsini DB-yə saxla
        await dbRun(
          `INSERT OR REPLACE INTO site_info (site_id, cms, cms_version, framework, language, php_version, node_version,
            db_type, db_name, db_host, db_prefix, theme, plugins, packages, total_files, total_size, config_files, extra_info, analyzed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
          [
            id,
            analysis.cms,
            analysis.cms_version,
            analysis.framework,
            analysis.language,
            analysis.php_version,
            analysis.node_version,
            analysis.database.type,
            analysis.database.name,
            analysis.database.host,
            analysis.database.prefix,
            analysis.theme,
            JSON.stringify(analysis.plugins),
            JSON.stringify(analysis.packages),
            analysis.total_files,
            analysis.total_size,
            JSON.stringify(analysis.config_files),
            JSON.stringify(analysis.extra_info),
          ]
        );
      } catch (err) {
        console.error('Backup analysis failed:', err.message);
      }
    }

    const stats = fs.statSync(destPath);
    res.json({
      success: true,
      backup: {
        name: fileName,
        size: stats.size,
        sizeFormatted: formatFileSize(stats.size),
        createdAt: new Date().toISOString(),
      },
      analysis,
    });
  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: err.message });
  }
});

// Saytın analiz məlumatını al
app.get('/api/sites/:id/info', async (req, res) => {
  try {
    const { id } = req.params;
    const info = await dbGet('SELECT * FROM site_info WHERE site_id = ?', [id]);
    if (info) {
      info.plugins = JSON.parse(info.plugins || '[]');
      info.packages = JSON.parse(info.packages || '[]');
      info.config_files = JSON.parse(info.config_files || '[]');
      info.extra_info = JSON.parse(info.extra_info || '{}');
      res.json(info);
    } else {
      res.json(null);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Saytın backup siyahısı
app.get('/api/sites/:id/backups', async (req, res) => {
  try {
    const { id } = req.params;
    const siteDir = path.join(SITE_BACKUPS_DIR, `site_${id}`);

    if (!fs.existsSync(siteDir)) {
      return res.json([]);
    }

    const files = fs.readdirSync(siteDir)
      .map(f => {
        const filePath = path.join(siteDir, f);
        const stats = fs.statSync(filePath);
        return {
          name: f,
          size: stats.size,
          sizeFormatted: formatFileSize(stats.size),
          createdAt: stats.mtime.toISOString(),
        };
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    res.json(files);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Sayt backup-ını endir
app.get('/api/sites/:id/backups/:name/download', requireAuth, async (req, res) => {
  try {
    const { id, name } = req.params;
    if (!isSafeFilename(name)) {
      return res.status(400).json({ error: 'Yanlış fayl adı' });
    }
    const siteDir = path.join(SITE_BACKUPS_DIR, `site_${id}`);
    const filePath = path.join(siteDir, name);
    if (!path.resolve(filePath).startsWith(path.resolve(siteDir))) {
      return res.status(400).json({ error: 'Yanlış fayl yolu' });
    }
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Backup tapılmadı' });
    }
    res.download(filePath, name);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Sayt backup-ını sil
app.delete('/api/sites/:id/backups/:name', requireAuth, async (req, res) => {
  try {
    const { id, name } = req.params;
    const filePath = path.join(SITE_BACKUPS_DIR, `site_${id}`, name);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Backup tapılmadı' });
    }

    fs.unlinkSync(filePath);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

// Socket.io connection
// Multi-user: socket üzərindən sayt datası GÖNDƏRMİRİK (data leak olardı, socket auth-suzdur).
// Socket yalnız "sites-changed" siqnalı daşıyır; klient auth-lu GET /api/sites ilə öz datasını alır.
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  // Qoşulan klientə dərhal bir dəfə "yenilə" siqnalı ver ki, ilkin datanı çəksin
  socket.emit('sites-changed');

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Catch-all route for React Router (production)
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api') && !req.path.startsWith('/socket.io')) {
    const indexPath = path.join(__dirname, '../client/dist/index.html');
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.status(404).send('Client not built. Run: cd client && npm run build');
    }
  } else {
    // Tanınmayan /api və /socket.io yolları üçün mütləq cavab qaytar.
    // Əks halda sorğu heç vaxt bağlanmır və klient timeout-a qədər gözləyir
    // (health check-lər və fetch-lər "asılı qalır").
    res.status(404).json({ error: 'Endpoint tapılmadı', path: req.path });
  }
});

const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '0.0.0.0';

// Initialize DB then start server
initDb().then(async () => {
  // Multi-user backfill migration (idempotent)
  try {
    const { adminId, backfilledSites } = await backfillMultiUser();
    if (adminId) {
      console.log(`Multi-user backfill: admin user id=${adminId}, ${backfilledSites} sayt admin-ə bağlandı`);
    } else {
      console.warn('Multi-user backfill: admin user yaradılmadı (ADMIN_EMAIL/ADMIN_PASSWORD_HASH yoxdur?)');
    }
  } catch (err) {
    console.error('Multi-user backfill xətası:', err.message);
  }

  httpServer.listen(PORT, HOST, () => {
    console.log(`Server running on http://${HOST}:${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Data dir: ${DATA_DIR}`);
    initPush();
    initOffsiteBackup();
    startMonitoring(io);
    startAutoBackup();
  });
}).catch((err) => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
