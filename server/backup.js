import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DATA_DIR, dbPath } from './db.js';
import { isSafeFilename } from './utils.js';
import { isOffsiteBackupEnabled, uploadBackupToR2, cleanOldOffsiteBackups } from './offsiteBackup.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = dbPath;
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const MAX_BACKUPS = 7; // Son 7 backup saxla (1 həftəlik)

// Backup qovluğunu yarat (yoxdursa)
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

// Backup yarat
export async function createBackup() {
  try {
    if (!fs.existsSync(DB_PATH)) {
      console.error('Backup error: monitor.db tapılmadı');
      return null;
    }

    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backupName = `monitor_backup_${timestamp}.db`;
    const backupPath = path.join(BACKUP_DIR, backupName);

    // Faylı kopyala
    fs.copyFileSync(DB_PATH, backupPath);

    // Köhnə backupları sil (MAX_BACKUPS-dan çox varsa)
    cleanOldBackups();

    const stats = fs.statSync(backupPath);
    console.log(`Backup yaradıldı: ${backupName} (${formatSize(stats.size)})`);

    // Xarici (R2) nüsxə — konfiqurasiya yoxdursa səssizcə keçilir.
    // Yükləmə uğursuz olsa belə lokal backup artıq mövcuddur, ona görə
    // bu, funksiyanın qalanını pozmamalıdır.
    if (isOffsiteBackupEnabled()) {
      await uploadBackupToR2(backupPath, backupName);
      const keepNames = listBackups().map(b => b.name);
      await cleanOldOffsiteBackups(keepNames);
    }

    return {
      name: backupName,
      path: backupPath,
      size: stats.size,
      createdAt: now.toISOString(),
    };
  } catch (err) {
    console.error('Backup error:', err.message);
    return null;
  }
}

// Köhnə backupları sil
function cleanOldBackups() {
  try {
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('monitor_backup_') && f.endsWith('.db'))
      .map(f => ({
        name: f,
        path: path.join(BACKUP_DIR, f),
        time: fs.statSync(path.join(BACKUP_DIR, f)).mtime.getTime(),
      }))
      .sort((a, b) => b.time - a.time); // Yenidən köhnəyə

    // MAX_BACKUPS-dan artığını sil
    if (files.length > MAX_BACKUPS) {
      const toDelete = files.slice(MAX_BACKUPS);
      for (const file of toDelete) {
        fs.unlinkSync(file.path);
        console.log(`Köhnə backup silindi: ${file.name}`);
      }
    }
  } catch (err) {
    console.error('Cleanup error:', err.message);
  }
}

// Bütün backupları siyahıla
export function listBackups() {
  try {
    if (!fs.existsSync(BACKUP_DIR)) return [];

    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('monitor_backup_') && f.endsWith('.db'))
      .map(f => {
        const filePath = path.join(BACKUP_DIR, f);
        const stats = fs.statSync(filePath);
        return {
          name: f,
          size: stats.size,
          sizeFormatted: formatSize(stats.size),
          createdAt: stats.mtime.toISOString(),
        };
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return files;
  } catch (err) {
    console.error('List backups error:', err.message);
    return [];
  }
}

// Backup-dan bərpa et
export function restoreBackup(backupName) {
  if (!isSafeFilename(backupName)) {
    return { success: false, message: 'Yanlış fayl adı' };
  }
  try {
    const backupPath = path.join(BACKUP_DIR, backupName);
    if (!fs.existsSync(backupPath)) {
      throw new Error('Backup faylı tapılmadı');
    }

    // Əvvəlcə cari db-nin backup-ını al (ehtiyat)
    const safetyBackupName = `monitor_pre_restore_${Date.now()}.db`;
    fs.copyFileSync(DB_PATH, path.join(BACKUP_DIR, safetyBackupName));

    // Bərpa et
    fs.copyFileSync(backupPath, DB_PATH);
    console.log(`Backup bərpa edildi: ${backupName}`);

    return { success: true, message: `Backup bərpa edildi: ${backupName}` };
  } catch (err) {
    console.error('Restore error:', err.message);
    return { success: false, message: err.message };
  }
}

// Backup sil
export function deleteBackup(backupName) {
  if (!isSafeFilename(backupName)) {
    return { success: false, message: 'Yanlış fayl adı' };
  }
  try {
    const backupPath = path.join(BACKUP_DIR, backupName);
    if (!fs.existsSync(backupPath)) {
      throw new Error('Backup tapılmadı');
    }
    fs.unlinkSync(backupPath);
    return { success: true };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

// Fayl ölçüsünü formatlama
function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Avtomatik backup schedule (hər 24 saatda bir)
export function startAutoBackup() {
  // İlk olaraq başlanğıcda bir backup al
  createBackup();

  // Hər 24 saatda bir
  setInterval(() => {
    console.log('Avtomatik backup başladı...');
    createBackup();
  }, 24 * 60 * 60 * 1000); // 24 saat

  console.log('Avtomatik backup aktivdir (hər 24 saatda)');
  if (isOffsiteBackupEnabled()) {
    console.log('Xarici (R2) backup köçürməsi aktivdir');
  }
}

// Backup qovluğunun path-ini export et (download üçün)
export const BACKUPS_PATH = BACKUP_DIR;
