import fs from 'fs';
import { AwsClient } from 'aws4fetch';

/**
 * Cloudflare R2-ə backup faylı yükləmə.
 *
 * Niyə lazımdır: `backup.js` gündəlik backup-ları Fly-ın öz volume-unda saxlayır.
 * Maşın/volume tamamilə məhv olsa (Fly-ın öz problemi, təsadüfi silinmə və s.),
 * bütün backup-lar da bərabər itər. R2-ə köçürmə eyni riski daşımayan ayrı bir
 * yerdə (pulsuz tier, 10GB) ehtiyat nüsxə saxlayır.
 *
 * R2 S3-compatible olduğu üçün ağır `aws-sdk` əvəzinə yüngül `aws4fetch`
 * (yalnız request signing, fetch-based) istifadə olunur.
 */

// DİQQƏT: mühit dəyişənləri modul səviyyəsində OXUNMUR.
// ESM-də bütün import-lar, importing modulun gövdəsindən (yəni `dotenv.config()`
// çağırışından) ƏVVƏL icra olunur. Modul yüklənən anda process.env hələ boşdur.
// Ona görə dəyərlər `initOffsiteBackup()` içində, dotenv işlədikdən sonra oxunur.
let ACCOUNT_ID = null;
let BUCKET = null;
let client = null;
let enabled = false;

export function initOffsiteBackup() {
  ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
  BUCKET = process.env.R2_BUCKET;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!ACCOUNT_ID || !accessKeyId || !secretAccessKey || !BUCKET) {
    console.warn('Xarici backup (R2) söndürülüb: R2_* mühit dəyişənləri tam təyin edilməyib');
    enabled = false;
    return false;
  }

  client = new AwsClient({
    accessKeyId,
    secretAccessKey,
    service: 's3',
    region: 'auto',
  });
  enabled = true;
  console.log(`Xarici backup (R2) aktivdir: bucket "${BUCKET}"`);
  return true;
}

export function isOffsiteBackupEnabled() {
  return enabled;
}

function endpointFor(key) {
  return `https://${ACCOUNT_ID}.r2.cloudflarestorage.com/${BUCKET}/${key}`;
}

/**
 * Backup faylını R2-ə yüklə.
 * @param {string} filePath - lokal fayl yolu
 * @param {string} fileName - R2-də saxlanacaq açar (adətən eyni fayl adı)
 * @returns {Promise<boolean>} uğurlu olub-olmadığı
 */
export async function uploadBackupToR2(filePath, fileName) {
  if (!enabled) return false;
  try {
    const body = fs.readFileSync(filePath);
    const key = `backups/${fileName}`;
    const res = await client.fetch(endpointFor(key), {
      method: 'PUT',
      body,
      headers: { 'Content-Type': 'application/x-sqlite3' },
    });
    if (!res.ok) {
      console.error(`R2 upload uğursuz oldu (${fileName}): HTTP ${res.status} ${await res.text().catch(() => '')}`);
      return false;
    }
    console.log(`Backup R2-ə yükləndi: ${key}`);
    return true;
  } catch (err) {
    console.error(`R2 upload xətası (${fileName}):`, err.message);
    return false;
  }
}

/**
 * R2-də köhnə backup-ları sil (yalnız bu tətbiqin `backups/` prefiksi daxilində).
 * Lokal `cleanOldBackups` ilə eyni MAX_BACKUPS məntiqini güdür.
 */
export async function cleanOldOffsiteBackups(keepNames) {
  if (!enabled) return;
  try {
    const listUrl = `https://${ACCOUNT_ID}.r2.cloudflarestorage.com/${BUCKET}?list-type=2&prefix=backups/`;
    const res = await client.fetch(listUrl);
    if (!res.ok) return;

    const xml = await res.text();
    const keys = [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map(m => m[1]);
    const keepSet = new Set(keepNames.map(n => `backups/${n}`));

    for (const key of keys) {
      if (!keepSet.has(key)) {
        await client.fetch(endpointFor(key.replace('backups/', '')), { method: 'DELETE' });
        console.log(`Köhnə xarici backup silindi: ${key}`);
      }
    }
  } catch (err) {
    console.error('R2 cleanup xətası:', err.message);
  }
}
