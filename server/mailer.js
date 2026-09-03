import nodemailer from 'nodemailer';
import { dbGet } from './db.js';

async function getSmtpSettings() {
  const row = await dbGet("SELECT value FROM settings WHERE key = 'smtp'");
  if (!row) return null;
  try {
    return JSON.parse(row.value);
  } catch {
    return null;
  }
}

function createTransporter(settings) {
  return nodemailer.createTransport({
    host: settings.host,
    port: parseInt(settings.port, 10),
    secure: parseInt(settings.port, 10) === 465,
    auth: {
      user: settings.user,
      pass: settings.pass,
    },
  });
}

export async function sendDowntimeAlert(site, checkResult) {
  const settings = await getSmtpSettings();
  if (!settings || !settings.recipient) return;

  const transporter = createTransporter(settings);

  const mailOptions = {
    from: settings.user,
    to: settings.recipient,
    subject: `🔴 Site Down: ${site.name}`,
    html: `
      <div style="font-family: sans-serif; padding: 20px; background: #050A14; color: #fff;">
        <h2 style="color: #FF4444;">Site Offline Alert</h2>
        <p><strong>Site:</strong> ${site.name}</p>
        <p><strong>URL:</strong> <a href="${site.url}" style="color: #00D4FF;">${site.url}</a></p>
        <p><strong>Time:</strong> ${new Date().toISOString()}</p>
        <p><strong>HTTP Code:</strong> ${checkResult.http_code || 'N/A'}</p>
        <p style="color: #8899AA; margin-top: 20px;">— Website Monitor Dashboard</p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Alert email sent for ${site.name}`);
  } catch (err) {
    console.error(`Failed to send alert email for ${site.name}:`, err.message);
  }
}

// Sayt bərpa olduqda "yenidən online" email-i
export async function sendRecoveryEmail(site) {
  const settings = await getSmtpSettings();
  if (!settings || !settings.recipient) return;

  const transporter = createTransporter(settings);
  const mailOptions = {
    from: settings.user,
    to: settings.recipient,
    subject: `✅ Site Online: ${site.name}`,
    html: `
      <div style="font-family: sans-serif; padding: 20px; background: #14213d; color: #fff; border-radius: 8px;">
        <h2 style="color: #16a34a; margin-top: 0;">✅ Sayt Yenidən Online</h2>
        <p><strong>Sayt:</strong> ${site.name}</p>
        <p><strong>URL:</strong> <a href="${site.url}" style="color: #fca311;">${site.url}</a></p>
        <p><strong>Vaxt:</strong> ${new Date().toLocaleString()}</p>
        <p style="color: #9aa3b8; margin-top: 20px;">— Site Monitor Dashboard</p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Recovery email sent for ${site.name}`);
  } catch (err) {
    console.error(`Failed to send recovery email for ${site.name}:`, err.message);
  }
}

export async function sendTestEmail() {
  const settings = await getSmtpSettings();
  if (!settings || !settings.recipient) {
    throw new Error('SMTP settings not configured');
  }

  const transporter = createTransporter(settings);

  await transporter.sendMail({
    from: settings.user,
    to: settings.recipient,
    subject: '✅ Test Email — Website Monitor',
    html: `
      <div style="font-family: sans-serif; padding: 20px; background: #050A14; color: #fff;">
        <h2 style="color: #00D4FF;">Test Email Successful</h2>
        <p>Your SMTP configuration is working correctly.</p>
        <p style="color: #8899AA; margin-top: 20px;">— Website Monitor Dashboard</p>
      </div>
    `,
  });
}

export async function sendExpiryEmail(site, message, smtpOverride) {
  const settings = smtpOverride || await getSmtpSettings();
  if (!settings || !settings.recipient) return;

  const transporter = createTransporter(settings);

  // markdown-ı sadə HTML-ə çevir
  const htmlMessage = message
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');

  await transporter.sendMail({
    from: settings.user,
    to: settings.recipient,
    subject: `⚠️ Bitmə Xəbərdarlığı: ${site.name}`,
    html: `
      <div style="font-family: sans-serif; padding: 24px; background: #14213d; color: #ffffff; border-radius: 8px;">
        <h2 style="color: #fca311; margin-top: 0;">⚠️ Bitmə Xəbərdarlığı</h2>
        <div style="background: #1d2d4f; padding: 16px; border-radius: 6px; border-left: 4px solid #fca311;">
          <p style="margin: 0; line-height: 1.8;">${htmlMessage}</p>
        </div>
        <p style="color: #9aa3b8; margin-top: 20px; font-size: 13px;">— Site Monitor Dashboard</p>
      </div>
    `,
  });
  console.log(`Expiry email sent for ${site.name}`);
}
