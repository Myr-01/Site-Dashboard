import { useState, useEffect, useRef } from 'react';
import { useEnterAnimation } from '../hooks/useEnterAnimation';
import { loginWithPassword } from '../useAuth';

interface AuthModalProps {
  onSuccess: () => void;
  onClose: () => void;
}

export default function AuthModal({ onSuccess, onClose }: AuthModalProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const enterVisible = useEnterAnimation();
  const isVisible = enterVisible && !isClosing;
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  // Block body scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(onClose, 200);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;
    setLoading(true);
    setError('');
    try {
      // Uğurlu olduqda JWT token session-da saxlanılır (şifrənin özü yox)
      const ok = await loginWithPassword(password);
      if (ok) {
        setIsClosing(true);
        setTimeout(onSuccess, 200);
      } else {
        setError('Şifrə yanlışdır');
        setPassword('');
        inputRef.current?.focus();
      }
    } catch {
      setError('Server bağlantısı uğursuz oldu');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose(); };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  return (
    <div
      className={`fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[1010] transition-opacity duration-200 ${
        isVisible ? 'opacity-100' : 'opacity-0'
      }`}
      onClick={handleClose}
    >
      <div
        className={`bg-navy-surface border border-border rounded-2xl p-6 w-full max-w-sm shadow-2xl transition-[transform,opacity] duration-200 ${
          isVisible ? 'scale-100 opacity-100 translate-y-0' : 'scale-95 opacity-0 translate-y-2'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Icon */}
        <div className="flex justify-center mb-4">
          <div className="w-12 h-12 bg-accent/10 border border-accent/20 rounded-xl flex items-center justify-center">
            <svg className="w-6 h-6 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
        </div>

        <h2 className="text-white font-heading font-bold text-lg text-center mb-1">Admin Girişi</h2>
        <p className="text-text-muted text-sm text-center mb-5">Bu əməliyyat üçün şifrə tələb olunur</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              ref={inputRef}
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(''); }}
              placeholder="Şifrəni daxil edin"
              className={`w-full px-4 py-3 bg-navy-light border rounded-lg text-white text-sm placeholder:text-text-muted/50 focus:outline-none transition-colors ${
                error ? 'border-red-400 focus:border-red-400' : 'border-border focus:border-accent'
              }`}
            />
            {error && <p className="text-red-400 text-xs mt-1.5">{error}</p>}
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 px-4 py-2.5 text-sm border border-border text-text-muted rounded-lg hover:text-white transition-colors"
            >
              Ləğv et
            </button>
            <button
              type="submit"
              disabled={loading || !password.trim()}
              className="flex-1 px-4 py-2.5 text-sm bg-accent text-bg font-medium rounded-lg hover:bg-accent/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Yoxlanılır...' : 'Giriş'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
