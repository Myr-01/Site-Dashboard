import { useState, useRef } from 'react';
import { adminApi } from '../useAuth';
import { useBranding } from '../BrandingContext';
import { apiUrl } from '../api';
import { dialog } from './Dialog';

// Hazır accent rəng palitrası (tünd temaya uyğun)
const COLOR_PRESETS = [
  { name: 'Narıncı', value: '#fca311' },
  { name: 'Mavi', value: '#3b82f6' },
  { name: 'Yaşıl', value: '#22c55e' },
  { name: 'Bənövşəyi', value: '#8b5cf6' },
  { name: 'Çəhrayı', value: '#ec4899' },
  { name: 'Firuzəyi', value: '#06b6d4' },
  { name: 'Qırmızı', value: '#ef4444' },
  { name: 'Kəhrəba', value: '#f59e0b' },
];

// Bölmə başlığı (ikon + başlıq + alt mətn)
function SectionHeader({ iconPath, title, subtitle }: { iconPath: string; title: string; subtitle: string }) {
  return (
    <div className="flex items-start gap-3 mb-5">
      <div className="w-9 h-9 rounded-xl bg-accent/15 border border-accent/30 flex items-center justify-center shrink-0">
        <svg className="w-5 h-5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={iconPath} />
        </svg>
      </div>
      <div>
        <h3 className="text-white font-medium">{title}</h3>
        <p className="text-text-muted text-xs mt-0.5">{subtitle}</p>
      </div>
    </div>
  );
}

export default function AdminSettings() {
  const { branding, applyBranding, reloadBranding } = useBranding();
  const [title, setTitle] = useState(branding.title);
  const [color, setColor] = useState(branding.primary_color);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const logoRef = useRef<HTMLInputElement>(null);
  const faviconRef = useRef<HTMLInputElement>(null);

  const dirty = title !== branding.title || color !== branding.primary_color;

  const saveBranding = async () => {
    setSaving(true);
    setMsg('');
    try {
      const updated = await adminApi.saveBranding({ title, primary_color: color });
      applyBranding(updated);
      setMsg('Yadda saxlanıldı');
      setTimeout(() => setMsg(''), 2500);
    } catch {
      setMsg('Xəta baş verdi');
    } finally {
      setSaving(false);
    }
  };

  const uploadImage = async (kind: 'logo' | 'favicon', file: File | undefined) => {
    if (!file) return;
    try {
      const updated = await adminApi.uploadBrandingImage(kind, file);
      applyBranding(updated);
      setMsg(`${kind === 'logo' ? 'Logo' : 'Favicon'} yükləndi`);
      setTimeout(() => setMsg(''), 2500);
    } catch (err) {
      await dialog.alert(err instanceof Error ? err.message : 'Yükləmə xətası', 'Xəta');
    }
  };

  const removeImage = async (kind: 'logo' | 'favicon') => {
    try {
      const updated = await adminApi.removeBrandingImage(kind);
      applyBranding(updated);
    } catch {
      /* susdur */
    }
  };

  const regenerate = async () => {
    const ok = await dialog.confirm(
      'Giriş kodunu indi yeniləmək istəyirsiniz? Köhnə kod dərhal etibarsız olacaq.',
      'Kodu yenilə'
    );
    if (!ok) return;
    try {
      const data = await adminApi.regeneratePasscode();
      await dialog.alert(`Yeni giriş kodu: ${data.code}`, 'Kod yeniləndi');
    } catch {
      await dialog.alert('Kod yenilənmədi', 'Xəta');
    }
  };

  return (
    <div className="max-w-4xl">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Sol: branding formu (2 sütun) */}
        <div className="lg:col-span-2 space-y-5">
          {/* Branding kartı */}
          <div className="bg-navy-surface border border-border rounded-2xl p-6">
            <SectionHeader
              iconPath="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"
              title="Görünüş (Branding)"
              subtitle="Dashboard-un adı, rəngi və loqosu"
            />

            <div className="space-y-6">
              {/* Başlıq */}
              <div>
                <label className="block text-text-muted text-xs mb-1.5 font-medium">Dashboard adı</label>
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  maxLength={60}
                  className="w-full px-3.5 py-2.5 bg-navy-light border border-border rounded-xl text-white text-sm focus:outline-none focus:border-accent transition-colors"
                />
              </div>

              {/* Rəng — palitra + custom */}
              <div>
                <label className="block text-text-muted text-xs mb-2 font-medium">Vurğu rəngi (accent)</label>
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  {COLOR_PRESETS.map(p => (
                    <button
                      key={p.value}
                      onClick={() => setColor(p.value)}
                      title={p.name}
                      className={`w-8 h-8 rounded-lg transition-transform hover:scale-110 ${
                        color.toLowerCase() === p.value.toLowerCase() ? 'ring-2 ring-white ring-offset-2 ring-offset-navy-surface' : ''
                      }`}
                      style={{ backgroundColor: p.value }}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={color}
                    onChange={e => setColor(e.target.value)}
                    className="w-11 h-9 rounded-lg border border-border bg-navy-light cursor-pointer p-0.5"
                  />
                  <input
                    type="text"
                    value={color}
                    onChange={e => setColor(e.target.value)}
                    placeholder="#fca311"
                    className="w-32 px-3 py-2 bg-navy-light border border-border rounded-xl text-white text-sm font-mono focus:outline-none focus:border-accent transition-colors"
                  />
                </div>
              </div>

              {/* Logo */}
              <div>
                <label className="block text-text-muted text-xs mb-2 font-medium">Logo</label>
                <div className="flex items-center gap-3">
                  <div className="w-14 h-14 rounded-xl bg-navy-light border border-border flex items-center justify-center overflow-hidden shrink-0">
                    {branding.logo_url
                      ? <img src={apiUrl(branding.logo_url)} alt="logo" className="max-h-12 max-w-12 object-contain" />
                      : <span className="text-accent text-lg">●</span>}
                  </div>
                  <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={e => uploadImage('logo', e.target.files?.[0])} />
                  <button onClick={() => logoRef.current?.click()} className="px-3.5 py-2 text-xs font-medium border border-border text-text-muted rounded-lg hover:text-white hover:border-accent/40 transition-colors">
                    Yüklə
                  </button>
                  {branding.logo_url && (
                    <button onClick={() => removeImage('logo')} className="px-3 py-2 text-xs text-red-400 hover:bg-red-400/10 rounded-lg transition-colors">
                      Sil
                    </button>
                  )}
                </div>
              </div>

              {/* Favicon */}
              <div>
                <label className="block text-text-muted text-xs mb-2 font-medium">Favicon (brauzer nişanı)</label>
                <div className="flex items-center gap-3">
                  <div className="w-14 h-14 rounded-xl bg-navy-light border border-border flex items-center justify-center overflow-hidden shrink-0">
                    {branding.favicon_url
                      ? <img src={apiUrl(branding.favicon_url)} alt="favicon" className="max-h-10 max-w-10 object-contain" />
                      : <span className="text-accent text-sm">◆</span>}
                  </div>
                  <input ref={faviconRef} type="file" accept="image/*" className="hidden" onChange={e => uploadImage('favicon', e.target.files?.[0])} />
                  <button onClick={() => faviconRef.current?.click()} className="px-3.5 py-2 text-xs font-medium border border-border text-text-muted rounded-lg hover:text-white hover:border-accent/40 transition-colors">
                    Yüklə
                  </button>
                  {branding.favicon_url && (
                    <button onClick={() => removeImage('favicon')} className="px-3 py-2 text-xs text-red-400 hover:bg-red-400/10 rounded-lg transition-colors">
                      Sil
                    </button>
                  )}
                </div>
              </div>

              {/* Save */}
              <div className="flex items-center gap-3 pt-2 border-t border-border">
                <button
                  onClick={saveBranding}
                  disabled={saving || !dirty}
                  className="px-5 py-2.5 text-sm font-medium rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ backgroundColor: 'var(--accent-color)', color: '#000' }}
                >
                  {saving ? 'Saxlanılır...' : 'Yadda saxla'}
                </button>
                {dirty && (
                  <button
                    onClick={() => { setTitle(branding.title); setColor(branding.primary_color); }}
                    className="px-4 py-2.5 text-sm border border-border text-text-muted rounded-xl hover:text-white transition-colors"
                  >
                    Ləğv et
                  </button>
                )}
                {msg && <span className="text-green-400 text-xs flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  {msg}
                </span>}
              </div>
            </div>
          </div>

          {/* Passcode kartı */}
          <div className="bg-navy-surface border border-border rounded-2xl p-6">
            <SectionHeader
              iconPath="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
              title="Giriş kodu (rotating passcode)"
              subtitle="Qonaq olmayan istifadəçilərin sayt əlavə etməsi üçün. Hər 12 saatda avtomatik yenilənir."
            />
            <button
              onClick={regenerate}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm border border-accent/40 text-accent rounded-xl hover:bg-accent/10 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Kodu indi yenilə
            </button>
          </div>
        </div>

        {/* Sağ: canlı önizləmə (sticky) */}
        <div className="lg:col-span-1">
          <div className="bg-navy-surface border border-border rounded-2xl p-5 lg:sticky lg:top-6">
            <p className="text-text-muted text-xs font-medium mb-3">Canlı önizləmə</p>
            {/* Mini dashboard nümunəsi */}
            <div className="rounded-xl border border-border overflow-hidden">
              {/* header */}
              <div className="px-3 py-2.5 bg-navy-light flex items-center gap-2 border-b border-border">
                {branding.logo_url
                  ? <img src={apiUrl(branding.logo_url)} alt="" className="h-5 w-auto max-w-[80px] object-contain" />
                  : <span style={{ color }} className="text-sm">●</span>}
                <span className="text-white text-xs font-heading font-bold truncate">{title || 'Site Monitor'}</span>
              </div>
              {/* body */}
              <div className="p-3 space-y-2 bg-bg">
                <div className="h-2 w-3/4 rounded bg-navy-light" />
                <div className="h-2 w-1/2 rounded bg-navy-light" />
                <button
                  className="mt-1 px-3 py-1.5 rounded-lg text-xs font-medium"
                  style={{ backgroundColor: color, color: '#000' }}
                >
                  Nümunə düymə
                </button>
                <div className="flex gap-1.5 pt-1">
                  <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: `${color}22`, color }}>etiket</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-400/10 text-green-400">online</span>
                </div>
              </div>
            </div>
            <p className="text-text-muted/60 text-[11px] mt-3">
              Dəyişikliklər "Yadda saxla" ilə tətbiq olunur.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
