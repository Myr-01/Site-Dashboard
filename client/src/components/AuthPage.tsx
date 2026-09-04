import { useState } from 'react';
import { loginWithEmail, registerWithEmail, fetchGuestAccounts, loginAsGuest, GuestAccount } from '../useAuth';
import { useBranding } from '../BrandingContext';
import { apiUrl } from '../api';

interface AuthPageProps {
  onAuthenticated: () => void;
}

type Mode = 'login' | 'register' | 'guest';

export default function AuthPage({ onAuthenticated }: AuthPageProps) {
  const { branding } = useBranding();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [totpToken, setTotpToken] = useState('');
  const [needs2FA, setNeeds2FA] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState<GuestAccount[]>([]);

  const resetErrors = () => setError('');

  // Qonaq axını — hesab siyahısını yüklə və guest rejiminə keç
  const startGuestFlow = async () => {
    setLoading(true);
    setError('');
    const list = await fetchGuestAccounts();
    setLoading(false);
    if (list.length === 0) {
      setError('Hazırda baxıla biləcək hesab yoxdur');
      return;
    }
    setAccounts(list);
    setMode('guest');
  };

  const handleGuestSelect = async (userId: number) => {
    setLoading(true);
    setError('');
    const res = await loginAsGuest(userId);
    setLoading(false);
    if (res.ok) onAuthenticated();
    else setError(res.error || 'Qonaq girişi uğursuz oldu');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    resetErrors();

    if (!email.trim() || !password) {
      setError('Email və şifrə tələb olunur');
      return;
    }

    if (mode === 'register') {
      if (password.length < 8) {
        setError('Şifrə ən azı 8 simvol olmalıdır');
        return;
      }
      if (password !== confirmPassword) {
        setError('Şifrələr uyğun gəlmir');
        return;
      }
    }

    setLoading(true);
    try {
      if (mode === 'register') {
        const res = await registerWithEmail(email.trim(), password);
        if (res.ok) {
          onAuthenticated();
        } else {
          setError(res.error || 'Qeydiyyat uğursuz oldu');
        }
      } else {
        const res = await loginWithEmail(email.trim(), password, needs2FA ? totpToken : undefined);
        if (res.ok) {
          onAuthenticated();
        } else if (res.requires2FA) {
          setNeeds2FA(true);
          setError('');
        } else {
          setError(res.error || 'Giriş uğursuz oldu');
        }
      }
    } catch {
      setError('Server bağlantısı uğursuz oldu');
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    setError('');
    setNeeds2FA(false);
    setTotpToken('');
    setConfirmPassword('');
  };

  // === QONAQ HESAB SEÇİMİ EKRANI ===
  if (mode === 'guest') {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-heading font-bold text-white flex items-center justify-center gap-2">
              {branding.logo_url ? (
                <img src={apiUrl(branding.logo_url)} alt={branding.title} className="h-9 w-auto max-w-[200px] object-contain" />
              ) : (
                <><span className="text-accent">●</span> {branding.title}</>
              )}
            </h1>
            <p className="text-text-muted text-sm mt-1">Qonaq rejimi — yalnız baxış</p>
          </div>

          <div className="bg-navy-surface border border-border rounded-2xl p-6 shadow-2xl">
            <h2 className="text-white font-heading font-medium text-base mb-1">Hesab seçin</h2>
            <p className="text-text-muted text-xs mb-5">Kimin saytlarını izləmək istəyirsiniz?</p>

            <div className="space-y-2">
              {accounts.map((acc) => (
                <button
                  key={acc.id}
                  onClick={() => handleGuestSelect(acc.id)}
                  disabled={loading}
                  className="w-full flex items-center justify-between px-4 py-3 bg-navy-light border border-border rounded-lg text-left hover:border-accent transition-colors disabled:opacity-50"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center shrink-0">
                      <span className="text-accent text-xs font-medium">{acc.label.slice(0, 1).toUpperCase()}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-white text-sm truncate">{acc.label}</p>
                      <p className="text-text-muted text-xs">{acc.site_count} sayt{acc.is_admin ? ' · admin' : ''}</p>
                    </div>
                  </div>
                  <svg className="w-4 h-4 text-text-muted shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              ))}
            </div>

            {error && <p className="text-red-400 text-xs mt-4">{error}</p>}

            <button
              onClick={() => switchMode('login')}
              className="w-full mt-5 text-text-muted hover:text-white text-xs transition-colors"
            >
              ← Girişə qayıt
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-heading font-bold text-white flex items-center justify-center gap-2.5 tracking-tight">
            {branding.logo_url ? (
              <img src={apiUrl(branding.logo_url)} alt={branding.title} className="h-10 w-auto max-w-[220px] object-contain" />
            ) : (
              <>
                <span className="relative flex h-3 w-3">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-accent/60 animate-ping" />
                  <span className="relative inline-flex h-3 w-3 rounded-full bg-accent" />
                </span>
                {branding.title}
              </>
            )}
          </h1>
          <p className="text-text-muted text-sm mt-2">Real-time sayt monitorinqu</p>
        </div>

        <div className="bg-navy-surface border border-border rounded-2xl p-6 shadow-2xl">
          {/* Tab switcher */}
          <div className="flex gap-2 mb-6 border-b border-border">
            <button
              type="button"
              onClick={() => switchMode('login')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                mode === 'login' ? 'border-accent text-accent' : 'border-transparent text-text-muted hover:text-white'
              }`}
            >
              Giriş
            </button>
            <button
              type="button"
              onClick={() => switchMode('register')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                mode === 'register' ? 'border-accent text-accent' : 'border-transparent text-text-muted hover:text-white'
              }`}
            >
              Qeydiyyat
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-text-muted text-xs mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); resetErrors(); }}
                placeholder="siz@numune.com"
                autoComplete="email"
                disabled={needs2FA}
                className="w-full px-3 py-2.5 bg-navy-light border border-border rounded-lg text-white text-sm placeholder:text-text-muted/50 focus:outline-none focus:border-accent transition-colors disabled:opacity-60"
              />
            </div>

            <div>
              <label className="block text-text-muted text-xs mb-1">Şifrə</label>
              <input
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); resetErrors(); }}
                placeholder={mode === 'register' ? 'Ən azı 8 simvol' : 'Şifrə'}
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                disabled={needs2FA}
                className="w-full px-3 py-2.5 bg-navy-light border border-border rounded-lg text-white text-sm placeholder:text-text-muted/50 focus:outline-none focus:border-accent transition-colors disabled:opacity-60"
              />
            </div>

            {mode === 'register' && (
              <div>
                <label className="block text-text-muted text-xs mb-1">Şifrəni təsdiqlə</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); resetErrors(); }}
                  placeholder="Şifrəni təkrar daxil edin"
                  autoComplete="new-password"
                  className="w-full px-3 py-2.5 bg-navy-light border border-border rounded-lg text-white text-sm placeholder:text-text-muted/50 focus:outline-none focus:border-accent transition-colors"
                />
              </div>
            )}

            {needs2FA && (
              <div>
                <label className="block text-text-muted text-xs mb-1">2FA Kodu</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={totpToken}
                  onChange={(e) => { setTotpToken(e.target.value); resetErrors(); }}
                  placeholder="6 rəqəmli kod"
                  autoFocus
                  className="w-full px-3 py-2.5 bg-navy-light border border-border rounded-lg text-white text-sm placeholder:text-text-muted/50 focus:outline-none focus:border-accent transition-colors tracking-widest"
                />
              </div>
            )}

            {error && <p className="text-red-400 text-xs">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full px-4 py-2.5 text-sm bg-accent text-bg font-medium rounded-lg hover:bg-accent/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Gözləyin...' : mode === 'register' ? 'Qeydiyyatdan keç' : needs2FA ? 'Təsdiqlə' : 'Giriş et'}
            </button>
          </form>

          <p className="text-text-muted/70 text-xs text-center mt-4">
            {mode === 'login' ? (
              <>Hesabınız yoxdur? <button onClick={() => switchMode('register')} className="text-accent hover:underline">Qeydiyyatdan keçin</button></>
            ) : (
              <>Artıq hesabınız var? <button onClick={() => switchMode('login')} className="text-accent hover:underline">Giriş edin</button></>
            )}
          </p>

          {/* Qonaq girişi */}
          <div className="mt-5 pt-5 border-t border-border">
            <button
              type="button"
              onClick={startGuestFlow}
              disabled={loading}
              className="w-full px-4 py-2.5 text-sm border border-border text-text-muted rounded-lg hover:text-white hover:border-accent/40 transition-colors disabled:opacity-50"
            >
              Qonaq kimi davam et →
            </button>
            <p className="text-text-muted/50 text-[11px] text-center mt-2">
              Şifrəsiz, yalnız baxış rejimi
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
