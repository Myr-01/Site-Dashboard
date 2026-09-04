import { useEffect, useRef } from 'react';

/**
 * Modal focus-trap hook — production hardening.
 *
 * Bir modal açılanda:
 *  - əvvəlki fokuslanmış elementi (trigger düyməsi) yadda saxlayır;
 *  - fokusu modalın içinə gətirir (mövcud autoFocus input-a hörmət edir,
 *    yoxdursa ilk fokuslana bilən elementə);
 *  - Tab / Shift+Tab-ı modalın daxilində saxlayır (arxa səhifəyə çıxmır);
 *  - bağlananda fokusu trigger-ə qaytarır.
 *
 * Kitabxana istifadə etmədən minimal, klaviatura + ekran-oxuyucu üçün etibarlı.
 *
 * @param active trap aktiv olmalıdırmı (adətən modal açıqdır)
 * @returns modalın kök (container) elementinə bağlanacaq ref
 */
export function useFocusTrap<T extends HTMLElement = HTMLDivElement>(active = true) {
  const containerRef = useRef<T>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    // Açılışdan əvvəlki fokusu yadda saxla ki, bağlananda qaytaraq.
    previouslyFocused.current = document.activeElement as HTMLElement | null;

    const FOCUSABLE = [
      'a[href]',
      'button:not([disabled])',
      'textarea:not([disabled])',
      'input:not([disabled]):not([type="hidden"])',
      'select:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
    ].join(',');

    const getFocusable = (): HTMLElement[] =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement
      );

    // Fokusu modalın içinə gətir — əgər artıq içəridə deyilsə.
    // Mövcud autoFocus (məs. input) fokusuna hörmət et.
    const focusInitial = () => {
      if (container.contains(document.activeElement)) return;
      const focusable = getFocusable();
      (focusable[0] ?? container).focus();
    };
    // autoFocus mikrotaskdan sonra işlədiyi üçün bir tick gözlə.
    const t = setTimeout(focusInitial, 0);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const focusable = getFocusable();
      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeEl = document.activeElement as HTMLElement;

      if (e.shiftKey) {
        if (activeEl === first || !container.contains(activeEl)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (activeEl === last || !container.contains(activeEl)) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    container.addEventListener('keydown', handleKeyDown);

    return () => {
      clearTimeout(t);
      container.removeEventListener('keydown', handleKeyDown);
      // Fokusu trigger-ə qaytar (element hələ də DOM-dadırsa).
      const prev = previouslyFocused.current;
      if (prev && document.contains(prev)) {
        prev.focus();
      }
    };
  }, [active]);

  return containerRef;
}
