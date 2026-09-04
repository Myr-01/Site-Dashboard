import { useState, useEffect } from 'react';
import { authHeaders } from '../useAuth';
import { apiUrl, sensitiveHeaders, clearSensitiveCode } from '../api';
import { COLOR_TAGS } from '../colorTags';
import PasscodeModal from './PasscodeModal';

interface AddSiteModalProps {
  onClose: () => void;
  onAdded: () => void;
}

export default function AddSiteModal({ onClose, onAdded }: AddSiteModalProps) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [colorTag, setColorTag] = useState('');
  const [alertDays, setAlertDays] = useState('3,1');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPasscode, setShowPasscode] = useState(false);

  // Block body scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  const submitSite = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(apiUrl('/api/sites'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(), ...sensitiveHeaders() },
        body: JSON.stringify({ name, url, color_tag: colorTag, alert_days: alertDays }),
      });

      const text = await res.text();
      if (res.status === 403) {
        // Rotating passcode tələb olunur (non-admin) və ya yanlışdır
        clearSensitiveCode();
        setShowPasscode(true);
        setLoading(false);
        return;
      }
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
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Server is not responding. Make sure the backend is running on port 3001.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitSite();
  };

  if (showPasscode) {
    return (
      <PasscodeModal
        title="Sayt əlavə etmək üçün adminin verdiyi giriş kodu tələb olunur"
        onClose={() => setShowPasscode(false)}
        onSuccess={() => { setShowPasscode(false); submitSite(); }}
      />
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[1000] p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="add-site-title" className="bg-navy-surface border border-border rounded-2xl p-6 w-full max-w-md">
        <h2 id="add-site-title" className="text-xl font-heading font-bold text-white mb-6">Sayt Əlavə Et</h2>
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
          <div>
            <label className="block text-text-muted text-sm mb-1.5">Rəng etiketi</label>
            <div className="flex items-center gap-2">
              {COLOR_TAGS.map(tag => {
                const isSelected = colorTag === tag.value;
                return (
                  <button
                    key={tag.value || 'none'}
                    type="button"
                    onClick={() => setColorTag(tag.value)}
                    title={tag.label}
                    aria-label={tag.label}
                    aria-pressed={isSelected}
                    className={`w-7 h-7 rounded-full border-2 transition-colors flex items-center justify-center ${
                      isSelected ? 'border-accent' : 'border-border hover:border-text-muted'
                    }`}
                    style={tag.value ? { backgroundColor: tag.value } : undefined}
                  >
                    {!tag.value && <span className="text-text-muted text-xs leading-none">✕</span>}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label className="block text-text-muted text-sm mb-1.5">Xəbərdarlıq günləri</label>
            <input
              type="text"
              value={alertDays}
              onChange={e => setAlertDays(e.target.value)}
              placeholder="30,7,1"
              className="w-full px-4 py-2.5 bg-navy-light border border-border rounded-lg text-white placeholder:text-text-muted/50 focus:outline-none focus:border-accent transition-colors"
            />
            <p className="text-text-muted text-xs mt-1">
              Domain / hosting bitməsinə bu qədər gün qaldıqda bildiriş göndərilir. Vergüllə ayır.
            </p>
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
              className="flex-1 px-4 py-2.5 text-sm bg-accent text-bg font-medium rounded-lg hover:bg-accent/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Adding...' : 'Add Site'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
