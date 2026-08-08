# Site-Dashboard — Tam Düzəliş Paketi (Kiro üçün)

## Kontekst
Bu, Site-Dashboard layihəsində tapılan bütün açıq problemlərin (13 ədəd) tam siyahısıdır. Aşağıdakı bölmə sırası ilə tətbiq et — hər bölmədən sonra qısa test et (build xətası olmadığına əmin ol), sonra növbətinə keç.

---

## 1-ci hissə: Real funksional bug-lar (istifadəçi təcrübəsini pozur)

### 1.1 — `manual-dates` POST-da auth header əskikdir
**Fayl:** `client/src/components/SiteDetailModal.tsx` (~sətir 793-817)

Kod əvvəlcə `/api/auth/verify`-ə sorğu göndərib şifrəni təsdiqləyir, sonra əsl `POST /api/sites/:id/manual-dates` sorğusunda `x-admin-password` header-ini göndərmir. Bu sorğunun `headers` bölməsini tap:
```js
await fetch(apiUrl(`/api/sites/${site.id}/manual-dates`), {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
```
Bunu belə dəyiş:
```js
await fetch(apiUrl(`/api/sites/${site.id}/manual-dates`), {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-admin-password': pass },
  body: JSON.stringify(body),
});
```

### 1.2 — Sayt silinmə backend cavabını yoxlamır
**Fayl:** `client/src/App.tsx`, `handleDelete` funksiyası (~sətir 83-94)

Hazırkı kod:
```js
const handleDelete = async (id: number) => {
  try {
    const pass = sessionStorage.getItem('adminPassword');
    await fetch(apiUrl(`/api/sites/${id}`), {
      method: 'DELETE',
      headers: pass ? { 'x-admin-password': pass } : {},
    });
    setSites(prev => prev.filter(s => s.id !== id));
  } catch (err) {
    console.error('Failed to delete site:', err);
  }
};
```
Bunu belə dəyiş (yalnız uğurlu olduqda UI-ni yenilə):
```js
const handleDelete = async (id: number) => {
  try {
    const pass = sessionStorage.getItem('adminPassword');
    const res = await fetch(apiUrl(`/api/sites/${id}`), {
      method: 'DELETE',
      headers: pass ? { 'x-admin-password': pass } : {},
    });
    if (res.ok) {
      setSites(prev => prev.filter(s => s.id !== id));
    } else {
      console.error('Failed to delete site: server returned', res.status);
      // istəyə görə: istifadəçiyə xəbərdarlıq göstər (məs. dialog.alert)
    }
  } catch (err) {
    console.error('Failed to delete site:', err);
  }
};
```

### 1.3 — `SettingsModal.tsx`-də 5 yerdə auth header əskikdir
**Fayl:** `client/src/components/SettingsModal.tsx`

Bu fayl artıq `authHeaders` import edir (`import { authHeaders } from '../useAuth';`), amma aşağıdakı 5 `fetch` çağırışında istifadə etmir. Hər birinə `headers` əlavə et (ya yeni yarat, ya da mövcuda spread et):

**a) `handleTestEmail` (~sətir 119):**
```js
// Əvvəl:
const res = await fetch(apiUrl('/api/settings/test-email'), { method: 'POST' });
// Sonra:
const res = await fetch(apiUrl('/api/settings/test-email'), { method: 'POST', headers: { ...authHeaders() } });
```

**b) Webhook test düyməsi (~sətir 329):**
```js
// Əvvəl:
const testRes = await fetch(apiUrl('/api/settings/test-webhook'), {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(webhooks),
});
// Sonra:
const testRes = await fetch(apiUrl('/api/settings/test-webhook'), {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...authHeaders() },
  body: JSON.stringify(webhooks),
});
```

**c) `handleCreateBackup` (~sətir 400):**
```js
// Əvvəl:
const res = await fetch(apiUrl('/api/backups'), { method: 'POST' });
// Sonra:
const res = await fetch(apiUrl('/api/backups'), { method: 'POST', headers: { ...authHeaders() } });
```

**d) `handleRestore` (~sətir 422):**
```js
// Əvvəl:
const res = await fetch(apiUrl(`/api/backups/${name}/restore`), { method: 'POST' });
// Sonra:
const res = await fetch(apiUrl(`/api/backups/${encodeURIComponent(name)}/restore`), { method: 'POST', headers: { ...authHeaders() } });
```

**e) `handleDelete` (~sətir 438):**
```js
// Əvvəl:
const res = await fetch(apiUrl(`/api/backups/${name}`), { method: 'DELETE' });
// Sonra:
const res = await fetch(apiUrl(`/api/backups/${encodeURIComponent(name)}`), { method: 'DELETE', headers: { ...authHeaders() } });
```

(Qeyd: d və e-də həm auth header, həm də `encodeURIComponent` əlavə olundu — bax aşağıda 3.3.)

---

## 2-ci hissə: Təhlükəsizlik — kritik/yüksək

### 2.1 — Path traversal (backup download)
**Fayl:** `server/index.js`

Yuxarı hissəyə (digər helper funksiyalardan əvvəl) əlavə et:
```js
function isSafeFilename(name) {
  if (typeof name !== 'string' || name.length === 0) return false;
  if (name.includes('..') || name.includes('/') || name.includes('\\')) return false;
  return true;
}
```

`/api/backups/:name/download` endpoint-ini tap və belə dəyiş:
```js
app.get('/api/backups/:name/download', requireAuth, (req, res) => {
  try {
    if (!isSafeFilename(req.params.name)) {
      return res.status(400).json({ error: 'Yanlış fayl adı' });
    }
    const filePath = path.join(BACKUPS_PATH, req.params.name);
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
```

`/api/sites/:id/backups/:name/download` endpoint-ini tap və belə dəyiş:
```js
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
```

`server/backup.js`-də `restoreBackup` və `deleteBackup` funksiyalarının başına da eyni yoxlamanı əlavə et (helper-i import et və ya kopyala):
```js
export function restoreBackup(backupName) {
  if (!isSafeFilename(backupName)) {
    return { success: false, message: 'Yanlış fayl adı' };
  }
  // ... qalan kod olduğu kimi
}

export function deleteBackup(backupName) {
  if (!isSafeFilename(backupName)) {
    return { success: false, message: 'Yanlış fayl adı' };
  }
  // ... qalan kod olduğu kimi
}
```

### 2.2 — Şifrələr server log-larına yazılır
**Fayl:** `server/index.js`, sətir ~167

Tap:
```js
console.log('Credentials POST for site', id, req.body);
```
Sil, ya da bununla əvəz et:
```js
console.log('Credentials POST for site', id);
```

### 2.3 — Webhook URL-ləri auth olmadan görünür
**Fayl:** `server/index.js`, `GET /api/settings/webhooks` endpoint-i

Hazırkı:
```js
app.get('/api/settings/webhooks', async (req, res) => {
  try {
    const row = await dbGet("SELECT value FROM settings WHERE key = 'webhooks'");
    if (row) {
      res.json(JSON.parse(row.value));
    } else {
      res.json({ telegram_webhook: '', discord_webhook: '', discord_user_id: '', message_template: '' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```
Maskalama funksiyası əlavə et və istifadə et:
```js
function maskUrl(url) {
  if (!url || url.length < 10) return url ? '••••••••' : '';
  return url.slice(0, 20) + '••••••••' + url.slice(-6);
}

app.get('/api/settings/webhooks', async (req, res) => {
  try {
    const row = await dbGet("SELECT value FROM settings WHERE key = 'webhooks'");
    if (row) {
      const data = JSON.parse(row.value);
      res.json({
        ...data,
        telegram_webhook: maskUrl(data.telegram_webhook),
        discord_webhook: maskUrl(data.discord_webhook),
      });
    } else {
      res.json({ telegram_webhook: '', discord_webhook: '', discord_user_id: '', message_template: '' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```
**Qeyd:** Bu, `SettingsModal.tsx`-də webhook input sahələrini redaktə edərkən problem yarada bilər (maskalanmış dəyər yenidən saxlanılarsa, əsl URL itər). Kiro-dan bunu da yoxlamasını xahiş et — SettingsModal-da webhook sahələri ancaq **boş olduqda və ya dəyişdirildikdə** yenilənməli, maskalanmış placeholder-i geri göndərməməlidir (email şifrəsi ilə eyni pattern — `SettingsModal.tsx`-də SMTP şifrəsi üçün bu artıq düzgün idarə olunur, oxşar məntiqi buraya da tətbiq et).

---

## 3-cü hissə: Orta prioritet

### 3.1 — Brute-force qorunması
`server/package.json`-a `express-rate-limit` əlavə et:
```
npm install express-rate-limit
```
`server/index.js`-in yuxarısına:
```js
import rateLimit from 'express-rate-limit';

const authLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 dəqiqə
  max: 10,
  message: { error: 'Çox sayda cəhd. Bir az sonra yenidən cəhd edin.' },
});
```
`/api/auth/verify` route-una tətbiq et:
```js
app.post('/api/auth/verify', authLimiter, (req, res) => {
  // ... mövcud kod
});
```

### 3.2 — Upload fayl ölçü limiti
**Fayl:** `server/index.js`

Tap:
```js
const upload = multer({ dest: 'uploads/' });
```
Dəyiş:
```js
const upload = multer({ dest: 'uploads/', limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB
```

### 3.3 — Backup fayl adları URL-də encode olunmalıdır
`SiteDetailModal.tsx`-də bütün `apiUrl(\`/api/.../backups/${name}/...\`)` çağırışlarında `name` dəyişənini `encodeURIComponent(name)` ilə əvəz et (bax 1.3-d, e-də nümunə).

### 3.4 — `helmet` əlavə et
```
npm install helmet
```
`server/index.js`-in yuxarısına:
```js
import helmet from 'helmet';
```
`app.use(cors(...))`-dan sonra:
```js
app.use(helmet({
  contentSecurityPolicy: false, // React app üçün CSP ayrıca konfiqurasiya tələb edir, hələlik deaktiv
}));
```

### 3.5 — Discord `@everyone` ping riski
**Fayl:** `server/monitor.js`

Tap:
```js
allowed_mentions: {
  parse: ['users', 'roles', 'everyone']
}
```
Dəyiş:
```js
allowed_mentions: {
  parse: ['users']
}
```

---

## 4-cü hissə: Kod keyfiyyəti (aşağı prioritet, vaxt olanda)

- `ImportModal.tsx`, `SettingsModal.tsx`, `UptimeCalendar.tsx`, `ResponseTimeChart.tsx`, `AddSiteModal.tsx` fayllarında `any` tipini konkret interface-lərlə əvəz et
- Bunu ayrı, kiçik PR/commit kimi et — funksional dəyişiklik deyil, risk aşağıdır amma diqqət tələb edir

---

## Test checklist (hər hissədən sonra)

**1-ci hissə (bug-lar):**
1. Login ol, domen/hosting bitmə tarixini redaktə et — uğurla saxlanmalıdır
2. Sayt sil — UI yalnız backend 200 qaytardıqda yenilənməlidir; şifrəsiz silməyə çalışsan, sayt siyahıda qalmalıdır
3. Login olaraq: test email göndər, test webhook göndər, backup yarat/bərpa/sil — hamısı uğurla işləməlidir

**2-ci hissə (təhlükəsizlik):**
4. `../../server/.env` kimi fayl adı ilə backup download sorğusu → 400 qaytarmalıdır
5. Auth olmadan backup download → 401 qaytarmalıdır
6. Server log-larında credentials POST zamanı şifrələr görünməməlidir
7. `GET /api/settings/webhooks` cavabında tam URL-lər deyil, maskalanmış versiya olmalıdır; Settings UI-də webhook redaktəsi hələ də düzgün işləməlidir (əsl URL itməməlidir)

**3-cü hissə:**
8. 10-dan çox səhv şifrə cəhdi → rate limit mesajı gəlməlidir
9. 50MB-dan böyük import faylı → rədd edilməlidir
10. Boşluqlu adı olan backup faylını download/restore/delete et — URL sınmamalıdır
