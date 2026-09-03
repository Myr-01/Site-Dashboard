import { useState, useEffect, useCallback } from 'react';
import { apiUrl } from '../api';
import { authHeaders } from '../useAuth';
import { dialog } from './Dialog';

interface CodeData {
  code: string;
  expires_at: string;
}

/**
 * Admin dashboard-da göstərilən canlı giriş kodu widget-i.
 * Kod 12 saatda bir yenilənir; admin bunu non-admin istifadəçilərlə paylaşır.
 */
export default function PasscodeWidget() {
  const [data, setData] = useState<CodeData | null>(null);
  const [remaining, setRemaining] = useState('');

  const fetchCode = useCallback(async () => {
    try {
      const res = await fetch(apiUrl('/api/admin/sensitive-code'), { headers: authHeaders() });
      if (res.ok) setData(await res.json());
    } catch {
      /* susdur */
    }
  }, []);

  useEffect(() => {
    fetchCode();
    // Kod ~12 saatda dəyişir; 5 dəqiqədə bir yeniləyək ki, expiry yaxınlaşanda təzələnsin
    const interval = setInterval(fetchCode, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchCode]);

  // Qalan vaxtı hesabla (HH:MM formatında)
  useEffect(() => {
    if (!data?.expires_at) return;
    const tick = () => {
      const ms = new Date(data.expires_at).getTime() - Date.now();
      if (ms <= 0) {
        setRemaining('bitib');
        fetchCode();
        return;
      }
      const h = Math.floor(ms / 3_600_000);
      const m = Math.floor((ms % 3_600_000) / 60_000);
      setRemaining(`${h}s ${m}dəq`);
    };
    tick();
    const t = setInterval(tick, 30_000);
    return () => clearInterval(t);
  }, [data, fetchCode]);

  const copyCode = async () => {
    if (!data?.code) return;
    try {
      await navigator.clipboard.writeText(data.code);
      await dialog.alert('Giriş kodu kopyalandı.', 'Kopyalandı');
    } catch {
      await dialog.alert(`Giriş kodu: ${data.code}`, 'Kod');
    }
  };

  if (!data) return null;

  return (
    <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-accent/10 border border-accent/30 rounded-lg">
      <span className="text-text-muted text-xs">Giriş kodu:</span>
      <span className="text-accent font-mono font-bold text-sm tracking-widest">{data.code}</span>
      <button
        onClick={copyCode}
        className="text-text-muted hover:text-accent transition-colors"
        aria-label="Kodu kopyala"
        title="Kopyala"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      </button>
      <span className="text-text-muted/60 text-[10px] border-l border-accent/20 pl-2">{remaining}</span>
    </div>
  );
}
