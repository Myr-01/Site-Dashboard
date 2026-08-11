// Service worker — brauzer push bildirişləri üçün.
// Vite `public/` qovluğundakı faylları build zamanı olduğu kimi kopyalayır.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Site Monitor', body: event.data ? event.data.text() : '' };
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'Site Monitor', {
      body: data.body || '',
      tag: data.tag || 'site-monitor',
      data: { url: data.url || '/' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Tətbiq artıq açıqdırsa yeni pəncərə açmaq yerinə ona fokuslan
      for (const client of windowClients) {
        if ('focus' in client) return client.focus();
      }
      return self.clients.openWindow(target);
    })
  );
});
