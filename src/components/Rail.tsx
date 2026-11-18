import { useEffect } from 'react';
import { useStore } from '../store';
import { useChatUnread } from '../lib/useChatUnread';
import type { ViewKey, Role } from '../types';
import { useAuth } from '../lib/auth';
import { Home, Sparkles, PlayCircle, CheckSquare, MessageSquare, Calendar, GraduationCap, FileText, User, Briefcase, DollarSign, Wallet, Gauge, Shield, Moon, Sun, LogOut } from 'lucide-react';
import sendaLogo from '../assets/senda-logo.png';

const NAV: { key: ViewKey; label: string; icon: typeof Home; roles: Role[] }[] = [
  { key: 'home', label: 'Inicio', icon: Home, roles: ['clipper', 'editor', 'admin', 'cliente'] },
  { key: 'brief', label: 'Mis proyectos', icon: Sparkles, roles: ['cliente'] },
  { key: 'revision', label: 'Revisión de videos', icon: PlayCircle, roles: ['cliente'] },
  { key: 'tareas', label: 'Tareas', icon: CheckSquare, roles: ['clipper', 'editor', 'admin'] },
  { key: 'clientes', label: 'Clientes', icon: Briefcase, roles: ['admin'] },
  { key: 'chat', label: 'Chat', icon: MessageSquare, roles: ['clipper', 'editor', 'admin', 'cliente'] },
  { key: 'calendario', label: 'Calendario', icon: Calendar, roles: ['clipper', 'editor', 'admin'] },
  { key: 'classroom', label: 'Classroom', icon: GraduationCap, roles: ['clipper', 'editor', 'admin'] },
  { key: 'contratos', label: 'Contratos', icon: FileText, roles: ['clipper', 'editor', 'admin'] },
  { key: 'perfil', label: 'Perfil', icon: User, roles: ['clipper', 'editor'] },
  { key: 'finanzas', label: 'Finanzas', icon: DollarSign, roles: ['admin'] },
  { key: 'nominas', label: 'Nóminas', icon: Wallet, roles: ['admin'] },
  { key: 'capacidad', label: 'Capacidad', icon: Gauge, roles: ['admin'] },
  { key: 'administracion', label: 'Admin', icon: Shield, roles: ['admin'] },
];

export function Rail({ onSignOut }: { onSignOut: () => void }) {
  const { view, setView, theme, toggleTheme, setSelectedClassroomModuleId } = useStore();
  const { user } = useAuth();
  const role = user?.role || 'clipper';
  const items = NAV.filter(n => n.roles.includes(role));
  const { total: chatUnread } = useChatUnread();

  // Número de mensajes sin leer también en la pestaña del navegador: "(2) SENDA"
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\)\s*/, '');
    document.title = chatUnread > 0 ? `(${chatUnread > 99 ? '99+' : chatUnread}) ${base}` : base;
  }, [chatUnread]);

  return (
    <aside className="fixed left-0 top-0 h-full w-16 bg-surface border-r border-line flex flex-col items-center py-4 gap-1 z-50">
      <div className="w-9 h-9 rounded-lg bg-surface-3 border border-line flex items-center justify-center mb-3 shrink-0 overflow-hidden p-1.5 shadow-[0_0_0_1px_rgba(53,214,228,0.06),0_0_16px_-4px_rgba(53,214,228,0.35)]">
        <img src={sendaLogo} alt="Senda" className="w-full h-full object-contain" />
      </div>
      <nav className="flex-1 flex flex-col gap-1 overflow-y-auto">
        {items.map(item => {
          const Icon = item.icon;
          const active = view === item.key;
          return (
            <button
              key={item.key}
              onClick={() => { if (item.key === 'classroom') setSelectedClassroomModuleId(null); setView(item.key); }}
              title={item.label}
              className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-150 group relative ${
                active ? 'bg-accent-dim text-accent' : 'text-muted hover:text-text hover:bg-surface-2'
              }`}
            >
              <Icon size={20} strokeWidth={active ? 2.5 : 2} />
              {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-accent rounded-r-full" />}
              {item.key === 'chat' && chatUnread > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[17px] h-[17px] px-1 rounded-full bg-accent text-on-accent text-[10px] font-bold flex items-center justify-center shadow-[0_0_10px_rgba(53,214,228,0.6)] animate-pulse">
                  {chatUnread > 99 ? '99+' : chatUnread}
                </span>
              )}
            </button>
          );
        })}
      </nav>
      <button
        onClick={toggleTheme}
        title="Cambiar tema"
        className="w-10 h-10 rounded-lg flex items-center justify-center text-muted hover:text-text hover:bg-surface-2 transition-colors"
      >
        {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
      </button>
      <button
        onClick={onSignOut}
        title="Cerrar sesión"
        className="w-10 h-10 rounded-lg flex items-center justify-center text-muted hover:text-red-400 hover:bg-surface-2 transition-colors"
      >
        <LogOut size={20} />
      </button>
    </aside>
  );
}
