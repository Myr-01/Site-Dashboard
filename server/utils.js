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
 * Admin auth middleware factory.
 * @param {string} adminPassword
 */
export function createRequireAuth(adminPassword) {
  return function requireAuth(req, res, next) {
    const token = req.headers['x-admin-password'];
    if (token === adminPassword) {
      next();
    } else {
      res.status(401).json({ error: 'İcazə yoxdur' });
    }
  };
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
