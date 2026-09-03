import { useState, useEffect, useMemo } from 'react';
import { adminApi, AdminSite } from '../useAuth';

export default function AdminSites() {
  const [sites, setSites] = useState<AdminSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  useEffect(() => {
    adminApi.sites().then(setSites).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sites;
    return sites.filter(s =>
      s.name.toLowerCase().includes(q) ||
      s.url.toLowerCase().includes(q) ||
      (s.owner_email || '').toLowerCase().includes(q)
    );
  }, [sites, query]);

  if (loading) return <p className="text-text-muted">Yüklənir...</p>;

  return (
    <div>
      <p className="text-text-muted text-sm mb-4">{sites.length} sayt · bütün istifadəçilər</p>

      <input
        type="text"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Sayt adı, URL və ya sahib email ilə axtar..."
        className="w-full max-w-md mb-4 px-3 py-2 bg-navy-light border border-border rounded-lg text-white text-sm placeholder:text-text-muted/50 focus:outline-none focus:border-accent transition-colors"
      />

      <div className="bg-navy-surface border border-border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-text-muted">
                <th className="px-4 py-3 font-medium">Ad</th>
                <th className="px-4 py-3 font-medium">URL</th>
                <th className="px-4 py-3 font-medium">Sahib</th>
                <th className="px-4 py-3 font-medium">Qrup</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => {
                const status = s.maintenance_mode ? 'baxımda' : (s.status || 'N/A');
                const statusColor = status === 'online' ? 'text-green-400'
                  : status === 'offline' ? 'text-red-400'
                  : status === 'baxımda' ? 'text-blue-400' : 'text-text-muted';
                return (
                  <tr key={s.id} className="border-b border-border/50 last:border-0">
                    <td className="px-4 py-3 text-white">{s.name}</td>
                    <td className="px-4 py-3 text-text-muted truncate max-w-[220px]">{s.url}</td>
                    <td className="px-4 py-3 text-text-muted">{s.owner_email || '—'}</td>
                    <td className="px-4 py-3 text-text-muted">{s.group_name || '—'}</td>
                    <td className={`px-4 py-3 font-medium ${statusColor}`}>{status}</td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-text-muted">Nəticə tapılmadı</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
