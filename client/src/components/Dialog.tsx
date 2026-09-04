import { useState, useEffect } from 'react';
import { useEnterAnimation } from '../hooks/useEnterAnimation';
import { useFocusTrap } from '../hooks/useFocusTrap';

/* =============================================
   Universal Dialog Component
   alert / confirm / prompt növlərini dəstəkləyir
   Sayt paleti: #000 bg, #14213d surface, #fca311 accent
   ============================================= */

type DialogType = 'alert' | 'confirm' | 'prompt' | 'password';

interface DialogConfig {
  type: DialogType;
  title?: string;
  message: string;
  defaultValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  resolve: (value: string | boolean | null) => void;
}

let _show: ((config: Omit<DialogConfig, 'resolve'>) => Promise<string | boolean | null>) | null = null;

export function showDialog(config: Omit<DialogConfig, 'resolve'>): Promise<string | boolean | null> {
  if (_show) return _show(config);
  return Promise.resolve(null);
}

// Convenience helpers
export const dialog = {
  alert: (message: string, title?: string) =>
    showDialog({ type: 'alert', message, title }),
  confirm: (message: string, title?: string, danger?: boolean) =>
    showDialog({ type: 'confirm', message, title, danger }),
  prompt: (message: string, defaultValue?: string, title?: string) =>
    showDialog({ type: 'prompt', message, defaultValue, title }),
  password: (message?: string) =>
    showDialog({ type: 'password', message: message || 'Admin şifrəsini daxil edin' }),
};

export function DialogProvider() {
  const [queue, setQueue] = useState<DialogConfig[]>([]);
  const current = queue[0] ?? null;

  useEffect(() => {
    _show = (config) =>
      new Promise((resolve) => {
        setQueue((q) => [...q, { ...config, resolve }]);
      });
    return () => { _show = null; };
  }, []);

  const resolve = (value: string | boolean | null) => {
    current?.resolve(value);
    setQueue((q) => q.slice(1));
  };

  if (!current) return null;

  return <DialogModal config={current} onResolve={resolve} />;
}

function DialogModal({ config, onResolve }: { config: DialogConfig; onResolve: (v: string | boolean | null) => void }) {
  const [value, setValue] = useState(config.defaultValue || '');
  const [isClosing, setIsClosing] = useState(false);
  const enterVisible = useEnterAnimation();
  const visible = enterVisible && !isClosing;
  const [showPass, setShowPass] = useState(false);
  const trapRef = useFocusTrap<HTMLDivElement>();

  const close = (val: string | boolean | null) => {
    setIsClosing(true);
    setTimeout(() => onResolve(val), 200);
  };

  const handleConfirm = () => {
    if (config.type === 'alert') close(true);
    else if (config.type === 'confirm') close(true);
    else if (config.type === 'prompt') close(value);
    else if (config.type === 'password') close(value);
  };

  const handleCancel = () => close(config.type === 'confirm' ? false : null);

  const isInput = config.type === 'prompt' || config.type === 'password';
  const isConfirm = config.type === 'confirm';
  const isAlert = config.type === 'alert';

  return (
    <div
      className={`fixed inset-0 flex items-center justify-center z-[1100] transition-opacity duration-200 ${visible ? 'opacity-100' : 'opacity-0'}`}
      style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(4px)' }}
      onClick={() => { if (isAlert) close(true); else handleCancel(); }}
    >
      <div
        ref={trapRef}
        role={config.type === 'alert' ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby="dialog-title"
        aria-describedby="dialog-message"
        className={`w-full max-w-sm mx-4 rounded-2xl overflow-hidden shadow-2xl transition-[transform,opacity] duration-200 ${visible ? 'scale-100 translate-y-0' : 'scale-95 translate-y-3'}`}
        style={{
          background: 'linear-gradient(160deg, #14213d 0%, #1a2a4a 100%)',
          border: config.danger ? '1px solid rgba(239,68,68,0.35)' : '1px solid rgba(252,163,17,0.2)',
          boxShadow: config.danger ? '0 25px 50px rgba(239,68,68,0.15)' : '0 25px 50px rgba(252,163,17,0.08)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-3">
          {/* Icon */}
          <div className="flex items-center gap-3 mb-3">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: config.danger ? 'rgba(239,68,68,0.15)' : 'rgba(252,163,17,0.12)' }}
            >
              {config.type === 'password' ? (
                <svg className="w-4 h-4" fill="none" stroke={config.danger ? '#ef4444' : '#fca311'} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              ) : config.type === 'confirm' ? (
                <svg className="w-4 h-4" fill="none" stroke={config.danger ? '#ef4444' : '#fca311'} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              ) : config.type === 'prompt' ? (
                <svg className="w-4 h-4" fill="none" stroke="#fca311" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="#fca311" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
            </div>
            <h3 id="dialog-title" className="text-white font-heading font-semibold text-base">
              {config.title || (config.type === 'password' ? 'Admin Girişi' : config.type === 'confirm' ? 'Təsdiq' : config.type === 'prompt' ? 'Redaktə' : 'Məlumat')}
            </h3>
          </div>
          <p id="dialog-message" className="text-text-muted text-sm leading-relaxed">{config.message}</p>
        </div>

        {/* Input (prompt / password) */}
        {isInput && (
          <div className="px-5 pb-3">
            <div className="relative mt-1">
              <input
                type={config.type === 'password' && !showPass ? 'password' : 'text'}
                value={value}
                onChange={e => setValue(e.target.value)}
                autoFocus
                onKeyDown={e => { if (e.key === 'Enter') handleConfirm(); if (e.key === 'Escape') handleCancel(); }}
                className="w-full px-4 py-3 rounded-xl text-white text-sm focus:outline-none focus:ring-2 transition-[border-color,box-shadow]"
                style={{
                  background: 'rgba(255,255,255,0.07)',
                  border: '1px solid rgba(252,163,17,0.25)',
                  caretColor: '#fca311',
                }}
                placeholder={config.type === 'password' ? '••••••••' : ''}
              />
              {config.type === 'password' && (
                <button
                  type="button"
                  onClick={() => setShowPass(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-white transition-colors"
                >
                  {showPass ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex gap-2.5 p-4 pt-2">
          {!isAlert && (
            <button
              onClick={handleCancel}
              className="flex-1 py-2.5 text-sm text-text-muted rounded-xl hover:text-white transition-colors"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              {config.cancelLabel || 'Ləğv et'}
            </button>
          )}
          <button
            onClick={handleConfirm}
            className="flex-1 py-2.5 text-sm font-semibold rounded-xl transition-opacity hover:opacity-90"
            style={config.danger
              ? { background: 'linear-gradient(135deg, #ef4444, #dc2626)', color: '#fff' }
              : { background: 'linear-gradient(135deg, #fca311, #e8940a)', color: '#000' }
            }
          >
            {config.confirmLabel || (isAlert ? 'Tamam' : isConfirm ? 'Bəli, davam et' : 'Saxla')}
          </button>
        </div>
      </div>
    </div>
  );
}
