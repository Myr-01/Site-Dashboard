import { useState, useRef } from 'react';
import { adminApi } from '../useAuth';
import { useBranding } from '../BrandingContext';
import { apiUrl } from '../api';
import { dialog } from './Dialog';

export default function AdminSettings() {
  const { branding, applyBranding, reloadBranding } = useBranding();
  const [title, setTitle] = useState(branding.title);
  const [color, setColor] = useState(branding.primary_color);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const logoRef = useRef<HTMLInputElement>(null);
  const faviconRef = useRef<HTMLInputElement>(null);

  const saveBranding = async () => {
    setSaving(true);
    setMsg('');
    try {
      const updated = await adminApi.saveBranding({ title, primary_color: color });
      applyBranding(updated);
      setMsg('Yadda saxlanıldı');
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
    } catch (err) {
      await dialog.alert(err instanceof Error ? err.message : 'Yükləmə xətası', 'Xəta');
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
    <div className="max-w-2xl">
      {/* Branding */}
      <div className="bg-navy-surface border border-border rounded-2xl p-6 mb-6">
        <h3 className="text-white font-medium mb-1">Görünüş (Branding)</h3>
        <p className="text-text-muted text-xs mb-5">Dashboard-un adı, rəngi və loqosu</p>

        <div className="space-y-5">
          {/* Başlıq */}
          <div>
            <label className="block text-text-muted text-xs mb-1.5">Dashboard adı</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              maxLength={60}
              className="w-full px-3 py-2 bg-navy-light border border-border rounded-lg text-white text-sm focus:outline-none focus:border-accent transition-colors"
            />
          </div>

          {/* Rəng */}
          <div>
            <label className="block text-text-muted text-xs mb-1.5">Vurğu rəngi (accent)</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={color}
                onChange={e => setColor(e.target.value)}
                className="w-12 h-9 rounded border border-border bg-navy-light cursor-pointer"
              />
              <input
                type="text"
                value={color}
                onChange={e => setColor(e.target.value)}
                placeholder="#fca311"
                className="w-32 px-3 py-2 bg-navy-light border border-border rounded-lg text-white text-sm font-mono focus:outline-none focus:border-accent transition-colors"
              />
              <span className="text-text-muted text-xs">Dərhal önizləmə üçün Yadda saxla</span>
            </div>
          </div>

          {/* Logo */}
          <div>
            <label className="block text-text-muted text-xs mb-1.5">Logo</label>
            <div className="flex items-center gap-3">
              {branding.logo_url && (
                <img src={apiUrl(branding.logo_url)} alt="logo" className="h-9 w-auto max-w-[120px] object-contain bg-navy-light rounded p-1 border border-border" />
              )}
              <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={e => uploadImage('logo', e.target.files?.[0])} />
              <button onClick={() => logoRef.current?.click()} className="px-3 py-2 text-xs border border-border text-text-muted rounded-lg hover:text-white transition-colors">
                Logo yüklə
              </button>
            </div>
          </div>

          {/* Favicon */}
          <div>
            <label className="block text-text-muted text-xs mb-1.5">Favicon (brauzer nişanı)</label>
            <div className="flex items-center gap-3">
              {branding.favicon_url && (
                <img src={apiUrl(branding.favicon_url)} alt="favicon" className="h-8 w-8 object-contain bg-navy-light rounded p-1 border border-border" />
              )}
              <input ref={faviconRef} type="file" accept="image/*" className="hidden" onChange={e => uploadImage('favicon', e.target.files?.[0])} />
              <button onClick={() => faviconRef.current?.click()} className="px-3 py-2 text-xs border border-border text-text-muted rounded-lg hover:text-white transition-colors">
                Favicon yüklə
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={saveBranding}
              disabled={saving}
              className="px-4 py-2 text-sm bg-accent text-bg font-medium rounded-lg hover:bg-accent/80 transition-colors disabled:opacity-50"
            >
              {saving ? 'Saxlanılır...' : 'Yadda saxla'}
            </button>
            <button
              onClick={() => reloadBranding()}
              className="px-4 py-2 text-sm border border-border text-text-muted rounded-lg hover:text-white transition-colors"
            >
              Sıfırla
            </button>
            {msg && <span className="text-green-400 text-xs">{msg}</span>}
          </div>
        </div>
      </div>

      {/* Passcode */}
      <div className="bg-navy-surface border border-border rounded-2xl p-6">
        <h3 className="text-white font-medium mb-1">Giriş kodu (rotating passcode)</h3>
        <p className="text-text-muted text-xs mb-4">
          Qonaq olmayan istifadəçilərin sayt əlavə etməsi / məlumatlara baxması üçün kod. Hər 12 saatda avtomatik yenilənir.
        </p>
        <button
          onClick={regenerate}
          className="px-4 py-2 text-sm border border-accent text-accent rounded-lg hover:bg-accent/10 transition-colors"
        >
          Kodu indi yenilə
        </button>
      </div>
    </div>
  );
}
