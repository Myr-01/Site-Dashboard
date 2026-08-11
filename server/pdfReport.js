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

// Rəng palitrası — çap üçün ağ fon üzərində oxunaqlı olacaq şəkildə seçilib
const C = {
  ink: '#14213d',       // əsas mətn / başlıqlar (brend navy)
  body: '#374151',      // adi mətn
  muted: '#6b7280',     // etiketlər, ikinci dərəcəli mətn
  faint: '#9ca3af',     // footer
  accent: '#fca311',    // brend narıncı — zolaqlar və vurğular
  rule: '#e5e7eb',      // xətlər, çərçivələr
  cardBg: '#f8fafc',
  headBg: '#f1f5f9',
  green: '#16a34a',
  red: '#dc2626',
  blue: '#2563eb',
};

// Şaquli ölçü şkalası — bölmələr arası boşluqlar sabit olsun
const GAP_SECTION = 18;
const GAP_AFTER_TITLE = 10;
const ROW_H = 16;

function fmtDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d.getTime())) return String(value);
  return d.toLocaleString('az-AZ', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function fmtDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('az-AZ', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtDuration(seconds) {
  if (seconds == null) return 'davam edir';
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s} san`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} dəq`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h} saat ${rem} dəq` : `${h} saat`;
}

/** Verilən mətni sütun eninə sığdır, sığmırsa kəs. */
function clip(doc, text, width, size) {
  const s = String(text ?? '—');
  doc.fontSize(size);
  if (doc.widthOfString(s) <= width) return s;
  let out = s;
  while (out.length > 1 && doc.widthOfString(out + '…') > width) {
    out = out.slice(0, -1);
  }
  return out + '…';
}

// ─── Tərtibat köməkçiləri ───────────────────────────────────────────────

function contentWidth(doc) {
  return doc.page.width - doc.page.margins.left - doc.page.margins.right;
}

/** Səhifədə kifayət qədər yer yoxdursa yeni səhifəyə keç. */
function ensureSpace(doc, needed) {
  const limit = doc.page.height - doc.page.margins.bottom - 28; // footer üçün ehtiyat
  if (doc.y + needed > limit) {
    doc.addPage();
    return true;
  }
  return false;
}

/** Bölmə başlığı: böyük hərflər, brend rəngi, altında incə xətt. */
function sectionTitle(doc, text, fonts) {
  ensureSpace(doc, 40);
  const x = doc.page.margins.left;
  const w = contentWidth(doc);

  doc.font(fonts.bold).fontSize(10).fillColor(C.ink)
    .text(text.toUpperCase(), x, doc.y, { characterSpacing: 0.8 });

  const y = doc.y + 4;
  doc.save()
    .moveTo(x, y).lineTo(x + w, y)
    .lineWidth(0.7).strokeColor(C.rule).stroke()
    .restore();

  doc.y = y + GAP_AFTER_TITLE;
}

/** Statuslu rəngli etiket (pill). */
function statusPill(doc, label, color, x, y, fonts) {
  doc.font(fonts.bold).fontSize(8);
  const padX = 7;
  const w = doc.widthOfString(label) + padX * 2;
  const h = 15;

  doc.save()
    .roundedRect(x - w, y, w, h, h / 2)
    .fillColor(color).fillOpacity(0.12).fill()
    .restore();

  doc.fillColor(color).text(label, x - w + padX, y + 4.2, { lineBreak: false });
  return h;
}

/**
 * Bir sıra metrika kartı (4 ədəd yan-yana).
 * @param {Array<{label: string, value: string, color?: string}>} cards
 */
function statCards(doc, cards, fonts) {
  const h = 46;
  ensureSpace(doc, h + 8);

  const x0 = doc.page.margins.left;
  const total = contentWidth(doc);
  const gap = 8;
  const w = (total - gap * (cards.length - 1)) / cards.length;
  const y = doc.y;

  cards.forEach((card, i) => {
    const x = x0 + i * (w + gap);

    doc.save()
      .roundedRect(x, y, w, h, 4)
      .fillColor(C.cardBg).fill()
      .roundedRect(x, y, w, h, 4)
      .lineWidth(0.7).strokeColor(C.rule).stroke()
      .restore();

    doc.font(fonts.reg).fontSize(7.5).fillColor(C.muted)
      .text(card.label.toUpperCase(), x + 9, y + 9, {
        width: w - 18, characterSpacing: 0.4, lineBreak: false,
      });

    doc.font(fonts.bold).fontSize(14).fillColor(card.color || C.ink)
      .text(card.value, x + 9, y + 22, { width: w - 18, lineBreak: false });
  });

  doc.y = y + h + GAP_SECTION;
}

/**
 * İki sütunlu, hizalanmış etiket/dəyər şəbəkəsi.
 * @param {Array<[string, string]>} pairs
 */
function kvGrid(doc, pairs, fonts) {
  const x0 = doc.page.margins.left;
  const total = contentWidth(doc);
  const colGap = 24;
  const colW = (total - colGap) / 2;
  const labelW = 108;

  const rows = Math.ceil(pairs.length / 2);
  ensureSpace(doc, rows * ROW_H);

  let y = doc.y;

  for (let i = 0; i < pairs.length; i += 2) {
    for (let c = 0; c < 2; c++) {
      const pair = pairs[i + c];
      if (!pair) continue;
      const [label, value] = pair;
      const x = x0 + c * (colW + colGap);

      doc.font(fonts.reg).fontSize(9).fillColor(C.muted)
        .text(label, x, y, { width: labelW, lineBreak: false });

      doc.font(fonts.bold).fontSize(9).fillColor(C.body)
        .text(clip(doc, value, colW - labelW, 9), x + labelW, y, {
          width: colW - labelW, lineBreak: false,
        });
    }
    y += ROW_H;
  }

  doc.y = y + GAP_SECTION - 6;
}

/**
 * Sadə cədvəl: başlıq sətri + zolaqlı sətirlər.
 * @param {string[]} headers
 * @param {number[]} widths - nisbi çəkilər
 * @param {string[][]} rows
 */
function table(doc, headers, widths, rows, fonts) {
  const x0 = doc.page.margins.left;
  const total = contentWidth(doc);
  const weightSum = widths.reduce((a, b) => a + b, 0);
  const cols = widths.map(w => (w / weightSum) * total);
  const headH = 20;
  const rowH = 17;

  const drawHeader = () => {
    const y = doc.y;
    doc.save().rect(x0, y, total, headH).fillColor(C.headBg).fill().restore();

    let x = x0;
    headers.forEach((h, i) => {
      doc.font(fonts.bold).fontSize(8).fillColor(C.ink)
        .text(h.toUpperCase(), x + 7, y + 6.5, {
          width: cols[i] - 14, characterSpacing: 0.4, lineBreak: false,
        });
      x += cols[i];
    });
    doc.y = y + headH;
  };

  ensureSpace(doc, headH + rowH * 2);
  drawHeader();

  rows.forEach((row, ri) => {
    if (ensureSpace(doc, rowH)) drawHeader();
    const y = doc.y;

    if (ri % 2 === 1) {
      doc.save().rect(x0, y, total, rowH).fillColor(C.cardBg).fill().restore();
    }

    let x = x0;
    row.forEach((cell, i) => {
      doc.font(fonts.reg).fontSize(8.5).fillColor(C.body)
        .text(clip(doc, cell, cols[i] - 14, 8.5), x + 7, y + 5, {
          width: cols[i] - 14, lineBreak: false,
        });
      x += cols[i];
    });

    doc.save()
      .moveTo(x0, y + rowH).lineTo(x0 + total, y + rowH)
      .lineWidth(0.5).strokeColor(C.rule).stroke()
      .restore();

    doc.y = y + rowH;
  });

  doc.y += GAP_SECTION;
}

/** Hər səhifənin altına ayırıcı xətt, sayt adı və səhifə nömrəsi. */
function drawFooters(doc, site, fonts) {
  const range = doc.bufferedPageRange();

  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);

    const x = doc.page.margins.left;
    const w = contentWidth(doc);
    const y = doc.page.height - doc.page.margins.bottom + 8;

    // pdfkit alt kənardan aşağıda mətn yazılanda avtomatik yeni səhifə açır.
    // Footer məhz o sahədə olduğu üçün yazarkən alt kənarı müvəqqəti sıfırlayırıq.
    const savedBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;

    doc.save()
      .moveTo(x, y).lineTo(x + w, y)
      .lineWidth(0.5).strokeColor(C.rule).stroke()
      .restore();

    const year = new Date().getFullYear();

    doc.font(fonts.reg).fontSize(7.5).fillColor(C.faint)
      // Sol: sayt adı
      .text(`${site.name} — Monitorinq hesabatı`, x, y + 6, { width: w * 0.45, lineBreak: false })
      // Sağ: səhifə nömrəsi
      .text(`Səhifə ${i - range.start + 1} / ${range.count}`, x, y + 6, {
        width: w, align: 'right', lineBreak: false,
      })
      // Orta: müəlliflik
      .text(`© ${year} Site Monitor · Made by Myr`, x, y + 6, {
        width: w, align: 'center', lineBreak: false,
      });

    doc.page.margins.bottom = savedBottom;
  }
}

// ─── Əsas funksiya ──────────────────────────────────────────────────────

/**
 * Sayt üçün PDF monitorinq hesabatı yarat və response-a stream et.
 *
 * @param {object} site - sites cədvəlindən sətir
 * @param {Array} checks - checks sətirləri (yeni -> köhnə sıralı)
 * @param {Array} incidents - incidents sətirləri (yeni -> köhnə sıralı)
 * @param {import('express').Response} res
 */
export function generateSiteReportPDF(site, checks, incidents, res) {
  // bufferPages: səhifə nömrələrini bilmək üçün sonda geri qayıtmaq lazımdır
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 56, bottom: 52, left: 50, right: 50 },
    bufferPages: true,
    info: {
      Title: `${site.name} — Monitorinq Hesabatı`,
      Author: 'Site Monitor',
    },
  });

  let fonts = { reg: 'Helvetica', bold: 'Helvetica-Bold' };
  if (FONT_REGULAR && FONT_BOLD) {
    doc.registerFont(REG, FONT_REGULAR);
    doc.registerFont(BOLD, FONT_BOLD);
    fonts = { reg: REG, bold: BOLD };
  }

  const safeName = String(site.name || 'sayt').replace(/[^\w.\-]+/g, '_');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}-report.pdf"`);
  doc.pipe(res);

  // ─── Hesablamalar ───
  const latest = checks[0] || null;
  const oldest = checks[checks.length - 1] || null;

  const onlineCount = checks.filter(c => c.status === 'online').length;
  const uptime = checks.length ? (onlineCount / checks.length) * 100 : null;

  const responseTimes = checks
    .filter(c => c.status === 'online' && c.response_time != null)
    .map(c => c.response_time);
  const avgResponse = responseTimes.length
    ? Math.round(responseTimes.reduce((s, v) => s + v, 0) / responseTimes.length)
    : null;

  const totalDowntime = incidents.reduce((s, i) => s + (i.duration_seconds || 0), 0);

  const isMaintenance = !!site.maintenance_mode;
  const isOnline = latest?.status === 'online';

  // ─── Üst zolaq ───
  doc.save()
    .rect(0, 0, doc.page.width, 6)
    .fillColor(C.accent).fill()
    .restore();

  // ─── Başlıq bloku ───
  const xL = doc.page.margins.left;
  const cw = contentWidth(doc);
  const titleY = doc.page.margins.top;

  // Status etiketi sağ üstdə
  const pill = isMaintenance
    ? { label: 'BAXIMDA', color: C.blue }
    : isOnline
    ? { label: 'ONLINE', color: C.green }
    : { label: 'OFFLINE', color: C.red };
  statusPill(doc, pill.label, pill.color, xL + cw, titleY + 3, fonts);

  doc.font(fonts.bold).fontSize(20).fillColor(C.ink)
    .text(site.name, xL, titleY, { width: cw - 90, lineBreak: false });

  doc.font(fonts.reg).fontSize(9.5).fillColor(C.muted)
    .text(site.url, xL, doc.y + 3, { width: cw - 90, lineBreak: false });

  const metaParts = [`Hesabat tarixi: ${fmtDateTime(new Date())}`];
  if (site.group_name) metaParts.push(`Qrup: ${site.group_name}`);
  if (oldest && latest) {
    metaParts.push(`Dövr: ${fmtDate(oldest.checked_at)} — ${fmtDate(latest.checked_at)}`);
  }
  doc.font(fonts.reg).fontSize(8.5).fillColor(C.faint)
    .text(metaParts.join('   ·   '), xL, doc.y + 4, { width: cw, lineBreak: false });

  doc.y += 18;

  // ─── Metrika kartları ───
  statCards(doc, [
    {
      label: 'Uptime',
      value: uptime == null ? '—' : `${uptime.toFixed(1)}%`,
      color: uptime == null ? C.muted : uptime >= 99 ? C.green : uptime >= 95 ? C.accent : C.red,
    },
    { label: 'Orta cavab', value: avgResponse == null ? '—' : `${avgResponse} ms` },
    { label: 'Yoxlama sayı', value: String(checks.length) },
    {
      label: 'Hadisə sayı',
      value: String(incidents.length),
      color: incidents.length === 0 ? C.green : C.red,
    },
  ], fonts);

  // ─── Cari vəziyyət ───
  sectionTitle(doc, 'Cari vəziyyət', fonts);

  if (!latest) {
    doc.font(fonts.reg).fontSize(9).fillColor(C.muted)
      .text('Hələ heç bir yoxlama aparılmayıb.', xL, doc.y);
    doc.y += GAP_SECTION;
  } else {
    kvGrid(doc, [
      ['Status', isMaintenance ? 'Baxımda' : isOnline ? 'Online' : 'Offline'],
      ['HTTP kod', latest.http_code ?? '—'],
      ['Cavab müddəti', latest.response_time != null ? `${latest.response_time} ms` : '—'],
      ['Yoxlama intervalı', `${site.check_interval_minutes ?? 30} dəqiqə`],
      ['Server IP', latest.server_ip || '—'],
      ['Hosting', latest.hosting_provider || '—'],
      ['Son yoxlama', fmtDateTime(latest.checked_at)],
      ['Online yoxlamalar', `${onlineCount} / ${checks.length}`],
    ], fonts);
  }

  // ─── Domain və SSL ───
  sectionTitle(doc, 'Domain və SSL', fonts);

  const sslText = latest?.ssl_valid == null
    ? '—'
    : latest.ssl_valid
    ? `Etibarlı${latest.ssl_days_remaining != null ? ` · ${latest.ssl_days_remaining} gün qalıb` : ''}`
    : 'Etibarsız / yoxdur';

  kvGrid(doc, [
    ['SSL', sslText],
    ['SSL bitmə', fmtDate(latest?.ssl_expiry)],
    ['Domain bitmə', fmtDate(site.manual_domain_expiry || latest?.domain_expiry)],
    ['Registrar', site.manual_domain_registrar || latest?.domain_registrar || '—'],
    ['Hosting bitmə', fmtDate(site.manual_hosting_expiry)],
    ['Xəbərdarlıq', `${site.alert_days || '3,1'} gün əvvəl`],
  ], fonts);

  // ─── Hadisələr ───
  sectionTitle(doc, 'Hadisələr', fonts);

  if (incidents.length === 0) {
    doc.font(fonts.reg).fontSize(9).fillColor(C.green)
      .text('Qeydə alınmış hadisə yoxdur.', xL, doc.y);
    doc.y += GAP_SECTION;
  } else {
    doc.font(fonts.reg).fontSize(9).fillColor(C.muted)
      .text(`Ümumi downtime: `, xL, doc.y, { continued: true })
      .font(fonts.bold).fillColor(C.body).text(fmtDuration(totalDowntime));
    doc.y += 10;

    const shown = incidents.slice(0, 12);
    table(
      doc,
      ['Başlanğıc', 'HTTP', 'Müddət', 'Qeyd'],
      [26, 12, 18, 44],
      shown.map(inc => [
        fmtDateTime(inc.started_at),
        inc.http_code == null ? '—' : String(inc.http_code),
        fmtDuration(inc.duration_seconds),
        inc.resolution_note || '—',
      ]),
      fonts
    );

    if (incidents.length > shown.length) {
      doc.font(fonts.reg).fontSize(8).fillColor(C.faint)
        .text(`... və daha ${incidents.length - shown.length} hadisə`, xL, doc.y - GAP_SECTION + 4);
      doc.y += 8;
    }
  }

  // ─── Qeydlər ───
  if (site.notes) {
    sectionTitle(doc, 'Qeydlər', fonts);
    doc.font(fonts.reg).fontSize(9).fillColor(C.body)
      .text(site.notes, xL, doc.y, { width: cw, align: 'left', lineGap: 2 });
  }

  // ─── Footer-lər (səhifə sayı bilindikdən sonra) ───
  drawFooters(doc, site, fonts);

  doc.end();
}
