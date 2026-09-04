/**
 * Runtime accent rəngi helper-i — white-label branding üçün.
 *
 * Accent `--accent-rgb` CSS dəyişənində saxlanılır (məs. "252 163 17") və
 * admin panel tərəfindən runtime-da dəyişdirilir. Tailwind sinifləri (text-accent,
 * border-accent və s.) bunu avtomatik istifadə edir, amma Chart.js kimi canvas
 * əsaslı komponentlər və bəzi inline SVG stroke-ları hex/rgb string tələb edir.
 * Bu helper həmin yerlər üçün cari accent-i CSS dəyişənindən oxuyur.
 */

/** Cari accent-in "R G B" komponentlərini qaytarır (məs. "252 163 17"). */
function accentRgbComponents(): string {
  if (typeof window === 'undefined') return '252 163 17';
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue('--accent-rgb')
    .trim();
  return v || '252 163 17';
}

/** Cari accent rənginin rgb()/rgba() formatı. alpha verilərsə rgba qaytarır. */
export function accentColor(alpha = 1): string {
  const comps = accentRgbComponents().replace(/\s+/g, ', ');
  return alpha >= 1 ? `rgb(${comps})` : `rgba(${comps}, ${alpha})`;
}

/** Cari accent-in hex forması (məs. "#fca311") — hex tələb edən API-lar üçün. */
export function accentHex(): string {
  const [r, g, b] = accentRgbComponents().split(/\s+/).map(Number);
  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
