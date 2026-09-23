import { useState } from 'react';
import { useAuth } from '../lib/auth';
import { Mail, Lock, LogIn, AlertCircle, Loader2 } from 'lucide-react';
import sendaLogo from '../assets/senda-logo.png';

export function LoginView() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const result = await signIn(email, password);
    setLoading(false);
    if (result.error) setError(result.error);
  };

  return (
    <div className="min-h-screen bg-ink flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-surface-2 border border-line flex items-center justify-center overflow-hidden p-2 mb-4">
            <img src={sendaLogo} alt="Senda" className="w-full h-full object-contain" />
          </div>
          <h1 className="font-display text-3xl font-bold">SENDA</h1>
          <p className="text-muted mt-2 text-sm">Plataforma de gestión de clips y edición</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-surface-2 border border-line rounded-2xl p-6 space-y-4">
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

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-accent text-on-accent rounded-lg py-2.5 font-medium hover:bg-accent-strong transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : <LogIn size={18} />}
            {loading ? 'Ingresando...' : 'Iniciar sesión'}
          </button>
        </form>

        <p className="text-center text-xs text-muted-2 mt-6">
          Si no tienes acceso, contacta al administrador de la plataforma.
        </p>
      </div>
    </div>
  );
}
