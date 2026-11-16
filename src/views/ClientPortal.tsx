import { useEffect, useMemo, useRef, useState } from 'react';
import { takeNavIntent } from '../lib/navIntent';
import { useStore } from '../store';
import type { Brand, Correction, Video } from '../types';
import { resolveMediaUrl, isGoogleDriveUrl, getGoogleDrivePreviewUrl, getGoogleDriveStreamUrl } from '../lib/supabaseClient';
import { findOrderForVideo } from '../lib/economics';
import { CorrectionTimeline, fmtTime, parseTime } from '../components/CorrectionTimeline';
import { GlowCard } from '../components/ui/spotlight-card';
import { EmptyState, StatChip } from '../components/home/home-bits';
import {
  ArrowLeft, CheckCircle2, ChevronLeft, ChevronRight, Clock, Film, FolderOpen, Lock, Maximize2,
  MessageSquare, Monitor, Play, Plus, Send, Smartphone, Sparkles, Trash2, Unlock, X,
} from 'lucide-react';

type Filter = 'todos' | 'revisar' | 'aprobados' | 'produccion';
type Orientation = 'auto' | 'horizontal' | 'vertical';

const isDelivered = (v: Video) => Boolean(v.publishedToClient || v.qc === 'aprobado_senda' || v.qc === 'aprobado_cliente');
const finalOf = (v: Video) => v.finalVideos[v.finalVideos.length - 1] || null;

function videoStatus(v: Video): { label: string; cls: string; dot: string } {
  if (v.qc === 'aprobado_cliente') return { label: 'Aprobado por el cliente', cls: 'bg-mint-dim text-mint border-mint/30', dot: 'bg-mint' };
  if (isDelivered(v) && v.qc === 'correcciones') return { label: 'Feedback en corrección', cls: 'bg-red-500/10 text-red-400 border-red-500/30', dot: 'bg-red-500' };
  if (isDelivered(v)) return { label: 'Listo para revisar', cls: 'bg-accent-dim text-accent border-accent/30', dot: 'bg-accent' };
  return { label: 'En producción', cls: 'bg-surface-3 text-muted-2 border-line', dot: 'bg-muted-2' };
}

function sortedVideos(b: Brand) {
  return b.videos.slice().sort((a, c) => (a.videoNumber || 0) - (c.videoNumber || 0));
}

/** Portal del cliente: marcas → videos entregados → revisión con feedback en la línea de tiempo. */
export function ClientPortal() {
  const { brands, orders, role } = useStore();
  // Desde Inicio se puede abrir directo un video: "brandId::videoId"
  const [intent] = useState(() => (takeNavIntent('revision') || '').split('::'));
  const [brandId, setBrandId] = useState<string | null>(intent[0] || null);
  const [videoId, setVideoId] = useState<string | null>(intent[1] || null);
  const [filter, setFilter] = useState<Filter>('todos');

  const orderedBrands = useMemo(
    () => brands.slice().sort((a, b) => b.videos.filter(isDelivered).length - a.videos.filter(isDelivered).length),
    [brands]
  );
  const brand = orderedBrands.find(b => b.id === brandId) || orderedBrands[0] || null;
  const videos = brand ? sortedVideos(brand) : [];
  const video = videos.find(v => v.id === videoId) || null;
  // La copia del cliente usa "brand-<idPedido>"; si aún no hay videos se busca el pedido por ese id o por la marca
  const order = !brand ? null
    : videos[0] ? findOrderForVideo(videos[0], brand.name, orders)
    : orders.find(o => `brand-${o.id}` === brand.id) || orders.find(o => o.brand.trim().toLowerCase() === brand.name.trim().toLowerCase()) || null;

  if (!brand) {
    return (
      <GlowCard contentClassName="p-8">
        <EmptyState
          icon={<Film size={22} />}
          title="Aún no hay entregas"
          text={role === 'cliente'
            ? 'Tus videos aparecerán aquí en cuanto el equipo SENDA los entregue.'
            : 'Cuando apruebes un video con “Aprobado Senda”, aparecerá aquí para el cliente.'}
        />
      </GlowCard>
    );
  }

  return (
    <div className="space-y-5">
      {/* Marcas: tira horizontal con progreso */}
      <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1 snap-x">
        {orderedBrands.map(b => {
          const total = b.videos.length || 1;
          const approved = b.videos.filter(v => v.qc === 'aprobado_cliente').length;
          const delivered = b.videos.filter(isDelivered).length;
          const active = b.id === brand.id;
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => { setBrandId(b.id); setVideoId(null); setFilter('todos'); }}
              className={`snap-start shrink-0 w-60 text-left rounded-xl border p-3.5 transition-all ${
                active ? 'bg-accent-dim/40 border-accent shadow-[0_0_20px_-10px_rgba(53,214,228,0.8)]' : 'bg-surface-2 border-line hover:border-accent/40'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold truncate">{b.name}</p>
                <span className="font-tech text-[11px] text-muted-2">{b.videos.length} vid</span>
              </div>
              <div className="flex h-1.5 rounded-full overflow-hidden bg-surface-3 mt-2.5">
                <span className="bg-mint" style={{ width: `${(approved / total) * 100}%` }} />
                <span className="bg-accent" style={{ width: `${((delivered - approved) / total) * 100}%` }} />
              </div>
              <p className="text-[11px] text-muted-2 mt-1.5 font-tech">
                <span className="text-accent">{delivered}</span> entregados · <span className="text-mint">{approved}</span> aprobados
              </p>
            </button>
          );
        })}
      </div>

      {video ? (
        <VideoReview
          key={video.id}
          brand={brand}
          video={video}
          videos={videos}
          onBack={() => setVideoId(null)}
          onNavigate={setVideoId}
        />
      ) : (
        <BrandOverview
          brand={brand}
          videos={videos}
          driveUrl={order?.driveFolderUrl || null}
          deliveryLabel={order?.deliveryDate ? `${order.deliveryDate}${order.deliveryTime ? ` · ${order.deliveryTime}` : ''}` : null}
          plannedCount={order?.videoCount || 0}
          filter={filter}
          onFilter={setFilter}
          onOpen={setVideoId}
        />
      )}
    </div>
  );
}

function BrandOverview({
  brand, videos, driveUrl, deliveryLabel, plannedCount, filter, onFilter, onOpen,
}: {
  brand: Brand; videos: Video[]; driveUrl: string | null; deliveryLabel: string | null; plannedCount: number;
  filter: Filter; onFilter: (f: Filter) => void; onOpen: (id: string) => void;
}) {
  const counts = {
    revisar: videos.filter(v => isDelivered(v) && v.qc !== 'aprobado_cliente').length,
    aprobados: videos.filter(v => v.qc === 'aprobado_cliente').length,
    produccion: videos.filter(v => !isDelivered(v)).length,
  };
  const visible = videos.filter(v =>
    filter === 'todos' ? true
      : filter === 'revisar' ? isDelivered(v) && v.qc !== 'aprobado_cliente'
      : filter === 'aprobados' ? v.qc === 'aprobado_cliente'
      : !isDelivered(v)
  );

  return (
    <GlowCard contentClassName="p-5 space-y-4" className="animate-fadeIn">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="font-display text-xl font-bold flex items-center gap-2"><Film size={18} className="text-accent shrink-0" /> {brand.name}</h3>
          <p className="text-xs text-muted mt-0.5 flex items-center gap-3 flex-wrap">
            <span>{videos.length} videos en el pedido</span>
            {deliveryLabel && <span className="flex items-center gap-1"><Clock size={12} /> Entrega {deliveryLabel}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <StatChip label="Por revisar" value={counts.revisar} tone="accent" onClick={() => onFilter('revisar')} />
          <StatChip label="Aprobados" value={counts.aprobados} tone="mint" onClick={() => onFilter('aprobados')} />
          <StatChip label="En producción" value={counts.produccion} tone="amber" onClick={() => onFilter('produccion')} />
          {driveUrl && (
            <a href={driveUrl} target="_blank" rel="noreferrer"
              className="self-stretch px-3.5 rounded-xl bg-surface-2 border border-line hover:border-mint/40 text-xs font-medium text-muted hover:text-mint flex items-center gap-1.5 transition-colors">
              <FolderOpen size={15} /> Carpeta Drive
            </a>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 bg-surface-3 border border-line rounded-xl p-1 w-fit flex-wrap" role="tablist">
        {([
          ['todos', 'Todos', videos.length],
          ['revisar', 'Por revisar', counts.revisar],
          ['aprobados', 'Aprobados', counts.aprobados],
          ['produccion', 'En producción', counts.produccion],
        ] as [Filter, string, number][]).map(([key, label, n]) => (
          <button key={key} type="button" role="tab" aria-selected={filter === key} onClick={() => onFilter(key)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${filter === key ? 'bg-accent text-on-accent shadow-[0_0_16px_-6px_rgba(53,214,228,0.7)]' : 'text-muted hover:text-text'}`}>
            {label}
            <span className={`font-tech text-[11px] px-1.5 rounded ${filter === key ? 'bg-black/20' : 'bg-surface-2'}`}>{n}</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {videos.length === 0 ? (
          <div className="col-span-full">
            <EmptyState icon={<Clock size={22} />}
              title={plannedCount ? `${plannedCount} videos en producción` : 'Videos en producción'}
              text={`Cada video aparecerá aquí en cuanto el equipo lo entregue${deliveryLabel ? ` (entrega ${deliveryLabel})` : ''}.`} />
          </div>
        ) : visible.length === 0 && (
          <div className="col-span-full">
            <EmptyState icon={<Film size={22} />} title="Nada en este filtro" text="Prueba con otra pestaña para ver el resto de videos." action={{ label: 'Ver todos', onClick: () => onFilter('todos') }} />
          </div>
        )}
        {visible.map((v, i) => <VideoCard key={v.id} video={v} index={i} onOpen={() => onOpen(v.id)} />)}
      </div>
    </GlowCard>
  );
}

function VideoCard({ video, index, onOpen }: { video: Video; index: number; onOpen: () => void }) {
  const num = video.videoNumber || index + 1;
  const st = videoStatus(video);
  const delivered = isDelivered(video);
  const final = finalOf(video);
  const [thumb, setThumb] = useState<string | null>(null);

  useEffect(() => {
    let off = false;
    if (delivered && final?.fileUrl) {
      // Miniaturas solo para archivos de la plataforma: con Drive se evitaría descargar cada video al abrir la marca
      if (!isGoogleDriveUrl(final.fileUrl)) void resolveMediaUrl(final.fileUrl).then(u => { if (!off) setThumb(u); });
    }
    return () => { off = true; };
  }, [delivered, final?.fileUrl]);

  return (
    <button type="button" onClick={onOpen} disabled={!delivered}
      className="group text-left rounded-lg border border-line bg-surface-3 overflow-hidden hover:border-accent/40 hover:-translate-y-0.5 transition-all disabled:hover:translate-y-0 disabled:hover:border-line disabled:cursor-default">
      <div className="relative aspect-video bg-gradient-to-br from-surface-3 to-surface flex items-center justify-center overflow-hidden">
        {thumb ? (
          <video src={`${thumb}#t=0.5`} preload="metadata" muted playsInline onError={() => setThumb(null)} className="absolute inset-0 w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity pointer-events-none" />
        ) : (
          <span className="font-display text-5xl font-bold text-line">{String(num).padStart(2, '0')}</span>
        )}
        {delivered && (
          <span className="relative w-11 h-11 rounded-full bg-black/50 backdrop-blur-sm border border-white/20 flex items-center justify-center text-white group-hover:scale-110 transition-transform">
            <Play size={18} className="ml-0.5" />
          </span>
        )}
        <span className={`absolute top-2.5 left-2.5 text-[10px] font-semibold px-2 py-0.5 rounded-full border backdrop-blur-sm ${st.cls}`}>{st.label}</span>
      </div>
      <div className="px-3.5 py-3 flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">Video {num}</span>
        <span className="text-[11px] font-tech text-muted-2">
          {delivered ? `Feedback ${video.clientFeedbackRoundsUsed ?? 0}/${video.clientFeedbackMaxRounds ?? 1}` : <span className="flex items-center gap-1"><Lock size={11} /> Pendiente</span>}
        </span>
      </div>
    </button>
  );
}

function VideoReview({
  brand, video, videos, onBack, onNavigate,
}: {
  brand: Brand; video: Video; videos: Video[]; onBack: () => void; onNavigate: (id: string) => void;
}) {
  const { role, setQc, submitClientFeedbackBatch, enableExtraClientFeedbackRound } = useStore();
  const isAdmin = role === 'admin';
  const final = finalOf(video);
  const st = videoStatus(video);
  const delivered = isDelivered(video);
  const roundsUsed = video.clientFeedbackRoundsUsed ?? 0;
  const maxRounds = video.clientFeedbackMaxRounds ?? 1;
  const canSend = delivered && roundsUsed < maxRounds && video.qc !== 'aprobado_cliente';
  // Feedback enviado y el equipo corrigiendo: no se aprueba la versión vieja
  const inCorrection = delivered && video.qc === 'correcciones' && roundsUsed > 0;

  const playerRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [detected, setDetected] = useState<'horizontal' | 'vertical'>('horizontal');
  const [orientation, setOrientation] = useState<Orientation>('auto');
  const [drafts, setDrafts] = useState<{ time: number; text: string }[]>([]);
  const [pickTime, setPickTime] = useState<number | null>(null);
  const [timeInput, setTimeInput] = useState('0:00');
  const [text, setText] = useState('');
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const idx = videos.findIndex(v => v.id === video.id);
  const prev = videos.slice(0, idx).reverse().find(isDelivered);
  const next = videos.slice(idx + 1).find(isDelivered);

  useEffect(() => {
    let off = false;
    setSrc(null);
    if (final?.fileUrl) void resolveMediaUrl(final.fileUrl).then(u => { if (!off) setSrc(u || final.fileUrl || null); });
    return () => { off = true; };
  }, [final?.fileUrl]);

  // Drive se intenta reproducir en el reproductor propio (línea de tiempo enlazada); si falla, visor de Google
  const [driveFallback, setDriveFallback] = useState(false);
  const isDrive = Boolean(src && isGoogleDriveUrl(src) && driveFallback);
  const playSrc = src && isGoogleDriveUrl(src) ? getGoogleDriveStreamUrl(src) || src : src;
  const mode = orientation === 'auto' ? (isDrive ? 'horizontal' : detected) : orientation;
  const effectiveTime = pickTime ?? Math.round(time);
  useEffect(() => { setTimeInput(fmtTime(effectiveTime)); }, [effectiveTime]);

  const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3500); };
  const seek = (t: number) => {
    const el = playerRef.current;
    if (el) { el.currentTime = t; el.pause(); }
    setTime(t);
  };
  const addDraft = () => {
    if (!text.trim()) return;
    const t = parseTime(timeInput) ?? effectiveTime;
    setDrafts(d => [...d, { time: t, text: text.trim() }].sort((a, b) => a.time - b.time));
    setText('');
    setPickTime(null);
  };

  const sent = video.corrections.filter(c => c.author === 'cliente');
  const markers: Correction[] = [
    ...sent,
    ...drafts.map((d, i) => ({ id: `draft-${i}`, time: d.time, text: d.text })),
  ];

  return (
    <div className="space-y-4 animate-fadeIn">
      {/* Cabecera */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <button type="button" onClick={onBack} title="Volver a la marca"
            className="w-9 h-9 rounded-lg bg-surface-2 border border-line flex items-center justify-center text-muted hover:text-text hover:border-accent/50 transition-colors">
            <ArrowLeft size={17} />
          </button>
          <div className="min-w-0">
            <p className="text-[11px] font-tech uppercase tracking-wider text-muted-2">{brand.name}</p>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-display text-xl font-bold">{video.name}</h3>
              <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${st.cls}`}>{st.label}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button type="button" disabled={!prev} onClick={() => prev && onNavigate(prev.id)} title="Video anterior"
            className="h-9 px-3 rounded-lg bg-surface-2 border border-line text-xs text-muted hover:text-text disabled:opacity-30 flex items-center gap-1"><ChevronLeft size={14} /> Anterior</button>
          <button type="button" disabled={!next} onClick={() => next && onNavigate(next.id)} title="Siguiente video"
            className="h-9 px-3 rounded-lg bg-surface-2 border border-line text-xs text-muted hover:text-text disabled:opacity-30 flex items-center gap-1">Siguiente <ChevronRight size={14} /></button>
        </div>
      </div>

      {toast && (
        <div className="bg-mint-dim border border-mint/40 text-mint rounded-xl px-4 py-2.5 text-xs font-semibold flex items-center gap-2 animate-fadeIn">
          <CheckCircle2 size={15} /> {toast}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        {/* Reproductor + línea de tiempo */}
        <GlowCard className="xl:col-span-8" contentClassName="p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1 bg-surface-3 border border-line rounded-lg p-0.5">
              {([['auto', 'Auto', Sparkles], ['horizontal', 'Horizontal', Monitor], ['vertical', 'Vertical', Smartphone]] as const).map(([key, label, Icon]) => (
                <button key={key} type="button" onClick={() => setOrientation(key)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium flex items-center gap-1 transition-colors ${orientation === key ? 'bg-accent text-on-accent' : 'text-muted hover:text-text'}`}>
                  <Icon size={12} /> {label}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => void frameRef.current?.requestFullscreen?.()} title="Pantalla completa"
              className="h-8 px-2.5 rounded-lg bg-surface-3 border border-line text-[11px] text-muted hover:text-text flex items-center gap-1">
              <Maximize2 size={12} /> Pantalla completa
            </button>
          </div>

          <div ref={frameRef} className="bg-black rounded-lg overflow-hidden flex items-center justify-center">
            {!delivered ? (
              <div className="aspect-video w-full flex flex-col items-center justify-center text-center p-6 gap-2 bg-surface-3">
                <Clock size={34} className="text-amber" />
                <p className="text-sm font-semibold text-text">Este video aún está en producción</p>
                <p className="text-xs text-muted max-w-md">Aparecerá aquí en cuanto el administrador lo marque como “Aprobado Senda” en Tareas.</p>
              </div>
            ) : !src ? (
              <div className="aspect-video w-full flex items-center justify-center bg-surface-3 text-xs text-muted">Cargando video…</div>
            ) : isDrive ? (
              <iframe
                src={getGoogleDrivePreviewUrl(src) || src}
                title={video.name}
                allow="autoplay; encrypted-media; fullscreen"
                allowFullScreen
                className={`border-0 ${mode === 'vertical' ? 'h-[min(78vh,760px)] aspect-[9/16]' : 'w-full aspect-video'}`}
              />
            ) : (
              <video
                ref={playerRef}
                src={playSrc || undefined}
                onError={() => { if (src && isGoogleDriveUrl(src)) setDriveFallback(true); }}
                controls
                playsInline
                onLoadedMetadata={e => {
                  const el = e.currentTarget;
                  setDuration(el.duration || 0);
                  setDetected(el.videoHeight > el.videoWidth ? 'vertical' : 'horizontal');
                }}
                onTimeUpdate={e => setTime(e.currentTarget.currentTime)}
                className={`object-contain ${mode === 'vertical' ? 'h-[min(78vh,760px)] w-auto max-w-full' : 'w-full aspect-video'}`}
              />
            )}
          </div>

          {delivered && (
            <div className="bg-surface-3 border border-line rounded-lg p-3.5 space-y-2">
              <p className="text-[11px] font-semibold text-muted flex items-center gap-1.5">
                <Clock size={12} className="text-accent" /> Línea de tiempo del feedback
                <span className="ml-auto flex items-center gap-3 font-normal text-muted-2">
                  <span className="flex items-center gap-1"><span className="w-1.5 h-3 rounded-full bg-amber" /> Por enviar</span>
                  <span className="flex items-center gap-1"><span className="w-1.5 h-3 rounded-full bg-red-500" /> Enviado</span>
                  <span className="flex items-center gap-1"><span className="w-1.5 h-3 rounded-full bg-mint" /> Corregido</span>
                </span>
              </p>
              <CorrectionTimeline
                duration={duration || video.durationSeconds || 60}
                currentTime={time}
                corrections={markers}
                pickTime={canSend ? pickTime : null}
                onPick={setPickTime}
                onSeek={seek}
                editable={canSend}
                markerClass={c => (c.id.startsWith('draft-') ? 'bg-amber' : null)}
              />
              {isDrive && canSend && (
                <p className="text-[10px] text-muted-2">Este video se muestra con el visor de Google Drive: pausa en el momento exacto y escribe el minuto (ej. 0:42).</p>
              )}
            </div>
          )}
        </GlowCard>

        {/* Panel lateral: feedback + decisión */}
        <div className="xl:col-span-4 space-y-4">
          <GlowCard tone="amber" contentClassName="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold flex items-center gap-2"><MessageSquare size={18} className="text-amber shrink-0" /> Feedback</h3>
              <span className="flex gap-1">
                {Array.from({ length: maxRounds }).map((_, i) => (
                  <span key={i} title={`Ronda ${i + 1}`} className={`w-5 h-1.5 rounded-full ${i < roundsUsed ? 'bg-amber' : 'bg-surface-3 border border-line'}`} />
                ))}
              </span>
            </div>

            {canSend ? (
              <>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 bg-surface-3 border border-line rounded-lg pl-2 focus-within:border-amber transition-colors">
                    <Clock size={12} className="text-amber" />
                    <input value={timeInput}
                      onChange={e => { setTimeInput(e.target.value); const t = parseTime(e.target.value); if (t !== null) setPickTime(t); }}
                      className="w-12 bg-transparent py-2 text-xs font-tech font-bold text-amber outline-none" />
                  </div>
                  {!isDrive && (
                    <button type="button" onClick={() => setPickTime(Math.round(time))}
                      className="text-[11px] text-muted hover:text-accent px-2 py-2 rounded-lg bg-surface-3 border border-line hover:border-accent/50 transition-colors">
                      Tiempo actual
                    </button>
                  )}
                </div>
                <div className="flex gap-2">
                  <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addDraft(); }}
                    placeholder="¿Qué quieres cambiar en este momento?"
                    className="flex-1 min-w-0 bg-surface-3 border border-line rounded-lg px-3 py-2 text-xs outline-none focus:border-accent placeholder:text-muted-2" />
                  <button type="button" onClick={addDraft} disabled={!text.trim()}
                    className="px-3 rounded-lg bg-surface-3 border border-line text-accent text-xs font-semibold flex items-center gap-1 hover:border-accent/50 disabled:opacity-40">
                    <Plus size={13} /> Añadir
                  </button>
                </div>

                {drafts.length === 0 ? (
                  <p className="text-[11px] text-muted-2 text-center py-3 border border-dashed border-line rounded-xl">
                    Pausa el video, añade cada punto y envíalos todos juntos en una sola ronda.
                  </p>
                ) : (
                  <ul className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                    {drafts.map((d, i) => (
                      <li key={i} className="flex items-start gap-2 bg-surface-3/70 border border-line rounded-lg px-2.5 py-2">
                        <button type="button" onClick={() => seek(d.time)}
                          className="font-tech text-[11px] font-bold px-1.5 py-0.5 rounded bg-amber-dim text-amber shrink-0">{fmtTime(d.time)}</button>
                        <p className="flex-1 text-xs leading-snug">{d.text}</p>
                        <button type="button" onClick={() => setDrafts(list => list.filter((_, j) => j !== i))} title="Quitar"
                          className="text-muted-2 hover:text-red-400"><Trash2 size={12} /></button>
                      </li>
                    ))}
                  </ul>
                )}

                <button type="button" disabled={drafts.length === 0}
                  onClick={() => {
                    submitClientFeedbackBatch(video.id, drafts);
                    setDrafts([]);
                    flash('Feedback enviado. El equipo ya tiene las correcciones con su minuto exacto.');
                  }}
                  className="w-full py-2.5 rounded-xl bg-amber text-on-accent text-xs font-bold flex items-center justify-center gap-1.5 hover:opacity-95 disabled:opacity-40 disabled:cursor-not-allowed">
                  <Send size={13} /> Enviar {drafts.length > 0 ? `${drafts.length} corrección(es)` : 'correcciones'} · usa 1 ronda
                </button>
              </>
            ) : (
              <div className="bg-surface-3/60 border border-line rounded-xl p-3 text-xs text-muted flex items-start gap-2">
                <Lock size={14} className="text-amber shrink-0 mt-0.5" />
                <span>
                  {!delivered ? 'El feedback se habilita cuando el video esté entregado.'
                    : video.qc === 'aprobado_cliente' ? 'Video aprobado: ya no recibe correcciones.'
                    : 'La ronda de feedback ya se usó. El equipo está aplicando las correcciones.'}
                </span>
              </div>
            )}

            {sent.length > 0 && (
              <div className="pt-2 border-t border-line space-y-1.5">
                <span className="text-[10px] font-tech uppercase text-muted-2">Enviado ({sent.length})</span>
                <ul className="space-y-1 max-h-40 overflow-y-auto pr-1">
                  {sent.slice().sort((a, b) => a.time - b.time).map(c => (
                    <li key={c.id} className="flex items-start gap-2 text-xs">
                      <button type="button" onClick={() => seek(c.time)}
                        className={`font-tech text-[11px] font-bold px-1.5 rounded shrink-0 ${c.resolved ? 'bg-mint-dim text-mint' : 'bg-red-500/10 text-red-400'}`}>{fmtTime(c.time)}</button>
                      <span className={c.resolved ? 'text-muted line-through' : ''}>{c.text.replace(/^\[Feedback Cliente · Ronda \d+\]\s*/, '')}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </GlowCard>

          {/* Decisión final */}
          <GlowCard tone="mint" contentClassName="p-5 space-y-3">
            <h3 className="font-display text-lg font-semibold flex items-center gap-2"><CheckCircle2 size={18} className="text-mint shrink-0" /> Decisión final</h3>
            {video.qc === 'aprobado_cliente' ? (
              <p className="text-xs text-mint">Aprobado por el cliente{video.date ? ` el ${video.date}` : ''}. El pago del 100% quedó liberado.</p>
            ) : confirmApprove ? (
              <div className="space-y-2 animate-fadeIn">
                <p className="text-xs text-muted">¿Confirmas que el video queda aprobado? Esto cierra el video y libera el 100% del pago al equipo.</p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setConfirmApprove(false)}
                    className="flex-1 py-2 rounded-xl bg-surface-3 border border-line text-xs text-muted hover:text-text flex items-center justify-center gap-1"><X size={13} /> Cancelar</button>
                  <button type="button"
                    onClick={() => { setQc(video.id, 'aprobado_cliente'); setConfirmApprove(false); flash(`${video.name} aprobado por el cliente.`); }}
                    className="flex-1 py-2 rounded-xl bg-mint text-on-accent text-xs font-bold flex items-center justify-center gap-1"><CheckCircle2 size={13} /> Sí, aprobar</button>
                </div>
              </div>
            ) : (
              <>
              {inCorrection && (
                <p className="text-xs text-muted">El equipo está aplicando tu feedback. Podrás aprobar cuando llegue la versión corregida.</p>
              )}
              <button type="button" disabled={!delivered || drafts.length > 0 || inCorrection} onClick={() => setConfirmApprove(true)}
                title={drafts.length > 0 ? 'Tienes correcciones sin enviar' : inCorrection ? 'Esperando la versión corregida' : undefined}
                className="w-full py-3 rounded-xl bg-mint text-on-accent text-xs font-bold flex items-center justify-center gap-2 hover:opacity-95 disabled:opacity-40 disabled:cursor-not-allowed">
                <CheckCircle2 size={15} /> Aprobar video
              </button>
              </>
            )}
          </GlowCard>

          {isAdmin && delivered && video.qc !== 'aprobado_cliente' && !canSend && (
            <button type="button"
              onClick={() => { enableExtraClientFeedbackRound(video.id); flash(`Se habilitó una ronda extra de feedback para ${video.name}.`); }}
              className="w-full py-2.5 rounded-xl bg-surface-2 border border-accent/40 text-accent text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-accent/10 transition-colors">
              <Unlock size={13} /> Habilitar una ronda extra de feedback
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
