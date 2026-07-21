# Site Monitoring Dashboard

Tam funksional real-time sayt monitoring paneli.

## ✨ Funksiyalar

### 🎯 Əsas Funksiyalar
- ✅ Real-time sayt monitorinqi (hər 60 saniyədə)
- ✅ Online/Offline status izləməsi
- ✅ HTTP status code yoxlaması
- ✅ Response time ölçməsi (millisaniyə)
- ✅ SSL sertifikat yoxlaması və expiry date
- ✅ Uptime hesablaması (son 30 gün)
- ✅ SEO analizi (title, description, H1, robots, canonical)

### 🌍 Domain & Hosting
- ✅ Server IP adresi
- ✅ Hosting provider avtomatik aşkarlama
- ✅ Domain registrar məlumatı (WHOIS)
- ✅ Domain expiry tarixi və qalan günlər
- ✅ Manual domain/hosting expiry tarixi dəstəyi
- ✅ Rəng kodlu xəbərdarlıqlar (qırmızı/sarı/yaşıl)

### 📊 Qrafik və Analitika
- ✅ Response time qrafiki (son 24 saat)
- ✅ Uptime calendar (GitHub-style heatmap)
- ✅ Geo-location world map (server yerləşmələri)
- ✅ Real-time statistika

### 🔔 Bildirişlər
- ✅ Email bildirişləri (SMTP)
- ✅ Telegram webhook dəstəyi
- ✅ Discord webhook dəstəyi
- ✅ Sayt offline olanda avtomatik xəbərdarlıq

### 🎨 İstifadəçi İnterfeysi
- ✅ Qaranlıq və Açıq tema (toggle)
- ✅ Responsive dizayn (desktop, tablet, mobil)
- ✅ Floating toolbar (hover-activated)
- ✅ Modal animasiyalar
- ✅ Axtarış funksiyası
- ✅ CSV import/export

## 🛠️ Texnologiyalar

### Frontend
- React 18 + TypeScript
- Tailwind CSS
- Socket.io Client
- Chart.js & React-Chartjs-2
- Vite

### Backend
- Node.js + Express
- Socket.io
- SQLite3
- Axios, Cheerio, SSL-Checker
- Nodemailer
- WHOIS-JSON

## 📦 Quraşdırma

### Tələblər
- Node.js 18+
- npm

### 1. Server quraşdırma
```bash
cd server
npm install
npm start
```
Server port 3001-də işləyir.

### 2. Client quraşdırma
```bash
cd client
npm install
npm run dev
```
Client port 5173-də işləyir və API çağırışlarını serverə yönləndirir.

### 3. Brauzerdə açın
```
http://localhost:5173
```

## ⚙️ Konfiqurasiya

### Email Bildirişləri
1. Settings → Email Bildirişləri
2. SMTP məlumatlarını daxil edin
3. Test email göndərin
4. Saxla düyməsinə basın

### Telegram Webhook
1. Telegram botunuz üçün bot yaradın (@BotFather)
2. Webhook URL alın
3. Settings → Telegram/Discord
4. URL-ni daxil edib saxlayın

### Discord Webhook
1. Discord kanalınızda Settings → Integrations → Webhooks
2. Yeni webhook yaradın
3. URL-ni kopyalayın
4. Settings → Telegram/Discord bölməsinə əlavə edin

## 📱 Mobil Dəstək

Tam responsive dizayn:
- Floating toolbar mobil optimallaşdırılıb
- Touch-friendly düymələr
- Adaptive qrafiklər
- Mobil-friendly modallar

## 🗺️ Geo-location Xəritə

Serverlərinizin dünya xəritəsində harada yerləşdiyini görün:
- Avtomatik IP geo-location
- Real-time status göstəricisi
- Hover tooltips
- Hosting provider məlumatı

## 🎨 Tema Dəstəyi

İki tema mövcuddur:
- **Qaranlıq tema** (default): Premium tech görünüş
- **Açıq tema**: Klassik minimal dizayn

Floating toolbar-da ay/günəş ikonu ilə dəyişdirin.

## 📤 CSV Import Format

```csv
name,url
Google,https://google.com
GitHub,https://github.com
```

## 📊 API Endpoints

```
GET    /api/sites                    - Bütün saytlar
POST   /api/sites                    - Yeni sayt əlavə et
DELETE /api/sites/:id                - Sayt sil
POST   /api/sites/:id/manual-dates   - Manual tarixlər
GET    /api/sites/:id/history        - Yoxlanış tarixçəsi
POST   /api/import                   - CSV import
GET    /api/sites/locations          - Geo-location data
POST   /api/settings/email           - Email konfiqurasiyası
GET    /api/settings/email           - Email parametrləri
POST   /api/settings/webhooks        - Webhook konfiqurasiyası
GET    /api/settings/webhooks        - Webhook parametrləri
POST   /api/settings/test-email      - Test email göndər
```

## 🔄 Real-time Yenilənmələr

Socket.io ilə avtomatik yeniləmələr:
- Hər 60 saniyədə monitoring
- Dəyişikliklər dərhal görünür
- Manuel refresh lazım deyil

## 🎯 Gələcək Planlar

- [ ] Multi-user dəstəyi və autentifikasiya
- [ ] Advanced alerting rules
- [ ] Performance budgets
- [ ] Incident timeline
- [ ] API monitoring
- [ ] Certificate pinning

## 📄 Lisenziya

MIT

## 🤝 Töhfə

Pull request-lər xoş gəlmisiniz!

---

**Qeyd:** Bu monitoring paneli production istifadəsi üçün hazırdır. SSL, domain və hosting məlumatları avtomatik yoxlanılır.
