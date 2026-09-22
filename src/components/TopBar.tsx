import { useStore } from '../store';
import type { Role } from '../types';
import { Bell, ChevronDown } from 'lucide-react';
import { useState } from 'react';

const ROLE_LABELS: Record<Role, string> = {
  clipper: 'Clipper',
  editor: 'Editora',
  admin: 'Admin',
};

const VIEW_TITLES: Record<string, string> = {
  home: 'Inicio',
  tareas: 'Tareas',
  chat: 'Chat',
  carpeta: 'Carpeta',
  calendario: 'Calendario',
  classroom: 'Classroom',
  contratos: 'Contratos',
  perfil: 'Perfil',
  administracion: 'Administración',
  configuracion: 'Configuración',
};

export function TopBar() {
  const { role, setRole, view, notifications, workers, currentWorkerId, setCurrentWorkerId } = useStore();
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const worker = workers.find(w => w.id === currentWorkerId);
  const roleNotifs = notifications.filter(n => n.role === role);

  return (
    <header className="sticky top-0 z-40 h-16 bg-surface/80 backdrop-blur-md border-b border-line flex items-center justify-between px-6">
      <h1 className="font-display text-xl font-semibold">{VIEW_TITLES[view] || 'Senda'}</h1>
      <div className="flex items-center gap-3">
        <div className="flex bg-surface-2 rounded-lg p-0.5 border border-line">
          {(['clipper', 'editor', 'admin'] as Role[]).map(r => (
            <button
              key={r}
              onClick={() => setRole(r)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                role === r ? 'bg-accent text-on-accent' : 'text-muted hover:text-text'
              }`}
            >
              {ROLE_LABELS[r]}
            </button>
          ))}
        </div>

        <div className="relative">
          <button
            onClick={() => setNotifOpen(o => !o)}
            className="relative w-10 h-10 rounded-lg bg-surface-2 border border-line flex items-center justify-center text-muted hover:text-text transition-colors"
          >
            <Bell size={18} />
            {roleNotifs.length > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-accent rounded-full" />
            )}
          </button>
          {notifOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setNotifOpen(false)} />
              <div className="absolute right-0 mt-2 w-80 bg-surface-2 border border-line rounded-xl shadow-xl z-50 overflow-hidden">
                <div className="px-4 py-3 border-b border-line text-sm font-semibold">Notificaciones</div>
                <div className="max-h-80 overflow-y-auto">
                  {roleNotifs.length === 0 && <div className="px-4 py-6 text-sm text-muted text-center">Sin notificaciones</div>}
                  {roleNotifs.map((n, i) => (
                    <div key={i} className="px-4 py-3 border-b border-line/50 hover:bg-surface-3 transition-colors">
                      <p className="text-sm text-text">{n.text}</p>
                      <p className="text-xs text-muted-2 mt-0.5">{n.t}</p>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="relative">
          <button
            onClick={() => setProfileOpen(o => !o)}
            className="flex items-center gap-2 bg-surface-2 border border-line rounded-lg pl-2 pr-3 py-1.5 hover:border-accent transition-colors"
          >
            <div className="w-7 h-7 rounded-md bg-accent-dim flex items-center justify-center">
              <span className="text-sm font-semibold text-accent">
                {worker?.name.charAt(0) || '?'}
              </span>
            </div>
            <span className="text-sm font-medium">{worker?.name || 'Usuario'}</span>
            <ChevronDown size={14} className="text-muted" />
          </button>
          {profileOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setProfileOpen(false)} />
              <div className="absolute right-0 mt-2 w-56 bg-surface-2 border border-line rounded-xl shadow-xl z-50 overflow-hidden">
                <div className="px-4 py-3 border-b border-line">
                  <p className="text-sm font-semibold">{worker?.name}</p>
                  <p className="text-xs text-muted">{ROLE_LABELS[role]}</p>
                </div>
                <div className="py-1">
                  {workers.map(w => (
                    <button
                      key={w.id}
                      onClick={() => { setCurrentWorkerId(w.id); setProfileOpen(false); }}
                      className={`w-full text-left px-4 py-2 text-sm hover:bg-surface-3 transition-colors flex items-center justify-between ${
                        w.id === currentWorkerId ? 'text-accent' : 'text-text'
                      }`}
                    >
                      {w.name}
                      <span className="text-xs text-muted-2">{w.cargo}</span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
