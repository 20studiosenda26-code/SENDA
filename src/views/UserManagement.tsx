import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../lib/auth';
import { supabase, loadShared, saveShared } from '../lib/supabaseClient';
import {
  UserPlus, X, Users, Shield, Loader2, AlertCircle, CheckCircle2,
  ChevronDown, Search, Mail, Copy, Check,
} from 'lucide-react';
import type { Role } from '../types';
import type { AuthUser } from '../lib/auth';

export function UserManagement() {
  const { session, user: currentUser } = useAuth();
  const [isExpanded, setIsExpanded] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'todos' | Role>('todos');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRole, setFormRole] = useState<Role>('clipper');
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const loadUsers = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const [{ data }, storedEmails] = await Promise.all([
      supabase.from('profiles').select('id, name, role, contact_email').order('created_at', { ascending: false }),
      loadShared<Record<string, string>>('user_emails'),
    ]);
    const emailMap = storedEmails || {};

    if (data) {
      setUsers(data.map((p: Record<string, unknown>) => {
        const id = p.id as string;
        const contactEmail = (p.contact_email as string) || '';
        const fallbackEmail = emailMap[id] || (currentUser?.id === id ? currentUser.email : '');
        return {
          id,
          email: contactEmail || fallbackEmail || '',
          name: (p.name as string) || '',
          role: p.role as Role,
        };
      }));
    }
    setLoading(false);
  }, [currentUser?.id, currentUser?.email]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers, reloadKey]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);
    if (!formName.trim() || !formEmail.trim() || !formPassword || !formRole) {
      setFormError('Todos los campos son obligatorios');
      return;
    }

    setLoading(true);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/create-user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          name: formName.trim(),
          email: formEmail.trim(),
          password: formPassword,
          role: formRole,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        setFormError(result.error || 'Error al crear usuario');
      } else {
        // Aseguramos que el correo quede guardado tanto en profiles.contact_email como en platform_kv (user_emails)
        if (result.id && supabase) {
          await supabase.from('profiles').update({ contact_email: formEmail.trim() }).eq('id', result.id);
          const existingMap = (await loadShared<Record<string, string>>('user_emails')) || {};
          await saveShared('user_emails', { ...existingMap, [result.id]: formEmail.trim() });
        }
        setFormSuccess(`Usuario "${formName.trim()}" (${formEmail.trim()}) creado correctamente`);
        setFormName('');
        setFormEmail('');
        setFormPassword('');
        setFormRole('clipper');
        setReloadKey(k => k + 1);
        setTimeout(() => setFormSuccess(null), 4000);
      }
    } catch {
      setFormError('Error de conexión');
    }
    setLoading(false);
  };

  const counts = useMemo(() => {
    return {
      total: users.length,
      clipper: users.filter(u => u.role === 'clipper').length,
      editor: users.filter(u => u.role === 'editor').length,
      admin: users.filter(u => u.role === 'admin').length,
    };
  }, [users]);

  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      if (roleFilter !== 'todos' && u.role !== roleFilter) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return u.name.toLowerCase().includes(q) || (u.email && u.email.toLowerCase().includes(q)) || u.role.toLowerCase().includes(q);
    });
  }, [users, roleFilter, search]);

  const copyEmail = (id: string, email: string) => {
    if (!email) return;
    void navigator.clipboard?.writeText(email);
    setCopiedId(id);
    setTimeout(() => setCopiedId(prev => (prev === id ? null : prev)), 1800);
  };

  return (
    <div className="bg-surface-2 border border-line rounded-xl overflow-hidden transition-all">
      {/* Cabecera compacta con flechita desplegable */}
      <div className="p-4 sm:px-5 flex items-center justify-between gap-3 flex-wrap">
        <button
          type="button"
          onClick={() => setIsExpanded(v => !v)}
          className="flex items-center gap-3 text-left group flex-1 min-w-[220px]"
        >
          <div className="w-10 h-10 rounded-lg bg-accent-dim text-accent flex items-center justify-center shrink-0 group-hover:bg-accent/20 transition-colors">
            <Users size={20} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-display text-base sm:text-lg font-semibold group-hover:text-accent transition-colors">
                Gestión de usuarios
              </h3>
              <span className="font-tech text-[11px] px-2 py-0.5 rounded-full bg-surface-3 border border-line text-muted">
                {counts.total} registrados
              </span>
            </div>
            <p className="text-xs text-muted-2 truncate">
              {counts.clipper} Clippers · {counts.editor} Editores · {counts.admin} Admins — {isExpanded ? 'Haz clic para ocultar la lista' : 'Haz clic en la flecha para desplegar el directorio'}
            </p>
          </div>
        </button>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              setShowForm(s => !s);
              if (!showForm) setIsExpanded(true);
            }}
            className="flex items-center gap-1.5 bg-accent text-on-accent rounded-lg px-3 py-2 text-xs sm:text-sm font-medium hover:bg-accent-strong transition-colors"
          >
            <UserPlus size={15} /> Nuevo usuario
          </button>
          <button
            type="button"
            onClick={() => setIsExpanded(v => !v)}
            title={isExpanded ? 'Ocultar lista de usuarios' : 'Desplegar lista de usuarios'}
            className={`w-9 h-9 rounded-lg border flex items-center justify-center transition-all ${
              isExpanded
                ? 'bg-accent-dim border-accent/40 text-accent'
                : 'bg-surface-3 border-line text-muted hover:text-text hover:border-accent/40'
            }`}
          >
            <ChevronDown size={18} className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {/* Contenido desplegable */}
      {isExpanded && (
        <div className="border-t border-line px-4 sm:px-5 pb-5 pt-4 space-y-4">
          {showForm && (
            <form onSubmit={handleCreate} className="bg-surface-3 border border-line rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <UserPlus size={15} className="text-accent" /> Crear nuevo usuario
                </h4>
                <button type="button" onClick={() => setShowForm(false)} className="text-muted hover:text-text">
                  <X size={16} />
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="text-xs text-muted block mb-1">Nombre completo</label>
                  <input value={formName} onChange={e => setFormName(e.target.value)} placeholder="Juan Pérez" className="w-full bg-surface-2 border border-line rounded-md px-3 py-2 text-sm outline-none focus:border-accent" />
                </div>
                <div>
                  <label className="text-xs text-muted block mb-1">Correo electrónico</label>
                  <input type="email" value={formEmail} onChange={e => setFormEmail(e.target.value)} placeholder="juan@email.com" className="w-full bg-surface-2 border border-line rounded-md px-3 py-2 text-sm outline-none focus:border-accent" />
                </div>
                <div>
                  <label className="text-xs text-muted block mb-1">Contraseña</label>
                  <input type="password" value={formPassword} onChange={e => setFormPassword(e.target.value)} placeholder="••••••••" className="w-full bg-surface-2 border border-line rounded-md px-3 py-2 text-sm outline-none focus:border-accent" />
                </div>
                <div>
                  <label className="text-xs text-muted block mb-1">Rol</label>
                  <select value={formRole} onChange={e => setFormRole(e.target.value as Role)} className="w-full bg-surface-2 border border-line rounded-md px-3 py-2 text-sm outline-none focus:border-accent">
                    <option value="clipper">Clipper</option>
                    <option value="editor">Editora</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              </div>
              {formError && (
                <div className="flex items-center gap-2 text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
                  <AlertCircle size={14} /> {formError}
                </div>
              )}
              {formSuccess && (
                <div className="flex items-center gap-2 text-xs text-mint bg-mint/10 border border-mint/20 rounded-lg px-3 py-2">
                  <CheckCircle2 size={14} /> {formSuccess}
                </div>
              )}
              <div className="flex justify-end">
                <button type="submit" disabled={loading} className="bg-accent text-on-accent rounded-lg px-4 py-2 text-xs sm:text-sm font-medium hover:bg-accent-strong transition-colors flex items-center justify-center gap-2 disabled:opacity-50">
                  {loading ? <Loader2 size={15} className="animate-spin" /> : <UserPlus size={15} />} Guardar usuario
                </button>
              </div>
            </form>
          )}

          {/* Barra de búsqueda y filtro por rol */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-2" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar por nombre o correo..."
                className="w-full bg-surface-3 border border-line rounded-lg pl-8 pr-3 py-1.5 text-xs sm:text-sm outline-none focus:border-accent"
              />
            </div>
            <div className="flex items-center gap-1 bg-surface-3 border border-line rounded-lg p-1">
              {(['todos', 'clipper', 'editor', 'admin'] as const).map(r => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRoleFilter(r)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                    roleFilter === r ? 'bg-accent text-on-accent' : 'text-muted hover:text-text'
                  }`}
                >
                  {r === 'todos' ? `Todos (${counts.total})` : r === 'clipper' ? `Clippers (${counts.clipper})` : r === 'editor' ? `Editores (${counts.editor})` : `Admins (${counts.admin})`}
                </button>
              ))}
            </div>
          </div>

          {/* Lista compacta con altura máxima controlada para 30-40+ usuarios */}
          {filteredUsers.length === 0 ? (
            <p className="text-sm text-muted text-center py-6">No se encontraron usuarios con ese criterio</p>
          ) : (
            <div className="max-h-72 overflow-y-auto rounded-lg border border-line bg-surface-3/40 divide-y divide-line/60">
              {filteredUsers.map(u => (
                <div key={u.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5 hover:bg-surface-3 transition-colors">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-8 h-8 rounded-lg bg-surface-2 border border-line flex items-center justify-center text-xs font-bold text-accent shrink-0">
                      {u.name.charAt(0).toUpperCase() || '?'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{u.name}</p>
                      <div className="flex items-center gap-1.5 text-xs text-muted truncate">
                        <Mail size={11} className="text-muted-2 shrink-0" />
                        {u.email ? (
                          <>
                            <span className="font-tech text-[11px] truncate">{u.email}</span>
                            <button
                              type="button"
                              onClick={() => copyEmail(u.id, u.email)}
                              title="Copiar correo"
                              className="text-muted-2 hover:text-accent transition-colors shrink-0"
                            >
                              {copiedId === u.id ? <Check size={11} className="text-mint" /> : <Copy size={11} />}
                            </button>
                          </>
                        ) : (
                          <span className="text-muted-2 italic text-[11px]">Se sincronizará al iniciar sesión o desde Perfil</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <span className={`text-[11px] px-2.5 py-1 rounded-md flex items-center gap-1 shrink-0 font-medium ${
                    u.role === 'admin' ? 'bg-violet-dim text-violet' : u.role === 'editor' ? 'bg-mint-dim text-mint' : 'bg-accent-dim text-accent'
                  }`}>
                    <Shield size={11} /> {u.role === 'clipper' ? 'Clipper' : u.role === 'editor' ? 'Editor(a)' : 'Admin'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
