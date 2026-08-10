import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// pdfkit-in default Helvetica fontu WinAnsi kodlaşdırmasındadır və Azərbaycan
// hərflərini (ə, ı, ğ, ş) göstərə bilmir. Ona görə DejaVu Sans TTF-i embed edirik.
function resolveFont(file) {
  try {
    const pkg = require.resolve('dejavu-fonts-ttf/package.json');
    const p = path.join(path.dirname(pkg), 'ttf', file);
    return fs.existsSync(p) ? p : null;
  } catch {
    return null;
  }
}

const FONT_REGULAR = resolveFont('DejaVuSans.ttf');
const FONT_BOLD = resolveFont('DejaVuSans-Bold.ttf');

const REG = 'Body';
const BOLD = 'BodyBold';

function registerFonts(doc) {
  if (FONT_REGULAR && FONT_BOLD) {
    doc.registerFont(REG, FONT_REGULAR);
    doc.registerFont(BOLD, FONT_BOLD);
    return true;
  }
  return false;
}

function fmtDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d.getTime())) return String(value);
  return d.toLocaleString('az-AZ');
}

function fmtDuration(seconds) {
  if (seconds == null) return 'davam edir';
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s} san`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} dəq ${s % 60} san`;
  const h = Math.floor(m / 60);
  return `${h} saat ${m % 60} dəq`;
}

/**
 * Sayt üçün PDF monitorinq hesabatı yarat və response-a stream et.
 *
 * @param {object} site - sites cədvəlindən sətir
 * @param {Array} checks - checks sətirləri (yeni -> köhnə sıralı)
 * @param {Array} incidents - incidents sətirləri (yeni -> köhnə sıralı)
 * @param {import('express').Response} res
 */
export function generateSiteReportPDF(site, checks, incidents, res) {
  const doc = new PDFDocument({ margin: 50 });
  const hasFonts = registerFonts(doc);
  const reg = hasFonts ? REG : 'Helvetica';
  const bold = hasFonts ? BOLD : 'Helvetica-Bold';

  const safeName = String(site.name || 'sayt').replace(/[^\w.\-]+/g, '_');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}-report.pdf"`);
  doc.pipe(res);

  // === Başlıq ===
  doc.font(bold).fontSize(20).text(`${site.name} — Monitorinq Hesabatı`, { align: 'center' });
  doc.moveDown(0.6);
  doc.font(reg).fontSize(10);
  doc.text(`URL: ${site.url}`);
  doc.text(`Hesabat tarixi: ${new Date().toLocaleString('az-AZ')}`);
  if (site.group_name) doc.text(`Qrup: ${site.group_name}`);
  doc.moveDown();

  // === Ümumi statistika ===
  const onlineCount = checks.filter(c => c.status === 'online').length;
  const uptimePercent = checks.length > 0
    ? ((onlineCount / checks.length) * 100).toFixed(2) + '%'
    : 'N/A';

  const responseTimes = checks
    .filter(c => c.status === 'online' && c.response_time != null)
    .map(c => c.response_time);
  const avgResponse = responseTimes.length
    ? Math.round(responseTimes.reduce((s, v) => s + v, 0) / responseTimes.length) + ' ms'
    : 'N/A';

  const latest = checks[0] || null;
  const oldest = checks[checks.length - 1] || null;

  doc.font(bold).fontSize(14).text('Ümumi Statistika', { underline: true });
  doc.moveDown(0.3);
  doc.font(reg).fontSize(10);
  doc.text(`Uptime: ${uptimePercent}`);
  doc.text(`Yoxlama sayı: ${checks.length}`);
  doc.text(`Online yoxlamalar: ${onlineCount}`);
  doc.text(`Orta cavab müddəti: ${avgResponse}`);
  if (oldest && latest) {
    doc.text(`Əhatə olunan dövr: ${fmtDate(oldest.checked_at)} — ${fmtDate(latest.checked_at)}`);
  }
  doc.moveDown();

  // === Cari vəziyyət ===
  if (latest) {
    doc.font(bold).fontSize(14).text('Cari Vəziyyət', { underline: true });
    doc.moveDown(0.3);
    doc.font(reg).fontSize(10);
    doc.text(`Status: ${latest.status === 'online' ? 'Online' : 'Offline'}`);
    doc.text(`HTTP kod: ${latest.http_code ?? '—'}`);
    doc.text(`Cavab müddəti: ${latest.response_time != null ? latest.response_time + ' ms' : '—'}`);
    doc.text(`Server IP: ${latest.server_ip || '—'}`);
    doc.text(`Hosting: ${latest.hosting_provider || '—'}`);
    doc.text(`SSL: ${latest.ssl_valid ? 'Etibarlı' : 'Etibarsız / yoxdur'}${
      latest.ssl_days_remaining != null ? ` (${latest.ssl_days_remaining} gün qalıb)` : ''
    }`);
    const domainExpiry = site.manual_domain_expiry || latest.domain_expiry;
    doc.text(`Domain bitmə tarixi: ${domainExpiry || '—'}`);
    doc.text(`Registrar: ${site.manual_domain_registrar || latest.domain_registrar || '—'}`);
    if (site.manual_hosting_expiry) doc.text(`Hosting bitmə tarixi: ${site.manual_hosting_expiry}`);
    doc.moveDown();
  }

  // === Hadisələr ===
  doc.font(bold).fontSize(14).text('Son Hadisələr', { underline: true });
  doc.moveDown(0.3);
  doc.font(reg).fontSize(10);
  if (incidents.length === 0) {
    doc.text('Qeydə alınmış hadisə yoxdur.');
  } else {
    const totalDowntime = incidents.reduce((s, i) => s + (i.duration_seconds || 0), 0);
    doc.text(`Hadisə sayı: ${incidents.length} | Ümumi downtime: ${fmtDuration(totalDowntime)}`);
    doc.moveDown(0.4);
    incidents.slice(0, 10).forEach(inc => {
      doc.text(
        `${fmtDate(inc.started_at)} — HTTP ${inc.http_code ?? '—'} — müddət: ${fmtDuration(inc.duration_seconds)}`
      );
    });
    if (incidents.length > 10) {
      doc.moveDown(0.3);
      doc.fillColor('#666').text(`... və daha ${incidents.length - 10} hadisə`).fillColor('black');
    }
  }
  doc.moveDown();

  // === Qeydlər ===
  if (site.notes) {
    doc.font(bold).fontSize(14).text('Qeydlər', { underline: true });
    doc.moveDown(0.3);
    doc.font(reg).fontSize(10).text(site.notes);
  }

  doc.end();
}
