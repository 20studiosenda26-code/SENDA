import { useStore } from '../store';
import { useAuth } from '../lib/auth';
import { uploadSharedFile, isSupabaseConfigured } from '../lib/supabaseClient';
import { useState, useMemo, useRef, useEffect } from 'react';
import { Send, Search, Paperclip, Plus, X, Users, Bell, Loader2, Download, Check } from 'lucide-react';
import type { NotificationCategory } from '../types';

function timeShort(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
}

const CATEGORY_LABEL: Record<NotificationCategory, string> = {
  trabajo_asignado: 'Trabajo asignado',
  clips_enviados: 'Clips enviados',
  qc_clip: 'QC de clip',
  qc_video: 'QC de video',
  racha: 'Racha',
  pago_50: 'Pago 50%',
  pago_100: 'Pago 100%',
  mensaje: 'Mensaje',
  sistema: 'Sistema',
};

export function ChatView() {
  const {
    role, chatGroups, chatMessages, workers, adminProfiles, createChatGroup, sendChatGroupMessage,
    notificationsArchive,
  } = useStore();
  const { user } = useAuth();
  const isAdmin = role === 'admin';

  // 'notif' = pestaña especial de solo lectura con todas las notificaciones.
  const [activeId, setActiveId] = useState<string>('notif');
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [showNewDm, setShowNewDm] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [attachedFile, setAttachedFile] = useState<{ name: string; url: string } | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const myGroups = useMemo(() => {
    const list = isAdmin ? chatGroups : chatGroups.filter(g => user && g.memberIds.includes(user.id));
    return list
      .filter(g => !search || g.name.toLowerCase().includes(search.toLowerCase()))
      .slice()
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [chatGroups, isAdmin, user, search]);

  const activeGroup = activeId === 'notif' ? null : chatGroups.find(g => g.id === activeId) || null;
  const activeMessages = useMemo(
    () => (activeGroup ? chatMessages.filter(m => m.groupId === activeGroup.id).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) : []),
    [chatMessages, activeGroup]
  );

  const myNotifications = useMemo(
    () => notificationsArchive.filter(n => n.role === role && (!n.workerId || n.workerId === user?.id))
      .sort((a, b) => new Date(b.t).getTime() - new Date(a.t).getTime()),
    [notificationsArchive, role, user?.id]
  );

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [activeMessages.length, activeId]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploadingFile(true);
    const url = await uploadSharedFile(f, 'chat-attachments');
    setAttachedFile({ name: f.name, url });
    setUploadingFile(false);
  };

  const handleSend = async () => {
    if (!activeGroup || (!input.trim() && !attachedFile)) return;
    setSending(true);
    await sendChatGroupMessage(activeGroup.id, input.trim(), attachedFile?.name, attachedFile?.url);
    setInput('');
    setAttachedFile(null);
    setSending(false);
  };

  const toggleMember = (id: string) => {
    setSelectedMembers(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim() || selectedMembers.length === 0) return;
    await createChatGroup(groupName.trim(), selectedMembers);
    setGroupName('');
    setSelectedMembers([]);
    setShowNewGroup(false);
  };

  const handleCreateDm = async (workerId: string) => {
    const worker = workers.find(w => w.id === workerId);
    await createChatGroup(`Admin · ${worker?.name || 'Usuario'}`, [workerId]);
    setShowNewDm(false);
  };

  if (!isSupabaseConfigured) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="bg-surface-2 border border-line rounded-xl p-6 text-sm text-muted">
          El chat en vivo necesita que Supabase esté configurado (ver <code>.env</code>). Mientras tanto no hay conversaciones disponibles.
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto h-[calc(100vh-4rem)]">
      <div className="flex gap-4 h-full">
        {/* Sidebar */}
        <div className="w-72 shrink-0 bg-surface-2 border border-line rounded-xl p-3 overflow-y-auto flex flex-col">
          <div className="relative mb-3">
            <Search size={16} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-2" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..." className="w-full bg-surface-3 border border-line rounded-lg pl-8 pr-3 py-2 text-sm outline-none focus:border-accent" />
          </div>

          {isAdmin && (
            <div className="flex gap-2 mb-3">
              <button onClick={() => { setShowNewGroup(s => !s); setShowNewDm(false); }} className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium bg-accent text-on-accent rounded-lg py-2 hover:bg-accent-strong transition-colors">
                <Users size={13} /> Nuevo grupo
              </button>
              <button onClick={() => { setShowNewDm(s => !s); setShowNewGroup(false); }} className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium bg-surface-3 border border-line rounded-lg py-2 text-muted hover:text-text transition-colors">
                <Plus size={13} /> Privado
              </button>
            </div>
          )}

          {showNewDm && isAdmin && (
            <div className="mb-3 p-2.5 bg-surface-3 border border-line rounded-lg space-y-1 max-h-48 overflow-y-auto">
              <p className="text-[10px] text-muted-2 px-1 mb-1">Elige con quién chatear en privado</p>
              {workers.filter(w => !chatGroups.some(g => g.isDm && g.memberIds.includes(w.id))).map(w => (
                <button key={w.id} onClick={() => handleCreateDm(w.id)} className="w-full text-left px-2 py-1.5 rounded-md text-sm hover:bg-surface-2 flex items-center justify-between">
                  <span>{w.name}</span>
                  <span className="text-[10px] text-muted-2">{w.role === 'clipper' ? 'Clipper' : 'Editor(a)'}</span>
                </button>
              ))}
              {workers.filter(w => !chatGroups.some(g => g.isDm && g.memberIds.includes(w.id))).length === 0 && (
                <p className="text-xs text-muted-2 px-1 py-2">Ya tienes un privado con todos</p>
              )}
            </div>
          )}

          {showNewGroup && isAdmin && (
            <div className="mb-3 p-2.5 bg-surface-3 border border-line rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium">Crear grupo</p>
                <button onClick={() => setShowNewGroup(false)}><X size={14} className="text-muted" /></button>
              </div>
              <input value={groupName} onChange={e => setGroupName(e.target.value)} placeholder="Nombre del grupo" className="w-full bg-surface-2 border border-line rounded-md px-3 py-2 text-sm outline-none focus:border-accent" />
              <div className="max-h-32 overflow-y-auto space-y-1">
                {workers.map(w => (
                  <label key={w.id} className="flex items-center gap-2 px-1.5 py-1 rounded-md hover:bg-surface-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={selectedMembers.includes(w.id)} onChange={() => toggleMember(w.id)} className="accent-accent" />
                    {w.name} <span className="text-[10px] text-muted-2">({w.role === 'clipper' ? 'Clipper' : 'Editor(a)'})</span>
                  </label>
                ))}
              </div>
              <button onClick={handleCreateGroup} disabled={!groupName.trim() || selectedMembers.length === 0} className="w-full bg-accent text-on-accent rounded-md py-1.5 text-xs font-medium disabled:opacity-50">
                Crear grupo
              </button>
            </div>
          )}

          <button
            onClick={() => setActiveId('notif')}
            className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors mb-1 flex items-center gap-2 ${activeId === 'notif' ? 'bg-accent-dim text-accent' : 'text-muted hover:bg-surface-3 hover:text-text'}`}
          >
            <Bell size={16} className="shrink-0" />
            <div className="min-w-0">
              <span className="font-medium block">Notificaciones</span>
              <span className="text-xs text-muted-2 block">Historial completo, no se borra</span>
            </div>
          </button>

          <p className="text-xs text-muted-2 font-medium px-2 mb-1 mt-2">{isAdmin ? 'CONVERSACIONES' : 'MIS CHATS'}</p>
          {myGroups.length === 0 && <p className="text-xs text-muted-2 px-2 py-3">Sin conversaciones todavía</p>}
          {myGroups.map(g => (
            <button
              key={g.id}
              onClick={() => setActiveId(g.id)}
              className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors mb-1 ${activeId === g.id ? 'bg-accent-dim text-accent' : 'text-muted hover:bg-surface-3 hover:text-text'}`}
            >
              <span className="font-medium block truncate">{g.name}</span>
              <span className="text-xs text-muted-2 block">{g.isDm ? 'Privado' : `Grupo · ${g.memberIds.length} miembros`}</span>
            </button>
          ))}
        </div>

        {/* Panel principal */}
        <div className="flex-1 flex flex-col bg-surface-2 border border-line rounded-xl overflow-hidden">
          {activeId === 'notif' ? (
            <>
              <div className="px-5 py-3 border-b border-line flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-accent-dim flex items-center justify-center"><Bell size={16} className="text-accent" /></div>
                <div>
                  <p className="font-medium text-sm">Notificaciones</p>
                  <p className="text-xs text-muted-2">Aquí quedan guardadas todas, para siempre</p>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-5 space-y-2">
                {myNotifications.length === 0 && <p className="text-sm text-muted text-center py-8">Sin notificaciones todavía</p>}
                {myNotifications.map(n => (
                  <div key={n.id} className="bg-surface-3 rounded-xl px-4 py-2.5">
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <span className="text-[10px] uppercase tracking-wide text-accent font-medium">{CATEGORY_LABEL[n.category]}</span>
                      <span className="text-[10px] text-muted-2">{timeShort(n.t)}</span>
                    </div>
                    <p className="text-sm">{n.text}</p>
                  </div>
                ))}
              </div>
              <div className="p-4 border-t border-line text-center text-[11px] text-muted-2">
                Este chat es de solo lectura. Las notificaciones nunca se borran aquí.
              </div>
            </>
          ) : activeGroup ? (
            <>
              <div className="px-5 py-3 border-b border-line flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-accent-dim flex items-center justify-center">
                  <span className="text-sm font-bold text-accent">{activeGroup.name.charAt(0)}</span>
                </div>
                <div>
                  <p className="font-medium text-sm">{activeGroup.name}</p>
                  <p className="text-xs text-muted-2">{activeGroup.isDm ? 'Chat privado' : `${activeGroup.memberIds.length} miembros`}</p>
                </div>
              </div>
              <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-3">
                {activeMessages.length === 0 && <p className="text-sm text-muted text-center py-8">Sin mensajes todavía</p>}
                {activeMessages.map(m => {
                  const mine = m.senderId === user?.id;
                  return (
                    <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[70%] rounded-2xl px-4 py-2.5 ${mine ? 'bg-accent text-on-accent rounded-br-sm' : 'bg-surface-3 text-text rounded-bl-sm'}`}>
                        {!mine && <p className="text-[10px] font-semibold opacity-70 mb-0.5">{m.senderName}</p>}
                        {m.text && <p className="text-sm whitespace-pre-wrap">{m.text}</p>}
                        {m.fileUrl && (
                          <a href={m.fileUrl} download={m.fileName || undefined} className="text-xs flex items-center gap-1 mt-1 underline opacity-90">
                            <Download size={11} /> {m.fileName}
                          </a>
                        )}
                        <p className="text-[9px] opacity-60 mt-1 text-right">{timeShort(m.createdAt)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="p-4 border-t border-line">
                {attachedFile && (
                  <div className="flex items-center gap-2 bg-surface-3 border border-line rounded-lg px-3 py-1.5 mb-2 text-xs">
                    <Check size={12} className="text-mint" /> {attachedFile.name}
                    <button onClick={() => setAttachedFile(null)} className="ml-auto text-muted-2 hover:text-red-400"><X size={12} /></button>
                  </div>
                )}
                <div className="flex items-center gap-2 bg-surface-3 border border-line rounded-xl px-3 py-2">
                  <button onClick={() => fileInputRef.current?.click()} disabled={uploadingFile} className="text-muted hover:text-text transition-colors">
                    {uploadingFile ? <Loader2 size={18} className="animate-spin" /> : <Paperclip size={18} />}
                  </button>
                  <input ref={fileInputRef} type="file" className="hidden" onChange={handleFile} />
                  <input
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                    placeholder="Escribe un mensaje..."
                    className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-2"
                  />
                  <button onClick={handleSend} disabled={sending || (!input.trim() && !attachedFile)} className="w-8 h-8 rounded-lg bg-accent text-on-accent flex items-center justify-center hover:bg-accent-strong transition-colors disabled:opacity-50">
                    {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-2">
              {isAdmin ? 'Selecciona una conversación o crea un grupo/privado nuevo' : 'Aún no tienes conversaciones. El admin te agregará a un grupo o te escribirá en privado.'}
            </div>
          )}
        </div>
      </div>
      {adminProfiles.length === 0 && isAdmin && (
        <p className="sr-only">Sin administradores adicionales</p>
      )}
    </div>
  );
}
