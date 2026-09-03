// Bütün API çağırışları üçün mərkəzləşdirilmiş base URL
// Production-da VITE_API_URL Railway backend URL-inə işarə edir
// Development-da boşdur (Vite proxy /api → localhost:3001)
export const API_BASE = import.meta.env.VITE_API_URL || '';

export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

// Həssas əməliyyat kodunu (rotating passcode) sessiya boyu saxla ki, hər dəfə
// soruşmayaq. Non-admin user-lər üçün add site / credentials əməliyyatlarında istifadə olunur.
export function getSensitiveCode(): string | null {
  return sessionStorage.getItem('sensitiveCode');
}

export function setSensitiveCode(code: string): void {
  sessionStorage.setItem('sensitiveCode', code);
}

export function clearSensitiveCode(): void {
  sessionStorage.removeItem('sensitiveCode');
}

// Həssas əməliyyat header-i (admin üçün boş — server admin-i onsuz da istisna edir)
export function sensitiveHeaders(): Record<string, string> {
  const code = getSensitiveCode();
  return code ? { 'x-sensitive-code': code } : {};
}
