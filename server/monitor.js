import axios from 'axios';
import sslChecker from 'ssl-checker';
import * as cheerio from 'cheerio';
import dns from 'dns/promises';
import https from 'https';
import { createRequire } from 'module';
import { dbAll, dbGet, dbRun } from './db.js';
import { sendDowntimeAlert } from './mailer.js';
import { shouldRefreshCache, parseAlertDays } from './utils.js';
import { sendPushNotification } from './push.js';

// whois-json CJS paketidir — ESM mühitində createRequire ilə yükləyirik
const require = createRequire(import.meta.url);
const whois = require('whois-json');

// Monitorinq "tick"-i bu tezlikdə işləyir, amma hər saytın öz intervalı var
const TICK_INTERVAL_MS = 60 * 1000; // 1 dəqiqə
const TICK_TOLERANCE_MS = 5 * 1000; // tick sürüşməsi üçün tolerans
const DEFAULT_CHECK_INTERVAL_MINUTES = 30;

// site.id -> son real yoxlamanın vaxtı (ms).
// Yaddaşdadır: server restart olanda sıfırlanır və bütün saytlar dərhal bir dəfə
// yoxlanılır. Bu zərərsiz davranışdır, funksional problem deyil.
const lastCheckedMap = new Map();

// Multi-region probe configuration
// Production üçün: Cloudflare Workers, AWS Lambda@Edge, və ya öz distributed serverlərin
const REGION_PROBES = [
  { name: 'primary', endpoint: null }, // null = local check (bu server)
  // Future: distributed probe endpoints əlavə et
  // { name: 'us-east', endpoint: 'https://probe-us.example.com/check' },
  // { name: 'eu-west', endpoint: 'https://probe-eu.example.com/check' },
];

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

/**
 * Göndərilmiş bildirişi tarixçəyə yaz.
 * Bildiriş artıq göndərildiyi üçün burada xəta funksiyanın davamını pozmamalıdır.
 */
async function logNotification(siteId, channel, message) {
  try {
    await dbRun(
      'INSERT INTO notification_log (site_id, channel, message) VALUES (?, ?, ?)',
      [siteId ?? null, channel, message]
    );
  } catch (err) {
    console.error('Notification log failed:', err.message);
  }
}

// Send webhook notifications
async function sendWebhookNotification(site, result) {
  try {
    const row = await dbGet("SELECT value FROM settings WHERE key = 'webhooks'");
    if (!row) return;
    
    const webhooks = JSON.parse(row.value);
    const template = webhooks.message_template || DEFAULT_TEMPLATE;
    const message = formatMessage(template, site, result);
    const sentChannels = [];

    // Telegram webhook
    if (webhooks.telegram_webhook) {
      await axios.post(webhooks.telegram_webhook, {
        text: message,
        parse_mode: 'Markdown'
      }).catch(() => {});
      sentChannels.push('telegram');
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
          parse: ['users']
        }
      }).catch(() => {});
      sentChannels.push('discord');
    }

    // Slack webhook (Incoming Webhook)
    if (webhooks.slack_webhook) {
      await axios.post(webhooks.slack_webhook, {
        text: message,
      }).catch(() => {});
      sentChannels.push('slack');
    }

    // Brauzer push bildirişi — webhook-lardan asılı olmayaraq göndərilir
    const pushed = await sendPushNotification(
      `${site.name} — Offline`,
      `Sayt əlçatan deyil: ${site.url}`
    );
    if (pushed > 0) sentChannels.push('push');

    if (sentChannels.length > 0) {
      await logNotification(site.id, sentChannels.join('+'), message);
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

    // WHOIS-u yalnız son yoxlamadan 12 saatdan çox keçibsə et
    const WHOIS_CACHE_HOURS = 12;
    const now = new Date();
    const shouldCheckWhois = shouldRefreshCache(site.last_whois_check, WHOIS_CACHE_HOURS);

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
        if (lastCheck.domain_expiry) {
          result.domain_days_remaining = Math.ceil((new Date(lastCheck.domain_expiry) - now) / (1000 * 60 * 60 * 24));
        }
      }
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

  let checkedCount = 0;

  for (const site of sites) {
    // Baxım rejimindəki saytlar yoxlanılmır, bildiriş getmir
    if (site.maintenance_mode) continue;

    // Sayt-bəsində interval: vaxtı gəlməyən saytları skip et
    const intervalMs = (site.check_interval_minutes || DEFAULT_CHECK_INTERVAL_MINUTES) * 60 * 1000;
    const lastChecked = lastCheckedMap.get(site.id) || 0;
    // Tolerans: tick tam dəqiqə sərhədində düşməyəndə yoxlamanın bir tick geri qalmaması üçün
    if (Date.now() - lastChecked < intervalMs - TICK_TOLERANCE_MS) continue;

    lastCheckedMap.set(site.id, Date.now());
    checkedCount++;

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

    // Store geo-location for server IP — yalnız 24 saatdan çox keçibsə sorğula
    const GEO_CACHE_HOURS = 24;
    const shouldCheckGeo = shouldRefreshCache(site.last_geo_check, GEO_CACHE_HOURS);

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
  }

  // Silinmiş saytların map qeydlərini təmizlə (yaddaş sızması olmasın)
  if (lastCheckedMap.size > sites.length) {
    const liveIds = new Set(sites.map(s => s.id));
    for (const id of lastCheckedMap.keys()) {
      if (!liveIds.has(id)) lastCheckedMap.delete(id);
    }
  }

  // Yalnız real yoxlama olduqda yayımla — tick hər dəqiqə işlədiyi üçün
  // heç nə dəyişməyəndə lüzumsuz sorğu və trafik yaratmayaq
  if (io && checkedCount > 0) {
    const updatedSites = await getAllSitesWithLatestCheck();
    io.emit('sites-updated', updatedSites);
  }
}

export async function getAllSitesWithLatestCheck() {
  // Həssas sahələri (username/password) çıxarırıq — yalnız auth ilə ayrı endpoint-dən əldə edilə bilər
  const sites = await dbAll(`
    SELECT id, name, url, group_name, notes, created_at, color_tag, alert_days,
           maintenance_mode, check_interval_minutes,
           manual_domain_registrar, manual_domain_expiry, manual_hosting_expiry,
           domain_login_url, hosting_login_url
    FROM sites
  `);

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

/**
 * Köhnə detallı check qeydlərini sil ki, DB sonsuz böyüməsin.
 *
 * DİQQƏT — məlumat itkisi barədə: bu funksiya RETENTION_DAYS-dən köhnə **detallı**
 * check sətirlərini birbaşa silir və əvvəlcə heç bir aggregate (gündəlik özet)
 * saxlamır. Nəticədə:
 *   - 30 günlük uptime faizi (getAllSitesWithLatestCheck) təsirlənmir, çünki o
 *     yalnız son 30 günə baxır və retention müddəti ondan uzundur.
 *   - Lakin RETENTION_DAYS-dən uzun dövrlər üçün (məs. keçmiş ayların
 *     /api/sites/:id/report hesabatı) məlumat artıq mövcud olmayacaq və uptime
 *     faizi hesablana bilməyəcək.
 * Uzunmüddətli statistika lazım olduqda, silmədən əvvəl gündəlik özetləri ayrı
 * bir cədvələ (məs. `checks_daily`) yazmaq lazımdır — hazırkı sadə versiya bunu etmir.
 */
/**
 * Tamamlanmış günlərin (bugündən əvvəl) statistikasını `daily_stats`-a yaz.
 *
 * Yalnız dünəni deyil, `checks`-də olan BÜTÜN tamamlanmış günləri emal edir:
 *   - ilk işlədilmədə mövcud tarixçə geriyə doğru dolur;
 *   - server bir gün söndürülü qalsa, həmin gün itmir.
 * `cleanupOldChecks`-dən ƏVVƏL çağırılmalıdır, əks halda silinən detallı
 * qeydlərin özəti heç vaxt yazılmayacaq.
 *
 * Qeyd: orta cavab müddəti yalnız `online` yoxlamalar üzrə hesablanır —
 * offline yoxlamalarda `response_time` null olur və onları 0 kimi saymaq
 * ortalamanı süni şəkildə aşağı çəkərdi.
 */
async function aggregateDailyStats() {
  try {
    const result = await dbRun(
      `INSERT INTO daily_stats (site_id, date, avg_response_time, uptime_percent, total_checks)
       SELECT site_id,
              date(checked_at) AS d,
              AVG(CASE WHEN status = 'online' THEN response_time END),
              100.0 * SUM(CASE WHEN status = 'online' THEN 1 ELSE 0 END) / COUNT(*),
              COUNT(*)
       FROM checks
       WHERE date(checked_at) < date('now')
       GROUP BY site_id, date(checked_at)
       ON CONFLICT(site_id, date) DO UPDATE SET
         avg_response_time = excluded.avg_response_time,
         uptime_percent    = excluded.uptime_percent,
         total_checks      = excluded.total_checks`
    );
    console.log(`Gündəlik statistika hesablandı (${result.changes} gün/sayt qeydi)`);
  } catch (err) {
    console.error('Daily stats aggregation failed:', err.message);
  }
}

async function cleanupOldChecks() {
  const RETENTION_DAYS = 90;
  try {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const before = await dbGet('SELECT COUNT(*) as count FROM checks WHERE checked_at < ?', [cutoff]);
    if (!before?.count) {
      console.log(`Data cleanup: ${RETENTION_DAYS} gündən köhnə check qeydi yoxdur`);
      return;
    }
    await dbRun('DELETE FROM checks WHERE checked_at < ?', [cutoff]);
    console.log(`Data cleanup: ${before.count} köhnə check qeydi silindi (${RETENTION_DAYS} gündən köhnə)`);
  } catch (err) {
    console.error('Data cleanup failed:', err.message);
  }
}

export function startMonitoring(io) {
  // Run immediately on start
  runChecks(io);

  // Hər 1 dəqiqədə "tick" — amma yalnız öz intervalı çatan saytlar real yoxlanılır.
  // Tick özü yalnız yaddaşdaki vaxt müqayisəsidir, ona görə ucuzdur.
  setInterval(() => runChecks(io), TICK_INTERVAL_MS);

  // Expiry xəbərdarlıqlarını hər 12 saatda bir yoxla
  checkExpiryAlerts();
  setInterval(() => checkExpiryAlerts(), 12 * 60 * 60 * 1000);

  // Gündə bir dəfə: əvvəlcə gündəlik özəti yaz, SONRA köhnə detalları sil.
  // Sıra vacibdir — əks halda silinən qeydlərin statistikası itər.
  const dailyMaintenance = async () => {
    await aggregateDailyStats();
    await cleanupOldChecks();
  };
  dailyMaintenance();
  setInterval(dailyMaintenance, 24 * 60 * 60 * 1000);
}

// Response time yavaşlama xəbərdarlığı
// Enhanced anomaly detection with IQR (Interquartile Range) method
async function checkResponseTimeAlert(site, currentResponseTime) {
  try {
    // Konfiqurasiya: default dəyərlər
    const config = {
      minSamples: 10, // Minimum neçə yoxlama lazımdır
      multiplier: 3, // Ortalamadan neçə dəfə artıq olmalı
      absoluteThreshold: 2000, // Mütləq threshold (ms)
      iqrMultiplier: 1.5, // IQR üçün outlier faktoru
      useIQR: true, // IQR methodunu istifadə et
    };

    // Son 30 yoxlamanı götür (statistik əhəmiyyət üçün)
    const recent = await dbAll(
      `SELECT response_time FROM checks WHERE site_id = ? AND status = 'online' AND response_time IS NOT NULL ORDER BY checked_at DESC LIMIT 30 OFFSET 1`,
      [site.id]
    );
    if (recent.length < config.minSamples) return;

    const times = recent.map(r => r.response_time).sort((a, b) => a - b);
    const avg = times.reduce((s, t) => s + t, 0) / times.length;

    let isAnomaly = false;
    let anomalyReason = '';

    if (config.useIQR) {
      // IQR (Interquartile Range) method — statistik outlier detection
      const q1Index = Math.floor(times.length * 0.25);
      const q3Index = Math.floor(times.length * 0.75);
      const q1 = times[q1Index];
      const q3 = times[q3Index];
      const iqr = q3 - q1;
      const upperBound = q3 + config.iqrMultiplier * iqr;

      if (currentResponseTime > upperBound && currentResponseTime > config.absoluteThreshold) {
        isAnomaly = true;
        anomalyReason = `IQR outlier: ${currentResponseTime}ms > ${Math.round(upperBound)}ms (Q3+${config.iqrMultiplier}×IQR)`;
      }
    } else {
      // Sadə multiplier method
      if (currentResponseTime > avg * config.multiplier && currentResponseTime > config.absoluteThreshold) {
        isAnomaly = true;
        anomalyReason = `${Math.round(currentResponseTime / avg)}x yavaş (${currentResponseTime}ms vs orta ${Math.round(avg)}ms)`;
      }
    }

    if (isAnomaly) {
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

      // Trend analizi: son 5 yoxlamada getdikcə artırmı?
      const last5 = recent.slice(0, 5).map(r => r.response_time);
      const isIncreasing = last5.every((val, i) => i === 0 || val >= last5[i - 1]);
      const trendWarning = isIncreasing ? '\n\n⚠️ **Trend:** Response time artmaqdadır!' : '';

      const msg = `🐌 **Performans Anomaliyası**\n\n**Sayt:** ${site.name}\n**URL:** ${site.url}\n**Cari:** ${currentResponseTime}ms\n**Orta (son 30):** ${Math.round(avg)}ms\n**Səbəb:** ${anomalyReason}${trendWarning}`;
      await sendExpiryNotification(msg, webhooks, smtp, site);
      await dbRun(
        "INSERT OR IGNORE INTO expiry_alerts (site_id, alert_type, alerted_date) VALUES (?, 'response_slow', ?)",
        [site.id, today]
      );
      console.log(`🚨 Anomaly detected: ${site.name} — ${anomalyReason}`);
    }
  } catch (err) {
    console.error('Anomaly detection error:', err.message);
  }
}
// Domain və Hosting bitmə xəbərdarlıqları
async function checkExpiryAlerts() {
  try {
    const sites = await dbAll('SELECT * FROM sites');
    const webhooksRow = await dbGet("SELECT value FROM settings WHERE key = 'webhooks'");
    const smtpRow = await dbGet("SELECT value FROM settings WHERE key = 'smtp'");

    const webhooks = webhooksRow ? JSON.parse(webhooksRow.value) : null;
    const smtp = smtpRow ? JSON.parse(smtpRow.value) : null;

    for (const site of sites) {
      // Baxım rejimindəki saytlar üçün expiry/SSL xəbərdarlığı da göndərilmir
      if (site.maintenance_mode) continue;

      // Xəbərdarlıq günləri sayt üzrə fərdidir (sites.alert_days), yoxdursa default "3,1"
      const alertDays = parseAlertDays(site.alert_days);

      // === 1. Manual domain expiry ===
      if (site.manual_domain_expiry) {
        const days = Math.ceil((new Date(site.manual_domain_expiry) - new Date()) / (1000 * 60 * 60 * 24));
        if (alertDays.includes(days)) {
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
        if (alertDays.includes(days)) {
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
        if (alertDays.includes(days)) {
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
  const sentChannels = [];

  // Discord / Telegram / Slack webhook
  if (webhooks) {
    if (webhooks.telegram_webhook) {
      await axios.post(webhooks.telegram_webhook, {
        text: message,
        parse_mode: 'Markdown'
      }).catch(() => {});
      sentChannels.push('telegram');
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
      sentChannels.push('discord');
    }
    if (webhooks.slack_webhook) {
      await axios.post(webhooks.slack_webhook, {
        text: message,
      }).catch(() => {});
      sentChannels.push('slack');
    }
  }

  // Email
  if (smtp?.host && smtp?.recipient) {
    try {
      const { sendExpiryEmail } = await import('./mailer.js');
      await sendExpiryEmail(site, message, smtp);
      sentChannels.push('email');
    } catch {}
  }

  // Brauzer push bildirişi
  const pushed = await sendPushNotification(
    site?.name ? `${site.name} — Xəbərdarlıq` : 'Monitorinq xəbərdarlığı',
    // Markdown işarələrini push mətnindən təmizlə
    message.replace(/\*\*/g, '').replace(/\n+/g, ' ').slice(0, 200)
  );
  if (pushed > 0) sentChannels.push('push');

  if (sentChannels.length > 0) {
    await logNotification(site?.id, sentChannels.join('+'), message);
  }
}


// =====================================================
// MULTI-REGION CHECK FUNCTIONS
// =====================================================

// Multi-region check — majority vote ilə false-positive azaltma
async function performMultiRegionCheck(site) {
  const results = [];
  
  for (const region of REGION_PROBES) {
    try {
      const result = await checkSiteFromRegion(site, region);
      results.push({ region: region.name, ...result });
      
      // DB-yə yaz
      await dbRun(
        `INSERT INTO region_checks (site_id, region, status, http_code, response_time, error) VALUES (?, ?, ?, ?, ?, ?)`,
        [site.id, region.name, result.status, result.http_code, result.response_time, result.error]
      );
    } catch (err) {
      console.error(`Region check failed (${region.name}):`, err.message);
      await dbRun(
        `INSERT INTO region_checks (site_id, region, status, error) VALUES (?, ?, 'error', ?)`,
        [site.id, region.name, err.message]
      );
    }
  }

  // Majority vote: əksəriyyət "offline" deyirsə, həqiqətən down-dır
  const offlineCount = results.filter(r => r.status === 'offline').length;
  const onlineCount = results.filter(r => r.status === 'online').length;
  const finalStatus = offlineCount > onlineCount ? 'offline' : 'online';

  // Orta response time (online olan region-lardan)
  const onlineResults = results.filter(r => r.status === 'online' && r.response_time);
  const avgResponseTime = onlineResults.length > 0
    ? Math.round(onlineResults.reduce((sum, r) => sum + r.response_time, 0) / onlineResults.length)
    : null;

  return {
    status: finalStatus,
    regions: results,
    avgResponseTime,
    consensus: `${onlineCount}/${results.length} online`,
    falsePositiveMitigated: offlineCount > 0 && offlineCount < results.length, // bəzi region-lar offline, bəziləri online
  };
}

async function checkSiteFromRegion(site, region) {
  const startTime = Date.now();
  
  try {
    // Əgər region endpoint yoxdursa, lokal check et
    if (!region.endpoint) {
      return await localSiteCheck(site);
    }

    // Distributed probe endpoint-i çağır (future implementation)
    // Məsələn: POST https://probe-us-east.example.com/check
    // Body: { url: site.url }
    const response = await axios.post(region.endpoint, { url: site.url }, {
      timeout: 15000,
      validateStatus: () => true, // bütün status kodları qəbul et
    });

    return {
      status: response.data.status,
      http_code: response.data.http_code,
      response_time: response.data.response_time,
      error: response.data.error,
    };
  } catch (err) {
    return {
      status: 'error',
      http_code: null,
      response_time: Date.now() - startTime,
      error: err.message,
    };
  }
}

// Lokal site check (single region)
async function localSiteCheck(site) {
  const startTime = Date.now();
  
  try {
    const httpsAgent = new https.Agent({
      rejectUnauthorized: false, // self-signed SSL-lərə icazə ver
    });

    const response = await axios.get(site.url, {
      timeout: 15000,
      httpsAgent,
      validateStatus: () => true, // bütün status kodları qəbul et
      maxRedirects: 5,
    });

    const responseTime = Date.now() - startTime;
    const status = response.status >= 200 && response.status < 400 ? 'online' : 'offline';

    return {
      status,
      http_code: response.status,
      response_time: responseTime,
      error: status === 'offline' ? `HTTP ${response.status}` : null,
    };
  } catch (err) {
    return {
      status: 'offline',
      http_code: null,
      response_time: Date.now() - startTime,
      error: err.message,
    };
  }
}

// Export multi-region check funksiyası (index.js endpoint üçün)
export { performMultiRegionCheck };


// =====================================================
// ESCALATION POLICY FUNCTIONS
// =====================================================

// Alert göndər və escalation tracker-ə qeyd et
async function sendAlertWithEscalation(site, incidentId, alertType, message) {
  try {
    const escalationSettings = await dbGet("SELECT value FROM settings WHERE key = 'escalation'");
    const config = escalationSettings 
      ? JSON.parse(escalationSettings.value) 
      : { primary: null, secondary: null, escalation_delay_minutes: 5 };

    const webhooksRow = await dbGet("SELECT value FROM settings WHERE key = 'webhooks'");
    const smtpRow = await dbGet("SELECT value FROM settings WHERE key = 'smtp'");
    const webhooks = webhooksRow ? JSON.parse(webhooksRow.value) : null;
    const smtp = smtpRow ? JSON.parse(smtpRow.value) : null;

    // Primary contact-a göndər
    const primaryContact = config.primary || smtp?.recipient || 'default';
    await sendExpiryNotification(message, webhooks, smtp, site);

    // DB-yə escalation qeyd et
    const result = await dbRun(
      `INSERT INTO alert_escalations (site_id, incident_id, alert_type, sent_to) VALUES (?, ?, ?, ?)`,
      [site.id, incidentId, alertType, primaryContact]
    );

    const escalationId = result.lastID;

    // Escalation check planla (N dəqiqə sonra)
    if (config.secondary && config.escalation_delay_minutes > 0) {
      setTimeout(async () => {
        await checkAndEscalate(escalationId, site, incidentId, message, config, webhooks, smtp);
      }, config.escalation_delay_minutes * 60 * 1000);
    }

    console.log(`✉️ Alert sent to ${primaryContact} (escalation ID: ${escalationId})`);
  } catch (err) {
    console.error('Escalation alert error:', err.message);
  }
}

// Escalation check — acknowledge olunmayıbsa ikinci contact-a göndər
async function checkAndEscalate(escalationId, site, incidentId, message, config, webhooks, smtp) {
  try {
    const escalation = await dbGet(
      `SELECT * FROM alert_escalations WHERE id = ? AND acknowledged_at IS NULL`,
      [escalationId]
    );

    // Acknowledge olunubsa, escalate etmə
    if (!escalation) {
      console.log(`✅ Alert ${escalationId} acknowledged — no escalation needed`);
      return;
    }

    // İncident həll olunubsa, escalate etmə
    if (incidentId) {
      const incident = await dbGet(`SELECT * FROM incidents WHERE id = ? AND resolved_at IS NOT NULL`, [incidentId]);
      if (incident) {
        console.log(`✅ Incident ${incidentId} resolved — no escalation needed`);
        return;
      }
    }

    // Escalate et — ikinci contact-a göndər
    const escalatedMessage = `🚨 **ESCALATED ALERT** (cavabsız qaldı)\n\n${message}\n\n⏰ İlk göndərilən: ${escalation.sent_at}\n📞 Primary contact cavab vermədi`;

    // Secondary contact üçün smtp override (əgər fərqli email-dirsə)
    const secondarySmtp = smtp ? { ...smtp, recipient: config.secondary } : null;
    await sendExpiryNotification(escalatedMessage, webhooks, secondarySmtp, site);

    // DB-də escalated flag qoy
    await dbRun(`UPDATE alert_escalations SET escalated = 1 WHERE id = ?`, [escalationId]);

    console.log(`🔥 Alert ${escalationId} escalated to ${config.secondary}`);
  } catch (err) {
    console.error('Escalation check error:', err.message);
  }
}

// Alert acknowledge et
async function acknowledgeAlert(escalationId, acknowledgedBy) {
  try {
    await dbRun(
      `UPDATE alert_escalations SET acknowledged_at = datetime('now'), acknowledged_by = ? WHERE id = ?`,
      [acknowledgedBy, escalationId]
    );
    console.log(`✅ Alert ${escalationId} acknowledged by ${acknowledgedBy}`);
    return { success: true };
  } catch (err) {
    console.error('Acknowledge error:', err.message);
    return { success: false, error: err.message };
  }
}

// Export escalation funksiyaları
export { sendAlertWithEscalation, acknowledgeAlert };
