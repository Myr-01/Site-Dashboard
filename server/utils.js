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
