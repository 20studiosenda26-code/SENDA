import { useState, useRef } from 'react';
import { useStore } from '../store';
import { uploadSharedFile } from '../lib/supabaseClient';
import type { Order, OrderStatus } from '../types';
import {
  FolderOpen, ArrowLeft, Plus, X, Upload, Loader2, ListChecks, UserPlus, ChevronRight,
} from 'lucide-react';
import { TasksBoard } from './TasksView';

const ORDER_STATUS_OPTIONS: OrderStatus[] = ['aprobado_senda', 'aprobado_cliente', 'sin_asignar', 'finalizado', 'incompleto'];

const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  aprobado_senda: 'Aprobado Senda',
  aprobado_cliente: 'Aprobado cliente',
  sin_asignar: 'Sin asignar',
  finalizado: 'Pedido finalizado',
  incompleto: 'Pedido incompleto',
};

const ORDER_STATUS_DOT: Record<OrderStatus, string> = {
  aprobado_senda: 'bg-mint',
  aprobado_cliente: 'bg-accent',
  sin_asignar: 'bg-amber',
  finalizado: 'bg-emerald-400',
  incompleto: 'bg-red-500',
};

type Folder = 'disponibles' | 'iniciados' | 'asignar';

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
  if (folder === 'asignar') return <AsignarProyecto onBack={() => setFolder(null)} />;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h2 className="font-display text-2xl font-bold mb-1">Tareas</h2>
      <p className="text-muted text-sm mb-6">Elige una carpeta para continuar</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <FolderCard
          icon={<ListChecks size={22} />}
          title="Proyectos disponibles"
          desc="Pedidos por marca, cantidad y hora de entrega"
          onClick={() => setFolder('disponibles')}
        />
        <FolderCard
          icon={<FolderOpen size={22} />}
          title="Proyectos iniciados"
          desc="El tablero de tareas (sin iniciar, revisión, aprobado)"
          onClick={() => setFolder('iniciados')}
        />
        <FolderCard
          icon={<UserPlus size={22} />}
          title="Asignar proyectos"
          desc="Sube el brief y asigna clíper/editores disponibles"
          onClick={() => setFolder('asignar')}
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

// --- Carpeta: Proyectos disponibles ---
function ProyectosDisponibles({ onBack }: { onBack: () => void }) {
  const { orders, addOrder, updateOrder, deleteOrder } = useStore();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [brand, setBrand] = useState('');
  const [videoCount, setVideoCount] = useState('1');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [deliveryTime, setDeliveryTime] = useState('');
  const [status, setStatus] = useState<OrderStatus>('sin_asignar');

  const resetForm = () => {
    setBrand(''); setVideoCount('1'); setDeliveryDate(''); setDeliveryTime(''); setStatus('sin_asignar');
    setEditingId(null); setShowForm(false);
  };

  const startEdit = (o: Order) => {
    setEditingId(o.id); setBrand(o.brand); setVideoCount(String(o.videoCount));
    setDeliveryDate(o.deliveryDate); setDeliveryTime(o.deliveryTime); setStatus(o.status);
    setShowForm(true);
  };

  const handleSave = () => {
    if (!brand.trim()) return;
    if (editingId) {
      updateOrder(editingId, { brand: brand.trim(), videoCount: parseInt(videoCount) || 1, deliveryDate, deliveryTime, status });
    } else {
      addOrder({ brand: brand.trim(), videoCount: parseInt(videoCount) || 1, deliveryDate, deliveryTime, status, assignedWorkerIds: [], briefFileName: null, briefFileUrl: null });
    }
    resetForm();
  };

  return (
    <div>
      <BackBar onBack={onBack} title="Proyectos disponibles" />
      <div className="p-6 max-w-5xl mx-auto space-y-4">
        <div className="flex justify-end">
          <button onClick={() => { resetForm(); setShowForm(s => !s); }} className="flex items-center gap-1.5 text-sm font-medium bg-accent text-on-accent rounded-lg px-3 py-2 hover:bg-accent-strong transition-colors">
            <Plus size={15} /> Agregar proyecto
          </button>
        </div>

        {showForm && (
          <div className="bg-surface-2 border border-line rounded-xl p-4 space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input value={brand} onChange={e => setBrand(e.target.value)} placeholder="Marca" className="bg-surface-3 border border-line rounded-md px-3 py-2 text-sm outline-none focus:border-accent" />
              <input value={videoCount} onChange={e => setVideoCount(e.target.value)} type="number" min="1" placeholder="Cantidad de videos" className="bg-surface-3 border border-line rounded-md px-3 py-2 text-sm outline-none focus:border-accent" />
              <input value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} type="date" className="bg-surface-3 border border-line rounded-md px-3 py-2 text-sm outline-none focus:border-accent" />
              <input value={deliveryTime} onChange={e => setDeliveryTime(e.target.value)} type="time" className="bg-surface-3 border border-line rounded-md px-3 py-2 text-sm outline-none focus:border-accent" />
              <select value={status} onChange={e => setStatus(e.target.value as OrderStatus)} className="sm:col-span-2 bg-surface-3 border border-line rounded-md px-3 py-2 text-sm outline-none focus:border-accent">
                {ORDER_STATUS_OPTIONS.map(s => <option key={s} value={s}>{ORDER_STATUS_LABEL[s]}</option>)}
              </select>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={handleSave} disabled={!brand.trim()} className="bg-accent text-on-accent rounded-md px-3 py-2 text-sm font-medium hover:bg-accent-strong transition-colors disabled:opacity-50">
                {editingId ? 'Guardar cambios' : 'Crear proyecto'}
              </button>
              <button onClick={resetForm} className="text-sm text-muted hover:text-text px-3 py-2">Cancelar</button>
            </div>
          </div>
        )}

        {orders.length === 0 ? (
          <p className="text-sm text-muted text-center py-8">Sin proyectos disponibles todavía</p>
        ) : (
          <div className="space-y-2">
            {orders.map((o, i) => (
              <div key={o.id} className="flex items-center gap-3 p-3 bg-surface-2 border border-line rounded-lg">
                <span className="w-6 h-6 rounded-full bg-surface-3 border border-line flex items-center justify-center text-xs font-semibold shrink-0">{i + 1}</span>
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${ORDER_STATUS_DOT[o.status]}`} title={ORDER_STATUS_LABEL[o.status]} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{o.brand} · {o.videoCount} videos</p>
                  <p className="text-xs text-muted-2">{o.deliveryDate || 'Sin fecha'} {o.deliveryTime} · {ORDER_STATUS_LABEL[o.status]}</p>
                </div>
                <button onClick={() => startEdit(o)} className="text-xs text-accent hover:text-accent-strong font-medium shrink-0">Editar</button>
                <button onClick={() => deleteOrder(o.id)} className="text-muted-2 hover:text-red-400 shrink-0"><X size={14} /></button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// --- Carpeta: Asignar proyectos ---
function AsignarProyecto({ onBack }: { onBack: () => void }) {
  const { workers, assignProject } = useStore();
  const [brand, setBrand] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [deliveryTime, setDeliveryTime] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [briefFileName, setBriefFileName] = useState('');
  const [briefFileUrl, setBriefFileUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const toggle = (id: string) => setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploading(true);
    try {
      const url = await uploadSharedFile(f, 'briefs/asignaciones');
      setBriefFileName(f.name);
      setBriefFileUrl(url);
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = () => {
    if (!brand.trim() || selected.length === 0) return;
    assignProject(brand.trim(), deliveryDate, deliveryTime, selected, briefFileName || undefined, briefFileUrl || undefined);
    setBrand(''); setDeliveryDate(''); setDeliveryTime(''); setSelected([]); setBriefFileName(''); setBriefFileUrl('');
    setDone(true);
    setTimeout(() => setDone(false), 3000);
  };

  return (
    <div>
      <BackBar onBack={onBack} title="Asignar proyectos" />
      <div className="p-6 max-w-2xl mx-auto space-y-4">
        <div className="bg-surface-2 border border-line rounded-xl p-5 space-y-3">
          <div>
            <label className="text-xs text-muted-2 mb-1 block">Marca / nombre del pedido</label>
            <input value={brand} onChange={e => setBrand(e.target.value)} placeholder="Ej. Avon" className="w-full bg-surface-3 border border-line rounded-md px-3 py-2 text-sm outline-none focus:border-accent" />
          </div>

          <div>
            <label className="text-xs text-muted-2 mb-1 block">Brief / trabajo asignado (PDF, video, cualquier formato)</label>
            <label className="flex items-center gap-2 bg-surface-3 border border-line border-dashed rounded-md px-3 py-2 text-sm text-muted cursor-pointer hover:border-accent transition-colors">
              {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              {briefFileName || 'Subir archivo'}
              <input ref={fileRef} type="file" className="hidden" onChange={handleFile} />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-2 mb-1 block">Fecha de entrega</label>
              <input value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} type="date" className="w-full bg-surface-3 border border-line rounded-md px-3 py-2 text-sm outline-none focus:border-accent" />
            </div>
            <div>
              <label className="text-xs text-muted-2 mb-1 block">Hora de entrega</label>
              <input value={deliveryTime} onChange={e => setDeliveryTime(e.target.value)} type="time" className="w-full bg-surface-3 border border-line rounded-md px-3 py-2 text-sm outline-none focus:border-accent" />
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-2 mb-1 block">Editores y clípers disponibles</label>
            <div className="max-h-52 overflow-y-auto space-y-1 bg-surface-3 border border-line rounded-md p-2">
              {workers.map(w => (
                <label key={w.id} className="flex items-center gap-2 px-1.5 py-1.5 rounded-md hover:bg-surface-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={selected.includes(w.id)} onChange={() => toggle(w.id)} className="accent-accent" />
                  {w.name} <span className="text-[10px] text-muted-2">({w.role === 'clipper' ? 'Clipper' : 'Editor(a)'})</span>
                </label>
              ))}
              {workers.length === 0 && <p className="text-xs text-muted-2 px-1.5 py-2">No hay clíper/editores registrados</p>}
            </div>
          </div>

          <button
            onClick={handleSubmit}
            disabled={!brand.trim() || selected.length === 0}
            className="w-full bg-accent text-on-accent rounded-md py-2.5 text-sm font-medium hover:bg-accent-strong transition-colors disabled:opacity-50"
          >
            Asignar trabajo ({selected.length} seleccionado{selected.length === 1 ? '' : 's'})
          </button>
          {done && <p className="text-xs text-mint text-center">Trabajo asignado. Se notificó a cada persona seleccionada.</p>}
        </div>
      </div>
    </div>
  );
}
