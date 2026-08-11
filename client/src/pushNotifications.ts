import { apiUrl } from './api';
import { authHeaders } from './useAuth';

/**
 * VAPID public açarını base64url-dan Uint8Array-ə çevir.
 * `new Uint8Array(new ArrayBuffer(n))` istifadə olunur ki, nəticə `BufferSource`
 * kimi qəbul edilsin — `Uint8Array.from(...)` `ArrayBufferLike` qaytarır və
 * yeni TypeScript versiyalarında `applicationServerKey`-ə uyğun gəlmir.
 */
function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const output = new Uint8Array(new ArrayBuffer(rawData.length));
  for (let i = 0; i < rawData.length; i++) {
    output[i] = rawData.charCodeAt(i);
  }
  return output;
}

export function isPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export type PushResult =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Service worker-i qeydiyyatdan keçir, bildiriş icazəsi al və abunəliyi serverə göndər.
 */
export async function subscribeToPush(): Promise<PushResult> {
  if (!isPushSupported()) {
    return { ok: false, reason: 'Bu brauzer push bildirişlərini dəstəkləmir.' };
  }

  // Push API yalnız HTTPS və ya localhost-da işləyir
  if (!window.isSecureContext) {
    return {
      ok: false,
      reason: 'Push bildirişləri yalnız HTTPS və ya localhost üzərində işləyir.',
    };
  }

  try {
    const keyRes = await fetch(apiUrl('/api/push/vapid-public-key'));
    if (!keyRes.ok) {
      return { ok: false, reason: 'Server tərəfdə push konfiqurasiya edilməyib (VAPID açarları yoxdur).' };
    }
    const { publicKey } = await keyRes.json();
    if (!publicKey) {
      return { ok: false, reason: 'Server VAPID açarı qaytarmadı.' };
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return {
        ok: false,
        reason: permission === 'denied'
          ? 'Bildiriş icazəsi bloklanıb. Brauzer parametrlərindən icazə verin.'
          : 'Bildiriş icazəsi verilmədi.',
      };
    }

    const registration = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;

    // Mövcud abunəlik varsa onu istifadə et, yoxsa yenisini yarat
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }

    const res = await fetch(apiUrl('/api/push/subscribe'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(subscription),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { ok: false, reason: data.error || `Abunəlik serverə yazılmadı (${res.status}).` };
    }

    return { ok: true };
  } catch (err) {
    console.error('Push subscription failed:', err);
    return { ok: false, reason: err instanceof Error ? err.message : 'Naməlum xəta.' };
  }
}

/** Abunəliyi ləğv et (brauzerdə və serverdə). */
export async function unsubscribeFromPush(): Promise<PushResult> {
  if (!isPushSupported()) {
    return { ok: false, reason: 'Bu brauzer push bildirişlərini dəstəkləmir.' };
  }
  try {
    const registration = await navigator.serviceWorker.getRegistration('/sw.js');
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return { ok: true };

    await fetch(apiUrl('/api/push/unsubscribe'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    });
    await subscription.unsubscribe();
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : 'Naməlum xəta.' };
  }
}

/** Brauzerdə hazırda aktiv abunəlik var? */
export async function hasActivePushSubscription(): Promise<boolean> {
  if (!isPushSupported()) return false;
  try {
    const registration = await navigator.serviceWorker.getRegistration('/sw.js');
    const subscription = await registration?.pushManager.getSubscription();
    return !!subscription;
  } catch {
    return false;
  }
}
