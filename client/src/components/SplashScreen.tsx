import { useEffect, useState } from 'react';
import { useBranding } from '../BrandingContext';
import { apiUrl } from '../api';

interface SplashScreenProps {
  onDone: () => void;
}

/**
 * Açılış (splash) ekranı — logo + ad göstərir, sonra fade-out olub gizlənir.
 * Branding logosu varsa onu, yoxsa default nişanı göstərir.
 */
export default function SplashScreen({ onDone }: SplashScreenProps) {
  const { branding } = useBranding();
  const [visible, setVisible] = useState(false); // fade-in üçün
  const [leaving, setLeaving] = useState(false);  // fade-out üçün

  useEffect(() => {
    // Fade-in dərhal başlasın
    const inTimer = requestAnimationFrame(() => setVisible(true));
    // ~1.6s göstər, sonra fade-out başlat
    const outTimer = setTimeout(() => setLeaving(true), 1600);
    // fade-out (500ms) bitəndən sonra tam sil
    const doneTimer = setTimeout(onDone, 2100);
    return () => {
      cancelAnimationFrame(inTimer);
      clearTimeout(outTimer);
      clearTimeout(doneTimer);
    };
  }, [onDone]);

  return (
    <div
      className={`fixed inset-0 z-[2000] flex items-center justify-center bg-bg transition-opacity duration-500 ${
        leaving ? 'opacity-0' : 'opacity-100'
      }`}
    >
      <div
        className={`flex flex-col items-center gap-4 transition-[opacity,transform] duration-700 ${
          visible && !leaving ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
        }`}
      >
        {/* Logo */}
        {branding.logo_url ? (
          <img
            src={apiUrl(branding.logo_url)}
            alt={branding.title}
            className="h-20 w-auto max-w-[220px] object-contain animate-pulse-slow"
          />
        ) : (
          <div className="w-20 h-20 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center">
            <span className="text-accent text-4xl leading-none">●</span>
          </div>
        )}

        {/* Ad */}
        <h1 className="text-2xl font-heading font-bold text-white tracking-wide">
          {branding.title || 'Site Monitor'}
        </h1>

        {/* İncə yüklənmə xətti */}
        <div className="mt-2 w-24 h-0.5 bg-navy-light rounded-full overflow-hidden">
          <div className="h-full bg-accent animate-splash-bar" />
        </div>
      </div>
    </div>
  );
}
