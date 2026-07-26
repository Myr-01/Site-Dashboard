import { useState } from 'react';
import { authHeaders } from '../useAuth';
import { apiUrl } from '../api';

interface AddSiteModalProps {
  onClose: () => void;
  onAdded: () => void;
}

export default function AddSiteModal({ onClose, onAdded }: AddSiteModalProps) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch(apiUrl('/api/sites'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ name, url }),
      });

      const text = await res.text();
      if (!res.ok) {
        let errorMsg = 'Failed to add site';
        try {
          const data = JSON.parse(text);
          errorMsg = data.error || errorMsg;
        } catch {}
        throw new Error(errorMsg);
      }

      onAdded();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Server is not responding. Make sure the backend is running on port 3001.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-navy-surface border border-border rounded-2xl p-6 w-full max-w-md">
        <h2 className="text-xl font-heading font-bold text-white mb-6">Add Site</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-text-muted text-sm mb-1.5">Site Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="My Website"
              required
              className="w-full px-4 py-2.5 bg-navy-light border border-border rounded-lg text-white placeholder:text-text-muted/50 focus:outline-none focus:border-accent transition-colors"
            />
          </div>
          <div>
            <label className="block text-text-muted text-sm mb-1.5">URL</label>
            <input
              type="url"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://example.com"
              required
              className="w-full px-4 py-2.5 bg-navy-light border border-border rounded-lg text-white placeholder:text-text-muted/50 focus:outline-none focus:border-accent transition-colors"
            />
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 text-sm border border-border text-text-muted rounded-lg hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2.5 text-sm bg-accent text-bg font-medium rounded-lg hover:bg-accent/80 transition-colors disabled:opacity-50"
            >
              {loading ? 'Adding...' : 'Add Site'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
