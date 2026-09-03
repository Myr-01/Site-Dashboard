import { useState } from 'react';
import { loginWithEmail, registerWithEmail } from '../useAuth';

interface AuthPageProps {
  onAuthenticated: () => void;
}

type Mode = 'login' | 'register';

export default function AuthPage({ onAuthenticated }: AuthPageProps) {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [totpToken, setTotpToken] = useState('');
  const [needs2FA, setNeeds2FA] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const resetErrors = () => setError('');

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

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-heading font-bold text-white">
            <span className="text-accent">●</span> Site Monitor
          </h1>
          <p className="text-text-muted text-sm mt-1">Real-time website monitoring</p>
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
        </div>
      </div>
    </div>
  );
}
