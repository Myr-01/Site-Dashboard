import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Railway persistent volume: DATA_DIR env var qoyulubsa onu istifadə et,
// yoxsa lokal __dirname (development)
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : __dirname;

// Qovluğu yarat (yoxdursa)
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const dbPath = path.join(DATA_DIR, 'monitor.db');
console.log(`SQLite path: ${dbPath}`);

const db = new sqlite3.Database(dbPath);

// Promisified helpers
export function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

export function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row || null);
    });
  });
}

export function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

export function dbExec(sql) {
  return new Promise((resolve, reject) => {
    db.exec(sql, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

// Initialize the database schema
export async function initDb() {
  await dbExec(`PRAGMA journal_mode = WAL`);
  await dbExec(`PRAGMA foreign_keys = ON`);

  await dbExec(`
    CREATE TABLE IF NOT EXISTS sites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      manual_domain_expiry TEXT,
      manual_domain_registrar TEXT,
      manual_hosting_expiry TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  await dbExec(`
    CREATE TABLE IF NOT EXISTS checks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      site_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'offline',
      http_code INTEGER,
      response_time INTEGER,
      ssl_valid INTEGER,
      ssl_days_remaining INTEGER,
      ssl_expiry TEXT,
      seo_title TEXT,
      seo_title_value TEXT,
      seo_description TEXT,
      seo_description_value TEXT,
      seo_h1 TEXT,
      seo_robots TEXT,
      seo_canonical TEXT,
      server_ip TEXT,
      hosting_provider TEXT,
      domain_expiry TEXT,
      domain_registrar TEXT,
      domain_days_remaining INTEGER,
      checked_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
    );
  `);

  await dbExec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  await dbExec(`
    CREATE TABLE IF NOT EXISTS site_locations (
      site_id INTEGER PRIMARY KEY,
      latitude REAL,
      longitude REAL,
      country TEXT,
      city TEXT,
      FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
    );
  `);

  await dbExec(`
    CREATE TABLE IF NOT EXISTS expiry_alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      site_id INTEGER NOT NULL,
      alert_type TEXT NOT NULL,
      alerted_date TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
      UNIQUE(site_id, alert_type, alerted_date)
    );
  `);

  await dbExec(`
    CREATE TABLE IF NOT EXISTS site_info (
      site_id INTEGER PRIMARY KEY,
      cms TEXT,
      cms_version TEXT,
      framework TEXT,
      language TEXT,
      php_version TEXT,
      node_version TEXT,
      db_type TEXT,
      db_name TEXT,
      db_host TEXT,
      db_prefix TEXT,
      theme TEXT,
      plugins TEXT,
      packages TEXT,
      total_files INTEGER,
      total_size INTEGER,
      config_files TEXT,
      extra_info TEXT,
      analyzed_at TEXT,
      FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
    );
  `);

  await dbExec(`CREATE INDEX IF NOT EXISTS idx_checks_site_id ON checks(site_id)`);
  await dbExec(`CREATE INDEX IF NOT EXISTS idx_checks_checked_at ON checks(checked_at)`);

  // Migration: add new columns if they don't exist (for existing databases)
  try { await dbExec(`ALTER TABLE checks ADD COLUMN server_ip TEXT`); } catch {}
  try { await dbExec(`ALTER TABLE checks ADD COLUMN hosting_provider TEXT`); } catch {}
  try { await dbExec(`ALTER TABLE checks ADD COLUMN domain_expiry TEXT`); } catch {}
  try { await dbExec(`ALTER TABLE checks ADD COLUMN domain_registrar TEXT`); } catch {}
  try { await dbExec(`ALTER TABLE checks ADD COLUMN domain_days_remaining INTEGER`); } catch {}
  try { await dbExec(`ALTER TABLE sites ADD COLUMN manual_domain_expiry TEXT`); } catch {}
  try { await dbExec(`ALTER TABLE sites ADD COLUMN manual_domain_registrar TEXT`); } catch {}
  try { await dbExec(`ALTER TABLE sites ADD COLUMN manual_hosting_expiry TEXT`); } catch {}
  try { await dbExec(`ALTER TABLE sites ADD COLUMN domain_login_url TEXT`); } catch {}
  try { await dbExec(`ALTER TABLE sites ADD COLUMN domain_username TEXT`); } catch {}
  try { await dbExec(`ALTER TABLE sites ADD COLUMN domain_password TEXT`); } catch {}
  try { await dbExec(`ALTER TABLE sites ADD COLUMN hosting_login_url TEXT`); } catch {}
  try { await dbExec(`ALTER TABLE sites ADD COLUMN hosting_username TEXT`); } catch {}
  try { await dbExec(`ALTER TABLE sites ADD COLUMN hosting_password TEXT`); } catch {}
  try { await dbExec(`ALTER TABLE sites ADD COLUMN group_name TEXT`); } catch {}
  try { await dbExec(`ALTER TABLE sites ADD COLUMN notes TEXT`); } catch {}
  try { await dbExec(`ALTER TABLE sites ADD COLUMN last_whois_check TEXT`); } catch {}
  try { await dbExec(`ALTER TABLE sites ADD COLUMN last_geo_check TEXT`); } catch {}
  try { await dbExec(`ALTER TABLE sites ADD COLUMN color_tag TEXT`); } catch {}
  try { await dbExec(`ALTER TABLE sites ADD COLUMN alert_days TEXT DEFAULT '3,1'`); } catch {}
  try { await dbExec(`ALTER TABLE sites ADD COLUMN maintenance_mode INTEGER DEFAULT 0`); } catch {}
  try { await dbExec(`ALTER TABLE sites ADD COLUMN check_interval_minutes INTEGER DEFAULT 30`); } catch {}
  // Multi-user: hər sayt bir user-ə aiddir. Əvvəlcə nullable — backfill sonra edilir.
  try { await dbExec(`ALTER TABLE sites ADD COLUMN user_id INTEGER REFERENCES users(id)`); } catch {}
  await dbExec(`CREATE INDEX IF NOT EXISTS idx_sites_user_id ON sites(user_id)`);

  // Brauzer push bildirişi abunəlikləri
  await dbExec(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      endpoint TEXT UNIQUE NOT NULL,
      subscription_json TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Gündəlik aggregate statistika — köhnə detallı check-lər silinsə də
  // uzunmüddətli trend məlumatı qalsın
  await dbExec(`
    CREATE TABLE IF NOT EXISTS daily_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      site_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      avg_response_time REAL,
      uptime_percent REAL,
      total_checks INTEGER,
      UNIQUE(site_id, date),
      FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
    );
  `);
  await dbExec(`CREATE INDEX IF NOT EXISTS idx_daily_stats_site_date ON daily_stats(site_id, date)`);

  // Göndərilmiş bildirişlərin tarixçəsi (in-app)
  await dbExec(`
    CREATE TABLE IF NOT EXISTS notification_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      site_id INTEGER,
      channel TEXT NOT NULL,
      message TEXT NOT NULL,
      sent_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
    );
  `);
  await dbExec(`CREATE INDEX IF NOT EXISTS idx_notification_log_site_id ON notification_log(site_id)`);
  await dbExec(`CREATE INDEX IF NOT EXISTS idx_notification_log_sent_at ON notification_log(sent_at)`);

  // Incident log cədvəli
  await dbExec(`
    CREATE TABLE IF NOT EXISTS incidents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      site_id INTEGER NOT NULL,
      started_at TEXT NOT NULL,
      resolved_at TEXT,
      duration_seconds INTEGER,
      http_code INTEGER,
      resolution_note TEXT,
      FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
    );
  `);
  try { await dbExec(`CREATE INDEX IF NOT EXISTS idx_incidents_site_id ON incidents(site_id)`); } catch {}

  // Migration: mövcud incidents cədvəlinə postmortem qeyd sütunu
  // (CREATE TABLE-dan SONRA olmalıdır — əks halda təzə DB-də cədvəl hələ mövcud olmur)
  try { await dbExec(`ALTER TABLE incidents ADD COLUMN resolution_note TEXT`); } catch {}

  // Multi-region check results
  await dbExec(`
    CREATE TABLE IF NOT EXISTS region_checks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      site_id INTEGER NOT NULL,
      region TEXT NOT NULL,
      status TEXT NOT NULL,
      http_code INTEGER,
      response_time INTEGER,
      error TEXT,
      checked_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
    );
  `);
  await dbExec(`CREATE INDEX IF NOT EXISTS idx_region_checks_site_id ON region_checks(site_id)`);
  await dbExec(`CREATE INDEX IF NOT EXISTS idx_region_checks_checked_at ON region_checks(checked_at)`);

  // Escalation policy — alert acknowledgment və təkrar bildiriş
  await dbExec(`
    CREATE TABLE IF NOT EXISTS alert_escalations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      site_id INTEGER NOT NULL,
      incident_id INTEGER,
      alert_type TEXT NOT NULL,
      sent_to TEXT NOT NULL,
      sent_at TEXT DEFAULT (datetime('now')),
      acknowledged_at TEXT,
      acknowledged_by TEXT,
      escalated INTEGER DEFAULT 0,
      FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
      FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE SET NULL
    );
  `);
  await dbExec(`CREATE INDEX IF NOT EXISTS idx_alert_escalations_site_id ON alert_escalations(site_id)`);
  await dbExec(`CREATE INDEX IF NOT EXISTS idx_alert_escalations_acknowledged ON alert_escalations(acknowledged_at)`);

  // Escalation contacts konfiqurasiyası (settings cədvəlində JSON olaraq saxlanacaq)
  // Format: { primary: "email@example.com", secondary: "oncall@example.com", escalation_delay_minutes: 5 }

  // Users — multi-user auth. username saxlanılır (2FA geriyə uyğunluq üçün),
  // email login identifikatorudur, role 'user'/'admin'.
  await dbExec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      email TEXT UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      totp_secret TEXT,
      totp_enabled INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
  // Migration: köhnə users cədvəlinə email və role sütunları əlavə et
  try { await dbExec(`ALTER TABLE users ADD COLUMN email TEXT`); } catch {}
  try { await dbExec(`ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'`); } catch {}
  // email üçün unikallıq indeksi (NULL-lara icazə verir — köhnə username-only sətirlər üçün)
  try { await dbExec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL`); } catch {}

  // Rotating passcode — həssas əməliyyatlar (sayt əlavə etmə, credential-lara baxış) üçün.
  // Tək sətir saxlanılır (id=1), 12 saatda regenerate olunur.
  await dbExec(`
    CREATE TABLE IF NOT EXISTS sensitive_action_code (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      code TEXT NOT NULL,
      generated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // API keys — Public REST API üçün
  await dbExec(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      permissions TEXT DEFAULT 'read',
      rate_limit INTEGER DEFAULT 100,
      last_used_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      expires_at TEXT
    );
  `);
  await dbExec(`CREATE INDEX IF NOT EXISTS idx_api_keys_key ON api_keys(key)`);
}

/**
 * Multi-user backfill migration — idempotent, hər başlanğıcda təhlükəsiz işləyir.
 * 1. Admin user-i yaradır/yeniləyir (ADMIN_EMAIL + ADMIN_PASSWORD_HASH env-dən).
 * 2. Köhnə username='admin' sətrini email/role ilə tamamlayır.
 * 3. user_id-si olmayan mövcud saytları admin-ə bağlayır.
 * @returns {Promise<{adminId: number|null, backfilledSites: number}>}
 */
export async function backfillMultiUser() {
  const adminEmail = process.env.ADMIN_EMAIL || null;
  const adminHash = process.env.ADMIN_PASSWORD_HASH || null;

  let adminId = null;

  // 1. Köhnə username='admin' user-i varsa, onu admin roluna yüksəlt və email təyin et
  const existingAdmin = await dbGet(`SELECT id, email, role FROM users WHERE username = 'admin'`);
  if (existingAdmin) {
    adminId = existingAdmin.id;
    // Email boşdursa və env-də varsa təyin et; rolu admin et
    if (adminEmail && !existingAdmin.email) {
      // Email başqa user tərəfindən tutulmayıbsa təyin et
      const emailTaken = await dbGet(`SELECT id FROM users WHERE email = ? AND id != ?`, [adminEmail, adminId]);
      if (!emailTaken) {
        await dbRun(`UPDATE users SET email = ?, role = 'admin' WHERE id = ?`, [adminEmail, adminId]);
      } else {
        await dbRun(`UPDATE users SET role = 'admin' WHERE id = ?`, [adminId]);
      }
    } else {
      await dbRun(`UPDATE users SET role = 'admin' WHERE id = ?`, [adminId]);
    }
  } else if (adminEmail && adminHash) {
    // 2. Köhnə admin yoxdursa, env-dən yeni admin yarat (idempotent)
    const byEmail = await dbGet(`SELECT id FROM users WHERE email = ?`, [adminEmail]);
    if (byEmail) {
      adminId = byEmail.id;
      await dbRun(`UPDATE users SET role = 'admin' WHERE id = ?`, [adminId]);
    } else {
      const result = await dbRun(
        `INSERT INTO users (username, email, password_hash, role) VALUES ('admin', ?, ?, 'admin')`,
        [adminEmail, adminHash]
      );
      adminId = result.lastID;
    }
  } else if (adminHash) {
    // 3. Yalnız hash varsa (köhnə setup, email yoxdur) — username='admin' ilə yarat
    const result = await dbRun(
      `INSERT OR IGNORE INTO users (username, password_hash, role) VALUES ('admin', ?, 'admin')`,
      [adminHash]
    );
    const adminRow = await dbGet(`SELECT id FROM users WHERE username = 'admin'`);
    adminId = adminRow ? adminRow.id : (result.lastID || null);
  }

  // 4. user_id-si olmayan saytları admin-ə bağla (backfill)
  let backfilledSites = 0;
  if (adminId) {
    const result = await dbRun(`UPDATE sites SET user_id = ? WHERE user_id IS NULL`, [adminId]);
    backfilledSites = result.changes || 0;
  }

  return { adminId, backfilledSites };
}

export default db;
export { DATA_DIR, dbPath };
