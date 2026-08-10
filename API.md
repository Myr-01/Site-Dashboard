# API Reference

Bütün endpoint-lər `/api` prefiksi ilə başlayır. Base URL lokal işlədikdə `http://localhost:3001`.

## Autentifikasiya

Admin əməliyyatları JWT sessiya token-i tələb edir.

1. `POST /api/auth/verify` ilə şifrəni yoxla — cavabda `token` gəlir (7 gün etibarlıdır).
2. Sonrakı sorğularda token-i `x-admin-token` header-ində göndər.

```
x-admin-token: <JWT>
```

Auth sütununun dəyərləri:

| Dəyər | Mənası |
|-------|--------|
| — | Auth tələb olunmur (public oxuma) |
| Token | `x-admin-token` header-i tələb olunur |
| Token* | Header **və ya** `?token=` query parametri qəbul edilir (fayl endirmə üçün) |
| Qismən | Auth-suz işləyir, amma token varsa daha çox məlumat qaytarır |

Uğursuz auth `401` qaytarır: `{ "error": "İcazə yoxdur və ya sessiya bitib" }`

---

## Auth

| Metod | Endpoint | Auth | Təsvir |
|-------|----------|------|--------|
| POST | `/api/auth/verify` | — | Şifrəni yoxlayır, uğurlu olduqda JWT qaytarır. Rate limit: 5 dəqiqədə 10 cəhd |

**Body:** `{ "password": "..." }` → **Cavab:** `{ "success": true, "token": "<JWT>" }`

---

## Saytlar

| Metod | Endpoint | Auth | Təsvir |
|-------|----------|------|--------|
| GET | `/api/sites` | — | Bütün saytlar + son yoxlama + 30 günlük uptime. Həssas sahələr (username/password) daxil edilmir |
| POST | `/api/sites` | Token | Yeni sayt əlavə edir. Body: `{ name, url }` |
| DELETE | `/api/sites/:id` | Token | Saytı silir |
| GET | `/api/sites/:id/info` | — | Sayt haqqında əlavə məlumat |
| GET | `/api/sites/:id/history` | — | Cavab müddəti tarixçəsi (qrafik üçün) |
| GET | `/api/sites/:id/incidents` | — | Son 50 incident |
| POST | `/api/sites/:id/meta` | Token | Qeydləri və qrupu yeniləyir. Body: `{ notes, group_name }` |
| POST | `/api/sites/:id/manual-dates` | Token | Manual domain/hosting bitmə tarixləri |
| GET | `/api/sites/:id/credentials` | Token | Panel giriş məlumatları (həssas) |
| POST | `/api/sites/:id/credentials` | Token | Panel giriş məlumatlarını yazır |
| GET | `/api/sites/locations` | — | Bütün saytların geo-koordinatları (xəritə üçün) |

---

## Hesabatlar

| Metod | Endpoint | Auth | Təsvir |
|-------|----------|------|--------|
| GET | `/api/sites/:id/report` | — | JSON uptime hesabatı. Query: `?month=YYYY-MM` (default: son 30 gün) |
| GET | `/api/sites/:id/report/pdf` | Token* | PDF hesabat endirir (son 500 yoxlama, son 20 incident) |

---

## Parametrlər

| Metod | Endpoint | Auth | Təsvir |
|-------|----------|------|--------|
| GET | `/api/settings/email` | — | SMTP parametrləri (şifrə qaytarılmır) |
| POST | `/api/settings/email` | Token | SMTP parametrlərini saxlayır |
| POST | `/api/settings/test-email` | Token | Test email göndərir |
| GET | `/api/settings/webhooks` | Qismən | Webhook parametrləri. Token yoxdursa URL-lər maskalanır |
| POST | `/api/settings/webhooks` | Token | Webhook parametrlərini saxlayır |
| POST | `/api/settings/test-webhook` | Token | Telegram / Discord / Slack test mesajı göndərir |

**Webhook body sahələri:** `telegram_webhook`, `discord_webhook`, `discord_user_id`, `slack_webhook`, `message_template`

**Mesaj şablonu dəyişənləri:** `{name}` `{url}` `{status}` `{time}` `{response_time}` `{ip}` `{hosting}`

---

## Verilənlər bazası backup-ı

| Metod | Endpoint | Auth | Təsvir |
|-------|----------|------|--------|
| GET | `/api/backups` | — | Backup siyahısı |
| POST | `/api/backups` | Token | Dərhal backup yaradır |
| GET | `/api/backups/:name/download` | Token | Backup faylını endirir |
| POST | `/api/backups/:name/restore` | Token | Backup-dan bərpa edir (əvvəlcə avtomatik ehtiyat backup alınır) |
| DELETE | `/api/backups/:name` | Token | Backup-ı silir |

---

## Sayt backup-ları (WordPress)

| Metod | Endpoint | Auth | Təsvir |
|-------|----------|------|--------|
| GET | `/api/sites/:id/backups` | — | Sayta aid backup faylları |
| POST | `/api/sites/:id/backups` | Token | Backup yükləyir və analiz edir (`.zip`, `.wpress`, max 500MB) |
| GET | `/api/sites/:id/backups/:name/download` | Token | Backup faylını endirir |
| DELETE | `/api/sites/:id/backups/:name` | Token | Backup faylını silir |

---

## WebSocket

Socket.io ilə real-time yeniləmələr:

| Event | İstiqamət | Payload |
|-------|-----------|---------|
| `sites-updated` | server → client | `Site[]` — hər monitorinq dövründən sonra |

Client `connect` / `disconnect` event-lərini izləyərək bağlantı statusunu göstərir.

---

## CSV import

| Metod | Endpoint | Auth | Təsvir |
|-------|----------|------|--------|
| POST | `/api/import` | Token | CSV faylından saytları toplu şəkildə əlavə edir (multipart, `file` sahəsi, max 50MB) |
