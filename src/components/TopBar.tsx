import { useStore } from '../store';
import type { NotificationCategory, Role } from '../types';
import { Bell, ChevronDown, X, Trash2, Briefcase, Film, ClipboardCheck, Flame, DollarSign, MessageSquare, Info } from 'lucide-react';
import { useState } from 'react';
import sendaLogo from '../assets/senda-logo.png';

const CATEGORY_ICON: Record<NotificationCategory, typeof Bell> = {
  trabajo_asignado: Briefcase,
  clips_enviados: Film,
  qc_clip: ClipboardCheck,
  qc_video: ClipboardCheck,
  racha: Flame,
  pago_50: DollarSign,
  pago_100: DollarSign,
  mensaje: MessageSquare,
  sistema: Info,
};

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'ahora mismo';
  if (mins < 60) return `hace ${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.floor(hours / 24);
  return `hace ${days}d`;
}

const ROLE_LABELS: Record<Role, string> = {
  clipper: 'Clipper',
  editor: 'Editora',
  admin: 'Admin',
};

const VIEW_TITLES: Record<string, string> = {
  home: 'Inicio',
  tareas: 'Tareas',
  chat: 'Chat',
  calendario: 'Calendario',
  classroom: 'Classroom',
  contratos: 'Contratos',
  perfil: 'Perfil',
  administracion: 'Administración',
  configuracion: 'Configuración',
};

export function TopBar() {
  const { role, setRole, view, notifications, deleteNotification, clearNotifications, workers, currentWorkerId, setCurrentWorkerId } = useStore();
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const worker = workers.find(w => w.id === currentWorkerId);
  // El admin ve todos los movimientos de todos; clíper y editor solo ven lo
  // dirigido a su propio usuario (o difundido a todo su rol sin workerId).
  const roleNotifs = notifications
    .filter(n => n.role === role && (role === 'admin' || !n.workerId || n.workerId === currentWorkerId))
    .sort((a, b) => new Date(b.t).getTime() - new Date(a.t).getTime());

  return (
    <header className="sticky top-0 z-40 h-16 bg-surface/80 backdrop-blur-md border-b border-line flex items-center justify-between px-6">
      <div className="flex items-center gap-3">
        <h1 className="font-display text-xl font-semibold">{VIEW_TITLES[view] || 'Senda'}</h1>
      </div>
      <div className="flex items-center gap-3">
        <div className="hidden sm:flex items-center gap-2 bg-surface-2 border border-line rounded-lg pl-1.5 pr-3 py-1">
          <img src={sendaLogo} alt="Senda" className="w-6 h-6 object-contain" />
          <span className="font-display font-semibold text-sm">SENDA</span>
        </div>
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
              <div className="absolute right-0 mt-2 w-96 bg-surface-2 border border-line rounded-xl shadow-xl z-50 overflow-hidden">
                <div className="px-4 py-3 border-b border-line flex items-center justify-between">
                  <span className="text-sm font-semibold">Notificaciones {roleNotifs.length > 0 && `(${roleNotifs.length})`}</span>
                  {role === 'admin' && roleNotifs.length > 0 && (
                    <button
                      onClick={() => clearNotifications('admin')}
                      className="text-xs text-muted hover:text-red-400 flex items-center gap-1 transition-colors"
                    >
                      <Trash2 size={12} /> Borrar todas
                    </button>
                  )}
                </div>
                <div className="max-h-96 overflow-y-auto">
                  {roleNotifs.length === 0 && <div className="px-4 py-6 text-sm text-muted text-center">Sin notificaciones</div>}
                  {roleNotifs.map(n => {
                    const Icon = CATEGORY_ICON[n.category] || Bell;
                    return (
                      <div key={n.id} className="px-4 py-3 border-b border-line/50 hover:bg-surface-3 transition-colors flex items-start gap-2.5 group">
                        <div className="w-7 h-7 rounded-md bg-accent-dim flex items-center justify-center text-accent shrink-0 mt-0.5">
                          <Icon size={13} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-text">{n.text}</p>
                          <p className="text-xs text-muted-2 mt-0.5">{timeAgo(n.t)}</p>
                        </div>
                        <button
                          onClick={() => deleteNotification(n.id)}
                          className="text-muted-2 hover:text-red-400 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Eliminar notificación"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    );
                  })}
                </div>
                {(role === 'clipper' || role === 'editor') && roleNotifs.length > 0 && (
                  <div className="px-4 py-2 text-[10px] text-muted-2 border-t border-line text-center">
                    Las notificaciones se reinician automáticamente cada 24 horas
                  </div>
                )}
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
