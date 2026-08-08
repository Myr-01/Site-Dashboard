# Site-Dashboard — Path Traversal Düzəlişi (Kiro üçün)

## Kontekst
`server/index.js` faylında iki backup-download endpoint-i var. Hər ikisi `req.params.name` dəyərini sanitize etmədən birbaşa `path.join()`-ə verir. Bu, path traversal zəifliyi yaradır — istifadəçi fayl adı yerinə `../../server/.env` kimi dəyər göndərərək qovluqdan kənar fayllara çıxa bilər. Üstəlik bu iki endpoint auth da tələb etmir.

## Tələb olunan düzəliş

### 1. Sanitize helper funksiyası yarat

`server/index.js`-in yuxarı hissəsinə (digər helper funksiyalardan əvvəl) bunu əlavə et:

```js
// Fayl adında path traversal simvollarına icazə vermə
function isSafeFilename(name) {
  if (typeof name !== 'string' || name.length === 0) return false;
  // ".." , "/" , "\" olan hər hansı fayl adını rədd et
  if (name.includes('..') || name.includes('/') || name.includes('\\')) return false;
  return true;
}
```

### 2. `/api/backups/:name/download` endpoint-ini düzəlt

Hazırkı kod:
```js
app.get('/api/backups/:name/download', (req, res) => {
  try {
    const filePath = path.join(BACKUPS_PATH, req.params.name);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Backup tapılmadı' });
    }
    res.download(filePath, req.params.name);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

Bunu belə dəyiş — `requireAuth` əlavə et VƏ sanitize yoxlaması qoy:

```js
app.get('/api/backups/:name/download', requireAuth, (req, res) => {
  try {
    if (!isSafeFilename(req.params.name)) {
      return res.status(400).json({ error: 'Yanlış fayl adı' });
    }
    const filePath = path.join(BACKUPS_PATH, req.params.name);
    // Əlavə təhlükəsizlik: real path-in hələ də BACKUPS_PATH daxilində olduğunu təsdiqlə
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

### 3. `/api/sites/:id/backups/:name/download` endpoint-ini düzəlt

Hazırkı kod:
```js
app.get('/api/sites/:id/backups/:name/download', async (req, res) => {
  try {
    const { id, name } = req.params;
    const filePath = path.join(SITE_BACKUPS_DIR, `site_${id}`, name);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Backup tapılmadı' });
    }
    res.download(filePath, name);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

Bunu belə dəyiş:

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

### 4. Eyni faylda `restoreBackup` və `deleteBackup` çağırışlarını da yoxla

`server/backup.js`-də `restoreBackup(backupName)` və `deleteBackup(backupName)` funksiyaları da eyni problemi daşıyır (`path.join(BACKUP_DIR, backupName)` sanitize olunmadan). Bu funksiyaların da əvvəlində `isSafeFilename`-ə bənzər yoxlama əlavə et — ya funksiyaların özündə, ya da onları çağıran route-larda (`/api/backups/:name/restore`, `/api/backups/:name`) çağırışdan əvvəl.

Ən sadə yol: `server/backup.js`-ə də eyni `isSafeFilename` helper-ini kopyala (və ya export/import et `index.js`-dən) və `restoreBackup`/`deleteBackup` funksiyalarının başında bunu çağır:

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

## Test checklist

1. Normal backup adı ilə download işləməlidir (`monitor_backup_2026-01-01.db`)
2. `../../../etc/passwd` və ya `..%2F..%2Fserver%2F.env` kimi fayl adı ilə sorğu göndərəndə **400 error** qaytarmalıdır, fayl yüklənməməlidir
3. Admin login olmadan download endpoint-lərinə sorğu **401 error** qaytarmalıdır
4. Admin login olaraq normal backup download etmək əvvəlki kimi işləməlidir
5. Restore və delete əməliyyatları da normal fayl adları ilə əvvəlki kimi işləməlidir
