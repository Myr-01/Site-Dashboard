# Site Monitor Dashboard

Tam funksional real-time sayt monitoring paneli.

---

## Funksiyalar

### Esas Monitorinq
- Avtomatik sayt yoxlamasi (her 30 deqiqede), neticeler WebSocket ile real-time paylanilir
- Online / Offline status
- HTTP status code
- Response time (ms)
- SSL sertifikat ve bitme tarixi
- Uptime (son 30 gun)
- SEO analizi

### Domain ve Hosting
- Server IP
- Hosting provider
- Domain registrar (WHOIS + RDAP)
- Domain/Hosting expiry tarixi
- Manual expiry destey
- Panel giris melumatlar

### Bildirish
- Email (SMTP)
- Telegram webhook
- Discord webhook (@ ping)
- Slack webhook (Incoming Webhook)
- Offline xeberdarliq
- Domain/Hosting bitme (3 gun + 1 gun)
- SSL bitme (14 gun + 3 gun)
- Yavashlama xeberdarligi

### Analitika
- Response time qrafiki (24h)
- Uptime calendar
- Geo-location xeritesi
- Incident log
- Ayliq hesabat
- PDF hesabat export

### Sayt Idareetmesi
- Qruplar ve kateqoriyalar
- Qeydler (notes)
- Backup + analiz (.zip, .wpress)
- CSV import

### Tehlukesizlik ve Baxim
- Admin shifresi bcrypt hash kimi saxlanilir (plain text yox)
- JWT sessiya token-leri (7 gun), shifre her sorghuda goturulmur
- Login brute-force limiti (5 deqiqede 10 cehd)
- Kohne check melumatlari avtomatik temizlenir (90 gun retention)
- WebSocket baghlanti statusu gostericisi

---

## Texnologiyalar

**Frontend:** React 18 + TypeScript, Tailwind CSS, Vite, Socket.io, Chart.js, Leaflet

**Backend:** Node.js + Express, Socket.io, SQLite3, Nodemailer, WHOIS-JSON

---

## Qurashdirma

### Server

```bash
cd server
npm install
cp .env.example .env
```

Sonra admin shifresini hash-e cevirin (ashaghida "Environment deyishenleri" bolmesine bax) ve serveri baslatin:

```bash
node index.js
```

### Client

```bash
cd client
npm install
npm run dev
```

Brauzer: http://localhost:5173

---

## Environment deyishenleri

`server/.env` faylinda:

| Deyishen | Mecburi | Tesvir |
|----------|---------|--------|
| `ADMIN_PASSWORD_HASH` | Beli | Admin shifresinin bcrypt hash-i. Teyin edilmezse admin girishi mumkun deyil |
| `JWT_SECRET` | Production-da beli | Sessiya token-lerini imzalamaq ucun uzun tesadufi string |
| `DATA_DIR` | Xeyr | SQLite ve backup-larin yerleshdiyi qovluq (Railway volume mount path) |
| `FRONTEND_URL` | Xeyr | CORS ucun frontend origin-i |
| `PORT` | Xeyr | Default 3001. Railway avtomatik teyin edir |
| `NODE_ENV` | Xeyr | `production` / `development` |

`client/.env` faylinda:

| Deyishen | Tesvir |
|----------|--------|
| `VITE_API_URL` | Backend URL-i. Teyin edilmezse cari origin istifade olunur |

### Shifreni hash-e cevirmek

Admin shifresi artiq plain text saxlanilmir. Hash yaratmaq ucun:

```bash
cd server
node scripts/hash-password.js
```

Script shifreni sorushacaq ve bcrypt hash cap edecek. Neticeni `.env` faylina yapishdirin:

```
ADMIN_PASSWORD_HASH=$2b$10$...
```

`JWT_SECRET` yaratmaq ucun:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### Kohne `ADMIN_PASSWORD`-dan kecid (migration)

Evvelki versiyalarda shifre `.env`-de `ADMIN_PASSWORD=` kimi plain text saxlanilirdi. Kecid ucun:

1. `cd server && node scripts/hash-password.js` ishledin, movcud shifrenizi daxil edin
2. Cixan hash-i `.env`-de `ADMIN_PASSWORD_HASH=` deyerine yapishdirin
3. Kohne `ADMIN_PASSWORD=` setrini `.env`-den silin
4. `JWT_SECRET=` setrini elave edin (yuxaridaki emrle yaradin)
5. Serveri restart edin

Frontend terefde de deyishiklik var: shifre artiq `sessionStorage`-da saxlanilmir, onun yerine JWT token saxlanilir. Brauzerde kohne sessiya varsa, tab-i baghlayib yeniden acin ve yeniden login olun.

---

## Testler

```bash
cd server && npm test
cd client && npx vitest run
```

---

## API

Endpoint-lerin tam siyahisi ve auth teleblerine baxmaq ucun: [API.md](API.md)

---

## Deploy

### Backend - Fly.io (tovsiye olunan)

Layihede `Dockerfile` ve `fly.toml` hazirdir. Docker lokal olaraq lazim deyil — Fly uzaqdan build edir.

**1. flyctl qurashdir ve daxil ol**

```powershell
iwr https://fly.io/install.ps1 -useb | iex
fly auth login
```

**2. Tetbiq yarat**

Ad qlobal unikal olmalidir, `fly.toml`-da `app` deyerini oz adinla deyish:

```powershell
fly apps create site-monitor-myr
```

**3. Persistent volume yarat (VACIB)**

Bunsuz her deploy-da butun melumat (SQLite bazasi, backup-lar) itir. Region `fly.toml`-daki `primary_region` ile eyni olmalidir:

```powershell
fly volumes create monitor_data --region fra --size 3
```

**4. Sirleri teyin et**

```powershell
fly secrets set `
  ADMIN_PASSWORD_HASH="<hash>" `
  JWT_SECRET="<secret>" `
  VAPID_PUBLIC_KEY="<public>" `
  VAPID_PRIVATE_KEY="<private>" `
  VAPID_SUBJECT="mailto:sizin@email.com" `
  FRONTEND_URL="https://your-app.vercel.app"
```

`NODE_ENV`, `PORT` ve `DATA_DIR` `fly.toml`-un `[env]` bolmesindedir — onlari secret kimi vermek lazim deyil.

**5. Deploy**

```powershell
fly deploy --remote-only
fly scale count 1
fly logs
```

**6. Yoxla**

```
https://<app-adi>.fly.dev/api/health
https://<app-adi>.fly.dev/status
```

#### Fly.io ucun kritik qeydler

| Mesele | Sebeb |
|--------|-------|
| **Yalniz 1 mashin** (`fly scale count 1`) | Melumat SQLite-dedir ve volume tek mashina baglidir. Ikinci mashin oz ayri bazasini alar. Elave olaraq monitoring dovru proses yaddashindadir — 2 mashin her sayti 2 defe yoxlayar ve bildirishler dublikat geler |
| **`auto_stop_machines = 'off'`** | Fly default olaraq trafik olmayanda mashini dayandirir. Monitoring tetbiqi ucun bu yolverilmezdir — panele bakan olmasa da yoxlamalar, bildirishler, gundelik backup ve cleanup ishlemelidir |
| **Volume mount olunmalidir** | `DATA_DIR=/data` teyin edilib, amma volume mount olunmasa server `/data`-ni konteyner diskinde yaradar ve melumat sessizce itir. `fly logs`-da `Data dir: /data` setrini yoxla |
| **Backup-lar volume-dadir** | 3GB volume ~ orta hacimde saytlar ucun kifayetdir. WordPress `.wpress` backup-lari yuklyirsense `fly volumes extend` ile boyut |

#### Melumatlarin kocurulmesi

Iki variant:

**a) Konfiqurasiya (saytlar + parametrler, tarixce olmadan)** — en sade yol:
Parametrler → Backup tab → "Export Et" ile JSON endir, Fly-daki panelde "Import Et".

**b) Tam baza (tarixce, hadiseler, statistika da daxil)**:

```powershell
fly ssh sftp shell
put server/monitor.db /data/monitor.db
exit
fly apps restart <app-adi>
```

---

### Backend - Railway (alternativ)

| Deyishen | Deyer |
|----------|-------|
| DATA_DIR | /data |
| ADMIN_PASSWORD_HASH | $2b$10$... (bcrypt hash) |
| JWT_SECRET | uzun tesadufi string |
| VAPID_PUBLIC_KEY | push ucun (opsional) |
| VAPID_PRIVATE_KEY | push ucun (opsional) |
| VAPID_SUBJECT | mailto:sizin@email.com |
| FRONTEND_URL | https://your-app.vercel.app |
| NODE_ENV | production |

### Frontend

`Dockerfile` client-i de build edir, yeni Fly.io hem API-ni, hem paneli eyni origin-den servis edir — ayri frontend deploy-a ehtiyac yoxdur ve CORS problemi olmur.

Frontend-i ayrica Vercel-de saxlamaq istesen:

| Deyishen | Deyer |
|----------|-------|
| VITE_API_URL | https://your-app.fly.dev |

- Root Directory: `client`
- Build: `npm run build`
- Output: `dist`

Bu halda Fly terefde `FRONTEND_URL` secret-ini Vercel URL-ine beraber teyin et (CORS ucun).

---

## Lisenziya

MIT
