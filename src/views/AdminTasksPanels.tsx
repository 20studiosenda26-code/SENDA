// Tareas del Administrador (pensado para computador).
//   · Por asignar   → lista + detalle del pedido (brief del cliente) + elegir responsable
//   · En producción → tablero por etapa (kanban) o por proyecto
//   · Finalizados   → proyectos con todos sus videos aprobados por el cliente
// Al abrir cualquier video se usa el mismo detalle que ve el Clipper · Asistente (VideoDetail).
import { LiquidMetalButton } from "../components/ui/liquid-metal-button";
import { useMemo, useState, useEffect, type ReactNode } from "react";
import { useStore } from "../store";
import type { Order } from "../types";
import {
  CheckCircle2, ChevronRight, Clapperboard, Columns3, FileDown, FolderCheck, Gauge, Inbox, LayoutList,
  Link2, ListChecks, Palette, Search, StickyNote, Trash2, User, UserPlus, X,
} from "lucide-react";
import { TasksBoard } from "./TasksView";
import { DriveFolderField } from "../components/DriveFolderField";
import { ClientAccountField } from "../components/ClientAccountField";
import { WorkerPicker } from "../components/tasks/WorkerPicker";
import { GlowCard } from "../components/ui/spotlight-card";
import { CountTicker } from "../components/ui/number-ticker";
import { initialsOf } from "../components/ui/avatar-stack";
import { countdownLabel, deadlineMs, EmptyState, fmtDate } from "../components/home/home-bits";
import { takeNavIntent } from "../lib/navIntent";
import { flattenVideos, findOrderForVideo, type VideoWithBrand } from "../lib/economics";
import { adminTurn, boardStage, BOARD_STAGES, type BoardStage } from "../lib/videoFlow";

type Tab = "asignar" | "produccion" | "finalizados";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function AdminTasksRoot() {
  const { orders, brands, workers } = useStore();
  const [tab, setTab] = useState<Tab>(() => {
    const intent = takeNavIntent("tareas");
    return intent === "iniciados" ? "produccion" : "asignar";
  });
  const [view, setView] = useState<"etapas" | "proyectos">("etapas");
  const [search, setSearch] = useState("");
  const [person, setPerson] = useState<string>("todos");
  const [onlyMine, setOnlyMine] = useState(false);

  const videos = useMemo(() => flattenVideos(brands), [brands]);
  const toAssign = useMemo(() => orders.filter(o => !o.clipperId && o.status !== "finalizado"), [orders]);
  const activeVideos = videos.filter(v => v.qc !== "aprobado_cliente");
  const myTurn = activeVideos.filter(v => adminTurn(v));
  const late = activeVideos.filter(v => {
    const o = findOrderForVideo(v, v.brandName, orders);
    const dl = deadlineMs(o?.deliveryDate || v.date, o?.deliveryTime);
    return v.qc !== "aprobado_senda" && Number.isFinite(dl) && dl < Date.now();
  });
  const finishedProjects = brands.filter(b => b.videos.length > 0 && b.videos.every(v => v.qc === "aprobado_cliente")).length;

  const tabs: { key: Tab; label: string; count: number; icon: ReactNode }[] = [
    { key: "asignar", label: "Por asignar", count: toAssign.length, icon: <UserPlus size={15} /> },
    { key: "produccion", label: "En producción", count: activeVideos.length, icon: <Clapperboard size={15} /> },
    { key: "finalizados", label: "Finalizados", count: finishedProjects, icon: <FolderCheck size={15} /> },
  ];

  return (
    <div className="px-6 xl:px-8 py-6 max-w-[1440px] mx-auto space-y-5 animate-fadeIn">
      {/* Encabezado */}
      <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl font-bold">Tareas</h2>
          <p className="text-muted text-sm mt-1">Asigna proyectos, sigue cada video por etapa y revisa lo que espera tu aprobación.</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <StatChip label="Por asignar" value={toAssign.length} tone="amber" onClick={() => setTab("asignar")} />
          <StatChip label="Te toca revisar" value={myTurn.length} tone="accent" onClick={() => { setTab("produccion"); setView("etapas"); setOnlyMine(true); }} />
          <StatChip label="Videos vencidos" value={late.length} tone="red" onClick={() => { setTab("produccion"); setView("etapas"); }} />
          <StatChip label="Proyectos terminados" value={finishedProjects} tone="mint" onClick={() => setTab("finalizados")} />
        </div>
      </div>

      {/* Pestañas + filtros */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div className="flex items-center gap-1 bg-surface-2 border border-line rounded-xl p-1 w-fit" role="tablist">
          {tabs.map(t => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${
                tab === t.key ? "bg-accent text-on-accent shadow-[0_0_16px_-6px_rgba(53,214,228,0.7)]" : "text-muted hover:text-text"
              }`}
            >
              {t.icon} {t.label}
              <span className={`font-tech text-[11px] px-1.5 rounded ${tab === t.key ? "bg-black/20" : "bg-surface-3"}`}>{t.count}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-2" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar marca o video…"
              className="w-56 bg-surface-2 border border-line rounded-lg pl-8 pr-8 py-2 text-sm outline-none focus:border-accent placeholder:text-muted-2"
            />
            {search && (
              <button type="button" onClick={() => setSearch("")} aria-label="Limpiar búsqueda" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-2 hover:text-text">
                <X size={14} />
              </button>
            )}
          </label>
          {tab === "produccion" && (
            <>
              <select
                value={person}
                onChange={e => setPerson(e.target.value)}
                className="bg-surface-2 border border-line rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
                aria-label="Filtrar por responsable"
              >
                <option value="todos">Todo el equipo</option>
                {workers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
              <div className="flex items-center gap-1 bg-surface-2 border border-line rounded-lg p-0.5">
                <button type="button" onClick={() => setView("etapas")} title="Tablero por etapa" className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium ${view === "etapas" ? "bg-surface-3 text-accent" : "text-muted hover:text-text"}`}>
                  <Columns3 size={14} /> Por etapa
                </button>
                <button type="button" onClick={() => setView("proyectos")} title="Lista por proyecto" className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium ${view === "proyectos" ? "bg-surface-3 text-accent" : "text-muted hover:text-text"}`}>
                  <LayoutList size={14} /> Por proyecto
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {tab === "asignar" && <AssignWorkspace search={search} />}
      {tab === "produccion" && view === "etapas" && (
        <ProductionKanban search={search} person={person} onlyMine={onlyMine} setOnlyMine={setOnlyMine} />
      )}
      {tab === "produccion" && view === "proyectos" && <TasksBoard scope="activos" search={search} person={person} embedded />}
      {tab === "finalizados" && <TasksBoard scope="finalizados" search={search} embedded />}
    </div>
  );
}

function StatChip({ label, value, tone, onClick }: { label: string; value: number; tone: "accent" | "amber" | "red" | "mint"; onClick: () => void }) {
  const cls = { accent: "text-accent", amber: "text-amber", red: "text-red-400", mint: "text-mint" }[tone];
  return (
    <button type="button" onClick={onClick} className="text-left bg-surface-2 border border-line rounded-xl px-3.5 py-2 hover:border-accent/40 transition-colors min-w-[130px]">
      <p className={`font-display text-xl font-bold leading-none ${value > 0 ? cls : "text-muted-2"}`}><CountTicker value={value} /></p>
      <p className="text-[11px] text-muted mt-1">{label}</p>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Por asignar: lista a la izquierda, detalle y responsable a la derecha
// ---------------------------------------------------------------------------
function AssignWorkspace({ search }: { search: string }) {
  const { orders, assignOrderClipper, deleteOrder } = useStore();
  const list = useMemo(() => {
    const q = norm(search.trim());
    return orders
      .filter(o => !o.clipperId && o.status !== "finalizado")
      .filter(o => !q || norm(o.brand).includes(q))
      .sort((a, b) => {
        const da = deadlineMs(a.deliveryDate, a.deliveryTime);
        const db = deadlineMs(b.deliveryDate, b.deliveryTime);
        return (Number.isFinite(da) ? da : Infinity) - (Number.isFinite(db) ? db : Infinity);
      });
  }, [orders, search]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = list.find(o => o.id === selectedId) || list[0] || null;
  const [worker, setWorker] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => { setWorker(null); setConfirmDelete(false); }, [selected?.id]);

  const assign = async () => {
    if (!selected || !worker) return;
    setAssigning(true);
    try {
      await assignOrderClipper(selected.id, worker);
      setDone(`"${selected.brand}" asignado y notificado. Ya está en En producción.`);
      setTimeout(() => setDone(null), 5000);
    } finally {
      setAssigning(false);
    }
  };

  if (list.length === 0) {
    return (
      <GlowCard contentClassName="p-8">
        {done && <p className="text-sm text-mint text-center mb-4 flex items-center justify-center gap-1.5"><CheckCircle2 size={15} /> {done}</p>}
        <EmptyState
          icon={<ListChecks size={22} />}
          title={search ? "Sin resultados" : "Todo asignado"}
          text={search ? "No hay pedidos por asignar con esa búsqueda." : "No hay pedidos esperando responsable. Los nuevos pedidos de Clientes aparecerán aquí."}
        />
      </GlowCard>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
      {/* Lista */}
      <div className="lg:col-span-5 space-y-2">
        {done && <p className="text-xs text-mint bg-mint-dim border border-mint/30 rounded-lg px-3 py-2 flex items-center gap-1.5 animate-fadeIn"><CheckCircle2 size={14} /> {done}</p>}
        {list.map(o => {
          const dl = deadlineMs(o.deliveryDate, o.deliveryTime);
          const isLate = Number.isFinite(dl) && dl < Date.now();
          const active = selected?.id === o.id;
          const briefOk = Boolean(o.briefConfirmedAt || o.briefFileName || o.avatarName || o.editingStyleName);
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => setSelectedId(o.id)}
              className={`w-full text-left p-3.5 rounded-xl border transition-all ${active ? "bg-accent-dim/40 border-accent shadow-[0_0_20px_-10px_rgba(53,214,228,0.8)]" : "bg-surface-2 border-line hover:border-accent/40"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold truncate">{o.brand} <span className="text-muted-2 font-normal">· {o.videoCount} video{o.videoCount === 1 ? "" : "s"}</span></p>
                <ChevronRight size={15} className={active ? "text-accent" : "text-muted-2"} />
              </div>
              <p className="text-[11px] text-muted-2 mt-1">
                {fmtDate(o.deliveryDate, o.deliveryTime)}
                <span className={`ml-1.5 font-medium ${isLate ? "text-red-400" : "text-amber"}`}>· {countdownLabel(dl)}</span>
              </p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                <Chip ok={briefOk} label={o.briefConfirmedAt ? "Brief confirmado por el cliente" : briefOk ? "Brief parcial" : "Sin brief"} />
                <Chip ok={Boolean(o.clientId)} label={o.clientId ? "Cliente vinculado" : "Sin cuenta de cliente"} />
                <Chip ok={Boolean(o.driveFolderUrl)} label={o.driveFolderUrl ? "Drive listo" : "Sin carpeta de Drive"} />
              </div>
            </button>
          );
        })}
      </div>

      {/* Detalle */}
      {selected && (
        <GlowCard className="lg:col-span-7 lg:sticky lg:top-20" contentClassName="p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-display text-xl font-bold">{selected.brand}</h3>
              <p className="text-xs text-muted mt-0.5">
                {selected.videoCount} video{selected.videoCount === 1 ? "" : "s"} · entrega {fmtDate(selected.deliveryDate, selected.deliveryTime)}
                {selected.priority && <> · prioridad <span className="text-text">{selected.priority}</span></>}
                {selected.complexity && <> · complejidad <span className="text-text">{selected.complexity}</span></>}
              </p>
            </div>
            {confirmDelete ? (
              <div className="flex items-center gap-1 bg-red-500/15 border border-red-500/40 rounded-lg px-2 py-1 shrink-0">
                <span className="text-[11px] text-red-300 font-semibold">¿Borrar pedido?</span>
                <button type="button" onClick={() => { deleteOrder(selected.id); setConfirmDelete(false); }} className="px-2 py-0.5 rounded bg-red-500 text-white text-[11px] font-bold hover:bg-red-600">Sí</button>
                <button type="button" onClick={() => setConfirmDelete(false)} className="px-1.5 py-0.5 rounded bg-surface-3 text-muted text-[11px] hover:text-text">No</button>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirmDelete(true)} title="Eliminar pedido" className="p-1.5 rounded-lg text-muted-2 hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0">
                <Trash2 size={15} />
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            <InfoBlock icon={<User size={13} />} label="Avatar">
              {selected.avatarName || <span className="text-muted-2">El cliente no ha elegido avatar.</span>}
            </InfoBlock>
            <InfoBlock icon={<Palette size={13} />} label="Estilo de edición">
              {selected.editingStyleName || <span className="text-muted-2">El cliente no ha elegido estilo.</span>}
            </InfoBlock>
            <InfoBlock icon={<FileDown size={13} />} label="Brief">
              {selected.briefFileName ? (
                <a href={selected.briefFileUrl || "#"} target="_blank" rel="noreferrer" className="text-accent hover:text-accent-strong inline-flex items-center gap-1.5 break-all">
                  {selected.briefFileName} <FileDown size={12} className="shrink-0" />
                </a>
              ) : <span className="text-muted-2">Sin archivo de brief.</span>}
            </InfoBlock>
            <InfoBlock icon={<Link2 size={13} />} label="Referencias">
              {selected.references && selected.references.length > 0 ? (
                <ul className="space-y-1">
                  {selected.references.map(r => (
                    <li key={r.id}><a href={r.url} target="_blank" rel="noreferrer" className="text-accent hover:text-accent-strong break-all">{r.name}</a></li>
                  ))}
                </ul>
              ) : <span className="text-muted-2">Sin referencias.</span>}
            </InfoBlock>
            <div className="md:col-span-2">
              <InfoBlock icon={<StickyNote size={13} />} label="Notas del cliente">
                {selected.clientNotes || <span className="text-muted-2">Sin notas.</span>}
              </InfoBlock>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <ClientAccountField order={selected} />
            <DriveFolderField order={selected} compact />
          </div>

          <div className="pt-3 border-t border-line/70">
            <p className="text-sm font-semibold flex items-center gap-1.5"><Gauge size={15} className="text-accent" /> Elige responsable</p>
            <p className="text-[11px] text-muted-2 mb-2.5">Hace imagen principal, clips y video final de los {selected.videoCount} videos. Ordenado por quién está en línea y tiene más espacio hoy.</p>
            <WorkerPicker selected={worker} onSelect={setWorker} />
            <div className="flex items-center gap-3 pt-3 flex-wrap">
              <LiquidMetalButton
                onClick={assign}
                disabled={!worker}
                loading={assigning}
                label="Asignar proyecto"
                loadingLabel="Asignando..."
                icon={CheckCircle2}
                variant="cyan"
              />
              {!worker && <span className="text-xs text-muted-2">Selecciona a una persona para asignar.</span>}
            </div>
          </div>
        </GlowCard>
      )}
    </div>
  );
}

function Chip({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${ok ? "text-mint border-mint/30 bg-mint-dim" : "text-muted-2 border-line bg-surface-3"}`}>
      {label}
    </span>
  );
}

function InfoBlock({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="bg-surface-3 border border-line rounded-lg p-3 h-full">
      <p className="text-[10.5px] uppercase tracking-wide text-muted-2 flex items-center gap-1.5 mb-1.5 font-tech">{icon} {label}</p>
      <div className="text-sm leading-snug">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// En producción: tablero por etapa
// ---------------------------------------------------------------------------
const STAGE_TONE: Record<BoardStage, string> = {
  imagen: "bg-amber",
  clips: "bg-accent",
  final: "bg-violet",
  correcciones: "bg-red-400",
  cliente: "bg-mint",
  listo: "bg-mint",
};

function ProductionKanban({ search, person, onlyMine, setOnlyMine }: {
  search: string; person: string; onlyMine: boolean; setOnlyMine: (v: boolean) => void;
}) {
  const { brands, orders, workers, setSelectedVideo } = useStore();

  const cards = useMemo(() => {
    const q = norm(search.trim());
    return flattenVideos(brands)
      .filter(v => v.qc !== "aprobado_cliente")
      .filter(v => !q || norm(`${v.brandName} ${v.name}`).includes(q))
      .filter(v => person === "todos" || v.clipperId === person || v.editorId === person)
      .filter(v => !onlyMine || adminTurn(v))
      .map(v => {
        const o: Order | null = findOrderForVideo(v, v.brandName, orders);
        return { v, stage: boardStage(v), turn: adminTurn(v), dl: deadlineMs(o?.deliveryDate || v.date, o?.deliveryTime) };
      })
      .sort((a, b) => Number(Boolean(b.turn)) - Number(Boolean(a.turn)) || (Number.isFinite(a.dl) ? a.dl : Infinity) - (Number.isFinite(b.dl) ? b.dl : Infinity));
  }, [brands, orders, search, person, onlyMine]);

  const columns = BOARD_STAGES.filter(s => s.key !== "listo");
  const totalTurn = cards.filter(c => c.turn).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <button
          type="button"
          onClick={() => setOnlyMine(!onlyMine)}
          className={`inline-flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${onlyMine ? "bg-accent-dim border-accent/40 text-accent" : "border-line text-muted hover:text-text"}`}
        >
          <Inbox size={13} /> Solo lo que me toca revisar {totalTurn > 0 && !onlyMine && <span className="font-tech">({totalTurn})</span>}
        </button>
        <p className="text-[11px] text-muted-2">Ordenado: primero lo que espera tu revisión, luego por fecha de entrega.</p>
      </div>

      {cards.length === 0 ? (
        <GlowCard contentClassName="p-8">
          <EmptyState icon={<Clapperboard size={22} />} title="Nada en producción con estos filtros" text="Cambia la búsqueda o el responsable, o asigna proyectos desde Por asignar." />
        </GlowCard>
      ) : (
        <div className="overflow-x-auto pb-2 -mx-1 px-1">
          <div className="grid grid-cols-5 gap-3 min-w-[1100px]">
            {columns.map(col => {
              const list = cards.filter(c => c.stage === col.key);
              return (
                <div key={col.key} className="bg-surface-2/60 border border-line rounded-xl p-2.5 flex flex-col min-h-[320px]">
                  <div className="flex items-center justify-between px-1 pb-2">
                    <p className="text-xs font-semibold flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${STAGE_TONE[col.key]}`} /> {col.label}
                    </p>
                    <span className="font-tech text-[11px] text-muted-2">{list.length}</span>
                  </div>
                  <p className="text-[10px] text-muted-2 px-1 pb-2">{col.hint}</p>
                  <div className="space-y-2 overflow-y-auto max-h-[62vh] pr-0.5">
                    {list.length === 0 && <p className="text-[11px] text-muted-2 text-center py-6 border border-dashed border-line rounded-lg">Vacío</p>}
                    {list.map(({ v, turn, dl }) => (
                      <KanbanCard key={v.id} v={v} turn={turn} dl={dl} workerName={workers.find(w => w.id === (v.clipperId || v.editorId))?.name || v.clipperName} onOpen={() => setSelectedVideo(v)} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function KanbanCard({ v, turn, dl, workerName, onOpen }: { v: VideoWithBrand; turn: string | null; dl: number; workerName: string; onOpen: () => void }) {
  const late = v.qc !== "aprobado_senda" && Number.isFinite(dl) && dl < Date.now();
  const openCorrections = v.corrections.filter(c => !c.resolved).length;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`w-full text-left p-2.5 rounded-lg border bg-surface-3 transition-all hover:-translate-y-0.5 ${turn ? "border-accent/60 shadow-[0_0_18px_-10px_rgba(53,214,228,0.9)]" : "border-line hover:border-accent/40"}`}
    >
      <p className="text-xs font-semibold truncate">{v.brandName}</p>
      <p className="text-[11px] text-muted">{v.name}</p>
      {turn && (
        <p className="mt-1.5 text-[10px] font-semibold text-accent flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" /> Te toca: {turn}
        </p>
      )}
      {openCorrections > 0 && <p className="mt-1 text-[10px] text-red-400">{openCorrections} corrección(es) abiertas</p>}
      <div className="flex items-center justify-between gap-2 mt-2">
        <span className="flex items-center gap-1.5 min-w-0">
          <span className="w-5 h-5 rounded-md bg-accent-dim text-accent text-[9px] font-bold font-tech flex items-center justify-center shrink-0">{initialsOf(workerName || "?")}</span>
          <span className="text-[10px] text-muted-2 truncate">{workerName || "Sin responsable"}</span>
        </span>
        <span className={`text-[10px] font-tech shrink-0 ${late ? "text-red-400" : "text-muted-2"}`}>{v.qc === "aprobado_senda" ? "Con el cliente" : countdownLabel(dl).replace("Vence en ", "")}</span>
      </div>
    </button>
  );
}
