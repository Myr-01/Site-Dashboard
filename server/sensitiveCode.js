import crypto from 'crypto';
import { dbGet, dbRun } from './db.js';

// Passcode 12 saatda bir yenilənir
const ROTATION_MS = 12 * 60 * 60 * 1000;

// Uğursuz cəhdlər üçün sadə in-memory rate-limit (user_id → { count, firstAt })
const failedAttempts = new Map();
const MAX_FAILED = 5;
const LOCKOUT_MS = 10 * 60 * 1000; // 10 dəqiqə

// 6 rəqəmli oxunaqlı passcode generasiya et
function generateCode() {
  // 100000–999999 aralığı
  return String(crypto.randomInt(100000, 1000000));
}

/**
 * Cari passcode-u qaytar. Lazy rotation: 12 saatdan çox keçibsə yenidən yaradır.
 * Concurrent-safe: tək sətir (id=1) INSERT OR IGNORE + şərti UPDATE.
 * @returns {Promise<{code: string, generated_at: string, expires_at: string}>}
 */
export async function getCurrentCode() {
  let row = await dbGet('SELECT code, generated_at FROM sensitive_action_code WHERE id = 1');

  // İlk dəfə — sətir yoxdur
  if (!row) {
    const code = generateCode();
    await dbRun(
      "INSERT OR IGNORE INTO sensitive_action_code (id, code, generated_at) VALUES (1, ?, datetime('now'))",
      [code]
    );
    row = await dbGet('SELECT code, generated_at FROM sensitive_action_code WHERE id = 1');
  }

  // Vaxtı keçibsə yenilə
  const generatedMs = new Date(row.generated_at.replace(' ', 'T') + 'Z').getTime();
  const age = Date.now() - generatedMs;
  if (Number.isNaN(generatedMs) || age > ROTATION_MS) {
    const newCode = generateCode();
    // Şərti UPDATE — yalnız köhnə generated_at hələ dəyişməyibsə (concurrent qoruma)
    await dbRun(
      "UPDATE sensitive_action_code SET code = ?, generated_at = datetime('now') WHERE id = 1 AND generated_at = ?",
      [newCode, row.generated_at]
    );
    row = await dbGet('SELECT code, generated_at FROM sensitive_action_code WHERE id = 1');
  }

  const generatedAtMs = new Date(row.generated_at.replace(' ', 'T') + 'Z').getTime();
  return {
    code: row.code,
    generated_at: row.generated_at,
    expires_at: new Date(generatedAtMs + ROTATION_MS).toISOString(),
  };
}

/**
 * Verilmiş kodun cari passcode ilə uyğunluğunu yoxla.
 * @param {string} candidate
 * @returns {Promise<boolean>}
 */
export async function verifyCode(candidate) {
  if (typeof candidate !== 'string' || !candidate.trim()) return false;
  const { code } = await getCurrentCode();
  // Timing-safe müqayisə
  const a = Buffer.from(candidate.trim());
  const b = Buffer.from(code);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * User üçün rate-limit yoxla. true = bloklanıb.
 */
export function isLockedOut(userId) {
  const rec = failedAttempts.get(userId);
  if (!rec) return false;
  if (Date.now() - rec.firstAt > LOCKOUT_MS) {
    failedAttempts.delete(userId);
    return false;
  }
  return rec.count >= MAX_FAILED;
}

export function recordFailedAttempt(userId) {
  const rec = failedAttempts.get(userId);
  if (!rec || Date.now() - rec.firstAt > LOCKOUT_MS) {
    failedAttempts.set(userId, { count: 1, firstAt: Date.now() });
  } else {
    rec.count += 1;
  }
}

export function clearFailedAttempts(userId) {
  failedAttempts.delete(userId);
}
