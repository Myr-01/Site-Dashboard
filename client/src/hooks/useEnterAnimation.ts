import { useState, useEffect } from 'react';

/**
 * Modal/dialog giriş animasiyası üçün etibarlı hook.
 * setTimeout(10ms) hack-i əvəzinə double-requestAnimationFrame istifadə edir —
 * bu, brauzerin ilk render-i commit etdiyinə əmin olur, sonra animasiyanı tetikləyir.
 */
export function useEnterAnimation(): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let raf1: number, raf2: number;
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setVisible(true));
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, []);

  return visible;
}
