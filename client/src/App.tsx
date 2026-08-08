import { useState, useEffect, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { Site } from './types';
import StatsBar from './components/StatsBar';
import SiteCard from './components/SiteCard';
import SiteDetailModal from './components/SiteDetailModal';
import AddSiteModal from './components/AddSiteModal';
import SettingsModal from './components/SettingsModal';
import ImportModal from './components/ImportModal';
import FloatingToolbar from './components/FloatingToolbar';
import WorldMap from './components/WorldMap';
import AuthModal from './components/AuthModal';
import { useAuth } from './useAuth';
import { apiUrl } from './api';

function App() {
  const [sites, setSites] = useState<Site[]>([]);
  const [filteredSites, setFilteredSites] = useState<Site[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [selectedSite, setSelectedSite] = useState<Site | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [socket, setSocket] = useState<Socket | null>(null);
  const { withAuth, showAuthModal, onAuthSuccess, onAuthClose } = useAuth();

  useEffect(() => {
    // Backend URL: VITE_API_URL env var varsa onu istifadə et, yoxsa current origin
    const serverUrl = import.meta.env.VITE_API_URL || import.meta.env.VITE_SERVER_URL || window.location.origin;
    const s = io(serverUrl, { 
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
    });
    setSocket(s);

    s.on('sites-updated', (data: Site[]) => {
      setSites(data);
    });

    s.on('connect_error', (err) => {
      console.error('Socket connection error:', err);
    });

    return () => {
      s.disconnect();
    };
  }, []);

  useEffect(() => {
    if (searchQuery.trim() === '' && !activeGroup) {
      setFilteredSites(sites);
    } else {
      const query = searchQuery.toLowerCase();
      setFilteredSites(
        sites.filter(site => {
          const matchesSearch = !query || site.name.toLowerCase().includes(query) || site.url.toLowerCase().includes(query);
          const matchesGroup = !activeGroup || site.group_name === activeGroup;
          return matchesSearch && matchesGroup;
        })
      );
    }
  }, [searchQuery, sites, activeGroup]);

  const fetchSites = useCallback(async () => {
    try {
      const res = await fetch(apiUrl('/api/sites'));
      const data = await res.json();
      setSites(data);
    } catch (err) {
      console.error('Failed to fetch sites:', err);
    }
  }, []);

  useEffect(() => {
    fetchSites();
  }, [fetchSites]);

  const handleDelete = async (id: number) => {
    try {
      const pass = sessionStorage.getItem('adminPassword');
      const res = await fetch(apiUrl(`/api/sites/${id}`), {
        method: 'DELETE',
        headers: pass ? { 'x-admin-password': pass } : {},
      });
      if (res.ok) {
        setSites(prev => prev.filter(s => s.id !== id));
      } else {
        console.error('Failed to delete site: server returned', res.status);
      }
    } catch (err) {
      console.error('Failed to delete site:', err);
    }
  };

  return (
    <div className="min-h-screen bg-bg p-4 md:p-8">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-heading font-bold text-white">
            <span className="text-accent">●</span> Site Monitor
          </h1>
          <p className="text-text-muted text-sm mt-1">Real-time website monitoring dashboard</p>
        </div>
        {/* Search */}
        <div
          className="relative"
          onMouseEnter={() => setShowSearch(true)}
          onMouseLeave={() => {
            if (searchQuery === '') setShowSearch(false);
          }}
        >
          <button className="p-2 text-text-muted hover:text-accent transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </button>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Axtar..."
            className={`absolute right-0 top-0 h-full bg-navy-surface border border-border rounded-lg text-white text-sm placeholder:text-text-muted/50 focus:outline-none focus:border-accent transition-all duration-300 ${
              showSearch ? 'w-64 px-10 opacity-100' : 'w-10 px-0 opacity-0 pointer-events-none'
            }`}
          />
        </div>
      </header>

      {/* Stats Bar */}
      <StatsBar sites={sites} />

      {/* Group Filter */}
      {(() => {
        const groups = [...new Set(sites.map(s => s.group_name).filter(Boolean))] as string[];
        if (groups.length === 0) return null;
        return (
          <div className="flex items-center gap-2 mb-6 flex-wrap">
            <button
              onClick={() => setActiveGroup(null)}
              className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${
                activeGroup === null
                  ? 'bg-accent text-bg'
                  : 'bg-navy-surface border border-border text-text-muted hover:text-white'
              }`}
            >
              Hamısı ({sites.length})
            </button>
            {groups.map(g => (
              <button
                key={g}
                onClick={() => setActiveGroup(activeGroup === g ? null : g)}
                className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${
                  activeGroup === g
                    ? 'bg-accent text-bg'
                    : 'bg-navy-surface border border-border text-text-muted hover:text-white'
                }`}
              >
                {g} ({sites.filter(s => s.group_name === g).length})
              </button>
            ))}
          </div>
        );
      })()}

      {/* World Map (collapsible) */}
      {showMap && (
        <div className="mb-6">
          <WorldMap />
        </div>
      )}

      {/* Sites Grid */}
      {filteredSites.length === 0 && sites.length > 0 ? (
        <div className="text-center py-20">
          <p className="text-text-muted text-lg">"{searchQuery}" üzrə nəticə tapılmadı</p>
        </div>
      ) : filteredSites.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-text-muted text-lg">Hələ heç bir sayt monitoring olunmur.</p>
          <button
            onClick={() => setShowAddModal(true)}
            className="mt-4 px-6 py-3 bg-accent text-bg rounded-lg font-heading font-medium hover:bg-accent/80 transition-colors"
          >
            İlk Saytınızı Əlavə Edin
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
          {filteredSites.map(site => (
            <SiteCard key={site.id} site={site} onDelete={handleDelete} onSelect={setSelectedSite} />
          ))}
        </div>
      )}

      {/* Site Detail Pop-up */}
      {selectedSite && (
        <SiteDetailModal
          site={selectedSite}
          onClose={() => setSelectedSite(null)}
          onDelete={handleDelete}
        />
      )}

      {/* Modals */}
      {showAddModal && (
        <AddSiteModal onClose={() => setShowAddModal(false)} onAdded={fetchSites} />
      )}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showImport && (
        <ImportModal onClose={() => setShowImport(false)} onImported={fetchSites} />
      )}

      {/* Floating Toolbar */}
      <FloatingToolbar
        onAddSite={() => withAuth(() => setShowAddModal(true))}
        onImport={() => withAuth(() => setShowImport(true))}
        onSettings={() => withAuth(() => setShowSettings(true))}
        onShowMap={() => setShowMap(!showMap)}
        totalSites={sites.length}
        onlineCount={sites.filter(s => s.latestCheck?.status === 'online').length}
        offlineCount={sites.filter(s => s.latestCheck?.status === 'offline').length}
      />

      {/* Auth Modal */}
      {showAuthModal && (
        <AuthModal onSuccess={onAuthSuccess} onClose={onAuthClose} />
      )}
    </div>
  );
}

export default App;
