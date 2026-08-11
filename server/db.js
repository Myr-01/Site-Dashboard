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

  // Incident log cədvəli
  await dbExec(`
    CREATE TABLE IF NOT EXISTS incidents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      site_id INTEGER NOT NULL,
      started_at TEXT NOT NULL,
      resolved_at TEXT,
      duration_seconds INTEGER,
      http_code INTEGER,
      FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
    );
  `);
  try { await dbExec(`CREATE INDEX IF NOT EXISTS idx_incidents_site_id ON incidents(site_id)`); } catch {}
}

export default db;
export { DATA_DIR, dbPath };
