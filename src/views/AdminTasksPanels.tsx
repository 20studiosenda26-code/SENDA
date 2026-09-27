import { useMemo, useState } from 'react';
import { useStore } from '../store';
import type { Order, OrderStatus, Worker } from '../types';
import {
  FolderOpen, ArrowLeft, Loader2, ListChecks, ChevronRight, ChevronDown,
  User, FileDown, Link2, StickyNote, CheckCircle2, Trash2,
} from 'lucide-react';
import { TasksBoard } from './TasksView';

const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  aprobado_senda: 'Aprobado Senda',
  aprobado_cliente: 'Aprobado cliente',
  sin_asignar: 'Sin asignar',
  asignado: 'Asignado',
  finalizado: 'Pedido finalizado',
  incompleto: 'Pedido incompleto',
};

const ORDER_STATUS_DOT: Record<OrderStatus, string> = {
  aprobado_senda: 'bg-mint',
  aprobado_cliente: 'bg-accent',
  sin_asignar: 'bg-amber',
  asignado: 'bg-accent',
  finalizado: 'bg-emerald-400',
  incompleto: 'bg-red-500',
};

type Folder = 'disponibles' | 'iniciados';

export function AdminTasksRoot() {
  const [folder, setFolder] = useState<Folder | null>(null);

  if (folder === 'iniciados') {
    return (
      <div>
        <BackBar onBack={() => setFolder(null)} title="Proyectos iniciados" />
        <TasksBoard />
      </div>
    );
  }
  if (folder === 'disponibles') return <ProyectosDisponibles onBack={() => setFolder(null)} />;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h2 className="font-display text-2xl font-bold mb-1">Tareas</h2>
      <p className="text-muted text-sm mb-6">Elige una carpeta para continuar</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FolderCard
          icon={<ListChecks size={22} />}
          title="Proyectos disponibles"
          desc="Brief, avatar y referencias del cliente, y asignación de clíper + editor(a)"
          onClick={() => setFolder('disponibles')}
        />
        <FolderCard
          icon={<FolderOpen size={22} />}
          title="Proyectos iniciados"
          desc="El tablero de tareas (sin iniciar, revisión, aprobado)"
          onClick={() => setFolder('iniciados')}
        />
      </div>
    </div>
  );
}

function FolderCard({ icon, title, desc, onClick }: { icon: React.ReactNode; title: string; desc: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="text-left bg-surface-2 border border-line rounded-xl p-5 hover:border-accent/50 hover:bg-surface-3 transition-colors group">
      <div className="w-11 h-11 rounded-lg bg-accent-dim text-accent flex items-center justify-center mb-3">{icon}</div>
      <p className="font-display text-base font-semibold flex items-center gap-1">
        {title} <ChevronRight size={15} className="text-muted-2 group-hover:text-accent transition-colors" />
      </p>
      <p className="text-xs text-muted mt-1">{desc}</p>
    </button>
  );
}

function BackBar({ onBack, title }: { onBack: () => void; title: string }) {
  return (
    <div className="px-6 pt-6 max-w-7xl mx-auto flex items-center gap-3 -mb-2">
      <button onClick={onBack} className="w-9 h-9 rounded-lg bg-surface-2 border border-line flex items-center justify-center text-muted hover:text-text transition-colors">
        <ArrowLeft size={16} />
      </button>
      <h2 className="font-display text-xl font-bold">{title}</h2>
    </div>
  );
}

// --- Bloque de información fija del cliente (avatar / brief / referencias / notas) ---
function InfoBlock({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface-3 border border-line rounded-lg p-3">
      <p className="text-[10.5px] uppercase tracking-wide text-muted-2 flex items-center gap-1.5 mb-1.5 font-tech">
        {icon} {label}
      </p>
      <div className="text-sm leading-snug">{children}</div>
    </div>
  );
}

// --- Selector de Clipper/Editor ordenado por volumen de trabajo activo ---
function WorkerPicker({
  title, subtitle, workers, selected, onSelect, getWorkerWorkload, getWorkerCapacity, setWorkerCapacity,
}: {
  title: string;
  subtitle: string;
  workers: Worker[];
  selected: string | null;
  onSelect: (id: string) => void;
  getWorkerWorkload: (id: string) => number;
  getWorkerCapacity: (id: string) => number;
  setWorkerCapacity: (id: string, cap: number) => void;
}) {
  return (
    <div>
      <p className="text-xs font-semibold">{title}</p>
      <p className="text-[11px] text-muted-2 mb-2">{subtitle}</p>
      {workers.length === 0 ? (
        <p className="text-xs text-muted-2 py-2">Nadie con este rol registrado todavía.</p>
      ) : (
        <div className="space-y-1.5">
          {workers.map(w => {
            const load = getWorkerWorkload(w.id);
            const cap = getWorkerCapacity(w.id);
            const full = load >= cap;
            const isSel = selected === w.id;
            return (
              <label
                key={w.id}
                className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg border cursor-pointer transition-colors ${
                  isSel ? 'border-accent bg-accent-dim' : 'border-line bg-surface-2 hover:border-accent/40'
                }`}
              >
                <input type="radio" checked={isSel} onChange={() => onSelect(w.id)} className="accent-accent shrink-0" />
                <span className="flex-1 text-sm truncate">{w.name}</span>
                <span
                  className={`text-[10px] font-tech px-2 py-0.5 rounded-full shrink-0 ${
                    full ? 'bg-red-500/10 text-red-400' : load === 0 ? 'bg-mint-dim text-mint' : 'bg-surface-3 text-muted'
                  }`}
                  title="Proyectos activos / volumen máximo diario"
                >
                  {load}/{cap} activos
                </span>
                <input
                  type="number"
                  min={1}
                  value={cap}
                  onClick={e => e.stopPropagation()}
                  onChange={e => setWorkerCapacity(w.id, Number(e.target.value))}
                  title="Editar volumen máximo diario"
                  className="w-11 bg-surface-3 border border-line rounded-md px-1 py-0.5 text-[11px] text-center outline-none focus:border-accent shrink-0"
                />
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

// --- Una fila de proyecto: se expande para mostrar todo el detalle y, si
// hace falta, el flujo de asignación de clíper + editor(a). ---
function ProjectRow({ order, index, isOpen, onToggle }: { order: Order; index: number; isOpen: boolean; onToggle: () => void }) {
  const { workers, getWorkerWorkload, getWorkerCapacity, setWorkerCapacity, assignOrderClipper, assignOrderEditor, deleteOrder } = useStore();
  const [clipperSel, setClipperSel] = useState<string | null>(order.clipperId || null);
  const [editorSel, setEditorSel] = useState<string | null>(order.editorId || null);
  const [assigningClipper, setAssigningClipper] = useState(false);
  const [assigningEditor, setAssigningEditor] = useState(false);
  const [justAssignedClipper, setJustAssignedClipper] = useState(false);
  const [justAssignedEditor, setJustAssignedEditor] = useState(false);
  const [reassigningClipper, setReassigningClipper] = useState(false);
  const [reassigningEditor, setReassigningEditor] = useState(false);

  const clippers = useMemo(
    () => workers.filter(w => w.role === 'clipper').sort((a, b) => getWorkerWorkload(a.id) - getWorkerWorkload(b.id)),
    [workers, getWorkerWorkload],
  );
  const editors = useMemo(
    () => workers.filter(w => w.role === 'editor').sort((a, b) => getWorkerWorkload(a.id) - getWorkerWorkload(b.id)),
    [workers, getWorkerWorkload],
  );

  const clipperName = workers.find(w => w.id === order.clipperId)?.name;
  const editorName = workers.find(w => w.id === order.editorId)?.name;
  const isFullyAssigned = !!order.clipperId && !!order.editorId;

  const handleAssignClipper = async () => {
    if (!clipperSel) return;
    setAssigningClipper(true);
    try {
      await assignOrderClipper(order.id, clipperSel);
      setJustAssignedClipper(true);
      setReassigningClipper(false);
      setTimeout(() => setJustAssignedClipper(false), 5000);
    } finally {
      setAssigningClipper(false);
    }
  };

  const handleAssignEditor = async () => {
    if (!editorSel) return;
    setAssigningEditor(true);
    try {
      await assignOrderEditor(order.id, editorSel);
      setJustAssignedEditor(true);
      setReassigningEditor(false);
      setTimeout(() => setJustAssignedEditor(false), 5000);
    } finally {
      setAssigningEditor(false);
    }
  };

  return (
    <div className="bg-surface-2 border border-line rounded-xl overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center gap-3 p-3.5 text-left hover:bg-surface-3/60 transition-colors">
        <span className="w-6 h-6 rounded-full bg-surface-3 border border-line flex items-center justify-center text-xs font-semibold shrink-0 font-tech">{index + 1}</span>
        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${ORDER_STATUS_DOT[order.status]}`} title={ORDER_STATUS_LABEL[order.status]} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{order.brand} · {order.videoCount} videos</p>
          <p className="text-xs text-muted-2 truncate">
            Entrega: {order.deliveryDate ? `${order.deliveryDate} · ${order.deliveryTime || 'sin hora'}` : 'sin fecha'} · {ORDER_STATUS_LABEL[order.status]}
            {isFullyAssigned && <> · {clipperName} + {editorName}</>}
          </p>
        </div>
        <ChevronDown size={16} className={`text-muted-2 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="border-t border-line p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <InfoBlock icon={<User size={13} />} label="Avatar elegido por el cliente">
              {order.avatarName || <span className="text-muted-2">El cliente no ha elegido avatar todavía.</span>}
            </InfoBlock>
            <InfoBlock icon={<FileDown size={13} />} label="Brief">
              {order.briefFileName ? (
                <a href={order.briefFileUrl || '#'} target="_blank" rel="noreferrer" className="text-accent hover:text-accent-strong inline-flex items-center gap-1.5 break-all">
                  {order.briefFileName} <FileDown size={12} className="shrink-0" />
                </a>
              ) : (
                <span className="text-muted-2">Brief pendiente de subir.</span>
              )}
            </InfoBlock>
            <InfoBlock icon={<Link2 size={13} />} label="Referencias del cliente">
              {order.references && order.references.length > 0 ? (
                <ul className="space-y-1">
                  {order.references.map(r => (
                    <li key={r.id}>
                      <a href={r.url} target="_blank" rel="noreferrer" className="text-accent hover:text-accent-strong break-all">{r.name}</a>
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="text-muted-2">El cliente no dejó referencias para este proyecto.</span>
              )}
            </InfoBlock>
            <InfoBlock icon={<StickyNote size={13} />} label="Notas del cliente">
              {order.clientNotes || <span className="text-muted-2">El cliente no dejó notas adicionales.</span>}
            </InfoBlock>
          </div>

          {order.status !== 'finalizado' && (
            <div className="pt-3 border-t border-line/70 space-y-4">
              {/* --- Clipper: se puede asignar solo, sin necesidad del editor(a) --- */}
              <div>
                {order.clipperId && !reassigningClipper ? (
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <p className="text-sm flex items-center gap-1.5">
                      <CheckCircle2 size={14} className="text-mint shrink-0" />
                      Clipper: <span className="font-medium">{clipperName}</span>
                    </p>
                    <button onClick={() => setReassigningClipper(true)} className="text-xs text-accent hover:text-accent-strong font-medium shrink-0">Reasignar</button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <WorkerPicker
                      title="Elige un Clipper"
                      subtitle="Ordenados de menor a mayor volumen de trabajo activo"
                      workers={clippers} selected={clipperSel} onSelect={setClipperSel}
                      getWorkerWorkload={getWorkerWorkload} getWorkerCapacity={getWorkerCapacity} setWorkerCapacity={setWorkerCapacity}
                    />
                    <div className="flex items-center gap-3 pt-1 flex-wrap">
                      <button
                        onClick={handleAssignClipper}
                        disabled={!clipperSel || assigningClipper}
                        className="flex items-center gap-2 bg-accent text-on-accent rounded-lg px-4 py-2 text-sm font-medium hover:bg-accent-strong transition-colors disabled:opacity-50"
                      >
                        {assigningClipper ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                        Asignar Clipper
                      </button>
                      {reassigningClipper && (
                        <button onClick={() => setReassigningClipper(false)} className="text-xs text-muted hover:text-text">Cancelar</button>
                      )}
                      {justAssignedClipper && (
                        <p className="text-xs text-mint">Clipper asignado. Se notificó en la app, por correo (si lo activó) y con un mensaje del Admin en Mensajes.</p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* --- Editor(a): siempre visible como opción independiente del Clipper --- */}
              <div className="pt-3 border-t border-line/40">
                {order.editorId && !reassigningEditor ? (
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <p className="text-sm flex items-center gap-1.5">
                      <CheckCircle2 size={14} className="text-mint shrink-0" />
                      Editor(a): <span className="font-medium">{editorName}</span>
                    </p>
                    <button onClick={() => setReassigningEditor(true)} className="text-xs text-accent hover:text-accent-strong font-medium shrink-0">Reasignar</button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <WorkerPicker
                      title="Elige un Editor(a)"
                      subtitle="Ordenados de menor a mayor volumen de trabajo activo"
                      workers={editors} selected={editorSel} onSelect={setEditorSel}
                      getWorkerWorkload={getWorkerWorkload} getWorkerCapacity={getWorkerCapacity} setWorkerCapacity={setWorkerCapacity}
                    />
                    <div className="flex items-center gap-3 pt-1 flex-wrap">
                      <button
                        onClick={handleAssignEditor}
                        disabled={!editorSel || assigningEditor}
                        className="flex items-center gap-2 bg-accent text-on-accent rounded-lg px-4 py-2 text-sm font-medium hover:bg-accent-strong transition-colors disabled:opacity-50"
                      >
                        {assigningEditor ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                        Asignar Editor(a)
                      </button>
                      {reassigningEditor && (
                        <button onClick={() => setReassigningEditor(false)} className="text-xs text-muted hover:text-text">Cancelar</button>
                      )}
                      {justAssignedEditor && (
                        <p className="text-xs text-mint">Editor(a) asignado(a). Se notificó en la app, por correo (si lo activó) y con un mensaje del Admin en Mensajes.</p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {isFullyAssigned && (
                <p className="text-xs text-muted-2 flex items-center gap-1.5">
                  <CheckCircle2 size={12} className="text-mint shrink-0" />
                  Proyecto completamente asignado.
                </p>
              )}
            </div>
          )}

          <div className="flex justify-end pt-1">
            <button onClick={() => deleteOrder(order.id)} className="text-xs text-muted-2 hover:text-red-400 inline-flex items-center gap-1 transition-colors">
              <Trash2 size={12} /> Eliminar proyecto
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Carpeta: Proyectos disponibles ---
// Los proyectos llegan aquí automáticamente desde la página de clientes
// (cuando se crean, sin asignar). En cuanto un proyecto queda con
// clíper Y editor(a) asignados, desaparece de esta lista por completo y
// pasa a "Proyectos iniciados" (estados: sin iniciar, pendiente, etc.).
function ProyectosDisponibles({ onBack }: { onBack: () => void }) {
  const { orders } = useStore();
  const [openId, setOpenId] = useState<string | null>(null);

  const sorted = useMemo(() => {
    return [...orders]
      .filter(o => !(o.clipperId && o.editorId))
      .sort((a, b) => {
        if (a.status === 'finalizado' && b.status !== 'finalizado') return 1;
        if (b.status === 'finalizado' && a.status !== 'finalizado') return -1;
        const da = a.deliveryDate ? new Date(`${a.deliveryDate}T${a.deliveryTime || '23:59'}`).getTime() : Infinity;
        const db = b.deliveryDate ? new Date(`${b.deliveryDate}T${b.deliveryTime || '23:59'}`).getTime() : Infinity;
        return da - db;
      });
  }, [orders]);

  return (
    <div>
      <BackBar onBack={onBack} title="Proyectos disponibles" />
      <div className="p-6 max-w-3xl mx-auto space-y-4">
        <p className="text-xs text-muted-2">
          Ordenados por hora de entrega — el más próximo primero. Se cargan solos desde la página de clientes cuando un proyecto no está asignado todavía;
          al asignarle clíper y editor(a) pasan a "Proyectos iniciados".
        </p>

        {sorted.length === 0 ? (
          <p className="text-sm text-muted text-center py-8">Sin proyectos disponibles todavía</p>
        ) : (
          <div className="space-y-2">
            {sorted.map((o, i) => (
              <ProjectRow key={o.id} order={o} index={i} isOpen={openId === o.id} onToggle={() => setOpenId(id => (id === o.id ? null : o.id))} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
