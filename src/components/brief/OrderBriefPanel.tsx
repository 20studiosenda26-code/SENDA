import { useEffect, useState } from 'react';
import { CheckCircle2, Download, ExternalLink, FileText, Loader2, Plus, RefreshCw, RotateCcw, ScrollText, Send, ShieldCheck, Trash2, X } from 'lucide-react';
import { useStore } from '../../store';
import type { Order, OrderScript } from '../../types';
import { BriefEditor } from './BriefEditor';
import { reviewOf, REVIEW_LABEL, briefReadiness } from '../../lib/scripts';
import { AGENCY_STYLE_ID } from '../../lib/styleCatalog';

const newScript = (n: number): OrderScript => ({ id: `sc-${Date.now()}-${n}`, title: `Guión ${n}`, text: '' });

/** Admin: ve el brief como el cliente, lo corrige o lo borra, descarga su PDF y gestiona el servicio de guiones. */
export function OrderBriefPanel({ order }: { order: Order }) {
  const { generateBriefPdf, publishScripts, updateOrder, reopenBrief } = useStore();
  const [reopenMsg, setReopenMsg] = useState('');
  const [reopening, setReopening] = useState(false);
  const [openBrief, setOpenBrief] = useState(false);
  const [busy, setBusy] = useState<'pdf' | 'scripts' | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [scripts, setScripts] = useState<OrderScript[]>(order.scripts || []);

  // Si cambian por fuera (otro admin), se actualizan mientras no haya cambios sin publicar
  useEffect(() => { setScripts(order.scripts || []); }, [order.scripts]);

  const dirty = JSON.stringify(scripts) !== JSON.stringify(order.scripts || []);
  const flash = (ok: boolean, text: string) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), 4000); };

  const ready = briefReadiness(order);
  const reviews = (order.scripts || []).map(s => reviewOf(order, { ...s, source: 'agencia' as const }));
  const stylePicked = (order.scriptChoices || []).some(c => c.styleId && c.styleId !== AGENCY_STYLE_ID) || Boolean(order.editingStyleId && order.editingStyleId !== AGENCY_STYLE_ID);
  const steps = [
    { label: `Avatares ${ready.chosen}/${ready.total} (obligatorio)`, ok: ready.chosen === ready.total },
    { label: 'Estilo', ok: stylePicked },
    { label: 'Referencias', ok: (order.references || []).length > 0 },
    { label: 'Confirmado', ok: ready.confirmed },
  ];

  const genPdf = async () => {
    setBusy('pdf');
    const ok = await generateBriefPdf(order.id);
    setBusy(null);
    flash(ok, ok ? 'PDF del brief generado y subido al proyecto' : 'No se pudo generar el PDF. Intenta de nuevo.');
  };
  const publish = async () => {
    setBusy('scripts');
    const ok = await publishScripts(order.id, scripts);
    setBusy(null);
    flash(ok, ok ? 'Guiones publicados: el cliente ya los ve y recibió el aviso por el chat' : 'No se pudieron publicar los guiones. Intenta de nuevo.');
  };

  return (
    <div className="bg-surface-3/50 border border-line rounded-xl p-4 space-y-4 animate-fadeIn">
      {/* Brief */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-sm font-semibold flex items-center gap-1.5"><FileText size={15} className="text-accent" /> Brief del proyecto</p>
          <div className="flex items-center gap-1.5 flex-wrap">
            {steps.map(s => (
              <span key={s.label} className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 ${s.ok ? 'bg-mint-dim text-mint' : 'bg-surface-2 text-muted-2'}`}>
                {s.ok ? <CheckCircle2 size={10} /> : <span className="w-2 h-2 rounded-full border border-current" />} {s.label}
              </span>
            ))}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button type="button" onClick={() => setOpenBrief(true)}
            className="px-3.5 py-2 rounded-lg bg-violet/15 border border-violet/40 text-violet text-xs font-semibold flex items-center gap-1.5 hover:bg-violet/25">
            <ShieldCheck size={14} /> Abrir brief como cliente
          </button>
          {order.briefFileUrl ? (
            <a href={order.briefFileUrl} target="_blank" rel="noreferrer" download={order.briefFileName || undefined}
              className="px-3.5 py-2 rounded-lg bg-surface-2 border border-line text-xs font-medium flex items-center gap-1.5 hover:border-accent/40">
              <Download size={14} className="text-accent" /> Descargar brief PDF <ExternalLink size={11} className="text-muted-2" />
            </a>
          ) : null}
          <button type="button" disabled={busy === 'pdf'} onClick={() => void genPdf()}
            className="px-3.5 py-2 rounded-lg bg-surface-2 border border-line text-xs font-medium flex items-center gap-1.5 hover:border-accent/40 disabled:opacity-50">
            {busy === 'pdf' ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} className="text-accent" />} {order.briefFileUrl ? 'Regenerar PDF' : 'Generar PDF del brief'}
          </button>
        </div>
        <p className="text-[11px] text-muted-2">Cuando el cliente confirma su brief, el PDF se genera solo y queda en el proyecto para el Clipper.</p>

        {!ready.ready && !order.clipperId && (
          <p className="text-[11px] text-amber bg-amber-dim/40 border border-amber/30 rounded-lg px-3 py-2">No se puede asignar a producción todavía. {ready.reason} Se necesita el brief confirmado con un avatar por cada video.</p>
        )}

        {order.briefConfirmedAt && (
          <div className="bg-surface-2 border border-line rounded-xl p-3 space-y-2">
            <p className="text-xs font-semibold flex items-center gap-1.5"><RotateCcw size={13} className="text-amber" /> ¿Falta algo? Devuelve el brief al cliente</p>
            <p className="text-[11px] text-muted-2">Quita la confirmación y el brief vuelve a "pendiente"{order.clipperId ? ' aunque el proyecto ya esté en producción' : ''}. El cliente recibe tu mensaje por el chat y lo completa de nuevo.</p>
            <textarea value={reopenMsg} onChange={e => setReopenMsg(e.target.value)} rows={2} placeholder="¿Qué falta? (ej. Falta el guión 3 / falta elegir el avatar del video 4)"
              className="w-full bg-surface-3 border border-line rounded-lg px-3 py-2 text-xs outline-none focus:border-accent resize-none placeholder:text-muted-2" />
            <button type="button" disabled={reopening || !reopenMsg.trim()}
              onClick={async () => { setReopening(true); await reopenBrief(order.id, reopenMsg); setReopening(false); setReopenMsg(''); flash(true, 'Brief devuelto a pendiente y cliente avisado por el chat'); }}
              className="px-3.5 py-2 rounded-lg bg-amber-dim border border-amber/40 text-amber text-xs font-semibold flex items-center gap-1.5 hover:bg-amber/20 disabled:opacity-40">
              {reopening ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />} Regresar a brief pendiente y avisar
            </button>
          </div>
        )}
      </div>

      {/* Servicio de guiones */}
      <div className="space-y-3 pt-4 border-t border-line">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm font-semibold flex items-center gap-1.5"><ScrollText size={15} className="text-accent" /> Servicio de guiones</p>
          <button type="button" role="switch" aria-checked={Boolean(order.scriptsService)}
            onClick={() => updateOrder(order.id, { scriptsService: !order.scriptsService })}
            className={`flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${order.scriptsService ? 'bg-mint-dim text-mint border-mint/30' : 'bg-surface-2 text-muted border-line'}`}>
            <span className={`w-8 h-4 rounded-full relative transition-colors ${order.scriptsService ? 'bg-mint' : 'bg-surface-3 border border-line'}`}>
              <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${order.scriptsService ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </span>
            {order.scriptsService ? 'Activo para este cliente' : 'Inactivo'}
          </button>
        </div>

        {order.scriptsService && (
          <div className="space-y-2.5 animate-fadeIn">
            <p className="text-[11px] text-muted-2">Escribe un guión por video. Al publicar, se genera el PDF de guiones con la plantilla de SENDA y el cliente recibe el aviso por el chat para elegir avatar y estilo de cada uno.</p>
            {scripts.map((s, i) => (
              <div key={s.id} className="bg-surface-2 border border-line rounded-xl p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="font-tech text-[11px] font-bold bg-surface-3 text-accent rounded-md px-2 py-1 shrink-0">GUIÓN {i + 1}</span>
                  <input value={s.title} onChange={e => setScripts(list => list.map(x => x.id === s.id ? { ...x, title: e.target.value } : x))} placeholder="Título del guión"
                    className="flex-1 bg-surface-3 border border-line rounded-lg px-3 py-1.5 text-sm outline-none focus:border-accent" />
                  <button type="button" title="Quitar guión" onClick={() => setScripts(list => list.filter(x => x.id !== s.id))} className="text-muted-2 hover:text-red-400"><Trash2 size={14} /></button>
                </div>
                <textarea value={s.text} onChange={e => setScripts(list => list.map(x => x.id === s.id ? { ...x, text: e.target.value } : x))} rows={5} placeholder="Escribe el guión completo del video…"
                  className="w-full bg-surface-3 border border-line rounded-lg px-3 py-2 text-sm outline-none focus:border-accent resize-y leading-relaxed" />
                {(() => {
                  const saved = (order.scripts || []).find(x => x.id === s.id);
                  const rv = saved ? reviews[(order.scripts || []).indexOf(saved)] : null;
                  const stale = saved && (order.scriptReviews || []).some(r => r.scriptId === s.id) && !rv;
                  if (!rv && !stale) return null;
                  return rv ? (
                    <p className={`text-[11px] rounded-lg px-3 py-2 border ${rv.status === 'approved' ? 'bg-mint-dim text-mint border-mint/30' : rv.status === 'rejected' ? 'bg-red-500/10 text-red-400 border-red-500/30' : 'bg-amber-dim text-amber border-amber/30'}`}>
                      <b>Cliente: {REVIEW_LABEL[rv.status]}</b> · {rv.at.slice(0, 10)}{rv.feedback ? <> — <span className="text-text/90">{rv.feedback}</span></> : null}
                    </p>
                  ) : <p className="text-[11px] text-muted-2">Cambiaste este guión: el cliente debe revisarlo de nuevo.</p>;
                })()}
              </div>
            ))}
            <div className="flex items-center gap-2 flex-wrap">
              <button type="button" onClick={() => setScripts(list => [...list, newScript(list.length + 1)])}
                className="px-3 py-2 rounded-lg bg-surface-2 border border-line text-xs font-medium flex items-center gap-1.5 hover:border-accent/40"><Plus size={13} className="text-accent" /> Agregar guión</button>
              {scripts.length === 0 && order.videoCount > 1 && (
                <button type="button" onClick={() => setScripts(Array.from({ length: order.videoCount }, (_, i) => newScript(i + 1)))}
                  className="px-3 py-2 rounded-lg bg-surface-2 border border-line text-xs font-medium hover:border-accent/40">Crear {order.videoCount} guiones en blanco</button>
              )}
              <button type="button" disabled={busy === 'scripts' || scripts.every(s => !s.text.trim()) || (!dirty && Boolean(order.scriptsPublishedAt))} onClick={() => void publish()}
                className="ml-auto px-4 py-2 rounded-lg bg-accent text-on-accent text-xs font-semibold flex items-center gap-1.5 hover:bg-accent-strong disabled:opacity-40">
                {busy === 'scripts' ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} {order.scriptsPublishedAt ? 'Publicar cambios al cliente' : 'Publicar guiones al cliente'}
              </button>
            </div>
            {(order.clientScripts || []).length > 0 && (
              <div className="bg-surface-2 border border-line rounded-xl p-3 space-y-2">
                <p className="text-xs font-semibold flex items-center gap-1.5"><FileText size={13} className="text-violet" /> Guiones propios del cliente ({(order.clientScripts || []).length})</p>
                {(order.clientScripts || []).map(s => (
                  <div key={s.id} className="text-xs bg-surface-3 border border-line rounded-lg px-3 py-2">
                    <p className="font-medium flex items-center gap-2">{s.title}{s.fileUrl && <a href={s.fileUrl} target="_blank" rel="noreferrer" className="text-accent font-semibold flex items-center gap-1"><Download size={11} /> {s.fileName || 'PDF'}</a>}</p>
                    {s.text && <p className="text-muted mt-1 whitespace-pre-wrap line-clamp-4">{s.text}</p>}
                  </div>
                ))}
              </div>
            )}
            {order.scriptsPublishedAt && (
              <p className="text-[11px] text-mint flex items-center gap-1.5 flex-wrap">
                <CheckCircle2 size={12} /> Publicados el {order.scriptsPublishedAt.slice(0, 10)}
                {order.scriptsPdfUrl && <a href={order.scriptsPdfUrl} target="_blank" rel="noreferrer" className="underline hover:text-text">Ver PDF de guiones</a>}
              </p>
            )}
          </div>
        )}
      </div>

      {msg && <p className={`text-xs flex items-center gap-1.5 ${msg.ok ? 'text-mint' : 'text-red-400'}`}>{msg.ok ? <CheckCircle2 size={13} /> : <X size={13} />} {msg.text}</p>}

      {openBrief && (
        <div className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm overflow-y-auto p-3 sm:p-6 animate-fadeIn" onClick={() => setOpenBrief(false)}>
          <div className="max-w-4xl mx-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-end mb-2">
              <button type="button" onClick={() => setOpenBrief(false)} className="px-3 py-1.5 rounded-lg bg-surface-2 border border-line text-xs text-muted hover:text-text flex items-center gap-1.5"><X size={13} /> Cerrar</button>
            </div>
            <BriefEditor order={order} asAdmin onDone={() => setOpenBrief(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
