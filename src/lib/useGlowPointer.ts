import { useEffect } from 'react';

/** Un solo escucha global: mueve el foco de luz de la tarjeta ".glow-card" bajo el cursor. */
export function useGlowPointer() {
  useEffect(() => {
    let last: HTMLElement | null = null;
    const onMove = (e: PointerEvent) => {
      const el = (e.target as HTMLElement | null)?.closest?.('.glow-card') as HTMLElement | null;
      if (!el) { last = null; return; }
      const r = el.getBoundingClientRect();
      el.style.setProperty('--gx', `${e.clientX - r.left}px`);
      el.style.setProperty('--gy', `${e.clientY - r.top}px`);
      last = el;
    };
    document.addEventListener('pointermove', onMove, { passive: true });
    return () => { document.removeEventListener('pointermove', onMove); void last; };
  }, []);
}
