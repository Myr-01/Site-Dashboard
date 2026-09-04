import { useState } from 'react';
import { useTheme } from '../ThemeContext';

interface FloatingToolbarProps {
  onAddSite: () => void;
  onImport: () => void;
  onSettings: () => void;
  onShowMap: () => void;
  totalSites: number;
  onlineCount: number;
  offlineCount: number;
  isGuest?: boolean;
}

export default function FloatingToolbar({
  onAddSite,
  onImport,
  onSettings,
  onShowMap,
  totalSites,
  onlineCount,
  offlineCount,
  isGuest = false,
}: FloatingToolbarProps) {
  // hover (masaüstü) VƏ ya klik/toxunuş (mobil) ilə açılır
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const isVisible = hovered || pinned;
  const { theme, toggleTheme } = useTheme();

  return (
    <div
      className="fixed bottom-0 left-1/2 -translate-x-1/2 z-40 pb-4 md:pb-6 flex flex-col items-center gap-2"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Toolbar */}
      <div
        className={`bg-navy-surface border border-border rounded-2xl p-1.5 md:p-2 flex flex-wrap items-center justify-center gap-0.5 md:gap-1 shadow-2xl transition-[transform,opacity] duration-200 max-w-[95vw] ${
          isVisible ? 'translate-y-0 opacity-100 pointer-events-auto' : 'translate-y-4 opacity-0 pointer-events-none'
        }`}
        role="toolbar"
        aria-label="Alətlər paneli"
        aria-hidden={!isVisible}
      >
        {/* Dashboard */}
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="relative group p-2.5 md:p-3 rounded-xl hover:bg-navy-light transition-colors flex-shrink-0"
          title="Dashboard"
          aria-label="Dashboard-a qayıt"
        >
          <svg className="w-5 h-5 md:w-6 md:h-6 text-accent" fill="currentColor" viewBox="0 0 24 24">
            <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
          </svg>
          <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-navy-light px-2 py-1 rounded text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap hidden md:block">
            Dashboard
          </span>
        </button>

        {/* Separator */}
        <div className="w-px h-6 bg-border"></div>

        {/* Stats display */}
        <div className="flex items-center gap-2 md:gap-3 px-2 md:px-3">
          <div className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-white"></div>
            <span className="text-white text-xs md:text-sm font-medium">{totalSites}</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-green-400"></div>
            <span className="text-green-400 text-xs md:text-sm font-medium">{onlineCount}</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-red-400"></div>
            <span className="text-red-400 text-xs md:text-sm font-medium">{offlineCount}</span>
          </div>
        </div>

        {/* Separator */}
        <div className="w-px h-6 bg-border"></div>

        {/* World Map */}
        <button
          onClick={onShowMap}
          className="relative group p-2.5 md:p-3 rounded-xl hover:bg-navy-light transition-colors flex-shrink-0"
          title="Xəritə"
          aria-label="Xəritəni göstər/gizlət"
        >
          <svg className="w-5 h-5 md:w-6 md:h-6 text-text-muted group-hover:text-accent transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-navy-light px-2 py-1 rounded text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap hidden md:block">
            Xəritə
          </span>
        </button>

        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          className="relative group p-2.5 md:p-3 rounded-xl hover:bg-navy-light transition-colors flex-shrink-0"
          title={theme === 'dark' ? 'Açıq Tema' : 'Qaranlıq Tema'}
          aria-label={theme === 'dark' ? 'Açıq temaya keç' : 'Qaranlıq temaya keç'}
        >
          {theme === 'dark' ? (
            <svg className="w-5 h-5 md:w-6 md:h-6 text-text-muted group-hover:text-accent transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          ) : (
            <svg className="w-5 h-5 md:w-6 md:h-6 text-text-muted group-hover:text-accent transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
          )}
          <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-navy-light px-2 py-1 rounded text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap hidden md:block">
            {theme === 'dark' ? 'Açıq' : 'Qaranlıq'}
          </span>
        </button>

        {/* Yazma əməliyyatları — qonaq üçün gizli */}
        {!isGuest && (
          <>
            {/* Add Site */}
            <button
              onClick={onAddSite}
              className="relative group p-2.5 md:p-3 rounded-xl hover:bg-navy-light transition-colors flex-shrink-0"
              title="Sayt Əlavə Et"
              aria-label="Sayt əlavə et"
            >
              <svg className="w-5 h-5 md:w-6 md:h-6 text-text-muted group-hover:text-accent transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-navy-light px-2 py-1 rounded text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap hidden md:block">
                Sayt Əlavə Et
              </span>
            </button>

            {/* Import CSV */}
            <button
              onClick={onImport}
              className="relative group p-2.5 md:p-3 rounded-xl hover:bg-navy-light transition-colors flex-shrink-0"
              title="CSV İdxal"
              aria-label="CSV faylından idxal et"
            >
              <svg className="w-5 h-5 md:w-6 md:h-6 text-text-muted group-hover:text-accent transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-navy-light px-2 py-1 rounded text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap hidden md:block">
                CSV İdxal
              </span>
            </button>

            {/* Settings */}
            <button
              onClick={onSettings}
              className="relative group p-2.5 md:p-3 rounded-xl hover:bg-navy-light transition-colors flex-shrink-0"
              title="Parametrlər"
              aria-label="Parametrləri aç"
            >
              <svg className="w-5 h-5 md:w-6 md:h-6 text-text-muted group-hover:text-accent transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-navy-light px-2 py-1 rounded text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap hidden md:block">
                Parametrlər
              </span>
            </button>
          </>
        )}
      </div>

      {/* Daimi trigger düymə — toxunuş/klik ilə açır (mobil üçün kritik, hover-a əlavə).
          ≥44px touch target. Masaüstündə hover onsuz da açır; bu düymə mobildə görünür. */}
      <button
        onClick={() => setPinned(p => !p)}
        aria-label={isVisible ? 'Alətlər panelini bağla' : 'Alətlər panelini aç'}
        aria-expanded={isVisible}
        className="w-12 h-12 rounded-full bg-accent text-bg flex items-center justify-center shadow-2xl hover:bg-accent/80 transition-[background,transform] active:scale-95"
      >
        <svg className={`w-6 h-6 transition-transform duration-200 ${isVisible ? 'rotate-45' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
        </svg>
      </button>
    </div>
  );
}
