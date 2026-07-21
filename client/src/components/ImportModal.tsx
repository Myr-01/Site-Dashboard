import { useState, useRef } from 'react';
import { authHeaders } from '../useAuth';

interface ImportModalProps {
  onClose: () => void;
  onImported: () => void;
}

export default function ImportModal({ onClose, onImported }: ImportModalProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: number; errors: number; total: number } | null>(null);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError('Please select a CSV file');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { ...authHeaders() },
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import failed');

      setResult(data);
      onImported();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-navy-surface border border-border rounded-2xl p-6 w-full max-w-md">
        <h2 className="text-xl font-heading font-bold text-white mb-4">Import Sites from CSV</h2>
        <p className="text-text-muted text-sm mb-4">
          CSV should have columns: <code className="text-accent">name</code>, <code className="text-accent">url</code>
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
            <p className="text-green-400 text-sm">✓ {result.success} sites imported successfully</p>
            {result.errors > 0 && (
              <p className="text-red-400 text-sm mt-1">✗ {result.errors} rows failed</p>
            )}
          </div>
        )}

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 text-sm border border-border text-text-muted rounded-lg hover:text-white transition-colors"
          >
            Close
          </button>
          <button
            onClick={handleUpload}
            disabled={loading}
            className="flex-1 px-4 py-2.5 text-sm bg-accent text-bg font-medium rounded-lg hover:bg-accent/80 transition-colors disabled:opacity-50"
          >
            {loading ? 'Importing...' : 'Upload & Import'}
          </button>
        </div>
      </div>
    </div>
  );
}
