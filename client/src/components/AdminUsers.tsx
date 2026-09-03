import { useState, useEffect, useCallback } from 'react';
import { adminApi, AdminUser } from '../useAuth';
import { dialog } from './Dialog';

function formatDate(s: string): string {
  if (!s) return '—';
  const d = new Date(s.includes('T') ? s : s.replace(' ', 'T') + 'Z');
  return isNaN(d.getTime()) ? s : d.toLocaleDateString();
}

export default function AdminUsers() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      setUsers(await adminApi.users());
    } catch {
      /* susdur */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleDisabled = async (u: AdminUser) => {
    setBusyId(u.id);
    try {
      await adminApi.setUserDisabled(u.id, !u.disabled);
      await load();
    } catch (err) {
      await dialog.alert(err instanceof Error ? err.message : 'Xəta', 'Xəta');
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (u: AdminUser) => {
    const ok = await dialog.confirm(
      `${u.email || 'İstifadəçi'} hesabını və onun bütün saytlarını silmək istəyirsiniz? Bu əməliyyat geri qaytarıla bilməz.`,
      'Hesabı sil',
      true
    );
    if (!ok) return;
    setBusyId(u.id);
    try {
      await adminApi.deleteUser(u.id);
      await load();
    } catch (err) {
      await dialog.alert(err instanceof Error ? err.message : 'Xəta', 'Xəta');
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <p className="text-text-muted">Yüklənir...</p>;

  return (
    <div>
      <h2 className="text-xl font-heading font-bold text-white mb-1">İstifadəçilər</h2>
      <p className="text-text-muted text-sm mb-6">{users.length} hesab</p>

      <div className="bg-navy-surface border border-border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-text-muted">
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Rol</th>
                <th className="px-4 py-3 font-medium">Saytlar</th>
                <th className="px-4 py-3 font-medium">Qeydiyyat</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Əməliyyat</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => {
                const isAdmin = u.role === 'admin';
                return (
                  <tr key={u.id} className="border-b border-border/50 last:border-0">
                    <td className="px-4 py-3 text-white">{u.email || u.username || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs ${isAdmin ? 'bg-accent/10 text-accent border border-accent/20' : 'bg-navy-light text-text-muted'}`}>
                        {isAdmin ? 'admin' : 'user'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-text-muted">{u.site_count}</td>
                    <td className="px-4 py-3 text-text-muted">{formatDate(u.created_at)}</td>
                    <td className="px-4 py-3">
                      {u.disabled ? (
                        <span className="text-red-400 text-xs">Deaktiv</span>
                      ) : (
                        <span className="text-green-400 text-xs">Aktiv</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {isAdmin ? (
                        <span className="text-text-muted/50 text-xs">—</span>
                      ) : (
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => toggleDisabled(u)}
                            disabled={busyId === u.id}
                            className="px-2.5 py-1 text-xs rounded border border-border text-text-muted hover:text-white transition-colors disabled:opacity-50"
                          >
                            {u.disabled ? 'Aktivləşdir' : 'Deaktiv et'}
                          </button>
                          <button
                            onClick={() => remove(u)}
                            disabled={busyId === u.id}
                            className="px-2.5 py-1 text-xs rounded border border-red-400/30 text-red-400 hover:bg-red-400/10 transition-colors disabled:opacity-50"
                          >
                            Sil
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
