import { useState, useEffect } from 'react';
import { adminApi, AdminStats, ActivityEvent, CurrentUser } from '../useAuth';
import AdminUsers from './AdminUsers';
import AdminSites from './AdminSites';
import AdminSettings from './AdminSettings';
import PasscodeWidget from './PasscodeWidget';

// Nisbi vaxt formatı (məs. "5 dəq əvvəl")
function relativeTime(iso: string): string {
  if (!iso) return '';
  const then = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z').getTime();
  const diff = Date.now() - then;
  if (isNaN(diff)) return '';
  const s = Math.floor(diff / 1000);
  if (s < 60) return 'indicə';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} dəq əvvəl`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} saat əvvəl`;
  const d = Math.floor(h / 24);
  return `${d} gün əvvəl`;
}

// Hadisə tipinə görə ikon + rəng
function activityIcon(type: string): { color: string; path: string } {
  switch (type) {
    case 'login':
      return { color: 'text-green-400', path: 'M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1' };
    case 'register':
      return { color: 'text-blue-400', path: 'M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z' };
    case 'site_created':
      return { color: 'text-accent', path: 'M12 6v6m0 0v6m0-6h6m-6 0H6' };
    case 'site_deleted':
      return { color: 'text-red-400', path: 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16' };
    case 'code_regenerated':
      return { color: 'text-accent', path: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15' };
    case 'user_disabled':
    case 'user_deleted':
      return { color: 'text-red-400', path: 'M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636' };
    default:
      return { color: 'text-text-muted', path: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z' };
  }
}

type Section = 'dashboard' | 'users' | 'sites' | 'settings';

interface AdminPanelProps {
  user: CurrentUser;
  onExit: () => void;
  onLogout: () => void;
}

const NAV: { key: Section; label: string; icon: JSX.Element }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: (<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />) },
  { key: 'users', label: 'İstifadəçilər', icon: (<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 10-4-4 4 4 0 004 4z" />) },
  { key: 'sites', label: 'Saytlar', icon: (<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />) },
  { key: 'settings', label: 'Parametrlər', icon: (<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" />) },
];

function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [activityLoaded, setActivityLoaded] = useState(false);

  useEffect(() => {
    adminApi.stats().then(setStats).catch(() => {});
    adminApi.activity().then(setActivity).catch(() => {}).finally(() => setActivityLoaded(true));
  }, []);

  // Hər kart: ikon (svg path), üst border rəngi, dəyər
  const cards = [
    {
      label: 'İstifadəçilər',
      value: stats?.total_users,
      topBorder: 'border-t-accent',
      iconColor: 'text-accent',
      iconPath: 'M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 10-4-4 4 4 0 004 4zm6 0a4 4 0 10-3-6.87',
    },
    {
      label: 'Saytlar',
      value: stats?.total_sites,
      topBorder: 'border-t-blue-400',
      iconColor: 'text-blue-400',
      iconPath: 'M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9',
    },
    {
      label: 'Problemli saytlar',
      value: stats?.issue_sites,
      // 0 problem = yaşıl (yaxşı), problem varsa qırmızı
      topBorder: (stats?.issue_sites ?? 0) > 0 ? 'border-t-red-400' : 'border-t-green-400',
      iconColor: (stats?.issue_sites ?? 0) > 0 ? 'text-red-400' : 'text-green-400',
      iconPath: 'M12 9v2m0 4h.01M5.07 19H19a2 2 0 001.75-2.96l-6.93-12a2 2 0 00-3.5 0l-6.93 12A2 2 0 005.07 19z',
    },
  ];

  return (
    <div>
      <h2 className="text-xl font-heading font-bold text-white mb-6">Dashboard</h2>

      {/* Stat kartları — ikon + rəngli üst border */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {cards.map(c => (
          <div key={c.label} className={`bg-navy-surface border border-border border-t-2 ${c.topBorder} rounded-2xl p-5`}>
            <div className="flex items-center gap-2 mb-2">
              <svg className={`w-4 h-4 ${c.iconColor}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={c.iconPath} />
              </svg>
              <p className="text-text-muted text-xs">{c.label}</p>
            </div>
            <p className="text-3xl font-heading font-bold text-white">{c.value ?? '—'}</p>
          </div>
        ))}
      </div>

      {/* 2 sütunlu sətir: solda (geniş) activity feed, sağda (dar) giriş kodu */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Son Əməliyyatlar */}
        <div className="lg:col-span-2 bg-navy-surface border border-border rounded-2xl p-5">
          <h3 className="text-white font-medium text-sm mb-4">Son Əməliyyatlar</h3>
          {!activityLoaded ? (
            <p className="text-text-muted text-sm">Yüklənir...</p>
          ) : activity.length === 0 ? (
            <p className="text-text-muted text-sm py-4 text-center">Hələ əməliyyat yoxdur</p>
          ) : (
            <ul className="space-y-3">
              {activity.map(ev => {
                const ic = activityIcon(ev.type);
                return (
                  <li key={ev.id} className="flex items-start gap-3">
                    <svg className={`w-4 h-4 mt-0.5 shrink-0 ${ic.color}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={ic.path} />
                    </svg>
                    <div className="min-w-0 flex-1">
                      <p className="text-white text-sm truncate">{ev.message}</p>
                      <p className="text-text-muted text-xs">{relativeTime(ev.created_at)}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Cari giriş kodu */}
        <div className="bg-navy-surface border border-border rounded-2xl p-5 h-fit">
          <h3 className="text-white font-medium text-sm mb-4">Cari giriş kodu</h3>
          <PasscodeWidget />
          <p className="text-text-muted/70 text-xs mt-3">
            Bu kodu qonaq olmayan istifadəçilərlə paylaşın. Hər 12 saatda yenilənir.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function AdminPanel({ user, onExit, onLogout }: AdminPanelProps) {
  const [section, setSection] = useState<Section>('dashboard');

  return (
    <div className="min-h-screen bg-bg flex">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 bg-navy-surface border-r border-border flex flex-col">
        <div className="px-5 py-5 border-b border-border">
          <h1 className="text-lg font-heading font-bold text-white">
            <span className="text-accent">●</span> Admin
          </h1>
        </div>
        <nav className="flex-1 py-3">
          {NAV.map(item => (
            <button
              key={item.key}
              onClick={() => setSection(item.key)}
              className={`w-full flex items-center gap-3 px-5 py-2.5 text-sm transition-colors border-l-[3px] ${
                section === item.key
                  ? 'bg-navy-light text-accent border-accent font-medium'
                  : 'text-text-muted hover:text-white border-transparent'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">{item.icon}</svg>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="px-5 py-4 border-t border-border">
          <button
            onClick={onExit}
            className="w-full text-left text-text-muted hover:text-white text-xs transition-colors"
          >
            ← Dashboard-a qayıt
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="flex items-center justify-between px-6 py-3.5 border-b border-border bg-navy-surface">
          <span className="text-text-muted text-sm">Admin Panel</span>
          <div className="flex items-center gap-3">
            <span className="text-text-muted text-xs max-w-[180px] truncate" title={user.email || undefined}>
              {user.email || 'admin'}
            </span>
            <button
              onClick={onLogout}
              className="text-text-muted hover:text-red-400 transition-colors text-xs border-l border-border pl-3"
            >
              Çıxış
            </button>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 p-6 overflow-y-auto">
          {section === 'dashboard' && <AdminDashboard />}
          {section === 'users' && <AdminUsers />}
          {section === 'sites' && <AdminSites />}
          {section === 'settings' && <AdminSettings />}
        </main>
      </div>
    </div>
  );
}
