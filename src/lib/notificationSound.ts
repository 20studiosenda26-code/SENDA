// Sonido de notificación de SENDA: un carillón corto de dos notas,
// sintetizado con la Web Audio API (sin depender de ningún archivo .mp3).
// Esto mantiene el bundle liviano y evita problemas de licencias/assets.
// Las notas (A5 -> E6) están pensadas para sonar suave y "premium",
// coherentes con la identidad tech/creativa de SENDA: nada estridente,
// nada de más de ~400ms.

let sharedContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!sharedContext) sharedContext = new AudioCtx();
  return sharedContext;
}

function playTone(ctx: AudioContext, frequency: number, startOffset: number, duration: number, peakGain: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = frequency;
  osc.connect(gain);
  gain.connect(ctx.destination);

  const t0 = ctx.currentTime + startOffset;
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(peakGain, t0 + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

/**
 * Reproduce el sonido de notificación de SENDA: un pequeño carillón de
 * dos notas ascendentes, corto y agradable (~350ms en total). Si el
 * navegador bloquea el audio por política de autoplay (sin interacción
 * previa del usuario), falla en silencio sin romper nada.
 */
export function playNotificationChime() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }
    playTone(ctx, 880, 0, 0.18, 0.09); // A5
    playTone(ctx, 1318.51, 0.09, 0.26, 0.075); // E6
  } catch {
    // Nunca debe interrumpir la app por un problema de audio.
  }
}
