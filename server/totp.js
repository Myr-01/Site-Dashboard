import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import { dbGet, dbRun } from './db.js';

// Generate TOTP secret for a user
export async function generateTOTPSecret(username) {
  const secret = speakeasy.generateSecret({
    name: `Site Monitor (${username})`,
    issuer: 'Site Monitoring',
  });

  return {
    secret: secret.base32,
    otpauth_url: secret.otpauth_url,
  };
}

// Generate QR code as Data URL
export async function generateQRCode(otpauthUrl) {
  try {
    const dataUrl = await QRCode.toDataURL(otpauthUrl);
    return dataUrl;
  } catch (err) {
    throw new Error('QR code generation failed: ' + err.message);
  }
}

// Verify TOTP token
export function verifyTOTP(secret, token) {
  return speakeasy.totp.verify({
    secret,
    encoding: 'base32',
    token,
    window: 2, // ±2 time window (60s tolerance)
  });
}

// Enable 2FA for user
export async function enable2FA(userId, secret) {
  try {
    await dbRun(
      `UPDATE users SET totp_secret = ?, totp_enabled = 1 WHERE id = ?`,
      [secret, userId]
    );
    return { success: true };
  } catch (err) {
    throw new Error('Failed to enable 2FA: ' + err.message);
  }
}

// Disable 2FA for user
export async function disable2FA(userId) {
  try {
    await dbRun(
      `UPDATE users SET totp_secret = NULL, totp_enabled = 0 WHERE id = ?`,
      [userId]
    );
    return { success: true };
  } catch (err) {
    throw new Error('Failed to disable 2FA: ' + err.message);
  }
}

// Get user's 2FA status
export async function get2FAStatus(userId) {
  try {
    const user = await dbGet(
      `SELECT totp_enabled, totp_secret FROM users WHERE id = ?`,
      [userId]
    );
    
    return {
      enabled: user?.totp_enabled === 1,
      hasSecret: !!user?.totp_secret,
    };
  } catch (err) {
    throw new Error('Failed to get 2FA status: ' + err.message);
  }
}

// Check if user has 2FA enabled
export async function is2FAEnabled(username) {
  try {
    const user = await dbGet(
      `SELECT totp_enabled FROM users WHERE username = ?`,
      [username]
    );
    return user?.totp_enabled === 1;
  } catch (err) {
    return false;
  }
}

// Verify user's TOTP token
export async function verify2FA(username, token) {
  try {
    const user = await dbGet(
      `SELECT totp_secret FROM users WHERE username = ? AND totp_enabled = 1`,
      [username]
    );
    
    if (!user || !user.totp_secret) {
      return false;
    }

    return verifyTOTP(user.totp_secret, token);
  } catch (err) {
    console.error('2FA verification error:', err.message);
    return false;
  }
}
