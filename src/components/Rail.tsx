import { useStore } from '../store';
import type { ViewKey, Role } from '../types';
import { Home, CheckSquare, MessageSquare, Calendar, GraduationCap, FileText, User, Shield, Settings, Moon, Sun } from 'lucide-react';
import sendaLogo from '../assets/senda-logo.png';

const NAV: { key: ViewKey; label: string; icon: typeof Home; roles: Role[] }[] = [
  { key: 'home', label: 'Inicio', icon: Home, roles: ['clipper', 'editor', 'admin'] },
  { key: 'tareas', label: 'Tareas', icon: CheckSquare, roles: ['clipper', 'editor', 'admin'] },
  { key: 'chat', label: 'Chat', icon: MessageSquare, roles: ['clipper', 'editor', 'admin'] },
  { key: 'calendario', label: 'Calendario', icon: Calendar, roles: ['clipper', 'editor', 'admin'] },
  { key: 'classroom', label: 'Classroom', icon: GraduationCap, roles: ['clipper', 'editor', 'admin'] },
  { key: 'contratos', label: 'Contratos', icon: FileText, roles: ['clipper', 'editor'] },
  { key: 'perfil', label: 'Perfil', icon: User, roles: ['clipper', 'editor', 'admin'] },
  { key: 'administracion', label: 'Admin', icon: Shield, roles: ['admin'] },
  { key: 'configuracion', label: 'Config', icon: Settings, roles: ['admin'] },
];

export function Rail() {
  const { role, view, setView, theme, toggleTheme, setSelectedClassroomModuleId } = useStore();
  const items = NAV.filter(n => n.roles.includes(role));

  return (
    <aside className="fixed left-0 top-0 h-full w-16 bg-surface border-r border-line flex flex-col items-center py-4 gap-1 z-50">
      <div className="w-9 h-9 rounded-lg bg-surface-3 border border-line flex items-center justify-center mb-3 shrink-0 overflow-hidden p-1">
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
    </aside>
  );
}
