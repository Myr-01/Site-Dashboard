import { useState, useEffect } from 'react';
import { NotificationLogEntry } from '../types';
import { apiUrl } from '../api';

interface NotificationHistoryProps {
  siteId?: number;
}

export default function NotificationHistory({ siteId }: NotificationHistoryProps) {
  const [logs, setLogs] = useState<NotificationLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    const url = siteId
      ? apiUrl(`/api/notifications?site_id=${siteId}`)
      : apiUrl('/api/notifications');

    fetch(url)
      .then(res => {
        if (!res.ok) throw new Error(`Server xətası: ${res.status}`);
        return res.json();
      })
      .then(data => {
        if (!cancelled) setLogs(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setError('Bildiriş tarixçəsi yüklənə bilmədi');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [siteId]);

  if (loading) return <p className="text-text-muted text-sm">Yüklənir...</p>;
  if (error) return <p className="text-red-400 text-sm">{error}</p>;
  if (logs.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-text-muted text-sm">Hələ bildiriş göndərilməyib.</p>
        <p className="text-text-muted/70 text-xs mt-1">
          Sayt offline olanda və ya domain/SSL bitməyə yaxınlaşanda göndərilən bildirişlər burada görünəcək.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {logs.map(log => (
        <div key={log.id} className="bg-navy-light rounded-lg p-3 border border-border">
          <div className="flex justify-between items-center gap-2 text-xs text-text-muted mb-1">
            <span className="truncate">
              {log.site_name || 'Ümumi'}
              {' · '}
              <span className="text-accent">{log.channel}</span>
            </span>
            <span className="flex-shrink-0">
              {new Date(log.sent_at + 'Z').toLocaleString('az-AZ')}
            </span>
          </div>
          <p className="text-white text-sm whitespace-pre-wrap break-words">{log.message}</p>
        </div>
      ))}
    </div>
  );
}
