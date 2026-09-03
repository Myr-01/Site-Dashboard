import { Site } from '../types';
import { colorTagLabel } from '../colorTags';

interface SiteCardProps {
  site: Site;
  onDelete: (id: number) => void;
  onSelect: (site: Site) => void;
  selectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (id: number) => void;
  isGuest?: boolean;
}

function getSeoScore(check: Site['latestCheck']): number {
  if (!check) return 0;
  let score = 0;
  if (check.seo_title === 'yes') score++;
  if (check.seo_description === 'yes') score++;
  if (check.seo_h1 === 'yes') score++;
  if (check.seo_robots && !check.seo_robots.includes('noindex')) score++;
  if (check.seo_canonical === 'yes') score++;
  return score;
}

function formatTime(dateStr: string | null | undefined): string {
  if (!dateStr) return 'Never';
  const date = new Date(dateStr + 'Z');
  return date.toLocaleString();
}

export default function SiteCard({
  site,
  onDelete,
  onSelect,
  selectionMode = false,
  isSelected = false,
  onToggleSelect,
  isGuest = false,
}: SiteCardProps) {
  const check = site.latestCheck;
  const isOnline = check?.status === 'online';
  const isMaintenance = !!site.maintenance_mode;
  const seoScore = getSeoScore(check);

  // Seçim rejimində karta klikləmək detal modalını açmaq yerinə seçimi dəyişir.
  // Qonaq üçün detal modalı açılmır (yalnız kart üzərindəki xülasə görünür).
  const handleCardClick = () => {
    if (selectionMode) {
      onToggleSelect?.(site.id);
    } else if (!isGuest) {
      onSelect(site);
    }
  };

  return (
    <div
      className={`relative bg-navy-surface border rounded-2xl p-5 transition-[border-color,box-shadow,transform] duration-200 group ${
        isGuest ? 'cursor-default' : 'cursor-pointer hover:shadow-lg hover:shadow-accent/5 hover:-translate-y-0.5'
      } ${
        isSelected ? 'border-accent' : 'border-border hover:border-accent/50'
      }`}
      onClick={handleCardClick}
    >
      {/* Rəng etiketi */}
      {site.color_tag && (
        <div
          className="w-2.5 h-2.5 rounded-full absolute top-3 left-3"
          style={{ backgroundColor: site.color_tag }}
          title={`Etiket: ${colorTagLabel(site.color_tag)}`}
        />
      )}

      {/* Seçim checkbox-u */}
      {selectionMode && (
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggleSelect?.(site.id)}
          onClick={e => e.stopPropagation()}
          aria-label={`${site.name} saytını seç`}
          className="absolute top-3 right-3 w-4 h-4 accent-accent cursor-pointer z-10"
        />
      )}

      {/* Header */}
      <div className={`flex items-start justify-between mb-3 ${selectionMode ? 'pr-6' : ''}`}>
        <div className="flex-1 min-w-0">
          <h3 className={`font-heading font-semibold text-white truncate group-hover:text-accent transition-colors ${site.color_tag ? 'pl-4' : ''}`}>
            {site.name}
          </h3>
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-text-muted text-xs truncate">{site.url}</p>
            {site.group_name && (
              <span className="flex-shrink-0 px-1.5 py-0.5 text-xs bg-accent/10 text-accent rounded border border-accent/20">
                {site.group_name}
              </span>
            )}
          </div>
        </div>
        {isMaintenance ? (
          <span className="ml-2 px-2 py-0.5 text-xs font-bold rounded-full whitespace-nowrap flex items-center gap-1.5 bg-blue-500/10 text-blue-400 border border-blue-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
            BAXIMDA
          </span>
        ) : (
          <span
            className={`ml-2 px-2 py-0.5 text-xs font-bold rounded-full whitespace-nowrap flex items-center gap-1.5 ${
              isOnline
                ? 'bg-green-400/10 text-green-400'
                : 'bg-red-400/10 text-red-400'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-green-400' : 'bg-red-400'} ${isOnline ? 'animate-pulse' : ''}`}></span>
            {isOnline ? 'ONLINE' : 'OFFLINE'}
          </span>
        )}
      </div>

      {/* Metrics */}
      {check ? (
        <div className="mt-4 pt-4 border-t border-border/60 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          {!isGuest && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-text-muted text-xs">HTTP</span>
              <span className="text-white font-medium">{check.http_code || '—'}</span>
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            <span className="text-text-muted text-xs">Response</span>
            <span className="text-white font-medium">{check.response_time ? `${check.response_time}ms` : '—'}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-text-muted text-xs">SSL</span>
            <span className={`font-medium text-xs ${check.ssl_valid === 1 ? 'text-green-400' : check.ssl_valid === 0 ? 'text-red-400' : 'text-text-muted'}`}>
              {check.ssl_valid === 1
                ? `Valid (${check.ssl_days_remaining}d)`
                : check.ssl_valid === 0
                ? 'Invalid'
                : 'N/A'}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-text-muted text-xs">Uptime</span>
            <span className="text-white font-medium">{site.uptime !== null ? `${site.uptime}%` : '—'}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-text-muted text-xs">Domain</span>
            <span className={`font-medium text-xs ${
              (() => {
                const expiry = site.manual_domain_expiry || check.domain_expiry;
                if (!expiry) return 'text-text-muted';
                const days = Math.ceil((new Date(expiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                return days <= 30 ? 'text-red-400' : days <= 90 ? 'text-yellow-400' : 'text-green-400';
              })()
            }`}>
              {(() => {
                const expiry = site.manual_domain_expiry || check.domain_expiry;
                if (!expiry) return '—';
                const days = Math.ceil((new Date(expiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                return `${days} gün`;
              })()}
            </span>
          </div>
          {!isGuest && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-text-muted text-xs">Hosting</span>
              <span className="text-accent font-medium text-xs truncate max-w-[90px]" title={check.hosting_provider || ''}>{check.hosting_provider || '—'}</span>
            </div>
          )}
          {!isGuest && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-text-muted text-xs">SEO</span>
              <span className="text-accent font-medium">{seoScore}/5</span>
            </div>
          )}
          {/* Last Check — tam en, ayrıca sətir */}
          <div className="col-span-2 flex items-center justify-between gap-2 pt-2 mt-1 border-t border-border/40">
            <span className="text-text-muted text-xs">Son yoxlama</span>
            <span className="text-text-muted font-medium text-xs">{formatTime(check.checked_at)}</span>
          </div>
        </div>
      ) : (
        <div className="mt-4 pt-4 border-t border-border/60 flex items-center gap-2 text-text-muted text-sm">
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          İlk yoxlama gözlənilir...
        </div>
      )}
    </div>
  );
}
