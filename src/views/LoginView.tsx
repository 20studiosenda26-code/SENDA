import { LiquidMetalButton } from "../components/ui/liquid-metal-button";
import { useState, useRef } from 'react';
import { useAuth } from '../lib/auth';
import { WELCOME_AUDIO_DATA_URI } from '../lib/welcomeVoiceData';
import { Mail, Lock, LogIn, AlertCircle } from 'lucide-react';
import sendaLogo from '../assets/senda-logo.png';
import { BrandBackground } from '../components/BrandBackground';

export function LoginView() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const btnWrapRef = useRef<HTMLDivElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      sessionStorage.setItem('senda_show_welcome_orb', '1');
      if (btnWrapRef.current) {
        const rect = btnWrapRef.current.getBoundingClientRect();
        const centerY = rect.top + rect.height / 2;
        sessionStorage.setItem('senda_orb_start_y', String(centerY));
        sessionStorage.setItem('senda_orb_start_w', String(rect.width));
      }
    } catch {
      // ignorar
    }

    // Preparamos el audio exacto de ElevenLabs incrustado en memoria
    const welcomeAudio = new Audio(WELCOME_AUDIO_DATA_URI);
    welcomeAudio.volume = 1.0;

    const result = await signIn(email, password);
    setLoading(false);

    if (result.error) {
      try {
        sessionStorage.removeItem('senda_show_welcome_orb');
      } catch {
        // ignorar
      }
      setError(result.error);
    } else {
      // ¡Dispara la voz de ElevenLabs DE UNA apenas el login es correcto y arranca la bolita!
      try {
        if ('speechSynthesis' in window) window.speechSynthesis.cancel();
        welcomeAudio.currentTime = 0;
        void welcomeAudio.play();
      } catch {
        // ignorar
      }
    }
  };

  return (
    <div className="min-h-screen bg-ink flex items-center justify-center p-4 relative overflow-hidden">
      <BrandBackground />

      <div className="w-full max-w-md relative z-10">
        <div className="flex flex-col items-center mb-8">
          <div className="relative mb-5">
            <div
              className="absolute inset-0 rounded-full blur-2xl opacity-40"
              style={{ background: 'radial-gradient(circle, var(--accent), transparent 70%)' }}
              aria-hidden="true"
            />
            <div className="relative w-20 h-20 rounded-2xl bg-surface-2 border border-line flex items-center justify-center overflow-hidden p-3 shadow-[0_0_0_1px_rgba(53,214,228,0.08),0_12px_32px_-8px_rgba(0,0,0,0.6)]">
              <img src={sendaLogo} alt="Senda" className="w-full h-full object-contain" />
            </div>
          </div>
          <h1 className="font-display text-3xl font-bold tracking-[0.08em]">SENDA</h1>
          <p className="text-muted mt-2 text-sm">Plataforma de gestión de clips y edición</p>
        </div>

        <form onSubmit={handleSubmit} className="relative bg-surface-2 border border-line rounded-2xl p-6 space-y-4 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.7)]">
          <div className="absolute top-0 left-6 right-6 h-px bg-gradient-to-r from-transparent via-accent/50 to-transparent" aria-hidden="true" />
          <div>
            <label className="text-sm font-medium block mb-1.5">Correo electrónico</label>
            <div className="relative">
              <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-2" />
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="tu@email.com"
                required
                className="w-full bg-surface-3 border border-line rounded-lg pl-9 pr-3 py-2.5 text-sm outline-none focus:border-accent transition-colors placeholder:text-muted-2"
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium block mb-1.5">Contraseña</label>
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-2" />
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full bg-surface-3 border border-line rounded-lg pl-9 pr-3 py-2.5 text-sm outline-none focus:border-accent transition-colors placeholder:text-muted-2"
              />
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
              <AlertCircle size={16} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div ref={btnWrapRef} className="pt-1 flex justify-center">
            <LiquidMetalButton
              type="submit"
              fullWidth
              loading={loading}
              label="Iniciar sesión"
              loadingLabel="Ingresando..."
              icon={LogIn}
              variant="cyan"
            />
          </div>
        </form>

        <p className="text-center text-xs text-muted-2 mt-6">
          Si no tienes acceso, contacta al administrador de la plataforma.
        </p>
      </div>
    </div>
  );
}
