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

import { initDb, dbRun, dbGet, dbAll } from './db.js';
import { isSafeFilename, createRequireAuth } from './utils.js';
import { getAllSitesWithLatestCheck, startMonitoring } from './monitor.js';
import { sendTestEmail } from './mailer.js';
import { createBackup, listBackups, restoreBackup, deleteBackup, startAutoBackup, BACKUPS_PATH } from './backup.js';
import { analyzeBackup } from './backup-analyzer.js';
import { DATA_DIR } from './db.js';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

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

const upload = multer({ dest: 'uploads/', limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB
const siteBackupUpload = multer({
  dest: 'site-backups/temp/',
  limits: { fileSize: 500 * 1024 * 1024 }, // Max 500MB
});

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

// Serve static files (production build)
const clientDistPath = path.join(__dirname, '../client/dist');
if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
  console.log('Serving client from:', clientDistPath);
}

// === AUTH ===

// Şifrəni yoxla
app.post('/api/auth/verify', authLimiter, (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Şifrə yanlışdır' });
  }
});

// Admin əməliyyatları üçün middleware
const requireAuth = createRequireAuth(ADMIN_PASSWORD);

// Get all sites with latest check
app.get('/api/sites', async (req, res) => {
  try {
    const sites = await getAllSitesWithLatestCheck();
    res.json(sites);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add a site
app.post('/api/sites', requireAuth, async (req, res) => {
  try {
    const { name, url } = req.body;
    if (!name || !url) {
      return res.status(400).json({ error: 'Name and URL are required' });
    }
    const result = await dbRun('INSERT INTO sites (name, url) VALUES (?, ?)', [name, url]);
    const site = await dbGet('SELECT * FROM sites WHERE id = ?', [result.lastID]);
    res.status(201).json(site);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a site
app.delete('/api/sites/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    await dbRun('DELETE FROM checks WHERE site_id = ?', [id]);
    await dbRun('DELETE FROM sites WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update manual dates for a site
app.post('/api/sites/:id/manual-dates', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { manual_domain_registrar, manual_domain_expiry, manual_hosting_expiry } = req.body;
    await dbRun(
      'UPDATE sites SET manual_domain_registrar = ?, manual_domain_expiry = ?, manual_hosting_expiry = ? WHERE id = ?',
      [manual_domain_registrar, manual_domain_expiry, manual_hosting_expiry, id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get access credentials for a site (READ) — auth tələb edir
app.get('/api/sites/:id/credentials', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const site = await dbGet(
      'SELECT domain_username, domain_password, hosting_username, hosting_password FROM sites WHERE id = ?',
      [id]
    );
    if (!site) return res.status(404).json({ error: 'Sayt tapılmadı' });
    res.json(site);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update access credentials for a site — auth SiteDetailModal tərəfindən edilir
app.post('/api/sites/:id/credentials', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    console.log('Credentials POST for site', id);
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

// Get check history for a site
app.get('/api/sites/:id/history', async (req, res) => {
  try {
    const { id } = req.params;
    const history = await dbAll(
      'SELECT * FROM checks WHERE site_id = ? ORDER BY checked_at DESC LIMIT 50',
      [id]
    );
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Incident log for a site
app.get('/api/sites/:id/incidents', async (req, res) => {
  try {
    const { id } = req.params;
    const incidents = await dbAll(
      'SELECT * FROM incidents WHERE site_id = ? ORDER BY started_at DESC LIMIT 50',
      [id]
    );
    res.json(incidents);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update site notes and group
app.post('/api/sites/:id/meta', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { notes, group_name } = req.body;
    await dbRun(
      'UPDATE sites SET notes = ?, group_name = ? WHERE id = ?',
      [notes || null, group_name || null, id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Monthly uptime report for a site
app.get('/api/sites/:id/report', async (req, res) => {
  try {
    const { id } = req.params;
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

// CSV import
app.post('/api/import', requireAuth, upload.single('file'), async (req, res) => {
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
          await dbRun('INSERT INTO sites (name, url) VALUES (?, ?)', [name, url]);
          success++;
        } else {
          errors++;
        }
      } catch {
        errors++;
      }
    }

    res.json({ success, errors, total: records.length });
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
    const { telegram_webhook, discord_webhook, discord_user_id } = req.body;
    const testMessage = '🧪 **Test Mesajı**\n\nWebhook konfiqurasiyası düzgün işləyir! ✅';
    
    let telegramSuccess = false;
    let discordSuccess = false;
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

    if (telegramSuccess || discordSuccess) {
      res.json({ 
        success: true, 
        message: `Test mesajı göndərildi: ${telegramSuccess ? 'Telegram ✓' : ''} ${discordSuccess ? 'Discord ✓' : ''}`
      });
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
    const { telegram_webhook, discord_webhook, discord_user_id, message_template } = req.body;
    const settings = JSON.stringify({ telegram_webhook, discord_webhook, discord_user_id, message_template });
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
      const token = req.headers['x-admin-password'];
      if (token === ADMIN_PASSWORD) {
        res.json(data);
      } else {
        res.json({
          ...data,
          telegram_webhook: maskUrl(data.telegram_webhook),
          discord_webhook: maskUrl(data.discord_webhook),
        });
      }
    } else {
      res.json({ telegram_webhook: '', discord_webhook: '', discord_user_id: '', message_template: '' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all site locations for map
app.get('/api/sites/locations', async (req, res) => {
  try {
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
    `);
    res.json(locations);
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
app.post('/api/backups', requireAuth, (req, res) => {
  try {
    const result = createBackup();
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

    fs.renameSync(req.file.path, destPath);

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
io.on('connection', async (socket) => {
  console.log('Client connected:', socket.id);
  // Send current data immediately on connect
  try {
    const sites = await getAllSitesWithLatestCheck();
    socket.emit('sites-updated', sites);
  } catch (err) {
    console.error('Failed to send initial data:', err.message);
  }

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
  }
});

const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '0.0.0.0';

// Initialize DB then start server
initDb().then(() => {
  httpServer.listen(PORT, HOST, () => {
    console.log(`Server running on http://${HOST}:${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Data dir: ${DATA_DIR}`);
    startMonitoring(io);
    startAutoBackup();
  });
}).catch((err) => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
