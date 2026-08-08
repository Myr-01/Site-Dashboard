import { useState, useEffect } from 'react';
import { SmtpSettings, WebhookSettings } from '../types';
import { authHeaders } from '../useAuth';
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
    message_template: '',
  });
  const [loading, setLoading] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [message, setMessage] = useState('');

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
        if (data.telegram_webhook || data.discord_webhook || data.discord_user_id || data.message_template) {
          setWebhooks({
            telegram_webhook: data.telegram_webhook || '',
            discord_webhook: data.discord_webhook || '',
            discord_user_id: data.discord_user_id || '',
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

      if (!res.ok) throw new Error('ParametrlÉ™r yadda saxlanmadÄ±');
      setMessage('Email parametrlÉ™ri uÄŸurla saxlanÄ±ldÄ±');
    } catch (err: unknown) {
      setMessage(`XÉ™ta: ${err instanceof Error ? err.message : "Naməlum xəta"}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveWebhooks = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    // BoÅŸ dÉ™yÉ™rlÉ™ri trim et
    const cleanWebhooks = {
      telegram_webhook: webhooks.telegram_webhook.trim(),
      discord_webhook: webhooks.discord_webhook.trim(),
      discord_user_id: webhooks.discord_user_id.trim(),
      message_template: webhooks.message_template.trim(),
    };

    try {
      const res = await fetch(apiUrl('/api/settings/webhooks'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(cleanWebhooks),
      });

      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || 'ParametrlÉ™r yadda saxlanmadÄ±');
      setMessage('Webhook parametrlÉ™ri uÄŸurla saxlanÄ±ldÄ±');
    } catch (err: unknown) {
      setMessage(`XÉ™ta: ${err instanceof Error ? err.message : "Naməlum xəta"}`);
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
      if (!res.ok) throw new Error(data.error || 'Test email gÃ¶ndÉ™rilmÉ™di');
      setMessage('Test email uÄŸurla gÃ¶ndÉ™rildi!');
    } catch (err: unknown) {
      setMessage(`XÉ™ta: ${err instanceof Error ? err.message : "Naməlum xəta"}`);
    } finally {
      setTestLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-navy-surface border border-border rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-heading font-bold text-white mb-6">ParametrlÉ™r</h2>
        
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

        {activeTab === 'email' ? (
          <>
            <p className="text-text-muted text-sm mb-4">
              SMTP konfiqurasiyasÄ± ilÉ™ sayt offline olanda email bildiriÅŸ alÄ±n.
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
                <label className="block text-text-muted text-xs mb-1">Ä°stifadÉ™Ã§i adÄ±</label>
                <input
                  type="text"
                  value={settings.user}
                  onChange={e => setSettings({ ...settings, user: e.target.value })}
                  placeholder="your@email.com"
                  className="w-full px-3 py-2 bg-navy-light border border-border rounded-lg text-white text-sm placeholder:text-text-muted/50 focus:outline-none focus:border-accent transition-colors"
                />
              </div>
              <div>
                <label className="block text-text-muted text-xs mb-1">ÅžifrÉ™</label>
                <input
                  type="password"
                  value={settings.pass}
                  onChange={e => setSettings({ ...settings, pass: e.target.value })}
                  placeholder="â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢"
                  className="w-full px-3 py-2 bg-navy-light border border-border rounded-lg text-white text-sm placeholder:text-text-muted/50 focus:outline-none focus:border-accent transition-colors"
                />
              </div>
              <div>
                <label className="block text-text-muted text-xs mb-1">AlÄ±cÄ± Email</label>
                <input
                  type="email"
                  value={settings.recipient}
                  onChange={e => setSettings({ ...settings, recipient: e.target.value })}
                  placeholder="alerts@company.com"
                  className="w-full px-3 py-2 bg-navy-light border border-border rounded-lg text-white text-sm placeholder:text-text-muted/50 focus:outline-none focus:border-accent transition-colors"
                />
              </div>

              {message && activeTab === 'email' && (
                <p className={`text-sm ${message.includes('XÉ™ta') ? 'text-red-400' : 'text-green-400'}`}>
                  {message}
                </p>
              )}

              <div className="flex gap-3 pt-3">
                <button
                  type="button"
                  onClick={handleTestEmail}
                  disabled={testLoading}
                  className="px-4 py-2.5 text-sm border border-accent text-accent rounded-lg hover:bg-accent/10 transition-colors disabled:opacity-50"
                >
                  {testLoading ? 'GÃ¶ndÉ™rilir...' : 'Test'}
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-4 py-2.5 text-sm bg-accent text-bg font-medium rounded-lg hover:bg-accent/80 transition-colors disabled:opacity-50"
                >
                  {loading ? 'SaxlanÄ±lÄ±r...' : 'Saxla'}
                </button>
              </div>
            </form>
          </>
        ) : (
          <>
            <p className="text-text-muted text-sm mb-4">
              Telegram vÉ™ ya Discord webhook URL daxil edin. Sayt offline olanda avtomatik bildiriÅŸ gÃ¶ndÉ™rilÉ™cÉ™k.
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
                  Telegram bot yaradÄ±n vÉ™ webhook URL alÄ±n
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
                  Discord kanalÄ±nÄ±zda webhook yaradÄ±n
                </p>
              </div>
              <div>
                <label className="block text-text-muted text-xs mb-1">Discord User ID (ping Ã¼Ã§Ã¼n)</label>
                <input
                  type="text"
                  value={webhooks.discord_user_id}
                  onChange={e => setWebhooks({ ...webhooks, discord_user_id: e.target.value })}
                  placeholder="123456789012345678"
                  className="w-full px-3 py-2 bg-navy-light border border-border rounded-lg text-white text-sm placeholder:text-text-muted/50 focus:outline-none focus:border-accent transition-colors"
                />
                <p className="text-text-muted text-xs mt-1">
                  Sayt offline olanda sizi @ ilÉ™ ping edÉ™cÉ™k. Discord-da User Settings â†’ Advanced â†’ Developer Mode aktiv edin, sonra profilinizÉ™ saÄŸ klik â†’ "Copy User ID"
                </p>
              </div>
              <div>
                <label className="block text-text-muted text-xs mb-1">Mesaj Åžablonu (opsional)</label>
                <textarea
                  value={webhooks.message_template}
                  onChange={e => setWebhooks({ ...webhooks, message_template: e.target.value })}
                  placeholder={'âš ï¸ **Sayt Offline Oldu**\n\n**Sayt:** {name}\n**URL:** {url}\n**Status:** {status}\n**Vaxt:** {time}'}
                  rows={5}
                  className="w-full px-3 py-2 bg-navy-light border border-border rounded-lg text-white text-sm placeholder:text-text-muted/50 focus:outline-none focus:border-accent transition-colors resize-none font-mono"
                />
                <p className="text-text-muted text-xs mt-1">
                  DÉ™yiÅŸÉ™nlÉ™r: <span className="text-accent">{'{name}'}</span> <span className="text-accent">{'{url}'}</span> <span className="text-accent">{'{status}'}</span> <span className="text-accent">{'{time}'}</span> <span className="text-accent">{'{response_time}'}</span> <span className="text-accent">{'{ip}'}</span> <span className="text-accent">{'{hosting}'}</span>
                </p>
              </div>

              {message && activeTab === 'webhooks' && (
                <p className={`text-sm ${message.includes('XÉ™ta') ? 'text-red-400' : 'text-green-400'}`}>
                  {message}
                </p>
              )}

              <div className="flex gap-3 pt-3">
                <button
                  type="button"
                  onClick={async () => {
                    if (!webhooks.telegram_webhook && !webhooks.discord_webhook) {
                      setMessage('XÉ™ta: Æn azÄ± bir webhook URL daxil edin');
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
                      if (!testRes.ok) throw new Error(data.error || 'Test mesajÄ± gÃ¶ndÉ™rilmÉ™di');
                      setMessage('Test mesajÄ± uÄŸurla gÃ¶ndÉ™rildi!');
                    } catch (err: unknown) {
                      setMessage(`XÉ™ta: ${err instanceof Error ? err.message : "Naməlum xəta"}`);
                    } finally {
                      setTestLoading(false);
                    }
                  }}
                  disabled={testLoading}
                  className="px-4 py-2.5 text-sm border border-accent text-accent rounded-lg hover:bg-accent/10 transition-colors disabled:opacity-50"
                >
                  {testLoading ? 'GÃ¶ndÉ™rilir...' : 'Test'}
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-4 py-2.5 text-sm bg-accent text-bg font-medium rounded-lg hover:bg-accent/80 transition-colors disabled:opacity-50"
                >
                  {loading ? 'SaxlanÄ±lÄ±r...' : 'Saxla'}
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
            BaÄŸla
          </button>
        </div>
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
      setMessage('XÉ™ta: Backuplar yÃ¼klÉ™nmÉ™di');
    }
  };

  const handleCreateBackup = async () => {
    setLoading(true);
    setMessage('');
    try {
      const res = await fetch(apiUrl('/api/backups'), { method: 'POST', headers: { ...authHeaders() } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessage('Backup uÄŸurla yaradÄ±ldÄ±!');
      fetchBackups();
    } catch (err: unknown) {
      setMessage(`XÉ™ta: ${err instanceof Error ? err.message : "Naməlum xəta"}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async (name: string) => {
    const ok = await dialog.confirm(
      `"${name}" backup-Ä±ndan bÉ™rpa etmÉ™k istÉ™yirsiniz?\n\nDiqqÉ™t: Cari mÉ™lumatlar É™vÉ™z olunacaq (avtomatik ehtiyat backup alÄ±nacaq).`,
      'Backup BÉ™rpasÄ±',
      true
    );
    if (!ok) return;
    setLoading(true);
    setMessage('');
    try {
      const res = await fetch(apiUrl(`/api/backups/${encodeURIComponent(name)}/restore`), { method: 'POST', headers: { ...authHeaders() } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessage('Backup bÉ™rpa edildi! SÉ™hifÉ™ni yenilÉ™yin.');
      fetchBackups();
    } catch (err: unknown) {
      setMessage(`XÉ™ta: ${err instanceof Error ? err.message : "Naməlum xəta"}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (name: string) => {
    const ok = await dialog.confirm(`"${name}" backup-Ä±nÄ± silmÉ™k istÉ™yirsiniz?`, 'Backup Silinsin?', true);
    if (!ok) return;
    try {
      const res = await fetch(apiUrl(`/api/backups/${encodeURIComponent(name)}`), { method: 'DELETE', headers: { ...authHeaders() } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      fetchBackups();
    } catch (err: unknown) {
      setMessage(`XÉ™ta: ${err instanceof Error ? err.message : "Naməlum xəta"}`);
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
        VerilÉ™nlÉ™r bazasÄ±nÄ±n avtomatik backup-Ä± hÉ™r 24 saatda alÄ±nÄ±r. Son 7 backup saxlanÄ±lÄ±r.
      </p>

      <button
        onClick={handleCreateBackup}
        disabled={loading}
        className="w-full px-4 py-2.5 text-sm bg-accent text-bg font-medium rounded-lg hover:bg-accent/80 transition-colors disabled:opacity-50 mb-4"
      >
        {loading ? 'YaradÄ±lÄ±r...' : 'ðŸ’¾ Ä°ndi Backup Yarat'}
      </button>

      {message && (
        <p className={`text-sm mb-3 ${message.includes('XÉ™ta') ? 'text-red-400' : 'text-green-400'}`}>
          {message}
        </p>
      )}

      {backups.length === 0 ? (
        <p className="text-text-muted text-sm text-center py-4">HÉ™lÉ™ backup yoxdur</p>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto scrollbar-thin">
          {backups.map(backup => (
            <div key={backup.name} className="flex items-center justify-between p-3 bg-navy-light rounded-lg">
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium truncate">{backup.name}</p>
                <p className="text-text-muted text-xs">
                  {formatDate(backup.createdAt)} â€¢ {backup.sizeFormatted}
                </p>
              </div>
              <div className="flex gap-1.5 ml-2">
                <a
                  href={`/api/backups/${backup.name}/download`}
                  className="px-2 py-1 text-xs text-accent border border-accent/30 rounded hover:bg-accent/10 transition-colors"
                  title="Endir"
                >
                  â†“
                </a>
                <button
                  onClick={() => handleRestore(backup.name)}
                  className="px-2 py-1 text-xs text-green-400 border border-green-400/30 rounded hover:bg-green-400/10 transition-colors"
                  title="BÉ™rpa et"
                >
                  â†»
                </button>
                <button
                  onClick={() => handleDelete(backup.name)}
                  className="px-2 py-1 text-xs text-red-400 border border-red-400/30 rounded hover:bg-red-400/10 transition-colors"
                  title="Sil"
                >
                  âœ•
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
