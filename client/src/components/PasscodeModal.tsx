import { useState, useEffect, useRef } from 'react';
import { setSensitiveCode } from '../api';

interface PasscodeModalProps {
  onSuccess: () => void;
  onClose: () => void;
  title?: string;
}

/**
 * Non-admin istifadəçilərdən həssas əməliyyat (sayt əlavə, credential-lara baxış)
 * üçün rotating passcode soruşan modal. Kod sessiyada saxlanılır.
 */
export default function PasscodeModal({ onSuccess, onClose, title }: PasscodeModalProps) {
  const [code, setCode] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100);
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    // Kodu sessiyada saxla — API çağırışları x-sensitive-code header ilə gedəcək.
    // Səhvdirsə server 403 qaytaracaq və çağıran yenidən bu modalı göstərəcək.
    setSensitiveCode(code.trim());
    onSuccess();
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[1020] p-4"
      onClick={onClose}
    >
      <div
        className="bg-navy-surface border border-border rounded-2xl p-6 w-full max-w-sm shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center mb-4">
          <div className="w-12 h-12 bg-accent/10 border border-accent/20 rounded-xl flex items-center justify-center">
            <svg className="w-6 h-6 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
          </div>
        </div>

        <h2 className="text-white font-heading font-bold text-lg text-center mb-1">Giriş Kodu</h2>
        <p className="text-text-muted text-sm text-center mb-5">
          {title || 'Bu əməliyyat üçün adminin verdiyi giriş kodu tələb olunur'}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="6 rəqəmli kod"
            className="w-full px-4 py-3 bg-navy-light border border-border rounded-lg text-white text-sm placeholder:text-text-muted/50 focus:outline-none focus:border-accent transition-colors tracking-widest text-center"
          />
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 text-sm border border-border text-text-muted rounded-lg hover:text-white transition-colors"
            >
              Ləğv et
            </button>
            <button
              type="submit"
              disabled={!code.trim()}
              className="flex-1 px-4 py-2.5 text-sm bg-accent text-bg font-medium rounded-lg hover:bg-accent/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Təsdiqlə
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
