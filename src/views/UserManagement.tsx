import { useState } from 'react';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabaseClient';
import { UserPlus, X, Users, Mail, Shield, Trash2, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import type { Role } from '../types';
import type { AuthUser } from '../lib/auth';

export function UserManagement() {
  const { session } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRole, setFormRole] = useState<Role>('clipper');
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const loadUsers = async () => {
    if (!supabase || loaded) return;
    setLoading(true);
    const { data } = await supabase.from('profiles').select('id, name, role').order('created_at', { ascending: false });
    if (data) {
      const { data: authData } = await supabase.auth.admin.listUsers();
      const emailMap = new Map<string, string>();
      if (authData?.users) {
        for (const u of authData.users) emailMap.set(u.id, u.email || '');
      }
      setUsers(data.map(p => ({
        id: p.id,
        email: emailMap.get(p.id) || '',
        name: p.name,
        role: p.role as Role,
      })));
    }
    setLoaded(true);
    setLoading(false);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);
    if (!formName || !formEmail || !formPassword || !formRole) {
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
          name: formName,
          email: formEmail,
          password: formPassword,
          role: formRole,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        setFormError(result.error || 'Error al crear usuario');
      } else {
        setFormSuccess(`Usuario "${formName}" creado correctamente`);
        setFormName('');
        setFormEmail('');
        setFormPassword('');
        setFormRole('clipper');
        setLoaded(false);
        loadUsers();
        setTimeout(() => setFormSuccess(null), 3000);
      }
    } catch (err) {
      setFormError('Error de conexión');
    }
    setLoading(false);
  };

  loadUsers();

  return (
    <div className="bg-surface-2 border border-line rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display text-lg font-semibold flex items-center gap-2">
          <Users size={20} className="text-accent" /> Gestión de usuarios
        </h3>
        <button
          onClick={() => setShowForm(s => !s)}
          className="flex items-center gap-1.5 bg-accent text-on-accent rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-accent-strong transition-colors"
        >
          <UserPlus size={16} /> Nuevo usuario
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="mb-4 bg-surface-3 border border-line rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold">Crear nuevo usuario</h4>
            <button type="button" onClick={() => setShowForm(false)} className="text-muted hover:text-text"><X size={16} /></button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted block mb-1">Nombre</label>
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
            <div className="flex items-center gap-2 text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
              <AlertCircle size={14} /> {formError}
            </div>
          )}
          {formSuccess && (
            <div className="flex items-center gap-2 text-sm text-mint bg-mint/10 border border-mint/20 rounded-lg px-3 py-2">
              <CheckCircle2 size={14} /> {formSuccess}
            </div>
          )}
          <button type="submit" disabled={loading} className="w-full bg-accent text-on-accent rounded-lg py-2 text-sm font-medium hover:bg-accent-strong transition-colors flex items-center justify-center gap-2 disabled:opacity-50">
            {loading ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />} Crear usuario
          </button>
        </form>
      )}

      {users.length === 0 ? (
        <p className="text-sm text-muted text-center py-4">No hay usuarios registrados</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted text-xs border-b border-line">
                <th className="py-2 pr-4 font-medium">Nombre</th>
                <th className="py-2 pr-4 font-medium">Correo</th>
                <th className="py-2 pr-4 font-medium">Rol</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className="border-b border-line/50">
                  <td className="py-3 pr-4 font-medium">{u.name}</td>
                  <td className="py-3 pr-4 text-muted">{u.email}</td>
                  <td className="py-3 pr-4">
                    <span className={`text-xs px-2 py-1 rounded-md flex items-center gap-1 w-fit ${u.role === 'admin' ? 'bg-violet-dim text-violet' : u.role === 'editor' ? 'bg-mint-dim text-mint' : 'bg-accent-dim text-accent'}`}>
                      <Shield size={12} /> {u.role}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
