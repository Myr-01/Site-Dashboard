import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { io, Socket } from 'socket.io-client';
import { Site } from './types';
import StatsBar from './components/StatsBar';
import SiteCard from './components/SiteCard';
import AddSiteModal from './components/AddSiteModal';
import FloatingToolbar from './components/FloatingToolbar';
import WorldMap from './components/WorldMap';
import AuthModal from './components/AuthModal';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useAuth, authHeaders, getAdminToken } from './useAuth';
import { apiUrl } from './api';
import { dialog } from './components/Dialog';

const SiteDetailModal = lazy(() => import('./components/SiteDetailModal'));
const SettingsModal = lazy(() => import('./components/SettingsModal'));
const ImportModal = lazy(() => import('./components/ImportModal'));

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
  const [isConnected, setIsConnected] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
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

    s.on('connect', () => setIsConnected(true));
    s.on('disconnect', () => setIsConnected(false));

    s.on('connect_error', (err) => {
      setIsConnected(false);
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
      if (!res.ok) throw new Error(`Server xətası: ${res.status}`);
      const data = await res.json();
      setSites(data);
      setFetchError(null);
    } catch (err) {
      console.error('Failed to fetch sites:', err);
      setFetchError('Saytlar yüklənə bilmədi. Server ilə əlaqə yoxlayın.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSites();
  }, [fetchSites]);

  // `selectedSite` klik anında snapshot kimi saxlanılır — `sites` yeniləndikdə
  // (socket və ya fetch) onu da təzələ, əks halda modal köhnə dəyərləri göstərir
  useEffect(() => {
    setSelectedSite(prev => {
      if (!prev) return prev;
      const fresh = sites.find(s => s.id === prev.id);
      return fresh ?? prev;
    });
  }, [sites]);

  const handleDelete = async (id: number): Promise<boolean> => {
    try {
      const res = await fetch(apiUrl(`/api/sites/${id}`), {
        method: 'DELETE',
        headers: { ...authHeaders() },
      });
      if (res.ok) {
        setSites(prev => prev.filter(s => s.id !== id));
        return true;
      }
      console.error('Failed to delete site: server returned', res.status);
      return false;
    } catch (err) {
      console.error('Failed to delete site:', err);
      return false;
    }
  };

  const toggleSelect = useCallback((id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  const handleBulkDelete = async () => {
    const count = selectedIds.size;
    const confirmed = await dialog.confirm(
      `${count} saytı silmək istəyirsiniz? Bu əməliyyat geri qaytarıla bilməz.`,
      'Təsdiq',
      true
    );
    if (!confirmed) return;

    // Ardıcıl sil — server-ə eyni anda çoxlu sorğu getməsin
    let failed = 0;
    for (const id of selectedIds) {
      const ok = await handleDelete(id);
      if (!ok) failed++;
    }
    exitSelectionMode();

    if (failed > 0) {
      await dialog.alert(`${count - failed} sayt silindi, ${failed} sayt silinə bilmədi.`, 'Qismən uğurlu');
    }
  };

  // CSV export — window.open header göndərə bilmir, token query parametrindədir
  const handleCsvExport = () => {
    const token = getAdminToken();
    if (!token) return;
    window.open(apiUrl('/api/export/csv') + `?token=${encodeURIComponent(token)}`, '_blank');
  };

  // Klaviatura qısayolları
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Yazı yazarkən qısayollar işə düşməsin
      const active = document.activeElement;
      const tag = active?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (active as HTMLElement | null)?.isContentEditable) {
        return;
      }
      // Modifikator basılıbsa brauzerin öz qısayollarına mane olmayaq
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key === '/') {
        e.preventDefault();
        setShowSearch(true);
        // Input açılma animasiyası başlayandan sonra fokusla
        requestAnimationFrame(() => searchInputRef.current?.focus());
      } else if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        withAuth(() => setShowAddModal(true));
      } else if (e.key === 'Escape' && selectionMode) {
        exitSelectionMode();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [withAuth, selectionMode, exitSelectionMode]);

  return (
    <ErrorBoundary>
    <div className="min-h-screen bg-bg p-4 md:p-8">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-heading font-bold text-white">
            <span className="text-accent">●</span> Site Monitor
          </h1>
          <p className="text-text-muted text-sm mt-1">Real-time website monitoring dashboard</p>
          <p className="text-text-muted/70 text-xs mt-1">
            Qısayollar: <kbd className="px-1 py-0.5 bg-navy-surface border border-border rounded text-[10px]">/</kbd> axtar
            {' · '}
            <kbd className="px-1 py-0.5 bg-navy-surface border border-border rounded text-[10px]">n</kbd> yeni sayt
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* CSV Export */}
          <button
            onClick={() => withAuth(handleCsvExport)}
            className="px-3 py-1.5 text-xs rounded-lg font-medium border border-border bg-navy-surface text-text-muted hover:text-white transition-colors"
          >
            CSV Export
          </button>

          {/* Seçim rejimi */}
          <button
            onClick={() => (selectionMode ? exitSelectionMode() : setSelectionMode(true))}
            aria-pressed={selectionMode}
            className={`px-3 py-1.5 text-xs rounded-lg font-medium border transition-colors ${
              selectionMode
                ? 'bg-accent text-bg border-accent'
                : 'bg-navy-surface border-border text-text-muted hover:text-white'
            }`}
          >
            {selectionMode ? 'Seçimi bitir' : 'Seç'}
          </button>

        {/* Search */}
        <div
          className="relative"
          onMouseEnter={() => setShowSearch(true)}
          onMouseLeave={() => {
            if (searchQuery === '') setShowSearch(false);
          }}
        >
          <button className="p-2 text-text-muted hover:text-accent transition-colors" aria-label="Axtar">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </button>
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Axtar..."
            className={`absolute right-0 top-0 h-full bg-navy-surface border border-border rounded-lg text-white text-sm placeholder:text-text-muted/50 focus:outline-none focus:border-accent transition-all duration-300 ${
              showSearch ? 'w-64 px-10 opacity-100' : 'w-10 px-0 opacity-0 pointer-events-none'
            }`}
          />
        </div>
        </div>
      </header>

      {/* WebSocket bağlantı statusu */}
      {!isConnected && (
        <div
          role="status"
          aria-live="polite"
          className="bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 px-4 py-2 rounded-lg mb-4 text-sm text-center"
        >
          Server ilə bağlantı kəsildi. Yenidən qoşulmağa çalışılır...
        </div>
      )}

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

      {/* Error Banner */}
      {fetchError && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg mb-4 text-sm">
          {fetchError}
        </div>
      )}

      {/* World Map (collapsible) */}
      {showMap && (
        <div className="mb-6">
          <WorldMap />
        </div>
      )}

      {/* Sites Grid */}
      {isLoading ? (
        <div className="text-center py-20">
          <p className="text-text-muted text-lg">Yüklənir...</p>
        </div>
      ) : filteredSites.length === 0 && sites.length > 0 ? (
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
            <SiteCard
              key={site.id}
              site={site}
              onDelete={handleDelete}
              onSelect={setSelectedSite}
              selectionMode={selectionMode}
              isSelected={selectedIds.has(site.id)}
              onToggleSelect={toggleSelect}
            />
          ))}
        </div>
      )}

      {/* Site Detail Pop-up */}
      {selectedSite && (
        <Suspense fallback={null}>
          <ErrorBoundary>
            <SiteDetailModal
              site={selectedSite}
              onClose={() => setSelectedSite(null)}
              onDelete={handleDelete}
            />
          </ErrorBoundary>
        </Suspense>
      )}

      {/* Modals */}
      {showAddModal && (
        <AddSiteModal onClose={() => setShowAddModal(false)} onAdded={fetchSites} />
      )}
      {showSettings && (
        <Suspense fallback={null}>
          <ErrorBoundary>
            <SettingsModal onClose={() => setShowSettings(false)} />
          </ErrorBoundary>
        </Suspense>
      )}
      {showImport && (
        <Suspense fallback={null}>
          <ErrorBoundary>
            <ImportModal onClose={() => setShowImport(false)} onImported={fetchSites} />
          </ErrorBoundary>
        </Suspense>
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

      {/* Toplu əməliyyat paneli */}
      {selectionMode && selectedIds.size > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 bg-navy-surface border border-border rounded-lg px-4 py-3 flex gap-4 items-center shadow-lg">
          <span className="text-sm text-text-muted">{selectedIds.size} sayt seçildi</span>
          <button
            onClick={() => setSelectedIds(new Set(filteredSites.map(s => s.id)))}
            className="text-sm text-text-muted hover:text-white transition-colors"
          >
            Hamısını seç
          </button>
          <button
            onClick={() => withAuth(handleBulkDelete)}
            className="text-sm text-red-400 hover:text-red-300 transition-colors"
          >
            Sil
          </button>
          <button
            onClick={exitSelectionMode}
            className="text-sm text-text-muted hover:text-white transition-colors"
            aria-label="Seçimi ləğv et"
          >
            ✕
          </button>
        </div>
      )}

      {/* Auth Modal */}
      {showAuthModal && (
        <AuthModal onSuccess={onAuthSuccess} onClose={onAuthClose} />
      )}
    </div>
    </ErrorBoundary>
  );
}

export default App;
