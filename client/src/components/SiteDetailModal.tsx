import { useState, useEffect, useRef } from 'react';
import { Site, Incident } from '../types';
import ResponseTimeChart from './ResponseTimeChart';
import UptimeCalendar from './UptimeCalendar';
import { authHeaders } from '../useAuth';
import { dialog } from './Dialog';
import { apiUrl } from '../api';
import { useEnterAnimation } from '../hooks/useEnterAnimation';

interface SiteDetailModalProps {
  site: Site;
  onClose: () => void;
  onDelete: (id: number) => void;
}

interface SiteBackup {
  name: string;
  size: number;
  sizeFormatted: string;
  createdAt: string;
}

interface SiteInfo {
  cms: string | null;
  cms_version: string | null;
  framework: string | null;
  language: string | null;
  php_version: string | null;
  node_version: string | null;
  db_type: string | null;
  db_name: string | null;
  db_host: string | null;
  db_prefix: string | null;
  theme: string | null;
  plugins: string[];
  packages: string[];
  total_files: number;
  total_size: number;
  config_files: string[];
  analyzed_at: string | null;
  extra_info: {
    site_url?: string;
    home_url?: string;
    site_title?: string;
    site_description?: string;
    admin_email?: string;
    language_locale?: string;
    media_files?: number;
    content_years?: string;
    format?: string;
    all_themes?: string[];
    timezone?: string;
    date_format?: string;
    time_format?: string;
    permalink_structure?: string;
    posts_per_page?: string;
    users_can_register?: boolean;
    default_role?: string;
    search_engine_visible?: boolean;
    comment_status?: string;
    mailserver_login?: string;
    theme_name?: string;
    theme_version?: string;
    theme_author?: string;
    theme_uri?: string;
    is_child_theme?: boolean;
    parent_theme?: string;
    themes_count?: number;
    plugin_details?: { slug: string; name: string; version: string | null }[];
    installed_plugins_count?: number;
    published_posts?: number;
    published_pages?: number;
    user_count?: number;
    usernames?: string[];
    woocommerce?: boolean;
    woo_currency?: string;
    woo_country?: string;
    required_php?: string;
    required_mysql?: string;
    has_htaccess?: boolean;
    htaccess_rewrite?: boolean;
    has_robots?: boolean;
    robots_blocking?: boolean;
  };
}

type TabKey = 'overview' | 'domain' | 'seo' | 'info' | 'backups' | 'incidents' | 'notes';

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

function daysColor(days: number | null): string {
  if (days == null) return 'text-text-muted';
  return days <= 30 ? 'text-red-400' : days <= 90 ? 'text-yellow-400' : 'text-white';
}

export default function SiteDetailModal({ site: initialSite, onClose, onDelete }: SiteDetailModalProps) {
  const [isClosing, setIsClosing] = useState(false);
  const enterVisible = useEnterAnimation();
  const isVisible = enterVisible && !isClosing;
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [backups, setBackups] = useState<SiteBackup[]>([]);
  const [uploading, setUploading] = useState(false);
  const [siteInfo, setSiteInfo] = useState<SiteInfo | null>(null);
  const [editingCredential, setEditingCredential] = useState<'domain' | 'hosting' | null>(null);
  const [editField, setEditField] = useState<{ field: string; label: string; value: string; type: 'text' | 'date' } | null>(null);
  const [site, setSite] = useState<Site>(initialSite);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [notesValue, setNotesValue] = useState(initialSite.notes || '');
  const [groupValue, setGroupValue] = useState(initialSite.group_name || '');
  const [notesSaving, setNotesSaving] = useState(false);
  const [report, setReport] = useState<any>(null);
  const [credentials, setCredentials] = useState<{
    domain_username: string | null;
    domain_password: string | null;
    hosting_username: string | null;
    hosting_password: string | null;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const check = site.latestCheck;
  const isOnline = check?.status === 'online';
  const seoScore = getSeoScore(check);
  const E = siteInfo?.extra_info;

  // Saxlandıqdan sonra site datasını yenilə (reload yox)
  const refreshSite = async () => {
    try {
      const res = await fetch(apiUrl('/api/sites'));
      const all: Site[] = await res.json();
      const updated = all.find(s => s.id === site.id);
      if (updated) setSite(updated);
    } catch {}
  };

  useEffect(() => {
    fetchBackups();
    fetchSiteInfo();
    fetchCredentials();
    fetchIncidents();
    fetchReport();
  }, []);

  const fetchSiteInfo = async () => {
    try {
      const res = await fetch(apiUrl(`/api/sites/${site.id}/info`));
      setSiteInfo(await res.json());
    } catch {}
  };

  // Həssas sahələri yalnız admin login olduqda əldə et
  const fetchCredentials = async () => {
    const pass = sessionStorage.getItem('adminPassword');
    if (!pass) { setCredentials(null); return; }
    try {
      const res = await fetch(apiUrl(`/api/sites/${site.id}/credentials`), {
        headers: { 'x-admin-password': pass },
      });
      if (res.ok) {
        setCredentials(await res.json());
      } else {
        setCredentials(null);
      }
    } catch { setCredentials(null); }
  };

  const fetchIncidents = async () => {
    try {
      const res = await fetch(apiUrl(`/api/sites/${site.id}/incidents`));
      setIncidents(await res.json());
    } catch {}
  };

  const fetchReport = async () => {
    try {
      const res = await fetch(apiUrl(`/api/sites/${site.id}/report`));
      setReport(await res.json());
    } catch {}
  };

  const saveNotes = async () => {
    setNotesSaving(true);
    try {
      let pass = sessionStorage.getItem('adminPassword');
      if (!pass) {
        const entered = await dialog.password();
        if (!entered) { setNotesSaving(false); return; }
        pass = entered as string;
        sessionStorage.setItem('adminPassword', pass);
      }
      await fetch(apiUrl(`/api/sites/${site.id}/meta`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-password': pass },
        body: JSON.stringify({ notes: notesValue, group_name: groupValue }),
      });
      await refreshSite();
      await dialog.alert('Qeydlər saxlanıldı', 'Uğurlu');
    } catch {
      await dialog.alert('Xəta baş verdi', 'Xəta');
    } finally {
      setNotesSaving(false);
    }
  };

  const fetchBackups = async () => {
    try {
      const res = await fetch(apiUrl(`/api/sites/${site.id}/backups`));
      setBackups(await res.json());
    } catch {}
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(apiUrl(`/api/sites/${site.id}/backups`), { method: 'POST', body: formData, headers: { ...authHeaders() } });
      if (!res.ok) throw new Error('Upload uğursuz oldu');
      fetchBackups();
      fetchSiteInfo();
    } catch {
      await dialog.alert('Backup yüklənmədi. Yenidən cəhd edin.', 'Xəta');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeleteBackup = async (name: string) => {
    const ok = await dialog.confirm(`"${name}" backup-ını silmək istəyirsiniz?`, 'Backup Silinsin?', true);
    if (!ok) return;
    await fetch(apiUrl(`/api/sites/${site.id}/backups/${encodeURIComponent(name)}`), { method: 'DELETE', headers: { ...authHeaders() } });
    fetchBackups();
  };

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => onClose(), 200);
  };

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, []);

  const domainExpiry = site.manual_domain_expiry || check?.domain_expiry;
  const domainDays = domainExpiry ? Math.ceil((new Date(domainExpiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;
  const hostingDays = site.manual_hosting_expiry ? Math.ceil((new Date(site.manual_hosting_expiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'overview', label: 'Ümumi' },
    { key: 'domain', label: 'Domain & SSL' },
    { key: 'seo', label: 'SEO' },
    { key: 'incidents', label: `Hadisələr${incidents.length > 0 ? ` (${incidents.length})` : ''}` },
    { key: 'notes', label: 'Qeydlər' },
    { key: 'info', label: 'Bilgilər' },
    { key: 'backups', label: 'Backup' },
  ];

  return (
    <div
      className={`fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-opacity duration-200 ${
        isVisible ? 'opacity-100' : 'opacity-0'
      }`}
      onClick={handleClose}
    >
      <div
        className={`bg-navy-surface border border-border rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col transition-[transform,opacity] duration-200 ${
          isVisible ? 'scale-100 opacity-100 translate-y-0' : 'scale-95 opacity-0 translate-y-2'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-navy-surface border-b border-border p-5 rounded-t-2xl">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3">
                <h2 className="font-heading font-bold text-white text-xl truncate">{site.name}</h2>
                <span
                  className={`px-2.5 py-0.5 text-xs font-bold rounded-full flex items-center gap-1.5 ${
                    isOnline ? 'bg-green-400/10 text-green-400' : 'bg-red-400/10 text-red-400'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`}></span>
                  {isOnline ? 'ONLINE' : 'OFFLINE'}
                </span>
              </div>
              <a
                href={site.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-text-muted text-sm hover:text-accent transition-colors"
                onClick={(e) => e.stopPropagation()}
              >
                {site.url} ↗
              </a>
            </div>
            <button onClick={handleClose} className="ml-3 text-text-muted hover:text-white transition-colors text-xl leading-none">
              ✕
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-4 -mb-px overflow-x-auto scrollbar-thin">
            {tabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-3 py-2 text-sm font-medium whitespace-nowrap rounded-t-lg transition-colors border-b-2 ${
                  activeTab === tab.key
                    ? 'border-accent text-accent'
                    : 'border-transparent text-text-muted hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Body (scrollable) */}
        <div className="p-5 overflow-y-auto scrollbar-thin flex-1">
          {!check ? (
            <p className="text-text-muted text-sm text-center py-8">İlk yoxlama gözlənilir...</p>
          ) : (
            <>
              {/* ===== OVERVIEW ===== */}
              {activeTab === 'overview' && (
                <div className="space-y-5">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-navy-light rounded-lg p-3">
                      <span className="text-text-muted text-xs">HTTP</span>
                      <p className="text-white font-bold text-lg">{check.http_code || '—'}</p>
                    </div>
                    <div className="bg-navy-light rounded-lg p-3">
                      <span className="text-text-muted text-xs">Response</span>
                      <p className="text-white font-bold text-lg">{check.response_time ? `${check.response_time}ms` : '—'}</p>
                    </div>
                    <div className="bg-navy-light rounded-lg p-3">
                      <span className="text-text-muted text-xs">Uptime (30d)</span>
                      <p className="text-white font-bold text-lg">{site.uptime !== null ? `${site.uptime}%` : '—'}</p>
                    </div>
                    <div className="bg-navy-light rounded-lg p-3">
                      <span className="text-text-muted text-xs">SEO Score</span>
                      <p className="text-accent font-bold text-lg">{seoScore}/5</p>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-accent text-xs font-heading font-semibold uppercase tracking-wider mb-3">Response Time (24h)</h4>
                    <div className="bg-navy-light rounded-lg p-4">
                      <ResponseTimeChart siteId={site.id} />
                    </div>
                  </div>

                  <div>
                    <UptimeCalendar siteId={site.id} days={30} />
                  </div>
                </div>
              )}

              {/* ===== DOMAIN & SSL ===== */}
              {activeTab === 'domain' && (
                <div className="space-y-4">
                  <div className="space-y-1">
                    <InfoRow label="Server IP" value={<span className="font-mono text-xs">{check.server_ip || 'Unknown'}</span>} />
                    <InfoRow label="Hosting Provider" value={<span className="text-accent font-medium">{check.hosting_provider || 'Unknown'}</span>} />
                    <EditableRow
                      label="Domain Registrar"
                      value={site.manual_domain_registrar || check.domain_registrar || null}
                      displayValue={
                        <span className="text-white">
                          {site.manual_domain_registrar || check.domain_registrar || <span className="text-text-muted">Unknown</span>}
                          {site.manual_domain_registrar && <span className="text-text-muted text-xs ml-1">(manual)</span>}
                        </span>
                      }
                      onEdit={() => setEditField({ field: 'registrar', label: 'Domain Registrar', value: site.manual_domain_registrar || '', type: 'text' })}
                    />
                    <EditableRow
                      label="Domain Expires"
                      value={domainExpiry}
                      displayValue={
                        <span className={`font-medium ${daysColor(domainDays)}`}>
                          {domainExpiry ? `${domainExpiry} (${domainDays} gün)` : <span className="text-text-muted">Unknown</span>}
                          {site.manual_domain_expiry && <span className="text-text-muted text-xs ml-1">(manual)</span>}
                        </span>
                      }
                      onEdit={() => setEditField({ field: 'domain_expiry', label: 'Domain Bitmə Tarixi', value: site.manual_domain_expiry || '', type: 'date' })}
                    />
                    <EditableRow
                      label="Hosting Expires"
                      value={site.manual_hosting_expiry}
                      displayValue={
                        site.manual_hosting_expiry
                          ? <span className={`font-medium ${daysColor(hostingDays)}`}>{site.manual_hosting_expiry} ({hostingDays} gün) <span className="text-text-muted text-xs">(manual)</span></span>
                          : <span className="text-text-muted">Unknown</span>
                      }
                      onEdit={() => setEditField({ field: 'hosting_expiry', label: 'Hosting Bitmə Tarixi', value: site.manual_hosting_expiry || '', type: 'date' })}
                    />
                    <InfoRow
                      label="SSL Certificate"
                      value={
                        <span className={`font-medium ${check.ssl_valid === 1 ? 'text-green-400' : check.ssl_valid === 0 ? 'text-red-400' : 'text-text-muted'}`}>
                          {check.ssl_valid === 1 ? `Valid (${check.ssl_days_remaining} gün qalıb)` : check.ssl_valid === 0 ? 'Invalid' : 'N/A'}
                        </span>
                      }
                    />
                    {check.ssl_expiry && (
                      <InfoRow
                        label="SSL Expires"
                        value={<span className={`font-medium ${daysColor(check.ssl_days_remaining)}`}>{new Date(check.ssl_expiry).toLocaleDateString('az-AZ')}</span>}
                      />
                    )}
                  </div>

                  {/* Domain Panel Girişi */}
                  <CredentialSection
                    title="Domain Panel Girişi"
                    loginUrl={site.domain_login_url}
                    username={credentials?.domain_username ?? null}
                    password={credentials?.domain_password ?? null}
                    onEdit={() => setEditingCredential('domain')}
                  />

                  {/* Hosting Panel Girişi */}
                  <CredentialSection
                    title="Hosting Panel Girişi"
                    loginUrl={site.hosting_login_url}
                    username={credentials?.hosting_username ?? null}
                    password={credentials?.hosting_password ?? null}
                    onEdit={() => setEditingCredential('hosting')}
                  />
                </div>
              )}

              {/* ===== SEO ===== */}
              {activeTab === 'seo' && (
                <div className="space-y-2.5 text-sm">
                  <div className="flex items-start gap-2">
                    <span className={`mt-0.5 ${check.seo_title === 'yes' ? 'text-green-400' : 'text-red-400'}`}>{check.seo_title === 'yes' ? '✓' : '✗'}</span>
                    <div className="flex-1"><span className="text-text-muted">Title: </span><span className="text-white">{check.seo_title_value || 'Missing'}</span></div>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className={`mt-0.5 ${check.seo_description === 'yes' ? 'text-green-400' : 'text-red-400'}`}>{check.seo_description === 'yes' ? '✓' : '✗'}</span>
                    <div className="flex-1"><span className="text-text-muted">Meta Description: </span><span className="text-white">{check.seo_description_value || 'Missing'}</span></div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={check.seo_h1 === 'yes' ? 'text-green-400' : 'text-red-400'}>{check.seo_h1 === 'yes' ? '✓' : '✗'}</span>
                    <span className="text-text-muted">H1 Tag: </span><span className="text-white">{check.seo_h1 === 'yes' ? 'Present' : 'Missing'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={check.seo_robots && !check.seo_robots.includes('noindex') ? 'text-green-400' : 'text-red-400'}>{check.seo_robots && !check.seo_robots.includes('noindex') ? '✓' : '✗'}</span>
                    <span className="text-text-muted">Robots: </span><span className="text-white">{check.seo_robots || 'Not set'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={check.seo_canonical === 'yes' ? 'text-green-400' : 'text-red-400'}>{check.seo_canonical === 'yes' ? '✓' : '✗'}</span>
                    <span className="text-text-muted">Canonical URL: </span><span className="text-white">{check.seo_canonical === 'yes' ? 'Present' : 'Missing'}</span>
                  </div>
                </div>
              )}

              {/* ===== SITE INFO (Backup Analysis) ===== */}
              {activeTab === 'info' && (
                <div className="space-y-4">
                  {!siteInfo ? (
                    <div className="text-center py-8">
                      <p className="text-text-muted text-sm mb-1">Hələ analiz məlumatı yoxdur</p>
                      <p className="text-text-muted text-xs">"Backup" tabından .zip / .wpress yükləyin — texnologiyalar avtomatik analiz olunacaq</p>
                    </div>
                  ) : (
                    <>
                      {/* Sayt kimliyi */}
                      {(E?.site_title || E?.site_url || E?.admin_email) && (
                        <Section title="Sayt Kimliyi">
                          {E?.site_title && <KV k="Başlıq" v={E.site_title} />}
                          {E?.site_description && <KV k="Təsvir" v={E.site_description} />}
                          {E?.site_url && <KV k="URL" v={E.site_url} accent />}
                          {E?.admin_email && <KV k="Admin Email" v={E.admin_email} />}
                          {E?.language_locale && <KV k="Dil" v={E.language_locale} />}
                        </Section>
                      )}

                      {/* Texnologiya kartları */}
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        {siteInfo.cms && <Card k="CMS" v={`${siteInfo.cms}${siteInfo.cms_version ? ` v${siteInfo.cms_version}` : ''}`} />}
                        {siteInfo.framework && <Card k="Framework" v={siteInfo.framework} />}
                        {siteInfo.language && <Card k="Dil" v={siteInfo.language} />}
                        {(siteInfo.php_version || siteInfo.node_version) && <Card k="Versiya" v={siteInfo.php_version ? `PHP ${siteInfo.php_version}` : `Node ${siteInfo.node_version}`} />}
                        {siteInfo.db_type && <Card k="Verilənlər Bazası" v={siteInfo.db_type} sub={siteInfo.db_prefix ? `prefix: ${siteInfo.db_prefix}` : undefined} />}
                        {siteInfo.theme && <Card k="Aktiv Tema" v={siteInfo.theme} />}
                        <Card k="Fayl Sayı" v={siteInfo.total_files?.toLocaleString() || '—'} />
                        <Card k="Ümumi Ölçü" v={siteInfo.total_size ? `${(siteInfo.total_size / 1024 / 1024).toFixed(1)} MB` : '—'} />
                        {E?.media_files ? <Card k="Media Faylları" v={E.media_files.toLocaleString()} /> : null}
                        {E?.content_years && <Card k="Kontent İlləri" v={E.content_years} />}
                      </div>

                      {/* Kontent statistikası */}
                      {(E?.published_posts != null || E?.published_pages != null || E?.user_count != null) && (
                        <div className="grid grid-cols-3 gap-2 text-sm">
                          {E?.published_posts != null && <Stat n={E.published_posts} label="Yazı" />}
                          {E?.published_pages != null && <Stat n={E.published_pages} label="Səhifə" />}
                          {E?.user_count != null && <Stat n={E.user_count} label="İstifadəçi" />}
                        </div>
                      )}

                      {/* WooCommerce */}
                      {E?.woocommerce && (
                        <div className="bg-accent/10 border border-accent/25 rounded-lg p-3">
                          <span className="text-accent text-sm font-semibold">🛒 WooCommerce</span>
                          <div className="flex gap-4 text-xs text-text-muted mt-1">
                            {E.woo_currency && <span>Valyuta: <span className="text-white">{E.woo_currency}</span></span>}
                            {E.woo_country && <span>Ölkə: <span className="text-white">{E.woo_country}</span></span>}
                          </div>
                        </div>
                      )}

                      {/* WordPress Ayarları */}
                      {siteInfo.cms === 'WordPress' && (E?.timezone || E?.permalink_structure || E?.search_engine_visible != null) && (
                        <Section title="WordPress Ayarları">
                          {E?.timezone && <KV k="Saat qurşağı" v={E.timezone} />}
                          {E?.permalink_structure && <KV k="Permalink" v={E.permalink_structure} />}
                          {E?.posts_per_page && <KV k="Səhifə başına yazı" v={E.posts_per_page} />}
                          {E?.search_engine_visible != null && (
                            <KV k="SEO görünürlüyü" v={E.search_engine_visible ? 'Açıq' : 'Bağlı'} color={E.search_engine_visible ? 'text-green-400' : 'text-red-400'} />
                          )}
                          {E?.users_can_register != null && <KV k="Qeydiyyat" v={E.users_can_register ? 'Açıq' : 'Bağlı'} />}
                          {E?.default_role && <KV k="Default rol" v={E.default_role} />}
                          {E?.mailserver_login && <KV k="Mail server" v={E.mailserver_login} />}
                        </Section>
                      )}

                      {/* Tema detalları */}
                      {E?.theme_name && (
                        <Section title="Tema Detalları">
                          <KV k="Ad" v={E.theme_name} />
                          {E.theme_version && <KV k="Versiya" v={E.theme_version} />}
                          {E.theme_author && <KV k="Müəllif" v={E.theme_author} />}
                          {E.is_child_theme && <KV k="Child tema" v={`Bəli (parent: ${E.parent_theme})`} color="text-accent" />}
                        </Section>
                      )}

                      {/* Pluginlər */}
                      {E?.plugin_details && E.plugin_details.length > 0 ? (
                        <div>
                          <p className="text-text-muted text-xs mb-2 uppercase tracking-wider">
                            Aktiv Pluginlər ({E.plugin_details.length}{E.installed_plugins_count ? ` / ${E.installed_plugins_count}` : ''})
                          </p>
                          <div className="space-y-1 max-h-40 overflow-y-auto scrollbar-thin">
                            {E.plugin_details.map((p, i) => (
                              <div key={i} className="flex items-center justify-between px-2 py-1 bg-navy-light rounded text-xs">
                                <span className="text-white truncate flex-1">{p.name}</span>
                                {p.version && <span className="text-accent ml-2 flex-shrink-0">v{p.version}</span>}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (siteInfo.plugins.length > 0 || siteInfo.packages.length > 0) && (
                        <div>
                          <p className="text-text-muted text-xs mb-2 uppercase tracking-wider">
                            {siteInfo.plugins.length > 0 ? (siteInfo.cms === 'WordPress' ? 'Pluginlər' : 'Pluginlər') : 'Paketlər'} ({(siteInfo.plugins.length > 0 ? siteInfo.plugins : siteInfo.packages).length})
                          </p>
                          <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto scrollbar-thin">
                            {(siteInfo.plugins.length > 0 ? siteInfo.plugins : siteInfo.packages).map((item, i) => (
                              <span key={i} className="px-2 py-0.5 text-xs bg-navy-light border border-border rounded text-text-muted">{item}</span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Server tələbləri */}
                      {(E?.required_php || E?.has_htaccess || E?.has_robots) && (
                        <div className="flex flex-wrap gap-1.5">
                          {E?.required_php && <Tag>Min PHP: {E.required_php}</Tag>}
                          {E?.required_mysql && <Tag>Min MySQL: {E.required_mysql}</Tag>}
                          {E?.has_htaccess && <Tag color="text-green-400">.htaccess ✓</Tag>}
                          {E?.has_robots && <Tag color={E.robots_blocking ? 'text-red-400' : 'text-green-400'}>robots.txt {E.robots_blocking ? '(bloklayır!)' : '✓'}</Tag>}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* ===== INCIDENTS ===== */}
              {activeTab === 'incidents' && (
                <div className="space-y-4">
                  {/* Report xülasəsi */}
                  {report && (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-navy-light rounded-lg p-3">
                        <span className="text-text-muted text-xs">Uptime (30 gün)</span>
                        <p className={`font-bold text-lg ${report.uptime_percent >= 99 ? 'text-green-400' : report.uptime_percent >= 95 ? 'text-yellow-400' : 'text-red-400'}`}>
                          {report.uptime_percent != null ? `${report.uptime_percent}%` : '—'}
                        </p>
                      </div>
                      <div className="bg-navy-light rounded-lg p-3">
                        <span className="text-text-muted text-xs">Hadisə sayı</span>
                        <p className={`font-bold text-lg ${report.incident_count === 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {report.incident_count}
                        </p>
                      </div>
                      <div className="bg-navy-light rounded-lg p-3">
                        <span className="text-text-muted text-xs">Ümumi downtime</span>
                        <p className="text-white font-bold text-lg">
                          {report.total_downtime_seconds > 0
                            ? report.total_downtime_seconds < 60
                              ? `${report.total_downtime_seconds}s`
                              : report.total_downtime_seconds < 3600
                              ? `${Math.round(report.total_downtime_seconds / 60)}d`
                              : `${(report.total_downtime_seconds / 3600).toFixed(1)}s`
                            : '0s'}
                        </p>
                      </div>
                      <div className="bg-navy-light rounded-lg p-3">
                        <span className="text-text-muted text-xs">Orta cavab</span>
                        <p className="text-white font-bold text-lg">
                          {report.avg_response_time ? `${report.avg_response_time}ms` : '—'}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Incident siyahısı */}
                  <div>
                    <h4 className="text-accent text-xs font-heading font-semibold uppercase tracking-wider mb-3">
                      Son Hadisələr
                    </h4>
                    {incidents.length === 0 ? (
                      <div className="text-center py-8">
                        <p className="text-green-400 text-sm font-medium">✓ Heç bir hadisə qeydə alınmayıb</p>
                        <p className="text-text-muted text-xs mt-1">Sayt bu zamana qədər offline olmayıb</p>
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-64 overflow-y-auto scrollbar-thin">
                        {incidents.map(inc => {
                          const start = new Date(inc.started_at + 'Z');
                          const durSec = inc.duration_seconds;
                          const dur = durSec == null
                            ? '(hələ davam edir)'
                            : durSec < 60 ? `${durSec}s`
                            : durSec < 3600 ? `${Math.round(durSec / 60)} dəq`
                            : `${(durSec / 3600).toFixed(1)} saat`;
                          return (
                            <div key={inc.id} className={`p-3 rounded-lg border ${inc.resolved_at ? 'bg-navy-light border-border' : 'bg-red-400/10 border-red-400/30'}`}>
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className={`w-2 h-2 rounded-full ${inc.resolved_at ? 'bg-green-400' : 'bg-red-400 animate-pulse'}`}></span>
                                    <span className="text-white text-xs font-medium">
                                      {start.toLocaleString('az-AZ')}
                                    </span>
                                  </div>
                                  <p className="text-text-muted text-xs mt-1 ml-4">
                                    HTTP {inc.http_code || 'N/A'} · {inc.resolved_at ? `Müddət: ${dur}` : '🔴 Aktiv'}
                                  </p>
                                </div>
                                {inc.resolved_at && (
                                  <span className="text-green-400 text-xs flex-shrink-0">Həll edildi</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ===== NOTES ===== */}
              {activeTab === 'notes' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-text-muted text-xs mb-2 uppercase tracking-wider">Qrup / Kateqoriya</label>
                    <input
                      type="text"
                      value={groupValue}
                      onChange={e => setGroupValue(e.target.value)}
                      placeholder="Məs: Müştəri saytları, Şəxsi, E-ticarət..."
                      className="w-full px-3 py-2.5 bg-navy-light border border-border rounded-lg text-white text-sm placeholder:text-text-muted/40 focus:outline-none focus:border-accent transition-colors"
                    />
                    <p className="text-text-muted text-xs mt-1">Dashboard-da bu qrupa görə filtrə edə bilərsən</p>
                  </div>
                  <div>
                    <label className="block text-text-muted text-xs mb-2 uppercase tracking-wider">Qeydlər</label>
                    <textarea
                      value={notesValue}
                      onChange={e => setNotesValue(e.target.value)}
                      rows={8}
                      placeholder="Müştəri əlaqəsi, FTP məlumatları, xüsusi qeydlər..."
                      className="w-full px-3 py-2.5 bg-navy-light border border-border rounded-lg text-white text-sm placeholder:text-text-muted/40 focus:outline-none focus:border-accent transition-colors resize-none scrollbar-thin"
                    />
                  </div>
                  <button
                    onClick={saveNotes}
                    disabled={notesSaving}
                    className="w-full py-2.5 text-sm font-semibold rounded-xl transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ background: 'linear-gradient(135deg, #fca311, #e8940a)', color: '#000' }}
                  >
                    {notesSaving ? 'Saxlanılır...' : 'Saxla'}
                  </button>
                  {site.notes && (
                    <div className="bg-navy-light rounded-lg p-3 border border-accent/20">
                      <p className="text-text-muted text-xs mb-1">Son saxlanılan qeyd:</p>
                      <p className="text-white text-sm whitespace-pre-wrap">{site.notes}</p>
                    </div>
                  )}
                </div>
              )}

              {/* ===== BACKUPS ===== */}
              {activeTab === 'backups' && (
                <div>
                  <div className="mb-4">
                    <input ref={fileInputRef} type="file" onChange={handleUpload} className="hidden" accept=".zip,.rar,.tar,.gz,.7z,.tar.gz,.wpress" />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      className="w-full px-4 py-3 text-sm border border-dashed border-accent/40 text-accent rounded-lg hover:bg-accent/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {uploading ? 'Yüklənir və analiz olunur...' : '📁 Backup Faylı Yüklə (.zip, .wpress, .rar)'}
                    </button>
                    <p className="text-text-muted text-xs mt-2 text-center">Yükləndikdən sonra "Bilgilər" tabında analiz görünəcək</p>
                  </div>

                  {backups.length === 0 ? (
                    <p className="text-text-muted text-xs text-center py-6">Bu sayt üçün hələ backup yoxdur</p>
                  ) : (
                    <div className="space-y-2 max-h-80 overflow-y-auto scrollbar-thin">
                      {backups.map(backup => (
                        <div key={backup.name} className="flex items-center justify-between p-2.5 bg-navy-light rounded-lg">
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-xs font-medium truncate">{backup.name}</p>
                            <p className="text-text-muted text-xs">{new Date(backup.createdAt).toLocaleString('az-AZ')} • {backup.sizeFormatted}</p>
                          </div>
                          <div className="flex gap-1 ml-2">
                            <a href={`/api/sites/${site.id}/backups/${encodeURIComponent(backup.name)}/download`} className="px-2.5 py-1.5 text-xs text-accent border border-accent/30 rounded hover:bg-accent/10 transition-colors" title="Endir">↓</a>
                            <button onClick={() => handleDeleteBackup(backup.name)} className="px-2.5 py-1.5 text-xs text-red-400 border border-red-400/30 rounded hover:bg-red-400/10 transition-colors" title="Sil">✕</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-border">
          <button
            onClick={async () => {
              const ok = await dialog.confirm('Bu saytı monitoring siyahısından silmək istəyirsiniz?', 'Saytı Sil', true);
              if (ok) { onDelete(site.id); handleClose(); }
            }}
            className="px-3 py-2 text-xs text-red-400 border border-red-400/30 rounded-lg hover:bg-red-400/10 transition-colors"
          >
            Saytı Sil
          </button>
          <button onClick={handleClose} className="px-4 py-2 text-sm border border-border text-text-muted rounded-lg hover:text-white transition-colors">
            Bağla
          </button>
        </div>
      </div>

      {/* Field Edit Modal (registrar, domain expiry, hosting expiry) */}
      {editField && (
        <EditFieldModal
          label={editField.label}
          value={editField.value}
          type={editField.type}
          onSave={async (newValue) => {
            // Şifrə yoxla
            let pass = sessionStorage.getItem('adminPassword');
            if (!pass) {
              const entered = await dialog.password();
              if (!entered) return;
              pass = entered as string;
              sessionStorage.setItem('adminPassword', pass);
            }
            // Yoxla
            const authRes = await fetch(apiUrl('/api/auth/verify'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ password: pass }),
            });
            if (!authRes.ok) {
              sessionStorage.removeItem('adminPassword');
              await dialog.alert('Şifrə yanlışdır', 'Xəta');
              return;
            }

            const body: Record<string, string | null> = {
              manual_domain_registrar: site.manual_domain_registrar,
              manual_domain_expiry: site.manual_domain_expiry,
              manual_hosting_expiry: site.manual_hosting_expiry,
            };
            if (editField.field === 'registrar') body.manual_domain_registrar = newValue || null;
            if (editField.field === 'domain_expiry') body.manual_domain_expiry = newValue || null;
            if (editField.field === 'hosting_expiry') body.manual_hosting_expiry = newValue || null;

            await fetch(apiUrl(`/api/sites/${site.id}/manual-dates`), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-admin-password': pass },
              body: JSON.stringify(body),
            });
            setEditField(null);
            await refreshSite();
          }}
          onClose={() => setEditField(null)}
        />
      )}

      {/* Credential Edit Modal */}
      {editingCredential && (
        <CredentialEditModal
          siteId={site.id}
          type={editingCredential}
          initial={{
            loginUrl: editingCredential === 'domain' ? site.domain_login_url : site.hosting_login_url,
            username: editingCredential === 'domain' ? (credentials?.domain_username ?? '') : (credentials?.hosting_username ?? ''),
            password: editingCredential === 'domain' ? (credentials?.domain_password ?? '') : (credentials?.hosting_password ?? ''),
          }}
          onSave={async () => { setEditingCredential(null); await refreshSite(); await fetchCredentials(); }}
          onClose={() => setEditingCredential(null)}
        />
      )}
    </div>
  );
}

/* ===== Kiçik köməkçi komponentlər ===== */

/* Sadə info sətri (redaktə olmaz) */
function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 py-2.5 border-b border-border/40 last:border-0 text-sm">
      <span className="text-text-muted">{label}</span>
      {value}
    </div>
  );
}

/* Redaktə edilə bilən sətir (hover-da qələm ikonu) */
function EditableRow({
  label, displayValue, onEdit,
}: {
  label: string;
  value: string | null | undefined;
  displayValue: React.ReactNode;
  onEdit: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-2.5 border-b border-border/40 last:border-0 text-sm group">
      <span className="text-text-muted">{label}</span>
      <div className="flex items-center gap-2">
        {displayValue}
        <button
          onClick={onEdit}
          className="opacity-0 group-hover:opacity-100 transition-opacity text-text-muted hover:text-accent"
          title="Redaktə et"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
        </button>
      </div>
    </div>
  );
}

/* Köhnə Row — digər tab-larda istifadə olunur */
function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-text-muted">{label}</span>
      {value}
    </div>
  );
}

/* Edit Field Pop-up (sayt paleti ilə) */
function EditFieldModal({
  label, value, type, onSave, onClose,
}: {
  label: string;
  value: string;
  type: 'text' | 'date';
  onSave: (v: string) => Promise<void>;
  onClose: () => void;
}) {
  const [val, setVal] = useState(value);
  const [loading, setLoading] = useState(false);
  const [isClosing2, setIsClosing2] = useState(false);
  const enterVis2 = useEnterAnimation();
  const visible = enterVis2 && !isClosing2;

  const close = () => { setIsClosing2(true); setTimeout(onClose, 200); };
  const save = async () => { setLoading(true); await onSave(val); setLoading(false); };

  return (
    <div
      className={`fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[70] transition-opacity duration-200 ${visible ? 'opacity-100' : 'opacity-0'}`}
      onClick={close}
    >
      <div
        className={`w-full max-w-sm mx-4 rounded-2xl border border-accent/20 shadow-2xl shadow-accent/10 transition-[transform,opacity] duration-200 overflow-hidden ${visible ? 'scale-100 translate-y-0' : 'scale-95 translate-y-2'}`}
        style={{ background: 'linear-gradient(135deg, #14213d 0%, #1d2d4f 100%)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-accent/15 flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </div>
            <span className="text-white font-heading font-semibold text-sm">{label}</span>
          </div>
          <button onClick={close} className="text-text-muted hover:text-white transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {/* Body */}
        <div className="p-5">
          <input
            type={type}
            value={val}
            onChange={e => setVal(e.target.value)}
            autoFocus
            onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') close(); }}
            className="w-full px-4 py-3 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-accent/50 transition-[border-color,box-shadow]"
            style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(252,163,17,0.25)' }}
            placeholder={type === 'date' ? 'YYYY-MM-DD' : `${label} daxil edin`}
          />
          {type === 'date' && <p className="text-text-muted text-xs mt-2 ml-1">Nümunə: 2026-12-31</p>}
        </div>
        {/* Footer */}
        <div className="flex gap-2.5 px-5 pb-5">
          <button
            onClick={close}
            className="flex-1 py-2.5 text-sm text-text-muted rounded-xl transition-colors hover:text-white"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            Ləğv et
          </button>
          <button
            onClick={save}
            disabled={loading}
            className="flex-1 py-2.5 text-sm font-semibold rounded-xl transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: 'linear-gradient(135deg, #fca311, #e8940a)', color: '#000' }}
          >
            {loading ? '...' : 'Saxla'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Card({ k, v, sub }: { k: string; v: string; sub?: string }) {
  return (
    <div className="bg-navy-light rounded-lg p-2.5">
      <span className="text-text-muted text-xs">{k}</span>
      <p className="text-white font-medium truncate">{v}</p>
      {sub && <p className="text-text-muted text-xs">{sub}</p>}
    </div>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div className="bg-navy-light rounded-lg p-2.5 text-center">
      <p className="text-white font-bold text-lg">{n}</p>
      <span className="text-text-muted text-xs">{label}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-text-muted text-xs mb-2 uppercase tracking-wider">{title}</p>
      <div className="bg-navy-light rounded-lg p-3 space-y-1.5">{children}</div>
    </div>
  );
}

function KV({ k, v, accent, color }: { k: string; v: string; accent?: boolean; color?: string }) {
  return (
    <div className="flex justify-between items-center gap-3">
      <span className="text-text-muted text-xs flex-shrink-0">{k}</span>
      <span className={`text-xs truncate text-right ${color || (accent ? 'text-accent' : 'text-white')}`}>{v}</span>
    </div>
  );
}

function Tag({ children, color }: { children: React.ReactNode; color?: string }) {
  return <span className={`px-2 py-0.5 text-xs bg-navy-light border border-border rounded ${color || 'text-text-muted'}`}>{children}</span>;
}

/* ===== Credential Section (göstərmək üçün) ===== */
function CredentialSection({
  title, loginUrl, username, password, onEdit,
}: {
  title: string;
  loginUrl: string | null;
  username: string | null;
  password: string | null;
  onEdit: () => void;
}) {
  const [showPass, setShowPass] = useState(false);
  const hasData = loginUrl || username || password;

  return (
    <div className="bg-navy-light rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h5 className="text-white text-sm font-semibold">{title}</h5>
        <button
          onClick={onEdit}
          className="text-xs text-accent hover:underline transition-colors"
        >
          {hasData ? 'Redaktə et' : '+ Əlavə et'}
        </button>
      </div>

      {hasData ? (
        <div className="space-y-2 text-xs">
          {loginUrl && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-text-muted">Panel URL</span>
              <a
                href={loginUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline truncate max-w-[200px] flex items-center gap-1"
                onClick={(e) => e.stopPropagation()}
              >
                {loginUrl} ↗
              </a>
            </div>
          )}
          {username && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-text-muted">İstifadəçi adı</span>
              <span className="text-white font-mono">{username}</span>
            </div>
          )}
          {password && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-text-muted">Şifrə</span>
              <div className="flex items-center gap-2">
                <span className="text-white font-mono">
                  {showPass ? password : '••••••••'}
                </span>
                <button
                  onClick={() => setShowPass(p => !p)}
                  className="text-text-muted hover:text-white transition-colors"
                >
                  {showPass ? (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className="text-text-muted text-xs">Giriş məlumatı əlavə edilməyib</p>
      )}
    </div>
  );
}

/* ===== Credential Edit Modal ===== */
function CredentialEditModal({
  siteId, type, initial, onSave, onClose,
}: {
  siteId: number;
  type: 'domain' | 'hosting';
  initial: { loginUrl: string | null; username: string | null; password: string | null };
  onSave: () => void;
  onClose: () => void;
}) {
  const [loginUrl, setLoginUrl] = useState(initial.loginUrl || '');
  const [username, setUsername] = useState(initial.username || '');
  const [password, setPassword] = useState(initial.password || '');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isClosing3, setIsClosing3] = useState(false);
  const enterVis3 = useEnterAnimation();
  const isVisible = enterVis3 && !isClosing3;

  const handleClose = () => { setIsClosing3(true); setTimeout(onClose, 200); };

  const handleSave = async () => {
    // sessionStorage-da şifrə yoxdursa dialog ilə soruş
    let pass = sessionStorage.getItem('adminPassword');
    if (!pass) {
      const entered = await dialog.password();
      if (!entered) return;
      pass = entered as string;
      sessionStorage.setItem('adminPassword', pass);
    }

    setLoading(true);
    try {
      const body = type === 'domain'
        ? {
            domain_login_url: loginUrl || null,
            domain_username: username || null,
            domain_password: password || null,
          }
        : {
            hosting_login_url: loginUrl || null,
            hosting_username: username || null,
            hosting_password: password || null,
          };

      const res = await fetch(apiUrl(`/api/sites/${siteId}/credentials`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-password': pass },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        if (res.status === 401) {
          sessionStorage.removeItem('adminPassword');
          await dialog.alert('Şifrə yanlışdır', 'Xəta');
        } else {
          await dialog.alert(`Xəta: ${err.error}`, 'Xəta');
        }
        return;
      }
      onSave();
    } catch {
      await dialog.alert('Bağlantı xətası', 'Xəta');
    } finally {
      setLoading(false);
    }
  };

  const title = type === 'domain' ? 'Domain Panel Girişi' : 'Hosting Panel Girişi';

  return (
    <div
      className={`fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[70] transition-opacity duration-200 ${isVisible ? 'opacity-100' : 'opacity-0'}`}
      onClick={handleClose}
    >
      <div
        className={`bg-navy-surface border border-border rounded-2xl p-6 w-full max-w-sm shadow-2xl transition-[transform,opacity] duration-200 ${isVisible ? 'scale-100 translate-y-0' : 'scale-95 translate-y-2'}`}
        onClick={e => e.stopPropagation()}
      >
        <h3 className="text-white font-heading font-bold text-lg mb-5">{title}</h3>

        <div className="space-y-3">
          <div>
            <label className="block text-text-muted text-xs mb-1.5">Panel URL (giriş linki)</label>
            <input
              type="url"
              value={loginUrl}
              onChange={e => setLoginUrl(e.target.value)}
              placeholder="https://panel.example.com"
              className="w-full px-3 py-2.5 bg-navy-light border border-border rounded-lg text-white text-sm placeholder:text-text-muted/40 focus:outline-none focus:border-accent transition-colors"
            />
          </div>
          <div>
            <label className="block text-text-muted text-xs mb-1.5">İstifadəçi adı / Email</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="user@example.com"
              className="w-full px-3 py-2.5 bg-navy-light border border-border rounded-lg text-white text-sm placeholder:text-text-muted/40 focus:outline-none focus:border-accent transition-colors"
            />
          </div>
          <div>
            <label className="block text-text-muted text-xs mb-1.5">Şifrə</label>
            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3 py-2.5 pr-10 bg-navy-light border border-border rounded-lg text-white text-sm placeholder:text-text-muted/40 focus:outline-none focus:border-accent transition-colors font-mono"
              />
              <button
                type="button"
                onClick={() => setShowPass(p => !p)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-white transition-colors"
              >
                {showPass ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={handleClose} className="flex-1 px-4 py-2.5 text-sm border border-border text-text-muted rounded-lg hover:text-white transition-colors">
            Ləğv et
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            className="flex-1 px-4 py-2.5 text-sm bg-accent text-bg font-medium rounded-lg hover:bg-accent/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Saxlanılır...' : 'Saxla'}
          </button>
        </div>
      </div>
    </div>
  );
}
