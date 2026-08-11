// Rəng etiketləri. `value` birbaşa hex kodudur ki, inline style ilə göstərilə bilsin
// (Tailwind dinamik sinif adlarını build zamanı görməsə purge edir).
export const COLOR_TAGS = [
  { value: '', label: 'Yoxdur' },
  { value: '#ef4444', label: 'Qırmızı (vacib)' },
  { value: '#eab308', label: 'Sarı (daxili)' },
  { value: '#22c55e', label: 'Yaşıl' },
  { value: '#3b82f6', label: 'Mavi' },
] as const;

export function colorTagLabel(value: string | null | undefined): string {
  if (!value) return 'Yoxdur';
  return COLOR_TAGS.find(c => c.value === value)?.label ?? value;
}
