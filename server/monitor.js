import axios from 'axios';
import sslChecker from 'ssl-checker';
import * as cheerio from 'cheerio';
import dns from 'dns/promises';
import { createRequire } from 'module';
import { dbAll, dbGet, dbRun } from './db.js';
import { sendDowntimeAlert } from './mailer.js';

// whois-json CJS paketidir — ESM mühitində createRequire ilə yükləyirik
const require = createRequire(import.meta.url);
const whois = require('whois-json');

// Default webhook message template
const DEFAULT_TEMPLATE = '⚠️ **Sayt Offline Oldu**\n\n**Sayt:** {name}\n**URL:** {url}\n**Status:** {status}\n**Vaxt:** {time}';

// Replace template variables with actual values
function formatMessage(template, site, result) {
  return template
    .replace(/{name}/g, site.name)
    .replace(/{url}/g, site.url)
    .replace(/{status}/g, result.http_code || 'No Response')
    .replace(/{time}/g, new Date().toLocaleString('az-AZ'))
    .replace(/{response_time}/g, result.response_time ? `${result.response_time}ms` : 'N/A')
    .replace(/{ip}/g, result.server_ip || 'Unknown')
    .replace(/{hosting}/g, result.hosting_provider || 'Unknown');
}

// Send webhook notifications
async function sendWebhookNotification(site, result) {
  try {
    const row = await dbGet("SELECT value FROM settings WHERE key = 'webhooks'");
    if (!row) return;
    
    const webhooks = JSON.parse(row.value);
    const template = webhooks.message_template || DEFAULT_TEMPLATE;
    const message = formatMessage(template, site, result);
    
    // Telegram webhook
    if (webhooks.telegram_webhook) {
      await axios.post(webhooks.telegram_webhook, {
        text: message,
        parse_mode: 'Markdown'
      }).catch(() => {});
    }
    
    // Discord webhook - with optional user/role ping
    if (webhooks.discord_webhook) {
      let discordContent = message;
      // Discord User ID varsa, mesajın əvvəlinə ping əlavə et
      if (webhooks.discord_user_id && webhooks.discord_user_id.trim()) {
        discordContent = `<@${webhooks.discord_user_id.trim()}> ${message}`;
      }
      await axios.post(webhooks.discord_webhook, {
        content: discordContent,
        allowed_mentions: {
          parse: ['users', 'roles', 'everyone']
        }
      }).catch(() => {});
    }
  } catch (err) {
    console.error('Webhook notification failed:', err.message);
  }
}

// Known hosting/CDN IP ranges and patterns
function detectHostingProvider(ip, hostname) {
  if (!ip) return 'Unknown';

  const providers = [
    { name: 'Cloudflare', ranges: ['104.16.', '104.17.', '104.18.', '104.19.', '104.20.', '104.21.', '104.22.', '104.23.', '104.24.', '104.25.', '172.67.', '173.245.', '103.21.', '103.22.', '103.31.', '141.101.', '108.162.', '190.93.', '188.114.', '197.234.', '198.41.'] },
    { name: 'AWS (Amazon)', ranges: ['3.', '13.', '18.', '34.', '35.', '44.', '46.51.', '50.', '52.', '54.', '63.', '75.', '76.', '99.', '100.', '107.20.', '107.21.', '107.22.', '174.129.', '176.32.', '184.72.', '184.73.', '204.236.'] },
    { name: 'Google Cloud', ranges: ['34.', '35.', '104.196.', '104.197.', '104.198.', '104.199.', '130.211.', '146.148.', '162.222.', '173.255.', '199.36.'] },
    { name: 'DigitalOcean', ranges: ['104.131.', '104.236.', '107.170.', '128.199.', '134.209.', '137.184.', '138.68.', '138.197.', '139.59.', '142.93.', '143.110.', '143.198.', '144.126.', '146.190.', '147.182.', '149.154.', '157.230.', '157.245.', '159.65.', '159.89.', '159.203.', '161.35.', '162.243.', '163.47.', '164.90.', '164.92.', '165.22.', '165.227.', '167.71.', '167.99.', '167.172.', '170.64.', '174.138.', '178.62.', '178.128.', '188.166.', '192.241.', '198.199.', '198.211.', '206.189.', '207.154.', '209.97.'] },
    { name: 'Hetzner', ranges: ['49.12.', '49.13.', '65.108.', '65.109.', '78.46.', '78.47.', '88.198.', '88.99.', '95.216.', '116.202.', '116.203.', '128.140.', '135.181.', '136.243.', '138.201.', '142.132.', '144.76.', '148.251.', '157.90.', '159.69.', '162.55.', '167.235.', '168.119.', '176.9.', '178.63.', '188.40.', '195.201.', '213.133.', '213.239.'] },
    { name: 'Vercel', ranges: ['76.76.21.', '76.223.'] },
    { name: 'Netlify', ranges: ['75.2.', '99.83.'] },
    { name: 'OVH', ranges: ['51.68.', '51.75.', '51.77.', '51.79.', '51.81.', '51.83.', '51.89.', '51.91.', '51.178.', '51.195.', '54.36.', '54.37.', '54.38.', '54.39.', '91.121.', '92.222.', '137.74.', '139.99.', '141.94.', '142.4.', '144.217.', '145.239.', '147.135.', '148.113.', '149.56.', '158.69.', '164.132.', '167.114.', '176.31.', '178.32.', '185.12.', '188.165.', '192.95.', '192.99.', '193.70.', '198.27.', '198.50.', '198.100.', '198.245.', '213.186.', '213.251.'] },
    { name: 'GoDaddy', ranges: ['50.62.', '50.63.', '68.178.', '92.205.', '97.74.', '148.72.', '160.153.', '173.201.', '184.168.', '198.71.'] },
    { name: 'Namecheap', ranges: ['198.54.', '162.0.', '68.65.'] },
    { name: 'Hostinger', ranges: ['153.92.', '185.200.', '31.170.', '31.220.', '46.17.', '77.68.', '84.32.', '86.107.', '89.116.', '141.136.', '145.14.', '153.92.', '176.57.', '185.185.', '185.201.', '185.224.', '188.68.', '193.161.', '194.195.'] },
    { name: 'Microsoft Azure', ranges: ['13.', '20.', '23.', '40.', '51.', '52.', '65.52.', '70.37.', '104.40.', '104.41.', '104.42.', '104.43.', '104.44.', '104.45.', '104.46.', '104.47.', '104.208.', '104.209.', '104.210.', '104.211.', '104.212.', '104.213.', '104.214.', '104.215.', '111.221.', '131.253.', '134.170.', '137.116.', '137.117.', '137.135.', '138.91.', '157.55.', '157.56.', '168.61.', '168.62.', '168.63.', '191.232.', '191.233.', '191.234.', '191.235.', '191.236.', '191.237.', '191.238.', '191.239.'] },
  ];

  for (const provider of providers) {
    for (const range of provider.ranges) {
      if (ip.startsWith(range)) {
        return provider.name;
      }
    }
  }

  return 'Other';
}

// İki səviyyəli TLD-lər (root domain düzgün çıxarmaq üçün)
const TWO_LEVEL_TLDS = new Set([
  'co.uk', 'org.uk', 'me.uk', 'gov.uk', 'ac.uk',
  'com.tr', 'net.tr', 'org.tr', 'gov.tr', 'edu.tr',
  'com.az', 'net.az', 'org.az', 'gov.az', 'edu.az',
  'com.ru', 'com.ua', 'co.in', 'com.au', 'co.nz',
  'com.br', 'co.za', 'com.mx', 'com.sa', 'com.ge',
]);

function getRootDomain(hostname) {
  const parts = hostname.replace(/^www\./, '').split('.');
  if (parts.length <= 2) return parts.join('.');
  const lastTwo = parts.slice(-2).join('.');
  // Əgər son iki hissə məlum iki səviyyəli TLD-dirsə, üç hissə götür
  if (TWO_LEVEL_TLDS.has(lastTwo)) {
    return parts.slice(-3).join('.');
  }
  return lastTwo;
}

// Obyektin bütün açarlarında expiry/registrar tapmaq üçün
function findFieldByKeywords(obj, keywords) {
  if (!obj || typeof obj !== 'object') return null;
  for (const key of Object.keys(obj)) {
    const lower = key.toLowerCase();
    if (keywords.some(kw => lower.includes(kw))) {
      const val = obj[key];
      if (val && typeof val === 'string' && val.trim()) return val.trim();
    }
  }
  return null;
}

// Müxtəlif WHOIS tarix formatlarını parse et (.ru: 2025.03.15, digərləri: DD.MM.YYYY və s.)
function parseWhoisDate(raw) {
  if (!raw) return null;
  const s = String(raw).trim();

  // ISO / standart format
  let d = new Date(s);
  if (!isNaN(d.getTime())) return d;

  // YYYY.MM.DD (.ru, .su, .рф)
  let m = s.match(/^(\d{4})\.(\d{2})\.(\d{2})/);
  if (m) {
    d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
    if (!isNaN(d.getTime())) return d;
  }

  // DD.MM.YYYY və ya DD-MM-YYYY
  m = s.match(/^(\d{2})[.\-/](\d{2})[.\-/](\d{4})/);
  if (m) {
    d = new Date(`${m[3]}-${m[2]}-${m[1]}T00:00:00Z`);
    if (!isNaN(d.getTime())) return d;
  }

  return null;
}

// WHOIS + RDAP fallback ilə domain expiry axtar
async function lookupDomainExpiry(rootDomain) {
  const out = { expiry: null, registrar: null };

  // 1) WHOIS
  try {
    const whoisData = await whois(rootDomain, { follow: 2, timeout: 8000 });
    const data = Array.isArray(whoisData) ? whoisData[0] : whoisData;
    if (data && typeof data === 'object') {
      const reg = findFieldByKeywords(data, ['registrar']);
      if (reg) out.registrar = reg;
      const exp = data.expirationDate || data.registryExpiryDate ||
                  data.registrarRegistrationExpirationDate || data.paidTill ||
                  findFieldByKeywords(data, ['expir', 'paid', 'renewal', 'valid until', 'free-date']);
      const d = parseWhoisDate(exp);
      if (d) out.expiry = d.toISOString().split('T')[0];
    }
  } catch {}

  // 2) RDAP fallback (expiry tapılmayıbsa) — müasir protokol, çox gTLD-ni dəstəkləyir
  if (!out.expiry) {
    try {
      const res = await axios.get(`https://rdap.org/domain/${rootDomain}`, {
        timeout: 8000,
        headers: { 'Accept': 'application/rdap+json' },
      });
      const events = res.data?.events || [];
      const expEvent = events.find(e => e.eventAction === 'expiration');
      const d = parseWhoisDate(expEvent?.eventDate);
      if (d) out.expiry = d.toISOString().split('T')[0];
      // Registrar RDAP entities-dən
      if (!out.registrar && Array.isArray(res.data?.entities)) {
        const registrarEntity = res.data.entities.find(e => e.roles?.includes('registrar'));
        if (registrarEntity?.vcardArray?.[1]) {
          const fn = registrarEntity.vcardArray[1].find(v => v[0] === 'fn');
          if (fn?.[3]) out.registrar = fn[3];
        }
      }
    } catch {}
  }

  return out;
}

async function checkSite(site) {
  const result = {
    site_id: site.id,
    status: 'offline',
    http_code: null,
    response_time: null,
    ssl_valid: null,
    ssl_days_remaining: null,
    ssl_expiry: null,
    seo_title: 'no',
    seo_title_value: null,
    seo_description: 'no',
    seo_description_value: null,
    seo_h1: 'no',
    seo_robots: null,
    seo_canonical: 'no',
    server_ip: null,
    hosting_provider: null,
    domain_registrar: null,
    domain_expiry: null,
    domain_days_remaining: null,
  };

  try {
    const start = Date.now();
    const response = await axios.get(site.url, {
      timeout: 10000,
      headers: { 'User-Agent': 'SiteMonitor/1.0' },
      maxRedirects: 5,
      validateStatus: () => true,
    });
    result.response_time = Date.now() - start;
    result.http_code = response.status;
    result.status = response.status >= 200 && response.status < 400 ? 'online' : 'offline';

    // SEO checks
    if (response.headers['content-type']?.includes('text/html')) {
      const $ = cheerio.load(response.data);

      const title = $('title').text().trim();
      if (title) {
        result.seo_title = 'yes';
        result.seo_title_value = title.substring(0, 200);
      }

      const metaDesc = $('meta[name="description"]').attr('content');
      if (metaDesc) {
        result.seo_description = 'yes';
        result.seo_description_value = metaDesc.substring(0, 300);
      }

      if ($('h1').length > 0) {
        result.seo_h1 = 'yes';
      }

      const robotsMeta = $('meta[name="robots"]').attr('content');
      result.seo_robots = robotsMeta || null;

      const canonical = $('link[rel="canonical"]').attr('href');
      if (canonical) {
        result.seo_canonical = 'yes';
      }
    }
  } catch (err) {
    result.status = 'offline';
    result.response_time = null;
  }

  // SSL check
  try {
    const url = new URL(site.url);
    if (url.protocol === 'https:') {
      const sslResult = await sslChecker(url.hostname);
      result.ssl_valid = sslResult.valid ? 1 : 0;
      result.ssl_days_remaining = sslResult.daysRemaining;
      result.ssl_expiry = sslResult.validTo;
    }
  } catch {
    result.ssl_valid = 0;
  }

  // Domain & Hosting info
  try {
    const url = new URL(site.url);
    const hostname = url.hostname;

    // Get server IP
    const addresses = await dns.resolve4(hostname);
    if (addresses.length > 0) {
      result.server_ip = addresses[0];
    }

    // Detect hosting provider from IP and headers
    result.hosting_provider = detectHostingProvider(result.server_ip, hostname);

    // Domain expiry — əvvəlcə WHOIS, sonra RDAP fallback
    const rootDomain = getRootDomain(hostname);
    const domainData = await lookupDomainExpiry(rootDomain);
    if (domainData.registrar) result.domain_registrar = domainData.registrar;
    if (domainData.expiry) {
      result.domain_expiry = domainData.expiry;
      const now = new Date();
      result.domain_days_remaining = Math.ceil((new Date(domainData.expiry) - now) / (1000 * 60 * 60 * 24));
    }
  } catch {
    // DNS lookup failed
  }

  return result;
}

async function getLastStatus(siteId) {
  const row = await dbGet(
    'SELECT status FROM checks WHERE site_id = ? ORDER BY checked_at DESC LIMIT 1',
    [siteId]
  );
  return row ? row.status : null;
}

export async function runChecks(io) {
  const sites = await dbAll('SELECT * FROM sites');
  if (sites.length === 0) return;

  for (const site of sites) {
    const previousStatus = await getLastStatus(site.id);
    const result = await checkSite(site);

    await dbRun(
      `INSERT INTO checks (site_id, status, http_code, response_time, ssl_valid, ssl_days_remaining, ssl_expiry,
        seo_title, seo_title_value, seo_description, seo_description_value, seo_h1, seo_robots, seo_canonical,
        server_ip, hosting_provider, domain_expiry, domain_registrar, domain_days_remaining)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        result.site_id, result.status, result.http_code, result.response_time,
        result.ssl_valid, result.ssl_days_remaining, result.ssl_expiry,
        result.seo_title, result.seo_title_value, result.seo_description,
        result.seo_description_value, result.seo_h1, result.seo_robots, result.seo_canonical,
        result.server_ip, result.hosting_provider,
        result.domain_expiry, result.domain_registrar, result.domain_days_remaining,
      ]
    );

    // Send alert if site went from online to offline
    if (previousStatus === 'online' && result.status === 'offline') {
      sendDowntimeAlert(site, result);
      sendWebhookNotification(site, result);
      // Incident başladı — qeyd et
      await dbRun(
        `INSERT INTO incidents (site_id, started_at, http_code) VALUES (?, datetime('now'), ?)`,
        [site.id, result.http_code]
      );
    }

    // Sayt yenidən online oldu — aktiv incident-i bağla
    if (previousStatus === 'offline' && result.status === 'online') {
      const openIncident = await dbGet(
        `SELECT id, started_at FROM incidents WHERE site_id = ? AND resolved_at IS NULL ORDER BY started_at DESC LIMIT 1`,
        [site.id]
      );
      if (openIncident) {
        const durationSec = Math.round((Date.now() - new Date(openIncident.started_at + 'Z').getTime()) / 1000);
        await dbRun(
          `UPDATE incidents SET resolved_at = datetime('now'), duration_seconds = ? WHERE id = ?`,
          [durationSec, openIncident.id]
        );
      }
    }

    // Response time xəbərdarlığı — son 5 yoxlamada orta 3x artıbsa
    if (result.status === 'online' && result.response_time) {
      checkResponseTimeAlert(site, result.response_time);
    }

    // Store geo-location for server IP
    if (result.server_ip) {
      try {
        const geoRes = await axios.get(`http://ip-api.com/json/${result.server_ip}`);
        if (geoRes.data.status === 'success') {
          await dbRun(
            `INSERT OR REPLACE INTO site_locations (site_id, latitude, longitude, country, city)
             VALUES (?, ?, ?, ?, ?)`,
            [site.id, geoRes.data.lat, geoRes.data.lon, geoRes.data.country, geoRes.data.city]
          );
        }
      } catch {
        // Geo-location lookup failed
      }
    }
  }

  // Emit updated data to all connected clients
  if (io) {
    const updatedSites = await getAllSitesWithLatestCheck();
    io.emit('sites-updated', updatedSites);
  }
}

export async function getAllSitesWithLatestCheck() {
  const sites = await dbAll('SELECT * FROM sites');

  const results = [];
  for (const site of sites) {
    const latestCheck = await dbGet(
      'SELECT * FROM checks WHERE site_id = ? ORDER BY checked_at DESC LIMIT 1',
      [site.id]
    );

    // Calculate uptime for last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const totalChecks = await dbGet(
      'SELECT COUNT(*) as count FROM checks WHERE site_id = ? AND checked_at >= ?',
      [site.id, thirtyDaysAgo]
    );
    const onlineChecks = await dbGet(
      "SELECT COUNT(*) as count FROM checks WHERE site_id = ? AND checked_at >= ? AND status = 'online'",
      [site.id, thirtyDaysAgo]
    );

    const uptime = totalChecks.count > 0
      ? ((onlineChecks.count / totalChecks.count) * 100).toFixed(2)
      : null;

    results.push({
      ...site,
      latestCheck: latestCheck || null,
      uptime: uptime ? parseFloat(uptime) : null,
    });
  }

  return results;
}

export function startMonitoring(io) {
  // Run immediately on start
  runChecks(io);

  // Then every 60 seconds
  setInterval(() => runChecks(io), 60000);

  // Expiry xəbərdarlıqlarını hər 12 saatda bir yoxla
  checkExpiryAlerts();
  setInterval(() => checkExpiryAlerts(), 12 * 60 * 60 * 1000);
}

// Response time yavaşlama xəbərdarlığı
async function checkResponseTimeAlert(site, currentResponseTime) {
  try {
    // Son 10 yoxlamanın ortasını götür (cari xaric)
    const recent = await dbAll(
      `SELECT response_time FROM checks WHERE site_id = ? AND status = 'online' AND response_time IS NOT NULL ORDER BY checked_at DESC LIMIT 10 OFFSET 1`,
      [site.id]
    );
    if (recent.length < 5) return; // Kifayət qədər məlumat yoxdur

    const avg = recent.reduce((s, r) => s + r.response_time, 0) / recent.length;
    // 3x artıbsa VƏ 2000ms-dən çoxdursa xəbərdarlıq
    if (currentResponseTime > avg * 3 && currentResponseTime > 2000) {
      // Bu gün bu sayt üçün artıq xəbərdarlıq göndərmişiksə, skip et
      const today = new Date().toISOString().split('T')[0];
      const alreadySent = await dbGet(
        "SELECT id FROM expiry_alerts WHERE site_id = ? AND alert_type = 'response_slow' AND alerted_date = ?",
        [site.id, today]
      );
      if (alreadySent) return;

      const webhooksRow = await dbGet("SELECT value FROM settings WHERE key = 'webhooks'");
      const smtpRow = await dbGet("SELECT value FROM settings WHERE key = 'smtp'");
      const webhooks = webhooksRow ? JSON.parse(webhooksRow.value) : null;
      const smtp = smtpRow ? JSON.parse(smtpRow.value) : null;

      const msg = `🐌 **Sayt Yavaşlayıb**\n\n**Sayt:** ${site.name}\n**URL:** ${site.url}\n**Cari cavab müddəti:** ${currentResponseTime}ms\n**Normal orta:** ${Math.round(avg)}ms\n**${Math.round(currentResponseTime / avg)}x yavaş!**`;
      await sendExpiryNotification(msg, webhooks, smtp, site);
      await dbRun(
        "INSERT OR IGNORE INTO expiry_alerts (site_id, alert_type, alerted_date) VALUES (?, 'response_slow', ?)",
        [site.id, today]
      );
      console.log(`Response time alert: ${site.name} (${currentResponseTime}ms vs avg ${Math.round(avg)}ms)`);
    }
  } catch (err) {
    // Xəta olsa skip et
  }
}
// Domain və Hosting bitmə xəbərdarlıqları
async function checkExpiryAlerts() {
  try {
    const ALERT_DAYS = [3, 1]; // yalnız 3 gün və 1 gün qaldıqda
    const sites = await dbAll('SELECT * FROM sites');
    const webhooksRow = await dbGet("SELECT value FROM settings WHERE key = 'webhooks'");
    const smtpRow = await dbGet("SELECT value FROM settings WHERE key = 'smtp'");

    const webhooks = webhooksRow ? JSON.parse(webhooksRow.value) : null;
    const smtp = smtpRow ? JSON.parse(smtpRow.value) : null;

    for (const site of sites) {

      // === 1. Manual domain expiry ===
      if (site.manual_domain_expiry) {
        const days = Math.ceil((new Date(site.manual_domain_expiry) - new Date()) / (1000 * 60 * 60 * 24));
        if (ALERT_DAYS.includes(days)) {
          const key = `domain_manual_${days}d`;
          const alreadySent = await dbGet(
            "SELECT id FROM expiry_alerts WHERE site_id = ? AND alert_type = ? AND alerted_date = ?",
            [site.id, key, site.manual_domain_expiry]
          );
          if (!alreadySent) {
            const msg = buildExpiryMessage(site, 'domain', days, site.manual_domain_expiry);
            await sendExpiryNotification(msg, webhooks, smtp, site);
            await dbRun(
              "INSERT OR IGNORE INTO expiry_alerts (site_id, alert_type, alerted_date) VALUES (?, ?, ?)",
              [site.id, key, site.manual_domain_expiry]
            );
            console.log(`Domain expiry alert (manual) sent: ${site.name} (${days} gün qalıb)`);
          }
        }
      }

      // === 2. WHOIS-dən çəkilən domain expiry (checks cədvəli) ===
      const latestCheck = await dbGet(
        'SELECT domain_expiry, domain_days_remaining FROM checks WHERE site_id = ? ORDER BY checked_at DESC LIMIT 1',
        [site.id]
      );
      if (latestCheck?.domain_expiry && !site.manual_domain_expiry) {
        // Manual varsa WHOIS-i skip et (manual prioritetdir, dublikat olmasın)
        const days = Math.ceil((new Date(latestCheck.domain_expiry) - new Date()) / (1000 * 60 * 60 * 24));
        if (ALERT_DAYS.includes(days)) {
          const key = `domain_whois_${days}d`;
          const alreadySent = await dbGet(
            "SELECT id FROM expiry_alerts WHERE site_id = ? AND alert_type = ? AND alerted_date = ?",
            [site.id, key, latestCheck.domain_expiry]
          );
          if (!alreadySent) {
            const msg = buildExpiryMessage(site, 'domain', days, latestCheck.domain_expiry);
            await sendExpiryNotification(msg, webhooks, smtp, site);
            await dbRun(
              "INSERT OR IGNORE INTO expiry_alerts (site_id, alert_type, alerted_date) VALUES (?, ?, ?)",
              [site.id, key, latestCheck.domain_expiry]
            );
            console.log(`Domain expiry alert (WHOIS) sent: ${site.name} (${days} gün qalıb)`);
          }
        }
      }

      // === 3. Manual hosting expiry ===
      if (site.manual_hosting_expiry) {
        const days = Math.ceil((new Date(site.manual_hosting_expiry) - new Date()) / (1000 * 60 * 60 * 24));
        if (ALERT_DAYS.includes(days)) {
          const key = `hosting_${days}d`;
          const alreadySent = await dbGet(
            "SELECT id FROM expiry_alerts WHERE site_id = ? AND alert_type = ? AND alerted_date = ?",
            [site.id, key, site.manual_hosting_expiry]
          );
          if (!alreadySent) {
            const msg = buildExpiryMessage(site, 'hosting', days, site.manual_hosting_expiry);
            await sendExpiryNotification(msg, webhooks, smtp, site);
            await dbRun(
              "INSERT OR IGNORE INTO expiry_alerts (site_id, alert_type, alerted_date) VALUES (?, ?, ?)",
              [site.id, key, site.manual_hosting_expiry]
            );
            console.log(`Hosting expiry alert sent: ${site.name} (${days} gün qalıb)`);
          }
        }
      }

      // === 4. SSL sertifikat bitmə xəbərdarlığı ===
      const latestCheckSsl = await dbGet(
        'SELECT ssl_days_remaining, ssl_expiry FROM checks WHERE site_id = ? AND ssl_valid = 1 ORDER BY checked_at DESC LIMIT 1',
        [site.id]
      );
      if (latestCheckSsl?.ssl_days_remaining != null && latestCheckSsl.ssl_expiry) {
        const sslDays = latestCheckSsl.ssl_days_remaining;
        const SSL_ALERT_DAYS = [14, 3];
        if (SSL_ALERT_DAYS.includes(sslDays)) {
          const key = `ssl_${sslDays}d`;
          const alreadySent = await dbGet(
            "SELECT id FROM expiry_alerts WHERE site_id = ? AND alert_type = ? AND alerted_date = ?",
            [site.id, key, latestCheckSsl.ssl_expiry]
          );
          if (!alreadySent) {
            const urgency = sslDays <= 3 ? '🔴 **TƏCİLİ!**' : '🟡 **Xəbərdarlıq**';
            const msg = `🔒 SSL ${urgency}\n\n**Sayt:** ${site.name}\n**URL:** ${site.url}\n**SSL bitmə tarixi:** ${latestCheckSsl.ssl_expiry}\n**Qalan vaxt:** ${sslDays} gün\n\n⚡ SSL sertifikatı yeniləyin!`;
            await sendExpiryNotification(msg, webhooks, smtp, site);
            await dbRun(
              "INSERT OR IGNORE INTO expiry_alerts (site_id, alert_type, alerted_date) VALUES (?, ?, ?)",
              [site.id, key, latestCheckSsl.ssl_expiry]
            );
            console.log(`SSL expiry alert sent: ${site.name} (${sslDays} gün qalıb)`);
          }
        }
      }
    }
  } catch (err) {
    console.error('Expiry alert check failed:', err.message);
  }
}

function buildExpiryMessage(site, type, days, expiryDate) {
  const emoji = type === 'domain' ? '🌐' : '🖥️';
  const typeName = type === 'domain' ? 'Domain' : 'Hosting';
  const urgency = days === 1 ? '🔴 **SABAH BİTİR!**' : `🟠 **${days} GÜN QALDI**`;

  return `${emoji} ${urgency}\n\n**Sayt:** ${site.name}\n**URL:** ${site.url}\n**${typeName} bitmə tarixi:** ${expiryDate}\n**Qalan vaxt:** ${days} gün\n\n⚡ Dərhal yeniləyin!`;
}

async function sendExpiryNotification(message, webhooks, smtp, site) {
  // Discord / Telegram webhook
  if (webhooks) {
    if (webhooks.telegram_webhook) {
      await axios.post(webhooks.telegram_webhook, {
        text: message,
        parse_mode: 'Markdown'
      }).catch(() => {});
    }
    if (webhooks.discord_webhook) {
      let content = message;
      if (webhooks.discord_user_id?.trim()) {
        content = `<@${webhooks.discord_user_id.trim()}> ${message}`;
      }
      await axios.post(webhooks.discord_webhook, {
        content,
        allowed_mentions: { parse: ['users'] }
      }).catch(() => {});
    }
  }

  // Email
  if (smtp?.host && smtp?.recipient) {
    try {
      const { sendExpiryEmail } = await import('./mailer.js');
      await sendExpiryEmail(site, message, smtp);
    } catch {}
  }
}
