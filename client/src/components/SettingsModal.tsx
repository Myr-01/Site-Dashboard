import { useState, useEffect, useRef } from 'react';
import { SmtpSettings, WebhookSettings } from '../types';
import { authHeaders, getAdminToken } from '../useAuth';
import {
  isPushSupported,
  subscribeToPush,
  unsubscribeFromPush,
  hasActivePushSubscription,
} from '../pushNotifications';
import { dialog } from './Dialog';
import { apiUrl } from '../api';

interface SettingsModalProps {
  onClose: () => void;
}

interface BackupItem {
  name: string;
  size: number;
  sizeFormatted: string;
  createdAt: string;
}

export default function SettingsModal({ onClose }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<'email' | 'webhooks' | 'backups'>('email');
  const [settings, setSettings] = useState<SmtpSettings>({
    host: '',
    port: '587',
    user: '',
    pass: '',
    recipient: '',
  });
  const [webhooks, setWebhooks] = useState<WebhookSettings>({
    telegram_webhook: '',
    discord_webhook: '',
    discord_user_id: '',
    slack_webhook: '',
    message_template: '',
  });
  const [loading, setLoading] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [message, setMessage] = useState('');

  // Block body scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);
  useEffect(() => {
    fetch(apiUrl('/api/settings/email'))
      .then(res => res.json())
      .then(data => {
        if (data.host) {
          setSettings(prev => ({ ...prev, ...data }));
        }
      })
      .catch(() => {});

    fetch(apiUrl('/api/settings/webhooks'), { headers: { ...authHeaders() } })
      .then(res => res.json())
      .then(data => {
        if (data.telegram_webhook || data.discord_webhook || data.discord_user_id || data.slack_webhook || data.message_template) {
          setWebhooks({
            telegram_webhook: data.telegram_webhook || '',
            discord_webhook: data.discord_webhook || '',
            discord_user_id: data.discord_user_id || '',
            slack_webhook: data.slack_webhook || '',
            message_template: data.message_template || '',
          });
        }
      })
      .catch(() => {});
  }, []);

  const handleSaveEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      const res = await fetch(apiUrl('/api/settings/email'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(settings),
      });

      if (!res.ok) throw new Error('Parametrlər yadda saxlanmadı');
      setMessage('Email parametrləri uğurla saxlanıldı');
    } catch (err: any) {
      setMessage(`Xəta: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveWebhooks = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    // Boş dəyərləri trim et
    const cleanWebhooks = {
      telegram_webhook: webhooks.telegram_webhook.trim(),
      discord_webhook: webhooks.discord_webhook.trim(),
      discord_user_id: webhooks.discord_user_id.trim(),
      slack_webhook: webhooks.slack_webhook.trim(),
      message_template: webhooks.message_template.trim(),
    };

    try {
      const res = await fetch(apiUrl('/api/settings/webhooks'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(cleanWebhooks),
      });

      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || 'Parametrlər yadda saxlanmadı');
      setMessage('Webhook parametrləri uğurla saxlanıldı');
    } catch (err: any) {
      setMessage(`Xəta: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleTestEmail = async () => {
    setTestLoading(true);
    setMessage('');

    try {
      const res = await fetch(apiUrl('/api/settings/test-email'), { method: 'POST', headers: { ...authHeaders() } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Test email göndərilmədi');
      setMessage('Test email uğurla göndərildi!');
    } catch (err: any) {
      setMessage(`Xəta: ${err.message}`);
    } finally {
      setTestLoading(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div 
        className="bg-navy-surface border border-border rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto scrollbar-thin"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-heading font-bold text-white mb-6">Parametrlər</h2>
        
        {/* Tabs */}
        <div className="flex gap-2 mb-6 border-b border-border">
          <button
            onClick={() => setActiveTab('email')}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
              activeTab === 'email'
                ? 'border-accent text-accent'
                : 'border-transparent text-text-muted hover:text-white'
            }`}
          >
            Email
          </button>
          <button
            onClick={() => setActiveTab('webhooks')}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
              activeTab === 'webhooks'
                ? 'border-accent text-accent'
                : 'border-transparent text-text-muted hover:text-white'
            }`}
          >
            Webhook
          </button>
          <button
            onClick={() => setActiveTab('backups')}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
              activeTab === 'backups'
                ? 'border-accent text-accent'
                : 'border-transparent text-text-muted hover:text-white'
            }`}
          >
            Backup
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'email' && (
          <>
            <p className="text-text-muted text-sm mb-4">
              SMTP konfiqurasiyası ilə sayt offline olanda email bildiriş alın.
            </p>

            <form onSubmit={handleSaveEmail} className="space-y-3">
              <div>
                <label className="block text-text-muted text-xs mb-1">SMTP Host</label>
                <input
                  type="text"
                  value={settings.host}
                  onChange={e => setSettings({ ...settings, host: e.target.value })}
                  placeholder="smtp.gmail.com"
                  className="w-full px-3 py-2 bg-navy-light border border-border rounded-lg text-white text-sm placeholder:text-text-muted/50 focus:outline-none focus:border-accent transition-colors"
                />
              </div>
              <div>
                <label className="block text-text-muted text-xs mb-1">Port</label>
                <input
                  type="text"
                  value={settings.port}
                  onChange={e => setSettings({ ...settings, port: e.target.value })}
                  placeholder="587"
                  className="w-full px-3 py-2 bg-navy-light border border-border rounded-lg text-white text-sm placeholder:text-text-muted/50 focus:outline-none focus:border-accent transition-colors"
                />
              </div>
              <div>
                <label className="block text-text-muted text-xs mb-1">İstifadəçi adı</label>
                <input
                  type="text"
                  value={settings.user}
                  onChange={e => setSettings({ ...settings, user: e.target.value })}
                  placeholder="your@email.com"
                  className="w-full px-3 py-2 bg-navy-light border border-border rounded-lg text-white text-sm placeholder:text-text-muted/50 focus:outline-none focus:border-accent transition-colors"
                />
              </div>
              <div>
                <label className="block text-text-muted text-xs mb-1">Şifrə</label>
                <input
                  type="password"
                  value={settings.pass}
                  onChange={e => setSettings({ ...settings, pass: e.target.value })}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 bg-navy-light border border-border rounded-lg text-white text-sm placeholder:text-text-muted/50 focus:outline-none focus:border-accent transition-colors"
                />
              </div>
              <div>
                <label className="block text-text-muted text-xs mb-1">Alıcı Email</label>
                <input
                  type="email"
                  value={settings.recipient}
                  onChange={e => setSettings({ ...settings, recipient: e.target.value })}
                  placeholder="alerts@company.com"
                  className="w-full px-3 py-2 bg-navy-light border border-border rounded-lg text-white text-sm placeholder:text-text-muted/50 focus:outline-none focus:border-accent transition-colors"
                />
              </div>

              {message && activeTab === 'email' && (
                <p className={`text-sm ${message.includes('Xəta') ? 'text-red-400' : 'text-green-400'}`}>
                  {message}
                </p>
              )}

              <div className="flex gap-3 pt-3">
                <button
                  type="button"
                  onClick={handleTestEmail}
                  disabled={testLoading}
                  className="px-4 py-2.5 text-sm border border-accent text-accent rounded-lg hover:bg-accent/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {testLoading ? 'Göndərilir...' : 'Test'}
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-4 py-2.5 text-sm bg-accent text-bg font-medium rounded-lg hover:bg-accent/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Saxlanılır...' : 'Saxla'}
                </button>
              </div>
            </form>
          </>
        )}

        {activeTab === 'webhooks' && (
          <>
            <p className="text-text-muted text-sm mb-4">
              Telegram, Discord və ya Slack webhook URL daxil edin. Sayt offline olanda avtomatik bildiriş göndəriləcək.
            </p>

            <form onSubmit={handleSaveWebhooks} className="space-y-3">
              <div>
                <label className="block text-text-muted text-xs mb-1">Telegram Webhook URL</label>
                <input
                  type="text"
                  value={webhooks.telegram_webhook}
                  onChange={e => setWebhooks({ ...webhooks, telegram_webhook: e.target.value })}
                  placeholder="https://api.telegram.org/bot.../sendMessage"
                  className="w-full px-3 py-2 bg-navy-light border border-border rounded-lg text-white text-sm placeholder:text-text-muted/50 focus:outline-none focus:border-accent transition-colors"
                />
                <p className="text-text-muted text-xs mt-1">
                  Telegram bot yaradın və webhook URL alın
                </p>
              </div>
              <div>
                <label className="block text-text-muted text-xs mb-1">Discord Webhook URL</label>
                <textarea
                  value={webhooks.discord_webhook}
                  onChange={e => setWebhooks({ ...webhooks, discord_webhook: e.target.value })}
                  placeholder="https://discord.com/api/webhooks/..."
                  rows={3}
                  className="w-full px-3 py-2 bg-navy-light border border-border rounded-lg text-white text-sm placeholder:text-text-muted/50 focus:outline-none focus:border-accent transition-colors resize-none"
                />
                <p className="text-text-muted text-xs mt-1">
                  Discord kanalınızda webhook yaradın
                </p>
              </div>
              <div>
                <label className="block text-text-muted text-xs mb-1">Discord User ID (ping üçün)</label>
                <input
                  type="text"
                  value={webhooks.discord_user_id}
                  onChange={e => setWebhooks({ ...webhooks, discord_user_id: e.target.value })}
                  placeholder="123456789012345678"
                  className="w-full px-3 py-2 bg-navy-light border border-border rounded-lg text-white text-sm placeholder:text-text-muted/50 focus:outline-none focus:border-accent transition-colors"
                />
                <p className="text-text-muted text-xs mt-1">
                  Sayt offline olanda sizi @ ilə ping edəcək. Discord-da User Settings → Advanced → Developer Mode aktiv edin, sonra profilinizə sağ klik → "Copy User ID"
                </p>
              </div>
              <div>
                <label className="block text-text-muted text-xs mb-1">Slack Webhook URL</label>
                <textarea
                  value={webhooks.slack_webhook}
                  onChange={e => setWebhooks({ ...webhooks, slack_webhook: e.target.value })}
                  placeholder="https://hooks.slack.com/services/..."
                  rows={2}
                  className="w-full px-3 py-2 bg-navy-light border border-border rounded-lg text-white text-sm placeholder:text-text-muted/50 focus:outline-none focus:border-accent transition-colors resize-none"
                />
                <p className="text-text-muted text-xs mt-1">
                  Slack workspace-inizdə Incoming Webhook yaradın (Apps → Incoming Webhooks)
                </p>
              </div>
              <div>
                <label className="block text-text-muted text-xs mb-1">Mesaj Şablonu (opsional)</label>
                <textarea
                  value={webhooks.message_template}
                  onChange={e => setWebhooks({ ...webhooks, message_template: e.target.value })}
                  placeholder={'⚠️ **Sayt Offline Oldu**\n\n**Sayt:** {name}\n**URL:** {url}\n**Status:** {status}\n**Vaxt:** {time}'}
                  rows={5}
                  className="w-full px-3 py-2 bg-navy-light border border-border rounded-lg text-white text-sm placeholder:text-text-muted/50 focus:outline-none focus:border-accent transition-colors resize-none font-mono"
                />
                <p className="text-text-muted text-xs mt-1">
                  Dəyişənlər: <span className="text-accent">{'{name}'}</span> <span className="text-accent">{'{url}'}</span> <span className="text-accent">{'{status}'}</span> <span className="text-accent">{'{time}'}</span> <span className="text-accent">{'{response_time}'}</span> <span className="text-accent">{'{ip}'}</span> <span className="text-accent">{'{hosting}'}</span>
                </p>
              </div>

              {message && activeTab === 'webhooks' && (
                <p className={`text-sm ${message.includes('Xəta') ? 'text-red-400' : 'text-green-400'}`}>
                  {message}
                </p>
              )}

              <div className="flex gap-3 pt-3">
                <button
                  type="button"
                  onClick={async () => {
                    if (!webhooks.telegram_webhook && !webhooks.discord_webhook && !webhooks.slack_webhook) {
                      setMessage('Xəta: Ən azı bir webhook URL daxil edin');
                      return;
                    }
                    setTestLoading(true);
                    setMessage('');
                    try {
                      const testRes = await fetch(apiUrl('/api/settings/test-webhook'), { 
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', ...authHeaders() },
                        body: JSON.stringify(webhooks),
                      });
                      const data = await testRes.json();
                      if (!testRes.ok) throw new Error(data.error || 'Test mesajı göndərilmədi');
                      setMessage('Test mesajı uğurla göndərildi!');
                    } catch (err: any) {
                      setMessage(`Xəta: ${err.message}`);
                    } finally {
                      setTestLoading(false);
                    }
                  }}
                  disabled={testLoading}
                  className="px-4 py-2.5 text-sm border border-accent text-accent rounded-lg hover:bg-accent/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {testLoading ? 'Göndərilir...' : 'Test'}
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-4 py-2.5 text-sm bg-accent text-bg font-medium rounded-lg hover:bg-accent/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Saxlanılır...' : 'Saxla'}
                </button>
              </div>
            </form>
          </>
        )}

        {activeTab === 'backups' && (
          <BackupTab />
        )}

        <div className="flex justify-end pt-4 mt-4 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border border-border text-text-muted rounded-lg hover:text-white transition-colors"
          >
            Bağla
          </button>
        </div>
      </div>
    </div>
  );
}

function PushNotifications() {
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(false);
  const supported = isPushSupported();

  useEffect(() => {
    hasActivePushSubscription().then(setActive);
  }, []);

  const handleEnable = async () => {
    setBusy(true);
    try {
      const result = await subscribeToPush();
      if (result.ok) {
        setActive(true);
        await dialog.alert('Brauzer bildirişləri aktivləşdirildi.', 'Uğurlu');
      } else {
        await dialog.alert(result.reason, 'Aktivləşdirilə bilmədi');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleDisable = async () => {
    setBusy(true);
    try {
      const result = await unsubscribeFromPush();
      if (result.ok) {
        setActive(false);
        await dialog.alert('Brauzer bildirişləri söndürüldü.', 'Uğurlu');
      } else {
        await dialog.alert(result.reason, 'Xəta');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleTest = async () => {
    setBusy(true);
    try {
      const res = await fetch(apiUrl('/api/push/test'), {
        method: 'POST',
        headers: { ...authHeaders() },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Test bildirişi göndərilmədi');
      await dialog.alert(`Test bildirişi göndərildi (${data.sent} cihaz).`, 'Uğurlu');
    } catch (err) {
      await dialog.alert(err instanceof Error ? err.message : 'Xəta baş verdi', 'Xəta');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-6 pt-4 border-t border-border">
      <h3 className="text-white text-sm font-medium mb-1">Brauzer bildirişləri</h3>
      <p className="text-text-muted text-xs mb-3">
        Sayt offline olanda və ya domain/SSL bitməyə yaxınlaşanda brauzer bildirişi al.
        Sekmə bağlı olsa da işləyir. Yalnız HTTPS və ya localhost üzərində mümkündür.
      </p>

      {!supported ? (
        <p className="text-yellow-400 text-xs">Bu brauzer push bildirişlərini dəstəkləmir.</p>
      ) : (
        <div className="flex gap-2 flex-wrap items-center">
          {active ? (
            <>
              <span className="px-2 py-1 text-xs rounded-full bg-green-400/10 text-green-400 border border-green-400/30">
                Aktivdir
              </span>
              <button
                onClick={handleTest}
                disabled={busy}
                className="px-4 py-2 border border-accent text-accent rounded-lg hover:bg-accent/10 transition-colors text-sm disabled:opacity-50"
              >
                Test Bildirişi
              </button>
              <button
                onClick={handleDisable}
                disabled={busy}
                className="px-4 py-2 border border-border text-text-muted rounded-lg hover:text-white transition-colors text-sm disabled:opacity-50"
              >
                Söndür
              </button>
            </>
          ) : (
            <button
              onClick={handleEnable}
              disabled={busy}
              className="px-4 py-2 border border-accent text-accent rounded-lg hover:bg-accent/10 transition-colors text-sm disabled:opacity-50"
            >
              {busy ? 'Gözləyin...' : 'Brauzer Bildirişlərini Aktivləşdir'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ConfigTransfer() {
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleExport = () => {
    const token = getAdminToken();
    if (!token) {
      dialog.alert('Sessiya bitib, yenidən giriş edin', 'Xəta');
      return;
    }
    window.open(apiUrl('/api/config/export') + `?token=${encodeURIComponent(token)}`, '_blank');
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error('Fayl düzgün JSON deyil');
      }

      const res = await fetch(apiUrl('/api/config/import'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(data),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Import uğursuz oldu');

      const parts = [`${result.imported} sayt import edildi`];
      if (result.skipped > 0) {
        parts.push(`${result.skipped} sayt atlandı (dublikat və ya yanlış format)`);
      }
      await dialog.alert(parts.join('. ') + '.', 'Uğurlu');
      window.location.reload();
    } catch (err) {
      await dialog.alert(err instanceof Error ? err.message : 'Xəta baş verdi', 'Xəta');
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="mt-6 pt-4 border-t border-border">
      <h3 className="text-white text-sm font-medium mb-1">Konfiqurasiya</h3>
      <p className="text-text-muted text-xs mb-3">
        Saytların siyahısını və parametrlərini JSON kimi köçür. Giriş məlumatları (istifadəçi adı,
        şifrə, panel URL-ləri) fayla daxil edilmir.
      </p>
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={handleExport}
          className="px-4 py-2 border border-accent text-accent rounded-lg hover:bg-accent/10 transition-colors text-sm"
        >
          Export Et
        </button>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={importing}
          className="px-4 py-2 border border-border text-text-muted rounded-lg hover:text-white transition-colors text-sm disabled:opacity-50"
        >
          {importing ? 'Import olunur...' : 'Import Et'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          onChange={handleImport}
          className="hidden"
        />
      </div>
    </div>
  );
}

function BackupTab() {
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchBackups();
  }, []);

  const fetchBackups = async () => {
    try {
      const res = await fetch(apiUrl('/api/backups'));
      const data = await res.json();
      setBackups(data);
    } catch {
      setMessage('Xəta: Backuplar yüklənmədi');
    }
  };

  const handleCreateBackup = async () => {
    setLoading(true);
    setMessage('');
    try {
      const res = await fetch(apiUrl('/api/backups'), { method: 'POST', headers: { ...authHeaders() } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessage('Backup uğurla yaradıldı!');
      fetchBackups();
    } catch (err: any) {
      setMessage(`Xəta: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async (name: string) => {
    const ok = await dialog.confirm(
      `"${name}" backup-ından bərpa etmək istəyirsiniz?\n\nDiqqət: Cari məlumatlar əvəz olunacaq (avtomatik ehtiyat backup alınacaq).`,
      'Backup Bərpası',
      true
    );
    if (!ok) return;
    setLoading(true);
    setMessage('');
    try {
      const res = await fetch(apiUrl(`/api/backups/${encodeURIComponent(name)}/restore`), { method: 'POST', headers: { ...authHeaders() } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessage('Backup bərpa edildi! Səhifəni yeniləyin.');
      fetchBackups();
    } catch (err: any) {
      setMessage(`Xəta: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (name: string) => {
    const ok = await dialog.confirm(`"${name}" backup-ını silmək istəyirsiniz?`, 'Backup Silinsin?', true);
    if (!ok) return;
    try {
      const res = await fetch(apiUrl(`/api/backups/${encodeURIComponent(name)}`), { method: 'DELETE', headers: { ...authHeaders() } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      fetchBackups();
    } catch (err: any) {
      setMessage(`Xəta: ${err.message}`);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('az-AZ', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div>
      <p className="text-text-muted text-sm mb-4">
        Verilənlər bazasının avtomatik backup-ı hər 24 saatda alınır. Son 7 backup saxlanılır.
      </p>

      <button
        onClick={handleCreateBackup}
        disabled={loading}
        className="w-full px-4 py-2.5 text-sm bg-accent text-bg font-medium rounded-lg hover:bg-accent/80 transition-colors disabled:opacity-50 mb-4"
      >
        {loading ? 'Yaradılır...' : '💾 İndi Backup Yarat'}
      </button>

      {message && (
        <p className={`text-sm mb-3 ${message.includes('Xəta') ? 'text-red-400' : 'text-green-400'}`}>
          {message}
        </p>
      )}

      {backups.length === 0 ? (
        <p className="text-text-muted text-sm text-center py-4">Hələ backup yoxdur</p>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto scrollbar-thin">
          {backups.map(backup => (
            <div key={backup.name} className="flex items-center justify-between p-3 bg-navy-light rounded-lg">
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium truncate">{backup.name}</p>
                <p className="text-text-muted text-xs">
                  {formatDate(backup.createdAt)} • {backup.sizeFormatted}
                </p>
              </div>
              <div className="flex gap-1.5 ml-2">
                <a
                  href={`/api/backups/${backup.name}/download`}
                  className="px-2 py-1 text-xs text-accent border border-accent/30 rounded hover:bg-accent/10 transition-colors"
                  title="Endir"
                >
                  ↓
                </a>
                <button
                  onClick={() => handleRestore(backup.name)}
                  className="px-2 py-1 text-xs text-green-400 border border-green-400/30 rounded hover:bg-green-400/10 transition-colors"
                  title="Bərpa et"
                >
                  ↻
                </button>
                <button
                  onClick={() => handleDelete(backup.name)}
                  className="px-2 py-1 text-xs text-red-400 border border-red-400/30 rounded hover:bg-red-400/10 transition-colors"
                  title="Sil"
                  aria-label="Backup-ı sil"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <PushNotifications />
      <ConfigTransfer />
    </div>
  );
}
