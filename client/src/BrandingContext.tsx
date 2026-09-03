import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { apiUrl } from './api';

export interface Branding {
  logo_url: string;
  favicon_url: string;
  primary_color: string;
  title: string;
}

const DEFAULT_BRANDING: Branding = {
  logo_url: '',
  favicon_url: '',
  primary_color: '#fca311',
  title: 'Site Monitor',
};

interface BrandingContextValue {
  branding: Branding;
  reloadBranding: () => Promise<void>;
  applyBranding: (b: Branding) => void;
}

const BrandingContext = createContext<BrandingContextValue>({
  branding: DEFAULT_BRANDING,
  reloadBranding: async () => {},
  applyBranding: () => {},
});

// hex (#fca311) → "252 163 17" RGB komponent stringi (Tailwind opacity üçün)
function hexToRgbComponents(hex: string): string | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (!m) return null;
  return `${parseInt(m[1], 16)} ${parseInt(m[2], 16)} ${parseInt(m[3], 16)}`;
}

// Branding-i DOM-a tətbiq et: accent rəng, səhifə başlığı, favicon
function applyToDocument(b: Branding) {
  // Accent rəng (CSS variable → tailwind accent). RGB komponentləri olaraq saxlanılır
  // ki, opacity modifikatorları (accent/30, bg-accent/10) düzgün işləsin.
  if (b.primary_color) {
    const rgb = hexToRgbComponents(b.primary_color);
    if (rgb) document.documentElement.style.setProperty('--accent-rgb', rgb);
    // Solid hex də saxla (inline style-larda istifadə olunanlar üçün)
    document.documentElement.style.setProperty('--accent-color', b.primary_color);
  }
  // Səhifə başlığı
  document.title = b.title || 'Site Monitor';
  // Favicon (varsa)
  if (b.favicon_url) {
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = apiUrl(b.favicon_url);
  }
}

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<Branding>(DEFAULT_BRANDING);

  const applyBranding = useCallback((b: Branding) => {
    setBranding(b);
    applyToDocument(b);
  }, []);

  const reloadBranding = useCallback(async () => {
    try {
      const res = await fetch(apiUrl('/api/branding'));
      if (res.ok) {
        const data = (await res.json()) as Branding;
        applyBranding({ ...DEFAULT_BRANDING, ...data });
      }
    } catch {
      /* default qalır */
    }
  }, [applyBranding]);

  useEffect(() => {
    reloadBranding();
  }, [reloadBranding]);

  return (
    <BrandingContext.Provider value={{ branding, reloadBranding, applyBranding }}>
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding() {
  return useContext(BrandingContext);
}
