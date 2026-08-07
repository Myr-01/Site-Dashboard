# Site-Dashboard — Təhlükəsizlik Düzəlişləri (Kiro üçün)

## Kontekst
Bu Node.js/Express + SQLite backend-də (`server/index.js`, `server/db.js`, `server/monitor.js`) 3 təhlükəsizlik problemi var. Aşağıdakı düzəlişləri **ardıcıl** tətbiq et, hər dəyişiklikdən sonra server-in hələ də düzgün işlədiyini yoxla (sayt siyahısı yüklənməli, admin login işləməli).

---

## Problem 1 (KRİTİK): Domain/hosting şifrələri auth olmadan hər kəsə görünür

**Səbəb:** `server/monitor.js`-də `getAllSitesWithLatestCheck()` funksiyası `SELECT * FROM sites` işlədir. Bu, `domain_password` və `hosting_password` sütunlarını da daxil edir. Bu funksiya `GET /api/sites` (auth-suz) və Socket.io `sites-updated` event-i vasitəsilə hər kəsə göndərilir.

**Tələb olunan düzəliş:**

1. `server/monitor.js`-də `getAllSitesWithLatestCheck()` funksiyasında `SELECT *` əvəzinə spesifik sütunlar seç — həssas sütunları (`domain_password`, `hosting_password`, `domain_username`, `hosting_username`) çıxar:

```js
const sites = await dbAll(`
  SELECT id, name, url, group_name, notes, created_at,
         manual_domain_registrar, manual_domain_expiry, manual_hosting_expiry,
         domain_login_url, hosting_login_url
  FROM sites
`);
```

(Qeyd: `domain_login_url` və `hosting_login_url` URL-dir, şifrə deyil — saxlana bilər. Yalnız username/password sahələrini çıxar.)

2. Yeni, **auth tələb edən** endpoint yarat ki, admin panel özü kredensialları göstərmək istəyəndə çağıra bilsin:

```js
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
```

3. Frontend-də (`client/src`) kredensialları göstərən komponenti tap (çox güman `SiteDetailModal` və ya oxşar) və indi `/api/sites` cavabından şifrələri oxumaq əvəzinə, admin login olduqdan sonra yeni `/api/sites/:id/credentials` endpoint-ini çağırmaq üçün yenilə.

---

## Problem 2 (YÜKSƏK): CORS faktiki olaraq bütün origin-lərə açıqdır

**Səbəb:** `server/index.js`-də CORS callback-in `else` branch-i də `callback(null, true)` qaytarır, bu da `ALLOWED_ORIGINS` yoxlamasını mənasız edir.

**Tələb olunan düzəliş:**

`server/index.js`-də CORS konfiqurasiyasını (həm Socket.io, həm Express `cors()` middleware-də) belə dəyiş:

```js
origin: (origin, callback) => {
  if (!origin || ALLOWED_ORIGINS.includes(origin) || /\.vercel\.app$/.test(origin)) {
    callback(null, true);
  } else {
    callback(new Error('CORS: Bu origin-ə icazə yoxdur'));
  }
},
```

Yəni `else` branch-i artıq `true` yox, error qaytarmalıdır. Development mühitində problem yaransa, `ALLOWED_ORIGINS`-ə `http://localhost:5173` və `http://localhost:3000` onsuz da var — kifayət etməlidir.

---

## Problem 3 (ORTA): Auth middleware tutarsız tətbiq olunub

**Səbəb:** Bəzi yazma/silmə endpoint-ləri (`POST`, `DELETE`, `PUT`) `requireAuth` middleware-dən istifadə etmir.

**Tələb olunan düzəliş:**

`server/index.js` faylında bütün route-ları gəz və aşağıdakı qaydaya əməl et:
- **Bütün `POST`, `PUT`, `DELETE` route-lar** (istisna: `/api/auth/verify`, çünki bu login endpoint-idir) `requireAuth` middleware-ni ikinci parametr kimi almalıdır: `app.post('/api/...', requireAuth, async (req, res) => {...})`
- Xüsusilə bunlara diqqət et: `manual-dates`, backup ilə bağlı bütün `DELETE`/`POST` route-lar
- `GET` route-lar (oxuma) auth-suz qala bilər — bu, dashboard-ın oxu-yalnız hissəsi üçün normaldır

Dəyişiklikdən sonra frontend-də bu route-ları çağıran fetch/axios sorğularının `x-admin-password` header-ini göndərdiyinə əmin ol (əksər hissədə onsuz da var, amma yeni qorunan route-lar üçün yoxla).

---

## Test checklist (dəyişiklikdən sonra əl ilə yoxla)

1. `GET /api/sites` cavabında `domain_password`/`hosting_password` sahələri **olmamalıdır**
2. Admin login olmadan `/api/sites/:id/credentials`-ə sorğu — 401 qaytarmalıdır
3. Admin login olaraq eyni sorğu — düzgün kredensialları qaytarmalıdır
4. Frontend-də sayt siyahısı, kredensial göstərmə, sayt əlavə/silmə funksiyaları əvvəlki kimi işləməlidir
5. `ALLOWED_ORIGINS`-də olmayan origin-dən sorğu (məs. Postman-da fərqli `Origin` header ilə) — rədd edilməlidir
