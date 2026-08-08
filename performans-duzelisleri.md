# Site-Dashboard — Performans Düzəlişləri (Kiro üçün)

## Kontekst
Hazırda 3 sayt izlənilir, ona görə paralel emal (bütün saytları eyni anda yoxlamaq) hələ lazım deyil — sequential yoxlama bu miqyasda kifayət qədər sürətlidir. Aşağıdakı iki düzəliş isə həm indi, həm gələcəkdə faydalıdır.

---

## 1. Monitoring intervalını 60 saniyədən 30 dəqiqəyə dəyiş

**Fayl:** `server/monitor.js`

Tap (~sətir 440-441):
```js
// Then every 60 seconds
setInterval(() => runChecks(io), 60000);
```

Dəyiş:
```js
// Then every 30 minutes
setInterval(() => runChecks(io), 30 * 60 * 1000);
```

---

## 2. WHOIS və geo-location nəticələrini keşlə (təkrar sorğuları azalt)

**Problem:** Hazırda `checkSite()` funksiyası **hər yoxlama dövründə** (indi 30 dəqiqədə bir olacaq, əvvəl hər dəqiqə idi) WHOIS lookup və geo-location (`ip-api.com`) sorğusu göndərir. Bunların ikisi də nadir hallarda dəyişən məlumatdır:
- Domen registrar/expiry tarixi adətən aylarla, illərlə eyni qalır
- Server IP-si (və ona bağlı geo-location) də nadir hallarda dəyişir

Bu sorğuları hər dövrədə təkrarlamaq həm hədərdir, həm də `ip-api.com`-un pulsuz tarifi (dəqiqədə 45 sorğu) kimi xarici API limitlərinə yaxınlaşdıra bilər gələcəkdə sayt sayı artanda.

**Tələb olunan düzəliş:**

### 2.1 — DB-yə son WHOIS/geo yoxlama vaxtını saxlamaq üçün sütun əlavə et

`server/db.js`-də digər `ALTER TABLE` sətirlərinin yanına əlavə et:
```js
try { await dbExec(`ALTER TABLE sites ADD COLUMN last_whois_check TEXT`); } catch {}
try { await dbExec(`ALTER TABLE sites ADD COLUMN last_geo_check TEXT`); } catch {}
```

### 2.2 — `checkSite()` funksiyasında WHOIS/geo sorğusunu şərtləndir

`server/monitor.js`-də domain/hosting info hissəsini tap (WHOIS və geo-location çağırışlarının olduğu yer, `checkSite` funksiyası daxilində). Hazırkı məntiq hər dəfə sorğu göndərir — bunu belə dəyiş:

```js
// WHOIS-u yalnız son yoxlamadan 12 saatdan çox keçibsə et
const WHOIS_CACHE_HOURS = 12;
const now = new Date();
const lastWhoisCheck = site.last_whois_check ? new Date(site.last_whois_check) : null;
const shouldCheckWhois = !lastWhoisCheck || (now - lastWhoisCheck) > WHOIS_CACHE_HOURS * 60 * 60 * 1000;

if (shouldCheckWhois) {
  const rootDomain = getRootDomain(hostname);
  const domainData = await lookupDomainExpiry(rootDomain);
  if (domainData.registrar) result.domain_registrar = domainData.registrar;
  if (domainData.expiry) {
    result.domain_expiry = domainData.expiry;
    result.domain_days_remaining = Math.ceil((new Date(domainData.expiry) - now) / (1000 * 60 * 60 * 24));
  }
  await dbRun(`UPDATE sites SET last_whois_check = datetime('now') WHERE id = ?`, [site.id]);
} else {
  // Keşlənmiş dəyəri sondan olan check-dən götür
  const lastCheck = await dbGet(
    `SELECT domain_registrar, domain_expiry, domain_days_remaining FROM checks WHERE site_id = ? AND domain_expiry IS NOT NULL ORDER BY checked_at DESC LIMIT 1`,
    [site.id]
  );
  if (lastCheck) {
    result.domain_registrar = lastCheck.domain_registrar;
    result.domain_expiry = lastCheck.domain_expiry;
    // Qalan günü yenidən hesabla (tarix dəyişməsə də, "neçə gün qalıb" hər dəfə yenilənməlidir)
    if (lastCheck.domain_expiry) {
      result.domain_days_remaining = Math.ceil((new Date(lastCheck.domain_expiry) - now) / (1000 * 60 * 60 * 24));
    }
  }
}
```

Eyni məntiqi geo-location sorğusu üçün də tətbiq et (`runChecks` funksiyasında, `ip-api.com` çağırışının olduğu yer) — `last_geo_check` sütunundan istifadə edərək, yalnız IP dəyişibsə və ya 24 saatdan çox keçibsə yenidən sorğula:

```js
const GEO_CACHE_HOURS = 24;
const lastGeoCheck = site.last_geo_check ? new Date(site.last_geo_check) : null;
const shouldCheckGeo = !lastGeoCheck || (Date.now() - lastGeoCheck.getTime()) > GEO_CACHE_HOURS * 60 * 60 * 1000;

if (result.server_ip && shouldCheckGeo) {
  try {
    const geoRes = await axios.get(`http://ip-api.com/json/${result.server_ip}`);
    if (geoRes.data.status === 'success') {
      await dbRun(
        `INSERT OR REPLACE INTO site_locations (site_id, latitude, longitude, country, city)
         VALUES (?, ?, ?, ?, ?)`,
        [site.id, geoRes.data.lat, geoRes.data.lon, geoRes.data.country, geoRes.data.city]
      );
      await dbRun(`UPDATE sites SET last_geo_check = datetime('now') WHERE id = ?`, [site.id]);
    }
  } catch {
    // Geo-location lookup failed
  }
}
```

**Qeyd:** Dəqiq kod yerləşdirməsi (`runChecks` və `checkSite` funksiyalarının hansı hissəsində) mövcud kodun strukturuna uyğun olaraq Kiro tərəfindən düzgün inteqrasiya edilməlidir — yuxarıdakı nümunələr məntiqi göstərir, birbaşa copy-paste hər zaman uyğun gəlməyə bilər, funksiyanın mövcud dəyişən adlarına (`site`, `result`, `hostname`) uyğunlaşdırılmalıdır.

---

## Test checklist

1. Server-i yenidən başlat, log-larda ilk yoxlamanın dərhal (`runChecks(io)` başlanğıcda birbaşa çağırılır) işlədiyini gör
2. 30 dəqiqə gözləmədən test etmək üçün, müvəqqəti olaraq interval-ı `10000` (10 saniyə) et, ikinci dövrədə WHOIS/geo sorğusunun **edilmədiyini** (log-da görünməməli, ya da console.log əlavə edib yoxla) təsdiqlə, sonra geri `30 * 60 * 1000`-ə qaytar
3. Sayt siyahısında domen/hosting məlumatlarının (registrar, expiry) hələ də düzgün göstərildiyini yoxla (keşdən götürülsə də UI-də dəyişməməlidir)
4. Yeni sayt əlavə edəndə (heç bir keş yoxdur) ilk yoxlamada WHOIS/geo sorğusunun edildiyini təsdiqlə
