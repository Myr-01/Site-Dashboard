import { useState, useRef, useEffect } from 'react';
import { authHeaders } from '../useAuth';
import { apiUrl } from '../api';
import { useFocusTrap } from '../hooks/useFocusTrap';

interface ImportModalProps {
  onClose: () => void;
  onImported: () => void;
}

export default function ImportModal({ onClose, onImported }: ImportModalProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: number; errors: number; total: number } | null>(null);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const trapRef = useFocusTrap<HTMLDivElement>();

  // Block body scroll when modal is open + Escape to close
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleEsc);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleEsc);
    };
  }, [onClose]);

  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError('Əvvəlcə CSV faylı seçin');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(apiUrl('/api/import'), {
        method: 'POST',
        headers: { ...authHeaders() },
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'İdxal alınmadı. Faylı yoxlayıb yenidən cəhd edin.');

      setResult(data);
      onImported();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Naməlum xəta');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[1000] p-4" onClick={onClose}>
      <div ref={trapRef} role="dialog" aria-modal="true" aria-labelledby="import-title" className="bg-navy-surface border border-border rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <h2 id="import-title" className="text-xl font-heading font-bold text-white mb-4">CSV-dən Sayt İdxalı</h2>
        <p className="text-text-muted text-sm mb-4">
          CSV faylında bu sütunlar olmalıdır: <code className="text-accent">name</code>, <code className="text-accent">url</code>
        </p>

        <input
          ref={fileRef}
          type="file"
          accept=".csv"
          className="w-full px-4 py-2.5 bg-navy-light border border-border rounded-lg text-white file:mr-4 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-sm file:bg-accent file:text-bg file:font-medium file:cursor-pointer cursor-pointer"
        />

        {error && <p className="text-red-400 text-sm mt-3">{error}</p>}

        {result && (
          <div className="mt-4 p-3 bg-navy-light rounded-lg border border-border">
            <p className="text-green-400 text-sm">✓ {result.success} sayt uğurla idxal edildi</p>
            {result.errors > 0 && (
              <p className="text-red-400 text-sm mt-1">✕ {result.errors} sətir idxal edilmədi</p>
            )}
          </div>
        )}

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 text-sm border border-border text-text-muted rounded-lg hover:text-white transition-colors"
          >
            Bağla
          </button>
          <button
            onClick={handleUpload}
            disabled={loading}
            className="flex-1 px-4 py-2.5 text-sm bg-accent text-bg font-medium rounded-lg hover:bg-accent/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'İdxal edilir...' : 'Yüklə və idxal et'}
          </button>
        </div>
      </div>
    </div>
  );
}
