# ZeroTier Bağlantı Quraşdırması

## 1️⃣ Windows Firewall Qaydaları

### PowerShell (Administrator kimi):

```powershell
# Server üçün port 3001 açın
New-NetFirewallRule -DisplayName "Site Monitor Server" -Direction Inbound -LocalPort 3001 -Protocol TCP -Action Allow

# Client üçün port 5173 açın (lazımsa)
New-NetFirewallRule -DisplayName "Site Monitor Client" -Direction Inbound -LocalPort 5173 -Protocol TCP -Action Allow
```

### Və ya Manuel (GUI):
1. Windows Defender Firewall açın
2. Advanced Settings
3. Inbound Rules → New Rule
4. Port → TCP → 3001 və 5173
5. Allow the connection
6. Apply to all profiles
7. Name: "Site Monitor"

## 2️⃣ ZeroTier IP Öğrənmək

### Windows CMD/PowerShell:
```bash
ipconfig
```

ZeroTier interface-i axtarın (adətən "ZeroTier" yazılıb):
```
Ethernet adapter ZeroTier One [abc123]:
   IPv4 Address. . . . . . . . . . . : 10.147.17.123
```

## 3️⃣ Server Başlatma

```bash
cd server
node index.js
```

Server `0.0.0.0:3001`-də dinləməyə başlayacaq (bütün network interface-lər).

## 4️⃣ Client Konfiqurasiyası

### Dostunuz üçün `.env` faylı yaradın:

Client qovluğunda `.env` faylı:

```env
VITE_SERVER_URL=http://10.147.17.123:3001
```

**ÖNƏMLİ:** `10.147.17.123`-u öz ZeroTier IP-nizlə dəyişdirin!

### Client başlatma:

```bash
cd client
npm run dev
```

## 5️⃣ Dostunuz Necə Qoşulacaq?

### Variant 1: Production Build (tövsiyə olunur)

**Server kompüterində:**

```bash
# Client-i build et
cd client
npm run build

# Build olunmuş faylları serverdə serve et
cd ../server
npm install express-static
```

`server/index.js`-ə əlavə edin:

```javascript
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Serve static files
app.use(express.static(path.join(__dirname, '../client/dist')));

// Catch-all route for React Router
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api') && !req.path.startsWith('/socket.io')) {
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
  }
});
```

Dostunuz brauzerində açacaq:
```
http://10.147.17.123:3001
```

### Variant 2: Dev Mode (test üçün)

Dostunuz `.env` faylı ilə client-i öz kompüterində işlədə bilər:

```bash
cd client
# .env faylını yarat
echo VITE_SERVER_URL=http://10.147.17.123:3001 > .env
npm run dev
```

Sonra `http://localhost:5173` açar.

## 6️⃣ Firewall Test

```bash
# Dostunuz öz kompüterindən test etsin:
telnet 10.147.17.123 3001

# Və ya
curl http://10.147.17.123:3001/api/sites
```

## 7️⃣ Problem Həlli

### Server gözlənilən IP-də dinləmir?

```bash
# Server-də yoxlayın:
netstat -an | findstr 3001
```

Görməlisiniz:
```
TCP    0.0.0.0:3001          0.0.0.0:0              LISTENING
```

### CORS error?
✅ Artıq düzəldildi - `origin: true` konfiqurasiyası

### Socket.io bağlanmır?
✅ Artıq düzəldildi - reconnection parametrləri əlavə edilib

### Firewall problem?
Bütün antivirus və firewall proqramlarını yoxlayın.

## 8️⃣ ZeroTier Network Yoxlama

```bash
# ZeroTier CLI
zerotier-cli listnetworks
zerotier-cli listpeers
```

Dostunuzun ZeroTier-də "ONLINE" statusu olmalıdır.

## 🎯 Qısa Xülasə

**Siz (Server sahibi):**
1. Firewall-da port 3001 açın
2. ZeroTier IP-nizi öğrənin
3. `cd server && node index.js`
4. IP-nizi dostunuza göndərin

**Dostunuz:**
1. ZeroTier network-a join etsin
2. Brauzerində: `http://SIZIN_ZEROTIER_IP:3001`

**Və ya production üçün:**
- Client-i build edin və serverdən serve edin
- Dostunuz yalnız bir URL açacaq: `http://SIZIN_IP:3001`

---

✅ Artıq server `0.0.0.0`-da dinləyir
✅ CORS bütün origin-lərə icazə verir  
✅ Socket.io reconnection var
✅ Environment variable dəstəyi əlavə edildi
