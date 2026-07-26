// Bütün API çağırışları üçün mərkəzləşdirilmiş base URL
// Production-da VITE_API_URL Railway backend URL-inə işarə edir
// Development-da boşdur (Vite proxy /api → localhost:3001)
export const API_BASE = import.meta.env.VITE_API_URL || '';

export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}
