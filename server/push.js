import webpush from 'web-push';
import { dbAll, dbRun } from './db.js';

let pushEnabled = false;

/**
 * VAPID açarları varsa web-push-u konfiqurasiya et.
 * Açarlar yoxdursa push sadəcə söndürülür — server normal işləməyə davam edir.
 */
export function initPush() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';

  if (!publicKey || !privateKey) {
    console.warn('Push bildirişləri söndürülüb: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY təyin edilməyib');
    pushEnabled = false;
    return false;
  }

  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    pushEnabled = true;
    console.log('Push bildirişləri aktivdir');
    return true;
  } catch (err) {
    console.error('Push konfiqurasiyası uğursuz oldu:', err.message);
    pushEnabled = false;
    return false;
  }
}

export function isPushEnabled() {
  return pushEnabled;
}

/**
 * Bütün abunəliklərə push bildirişi göndər.
 * @param {string} title
 * @param {string} body
 * @param {string} [url] - bildirişə klikləndikdə açılacaq ünvan
 * @returns {Promise<number>} uğurla göndərilən abunəlik sayı
 */
export async function sendPushNotification(title, body, url = '/') {
  if (!pushEnabled) return 0;

  let sent = 0;
  try {
    const subs = await dbAll('SELECT endpoint, subscription_json FROM push_subscriptions');
    const payload = JSON.stringify({ title, body, url });

    for (const sub of subs) {
      try {
        await webpush.sendNotification(JSON.parse(sub.subscription_json), payload);
        sent++;
      } catch (err) {
        // 410 Gone / 404 Not Found — abunəlik artıq etibarsızdır (istifadəçi icazəni
        // geri götürüb və ya brauzer datası silinib). DB-dən təmizləyirik.
        if (err.statusCode === 410 || err.statusCode === 404) {
          await dbRun('DELETE FROM push_subscriptions WHERE endpoint = ?', [sub.endpoint]);
          console.log('Etibarsız push abunəliyi silindi');
        } else {
          console.error('Push göndərilmədi:', err.statusCode || '', err.message);
        }
      }
    }
  } catch (err) {
    console.error('Push notification error:', err.message);
  }

  return sent;
}
