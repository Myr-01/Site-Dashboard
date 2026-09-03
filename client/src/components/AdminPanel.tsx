import { useState, useEffect } from 'react';
import { adminApi, AdminStats, CurrentUser } from '../useAuth';
import AdminUsers from './AdminUsers';
import AdminSites from './AdminSites';
import AdminSettings from './AdminSettings';
import PasscodeWidget from './PasscodeWidget';

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

  useEffect(() => {
    adminApi.stats().then(setStats).catch(() => {});
  }, []);

  const cards = [
    { label: 'İstifadəçilər', value: stats?.total_users, color: 'text-white' },
    { label: 'Saytlar', value: stats?.total_sites, color: 'text-white' },
    { label: 'Problemli saytlar', value: stats?.issue_sites, color: 'text-red-400' },
  ];

  return (
    <div>
      <h2 className="text-xl font-heading font-bold text-white mb-6">Dashboard</h2>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {cards.map(c => (
          <div key={c.label} className="bg-navy-surface border border-border rounded-2xl p-5">
            <p className="text-text-muted text-xs mb-1">{c.label}</p>
            <p className={`text-3xl font-heading font-bold ${c.color}`}>{c.value ?? '—'}</p>
          </div>
        ))}
      </div>

      <div className="bg-navy-surface border border-border rounded-2xl p-5">
        <p className="text-text-muted text-xs mb-3">Cari giriş kodu</p>
        <PasscodeWidget />
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
              className={`w-full flex items-center gap-3 px-5 py-2.5 text-sm transition-colors ${
                section === item.key
                  ? 'bg-navy-light text-accent border-l-2 border-accent'
                  : 'text-text-muted hover:text-white border-l-2 border-transparent'
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
