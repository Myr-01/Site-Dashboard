import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const BCRYPT_ROUNDS = 10;

/**
 * Plain şifrəni bcrypt hash-ə çevir.
 * @param {string} plainPassword
 * @returns {Promise<string>}
 */
export async function hashPassword(plainPassword) {
  return bcrypt.hash(plainPassword, BCRYPT_ROUNDS);
}

/**
 * Plain şifrəni saxlanılan hash ilə müqayisə et.
 * @param {string} plainPassword
 * @param {string} hash
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(plainPassword, hash) {
  if (!plainPassword || !hash) return false;
  return bcrypt.compare(plainPassword, hash);
}

/**
 * Fayl adında path traversal simvollarına icazə vermə.
 * @param {*} name - Yoxlanacaq fayl adı
 * @returns {boolean}
 */
export function isSafeFilename(name) {
  if (typeof name !== 'string' || name.length === 0) return false;
  if (name.includes('..') || name.includes('/') || name.includes('\\')) return false;
  return true;
}

/**
 * İstifadəçi sessiya JWT-si yarat. Payload user identity daşıyır.
 * @param {{id: number, role?: string, email?: string}} user
 * @param {string} jwtSecret
 * @param {string} [expiresIn]
 * @returns {string}
 */
export function signUserToken(user, jwtSecret, expiresIn = '7d') {
  const payload = { user_id: user.id, role: user.role || 'user', email: user.email || null };
  // Guest token: hansı user-in saytlarını görəcəyini daşıyır
  if (user.role === 'guest' && user.guest_target != null) {
    payload.guest_target = user.guest_target;
  }
  return jwt.sign(payload, jwtSecret, { expiresIn });
}

/**
 * Geriyə uyğunluq üçün — köhnə admin token (payload {role:'admin'}, user_id yox).
 * Yeni kodda signUserToken istifadə et.
 * @param {string} jwtSecret
 * @param {string} [expiresIn]
 * @returns {string}
 */
export function signAdminToken(jwtSecret, expiresIn = '7d') {
  return jwt.sign({ role: 'admin' }, jwtSecret, { expiresIn });
}

/**
 * Token-in etibarlılığını yoxla və decode edilmiş payload-u qaytar (throw etmir).
 * @param {string|undefined} token
 * @param {string} jwtSecret
 * @returns {object|null} decode edilmiş payload və ya null
 */
export function verifyToken(token, jwtSecret) {
  if (!token) return null;
  try {
    return jwt.verify(token, jwtSecret);
  } catch {
    return null;
  }
}

/**
 * Token-in etibarlı JWT olub-olmadığını yoxla (throw etmir).
 * @param {string|undefined} token
 * @param {string} jwtSecret
 * @returns {boolean}
 */
export function isValidAdminToken(token, jwtSecret) {
  return verifyToken(token, jwtSecret) !== null;
}

/**
 * Auth middleware factory — JWT sessiya token-i yoxlayır və `req.user`-i doldurur.
 * Token `x-admin-token` header-ində gözlənilir (geriyə uyğunluq üçün ad saxlanılır).
 * `req.user = { id, role, email }`. Köhnə admin token-lərində user_id olmadığı üçün
 * id null, role 'admin' olur — belə token-lər hələ də admin kimi qəbul edilir.
 * @param {string} jwtSecret
 */
export function createRequireAuth(jwtSecret) {
  return function requireAuth(req, res, next) {
    const token = req.headers['x-admin-token'];
    const payload = verifyToken(token, jwtSecret);
    if (!payload) {
      return res.status(401).json({ error: 'İcazə yoxdur və ya sessiya bitib' });
    }
    req.user = {
      id: payload.user_id ?? null,
      role: payload.role || 'user',
      email: payload.email ?? null,
      guestTarget: payload.guest_target ?? null,
    };
    next();
  };
}

// Xəbərdarlıq günlərinin default dəyəri (sayt üzrə fərdi dəyər yoxdursa)
export const DEFAULT_ALERT_DAYS = '3,1';

/**
 * Vergüllə ayrılmış xəbərdarlıq günlərini massivə çevir.
 * Yanlış/boş dəyərlərdə default-a qayıdır.
 * @param {string|null|undefined} raw - məs. "30, 7,1"
 * @returns {number[]} məs. [30, 7, 1]
 */
export function parseAlertDays(raw) {
  const source = typeof raw === 'string' && raw.trim() ? raw : DEFAULT_ALERT_DAYS;
  const days = source
    .split(',')
    .map(d => parseInt(String(d).trim(), 10))
    .filter(d => Number.isInteger(d) && d > 0 && d <= 3650);
  const unique = [...new Set(days)].sort((a, b) => b - a);
  return unique.length > 0 ? unique : parseAlertDays(DEFAULT_ALERT_DAYS);
}

/**
 * İstifadəçi girişini DB-də saxlanacaq normal formata çevir.
 * @param {string|null|undefined} raw
 * @returns {string} məs. "30,7,1"
 */
export function normalizeAlertDays(raw) {
  return parseAlertDays(raw).join(',');
}

/**
 * Keş müddəti keçib-keçmədiyini yoxla.
 * @param {string|null} lastCheckedAt - ISO timestamp
 * @param {number} cacheHours
 * @returns {boolean}
 */
export function shouldRefreshCache(lastCheckedAt, cacheHours) {
  if (!lastCheckedAt) return true;
  const lastCheck = new Date(lastCheckedAt);
  const now = new Date();
  return (now.getTime() - lastCheck.getTime()) > cacheHours * 60 * 60 * 1000;
}
