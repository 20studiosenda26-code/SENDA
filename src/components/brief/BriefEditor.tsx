import { useEffect, useState } from 'react';
import {
  CheckCircle2, Download, FileText, Link2, Loader2, Lock, MessageSquare, Palette, Plus, RotateCcw, Save, ScrollText, ShieldCheck,
  StickyNote, ThumbsDown, ThumbsUp, Trash2, Upload, UserCircle2,
} from 'lucide-react';
import { useStore } from '../../store';
import { uploadSharedFile } from '../../lib/supabaseClient';
import type { Order, OrderReference, OrderScript, ScriptChoice, ScriptReview } from '../../types';
import { AvatarPicker, StylePicker, avatarChosen, type AvatarChoice, type StyleChoice } from './BriefPickers';
import { allScripts, reviewOf, scriptHash, REVIEW_LABEL, choiceForSlot, slotKey, videoSlots } from '../../lib/scripts';
import { AGENCY_STYLE_ID, AGENCY_STYLE_NAME } from '../../lib/styleCatalog';

/** El brief queda fijo para el cliente cuando el proyecto ya está en producción Y él ya lo confirmó.
 *  Si entró a producción sin brief confirmado, el cliente todavía puede completarlo. */
export const briefLocked = (o: Order) => Boolean(o.clipperId) && Boolean(o.briefConfirmedAt);

function SectionTitle({ n, icon: Icon, title, hint, badge }: { n: number; icon: typeof FileText; title: string; hint: string; badge: 'obligatorio' | 'opcional' }) {
  return (
    <div className="flex items-start gap-3">
      <span className="w-7 h-7 rounded-lg bg-accent-dim text-accent font-tech text-xs font-bold flex items-center justify-center shrink-0">{n}</span>
      <div>
        <p className="font-semibold flex items-center gap-1.5 flex-wrap">
          <Icon size={15} className="text-accent" /> {title}
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${badge === 'obligatorio' ? 'bg-amber-dim text-amber' : 'bg-surface-3 text-muted-2'}`}>
            {badge === 'obligatorio' ? 'Obligatorio' : 'Opcional'}
          </span>
        </p>
        <p className="text-xs text-muted-2">{hint}</p>
      </div>
    </div>
  );
}

type Choice = { avatar: AvatarChoice; style: StyleChoice };
const emptyChoice = (): Choice => ({ avatar: {}, style: {} });
const withAgencyStyle = (s: StyleChoice): StyleChoice => (s.styleId ? s : { styleId: AGENCY_STYLE_ID, styleName: AGENCY_STYLE_NAME });

const STATUS_STYLE: Record<ScriptReview['status'], string> = {
  approved: 'bg-mint-dim text-mint border-mint/30',
  rejected: 'bg-red-500/10 text-red-400 border-red-500/30',
  feedback: 'bg-amber-dim text-amber border-amber/30',
};

/** Aprobar, rechazar o dejar feedback sobre un guión */
function ReviewBar({ order, script, readOnly, onSave }: { order: Order; script: OrderScript; readOnly?: boolean; onSave: (r: ScriptReview) => void }) {
  const current = reviewOf(order, script);
  const [mode, setMode] = useState<'rejected' | 'feedback' | null>(null);
  const [text, setText] = useState('');
  useEffect(() => { setMode(null); setText(''); }, [script.id]);

  const save = (status: ScriptReview['status'], feedback?: string) => {
    onSave({ scriptId: script.id, status, feedback: feedback?.trim() || null, at: new Date().toISOString(), hash: scriptHash(script) });
    setMode(null); setText('');
  };

  return (
    <div className="px-4 pb-4 space-y-2.5">
      {current && (
        <div className={`text-xs border rounded-lg px-3 py-2 ${STATUS_STYLE[current.status]}`}>
          <p className="font-semibold flex items-center gap-1.5">
            {current.status === 'approved' ? <ThumbsUp size={13} /> : current.status === 'rejected' ? <ThumbsDown size={13} /> : <MessageSquare size={13} />}
            {REVIEW_LABEL[current.status]} · {current.at.slice(0, 10)}
          </p>
          {current.feedback && <p className="mt-1 text-text/90 whitespace-pre-wrap">{current.feedback}</p>}
        </div>
      )}
      {!readOnly && (
        <>
          <div className="flex gap-2 flex-wrap">
            <button type="button" onClick={() => save('approved')}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition-colors ${current?.status === 'approved' ? 'bg-mint text-on-accent border-mint' : 'bg-mint-dim text-mint border-mint/30 hover:bg-mint/20'}`}>
              <ThumbsUp size={13} /> Aprobar
            </button>
            <button type="button" onClick={() => setMode(m => (m === 'rejected' ? null : 'rejected'))}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition-colors ${current?.status === 'rejected' ? 'bg-red-500 text-white border-red-500' : 'bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/20'}`}>
              <ThumbsDown size={13} /> Rechazar
            </button>
            <button type="button" onClick={() => setMode(m => (m === 'feedback' ? null : 'feedback'))}
              className="px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 border bg-surface-3 border-line text-muted hover:text-text hover:border-accent/40 transition-colors">
              <MessageSquare size={13} /> Dejar feedback
            </button>
          </div>
          {mode && (
            <div className="space-y-2 animate-fadeIn">
              <textarea value={text} onChange={e => setText(e.target.value)} rows={3} autoFocus
                placeholder={mode === 'rejected' ? '¿Qué no te convence? (opcional, pero nos ayuda a mejorarlo)' : 'Escribe qué cambiarías o qué te gustaría ajustar'}
                className="w-full bg-surface-3 border border-line rounded-xl px-3 py-2 text-sm outline-none focus:border-accent placeholder:text-muted-2 resize-none" />
              <button type="button" onClick={() => save(mode, text)} disabled={mode === 'feedback' && !text.trim()}
                className="px-4 py-2 rounded-lg bg-accent text-on-accent text-xs font-semibold hover:bg-accent-strong disabled:opacity-40">
                {mode === 'rejected' ? 'Enviar rechazo' : 'Enviar feedback'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Brief del proyecto. Lo usa el cliente (Mis proyectos) y el admin al "entrar como cliente" (asAdmin). */
export function BriefEditor({ order, asAdmin, onDone }: { order: Order; asAdmin?: boolean; onDone?: () => void }) {
  const { updateOrder, setView, saveBriefAsAdmin, resetBrief } = useStore();
  const locked = !asAdmin && briefLocked(order);
  const scripts = allScripts(order);
  const agencyScripts = scripts.filter(s => s.source !== 'cliente');
  const ownScripts = scripts.filter(s => s.source === 'cliente');

  // Una elección por VIDEO (v1…vN): el avatar de cada uno es obligatorio
  const total = videoSlots(order);
  const slotKeys = Array.from({ length: total }, (_, i) => slotKey(i));
  const [perSlot, setPerSlot] = useState<Record<string, Choice>>(() => {
    const m: Record<string, Choice> = {};
    for (let i = 0; i < total; i++) {
      const c = choiceForSlot(order, i);
      m[slotKey(i)] = c ? {
        avatar: { avatarId: c.avatarId ?? null, avatarName: c.avatarName ?? null, imageUrl: c.avatarImageUrl ?? null, customText: c.avatarCustomText ?? null, refUrl: c.avatarRefUrl ?? null },
        style: { styleId: c.styleId ?? null, styleName: c.styleName ?? null },
      } : emptyChoice();
    }
    return m;
  });
  const [refs, setRefs] = useState<OrderReference[]>(order.references || []);
  const [refName, setRefName] = useState('');
  const [refUrl, setRefUrl] = useState('');
  const [notes, setNotes] = useState(order.clientNotes || '');
  const [saved, setSaved] = useState<'draft' | 'confirmed' | 'admin' | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  // Guiones propios
  const [ownTab, setOwnTab] = useState<'escribir' | 'pdf'>('escribir');
  const [ownTitle, setOwnTitle] = useState('');
  const [ownText, setOwnText] = useState('');
  const [ownUploading, setOwnUploading] = useState(false);
  const [ownErr, setOwnErr] = useState<string | null>(null);

  useEffect(() => { setSaved(null); }, [order.id]);

  const choiceOf = (key: string) => perSlot[key] || emptyChoice();
  const setChoice = (key: string, part: Partial<Choice>) => setPerSlot(m => ({ ...m, [key]: { ...(m[key] || emptyChoice()), ...part } }));

  const refUrlValid = /^https?:\/\/\S+\.\S+/.test(refUrl.trim());
  // Solo el avatar es obligatorio; estilo, referencias y notas son opcionales
  const chosenCount = slotKeys.filter(k => avatarChosen(choiceOf(k).avatar)).length;
  const avatarsDone = chosenCount === total;
  const complete = avatarsDone;

  const addRef = () => {
    if (!refUrlValid) return;
    setRefs(r => [...r, { id: `ref-${Date.now()}`, name: refName.trim() || `Referencia ${r.length + 1}`, url: refUrl.trim() }]);
    setRefName(''); setRefUrl('');
  };

  // Revisión de guiones y guiones propios: se guardan al instante
  const saveReview = (r: ScriptReview) =>
    updateOrder(order.id, { scriptReviews: [...(order.scriptReviews || []).filter(x => x.scriptId !== r.scriptId), r] });
  const addOwnScript = (s: OrderScript) => updateOrder(order.id, { clientScripts: [...(order.clientScripts || []), s] });
  const removeOwnScript = (id: string) => {
    updateOrder(order.id, { clientScripts: (order.clientScripts || []).filter(s => s.id !== id), scriptReviews: (order.scriptReviews || []).filter(r => r.scriptId !== id) });
  };
  const submitOwnText = () => {
    if (!ownText.trim()) return;
    addOwnScript({ id: `cs-${Date.now()}`, title: ownTitle.trim() || `Guión propio ${ownScripts.length + 1}`, text: ownText.trim(), source: 'cliente' });
    setOwnTitle(''); setOwnText('');
  };
  const submitOwnPdf = async (f: File | undefined) => {
    if (!f) return;
    setOwnUploading(true); setOwnErr(null);
    try {
      const url = await uploadSharedFile(f, `brief/client-scripts/${order.id}`);
      addOwnScript({ id: `cs-${Date.now()}`, title: ownTitle.trim() || f.name.replace(/\.[^.]+$/, ''), text: '', fileName: f.name, fileUrl: url, source: 'cliente' });
      setOwnTitle('');
    } catch {
      setOwnErr('No se pudo subir el archivo. Inténtalo de nuevo.');
    } finally { setOwnUploading(false); }
  };

  const buildPatch = (confirm: boolean): Partial<Order> => {
    const base: Partial<Order> = {
      references: refs,
      clientNotes: notes.trim() || null,
      briefConfirmedAt: confirm ? new Date().toISOString() : order.briefConfirmedAt ?? null,
    };
    const choices: ScriptChoice[] = slotKeys.map(k => {
      const c = choiceOf(k);
      const st = withAgencyStyle(c.style);
      return {
        scriptId: k, avatarId: c.avatar.avatarId ?? null, avatarName: c.avatar.avatarName ?? null, avatarImageUrl: c.avatar.imageUrl ?? null,
        avatarCustomText: c.avatar.customText ?? null, avatarRefUrl: c.avatar.refUrl ?? null,
        styleId: st.styleId ?? null, styleName: st.styleName ?? null,
      };
    });
    // Los campos "únicos" antiguos reflejan el video 1 (para pantallas y datos que aún los leen)
    const first = choices[0];
    return {
      ...base,
      scriptChoices: choices,
      avatarId: first.avatarId ?? null,
      avatarName: first.avatarName || first.avatarCustomText || null,
      avatarImageUrl: first.avatarImageUrl ?? null,
      avatarCustomText: first.avatarCustomText ?? null,
      avatarRefUrl: first.avatarRefUrl ?? null,
      editingStyleId: first.styleId ?? null,
      editingStyleName: first.styleName ?? null,
    };
  };

  const saveAsClient = (confirm: boolean) => {
    updateOrder(order.id, buildPatch(confirm));
    setSaved(confirm ? 'confirmed' : 'draft');
    setTimeout(() => setSaved(null), 3000);
  };
  const saveAsAdminNow = async (notify: boolean) => {
    setBusy(true);
    const ok = await saveBriefAsAdmin(order.id, buildPatch(Boolean(order.briefConfirmedAt) || complete), notify);
    setBusy(false);
    setSaved(ok ? 'admin' : null);
    if (ok) setTimeout(() => setSaved(null), 3500);
  };

  const scriptsPublished = Boolean(order.scriptsPublishedAt);
  const waitingScripts = Boolean(order.scriptsService) && agencyScripts.length === 0;
  const steps = [
    { label: `Avatares ${chosenCount}/${total}`, ok: avatarsDone, required: true },
    { label: 'Estilo', ok: true, required: false },
    { label: 'Referencias', ok: refs.length > 0, required: false },
  ];

  return (
    <div className="glow-card bg-surface-2 border border-line rounded-xl overflow-hidden">
      <div className="p-5 border-b border-line flex items-center justify-between gap-3 flex-wrap bg-gradient-to-br from-accent/5 to-transparent">
        <div>
          <p className="text-[11px] font-tech uppercase tracking-wider text-accent">Brief del proyecto</p>
          <h3 className="font-display text-2xl font-bold">{order.brand}</h3>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {order.briefFileUrl && (
            <a href={order.briefFileUrl} target="_blank" rel="noreferrer" download={order.briefFileName || undefined}
              className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-accent-dim text-accent border border-accent/30 flex items-center gap-1 hover:bg-accent/20">
              <Download size={11} /> Brief en PDF
            </a>
          )}
          {steps.map(st => (
            <span key={st.label} className={`text-[10px] font-semibold px-2 py-1 rounded-full flex items-center gap-1 ${st.ok && (st.required || st.label === 'Referencias') ? 'bg-mint-dim text-mint' : 'bg-surface-3 text-muted-2'}`}>
              {st.ok && (st.required || st.label === 'Referencias') ? <CheckCircle2 size={11} /> : <span className="w-2.5 h-2.5 rounded-full border border-current" />} {st.label}{st.required ? '' : ' (opcional)'}
            </span>
          ))}
        </div>
      </div>

      {asAdmin && (
        <div className="mx-5 mt-5 flex items-start gap-2.5 bg-violet/10 border border-violet/30 rounded-xl px-4 py-3 text-xs text-muted">
          <ShieldCheck size={15} className="text-violet shrink-0 mt-0.5" />
          <span className="flex-1">Estás viendo y editando este brief <strong className="text-text">como si fueras el cliente</strong>. Puedes corregirlo o borrarlo y pedirle que lo rehaga; el PDF se vuelve a generar al guardar. La aprobación de guiones la hace solo el cliente.</span>
        </div>
      )}

      {locked && (
        <div className="mx-5 mt-5 flex items-start gap-2.5 bg-surface-3 border border-line rounded-xl px-4 py-3 text-xs text-muted">
          <Lock size={15} className="text-amber shrink-0 mt-0.5" />
          <span className="flex-1">Tu proyecto ya está en producción y el brief quedó fijo. Si necesitas cambiar algo, escríbenos por el chat.</span>
          <button type="button" onClick={() => setView('chat')} className="text-accent font-semibold shrink-0">Ir al chat</button>
        </div>
      )}

      <fieldset disabled={locked} className="p-5 space-y-7 disabled:opacity-70">
        {/* 1. Guiones: los de SENDA (aprobar / rechazar / feedback) y los propios del cliente */}
        <section className="space-y-3.5">
          <SectionTitle n={1} icon={ScrollText} title="Guiones" badge="opcional"
            hint={order.scriptsService ? 'Revisa los que escribió SENDA o aporta los tuyos (escritos o en PDF).' : 'Si ya tienes tus guiones, súbelos en PDF o escríbelos aquí.'} />

          {order.scriptsService && (waitingScripts || !scriptsPublished) && agencyScripts.length === 0 && (
            <p className="text-xs text-muted-2 bg-surface-3 border border-dashed border-line rounded-xl px-4 py-4">Estamos escribiendo tus guiones. Te avisaremos por el chat cuando estén listos.</p>
          )}

          {agencyScripts.length > 0 && (
            <>
              {order.scriptsPdfUrl && (
                <a href={order.scriptsPdfUrl} target="_blank" rel="noreferrer" download={order.scriptsPdfName || undefined}
                  className="inline-flex items-center gap-2 text-xs font-semibold px-3.5 py-2 rounded-xl bg-accent text-on-accent hover:bg-accent-strong">
                  <Download size={14} /> Descargar guiones en PDF
                </a>
              )}
              <div className="space-y-2.5">
                {agencyScripts.map((s, i) => (
                  <div key={s.id} className="bg-surface-3/60 border border-line rounded-xl overflow-hidden">
                    <details open={i === 0}>
                      <summary className="cursor-pointer list-none flex items-center gap-2.5 px-4 py-3">
                        <span className="font-tech text-[11px] font-bold bg-surface text-accent rounded-md px-2 py-1">GUIÓN {i + 1}</span>
                        <span className="font-semibold text-sm flex-1 truncate">{s.title || `Guión ${i + 1}`}</span>
                        {reviewOf(order, s) && <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_STYLE[reviewOf(order, s)!.status]}`}>{REVIEW_LABEL[reviewOf(order, s)!.status]}</span>}
                      </summary>
                      <p className="px-4 pb-3 text-sm text-text/90 leading-relaxed whitespace-pre-wrap">{s.text}</p>
                    </details>
                    <ReviewBar order={order} script={s} readOnly={asAdmin} onSave={saveReview} />
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Guiones propios */}
          <div className="bg-surface-3/40 border border-line rounded-xl p-4 space-y-3">
            <p className="text-sm font-semibold flex items-center gap-1.5"><FileText size={14} className="text-accent" /> Tus propios guiones</p>
            {ownScripts.length > 0 && (
              <ul className="space-y-2">
                {ownScripts.map(s => (
                  <li key={s.id} className="bg-surface-2 border border-line rounded-lg px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="font-tech text-[10px] font-bold bg-violet/15 text-violet rounded-md px-1.5 py-0.5 shrink-0">TUYO</span>
                      <span className="text-sm font-medium flex-1 truncate">{s.title}</span>
                      {s.fileUrl && <a href={s.fileUrl} target="_blank" rel="noreferrer" className="text-xs text-accent font-semibold flex items-center gap-1"><Download size={12} /> {s.fileName || 'PDF'}</a>}
                      <button type="button" title="Quitar guión" onClick={() => removeOwnScript(s.id)} className="text-muted-2 hover:text-red-400"><Trash2 size={13} /></button>
                    </div>
                    {s.text && <p className="text-xs text-muted mt-1.5 whitespace-pre-wrap line-clamp-4">{s.text}</p>}
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-1.5">
              {([['escribir', 'Escribir el guión'], ['pdf', 'Subir PDF']] as const).map(([k, l]) => (
                <button key={k} type="button" onClick={() => setOwnTab(k)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${ownTab === k ? 'bg-accent text-on-accent' : 'bg-surface-2 border border-line text-muted hover:text-text'}`}>{l}</button>
              ))}
            </div>
            <input value={ownTitle} onChange={e => setOwnTitle(e.target.value)} placeholder="Título del guión (opcional)"
              className="w-full bg-surface-2 border border-line rounded-xl px-3 py-2 text-sm outline-none focus:border-accent placeholder:text-muted-2" />
            {ownTab === 'escribir' ? (
              <>
                <textarea value={ownText} onChange={e => setOwnText(e.target.value)} rows={5} placeholder="Escribe aquí tu guión completo…"
                  className="w-full bg-surface-2 border border-line rounded-xl px-3 py-2 text-sm outline-none focus:border-accent placeholder:text-muted-2 resize-y leading-relaxed" />
                <button type="button" onClick={submitOwnText} disabled={!ownText.trim()}
                  className="px-4 py-2 rounded-lg bg-accent text-on-accent text-xs font-semibold flex items-center gap-1.5 hover:bg-accent-strong disabled:opacity-40"><Plus size={13} /> Agregar guión</button>
              </>
            ) : (
              <label className={`w-full py-3 rounded-xl border border-dashed border-accent/50 text-accent text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer hover:bg-accent/5 ${ownUploading ? 'opacity-60 pointer-events-none' : ''}`}>
                {ownUploading ? <><Loader2 size={14} className="animate-spin" /> Subiendo…</> : <><Upload size={14} /> Elegir PDF del guión</>}
                <input type="file" accept=".pdf,application/pdf" className="hidden" disabled={ownUploading} onChange={e => { void submitOwnPdf(e.target.files?.[0]); e.target.value = ''; }} />
              </label>
            )}
            {ownErr && <p className="text-[11px] text-red-400">{ownErr}</p>}
            <p className="text-[11px] text-muted-2">El guión 1 va con el video 1, el 2 con el video 2… Abajo eliges el avatar de cada video. Puedes subir todos tus guiones en un solo PDF.</p>
          </div>
        </section>

        {/* 2. Avatar de CADA video (obligatorio) */}
        <section className="space-y-3">
          <SectionTitle n={2} icon={UserCircle2} title={total > 1 ? `Avatar de cada video (${total})` : 'Elige el avatar'} badge="obligatorio"
            hint={total > 1 ? `Tu proyecto tiene ${total} videos: elige un avatar para cada uno. Sin los ${total} avatares no se puede confirmar el brief.` : 'Elige uno de la galería SENDA, o describe o sube el tuyo.'} />
          {total > 1 && (
            <p className={`text-xs font-semibold flex items-center gap-1.5 ${avatarsDone ? 'text-mint' : 'text-amber'}`}>
              {avatarsDone ? <CheckCircle2 size={13} /> : <span className="w-2.5 h-2.5 rounded-full border border-current" />} {chosenCount} de {total} avatares elegidos
            </p>
          )}
          <div className="space-y-2.5">
            {slotKeys.map((k, i) => (
              <div key={k} className={total > 1 ? 'grid grid-cols-1 md:grid-cols-[170px_1fr] gap-2.5 items-center' : ''}>
                {total > 1 && (
                  <p className="text-sm font-semibold flex items-center gap-2">
                    <span className="font-tech text-[11px] bg-surface-3 border border-line rounded-md px-2 py-1 text-accent">VIDEO {i + 1}</span>
                    {scripts[i] && <span className="truncate text-muted text-xs">{scripts[i].title}</span>}
                  </p>
                )}
                <AvatarPicker compact={total > 1} value={choiceOf(k).avatar} onChange={a => setChoice(k, { avatar: a })} />
              </div>
            ))}
          </div>
        </section>

        {/* 3. Estilo (opcional o a recomendación de SENDA) */}
        <section className="space-y-3">
          <SectionTitle n={3} icon={Palette} title={total > 1 ? 'Estilo de edición de cada video' : 'Estilo de edición'} badge="opcional"
            hint="Elígelo tú o déjalo a recomendación de SENDA. Cada estilo es una categoría: ábrela para ver sus videos." />
          <div className="space-y-2.5">
            {slotKeys.map((k, i) => (
              <div key={k} className={total > 1 ? 'grid grid-cols-1 md:grid-cols-[170px_1fr] gap-2.5 items-center' : ''}>
                {total > 1 && <p className="text-sm font-semibold"><span className="font-tech text-[11px] bg-surface-3 border border-line rounded-md px-2 py-1 text-accent">VIDEO {i + 1}</span></p>}
                <StylePicker compact={total > 1} value={choiceOf(k).style} onChange={st => setChoice(k, { style: st })} />
              </div>
            ))}
          </div>
        </section>

        {/* 4. Referencias (opcional) */}
        <section className="space-y-3">
          <SectionTitle n={4} icon={Link2} title="Referencias" badge="opcional" hint="Videos o cuentas que te gusten (TikTok, Reels, YouTube, Drive…)." />
          {refs.length > 0 && (
            <ul className="space-y-1.5">
              {refs.map(r => (
                <li key={r.id} className="flex items-center gap-2 bg-surface-3/70 border border-line rounded-xl px-3 py-2">
                  <Link2 size={13} className="text-accent shrink-0" />
                  <a href={r.url} target="_blank" rel="noreferrer" className="flex-1 min-w-0 text-sm truncate hover:text-accent">{r.name}<span className="text-muted-2 text-xs ml-2">{r.url}</span></a>
                  <button type="button" onClick={() => setRefs(list => list.filter(x => x.id !== r.id))} title="Quitar" className="text-muted-2 hover:text-red-400"><Trash2 size={13} /></button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2 flex-wrap">
            <input value={refName} onChange={e => setRefName(e.target.value)} placeholder="Nombre (opcional)"
              className="w-40 bg-surface-3 border border-line rounded-xl px-3 py-2 text-sm outline-none focus:border-accent placeholder:text-muted-2" />
            <input value={refUrl} onChange={e => setRefUrl(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addRef(); }} placeholder="https://…"
              className={`flex-1 min-w-[180px] bg-surface-3 border rounded-xl px-3 py-2 text-sm outline-none placeholder:text-muted-2 ${refUrl && !refUrlValid ? 'border-red-500/60' : 'border-line focus:border-accent'}`} />
            <button type="button" onClick={addRef} disabled={!refUrlValid}
              className="px-3.5 rounded-xl bg-surface-3 border border-line text-accent text-sm font-semibold flex items-center gap-1 hover:border-accent/50 disabled:opacity-40">
              <Plus size={14} /> Añadir
            </button>
          </div>
        </section>

        {/* 5. Notas (opcional) */}
        <section className="space-y-3">
          <SectionTitle n={5} icon={StickyNote} title="Notas para el equipo" badge="opcional" hint="Mensajes clave, ofertas, lo que NO quieres ver…" />
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Escribe aquí cualquier detalle importante"
            className="w-full bg-surface-3 border border-line rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-accent placeholder:text-muted-2 resize-y" />
        </section>
      </fieldset>

      {!locked && (
        <div className="px-5 py-4 border-t border-line bg-surface-3/40 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs">
            {saved === 'confirmed' ? <span className="text-mint flex items-center gap-1.5"><CheckCircle2 size={14} /> Brief confirmado y enviado a SENDA</span>
              : saved === 'draft' ? <span className="text-mint flex items-center gap-1.5"><CheckCircle2 size={14} /> Borrador guardado</span>
              : saved === 'admin' ? <span className="text-mint flex items-center gap-1.5"><CheckCircle2 size={14} /> Guardado · PDF actualizado</span>
              : order.briefConfirmedAt ? <span className="text-muted-2">Confirmado el {order.briefConfirmedAt.slice(0, 10)} · puedes seguir ajustándolo</span>
              : <span className="text-muted-2">{complete ? 'Todo listo para confirmar' : total > 1 ? `Faltan avatares: ${chosenCount} de ${total} elegidos (lo demás es opcional)` : 'Falta elegir el avatar (lo demás es opcional)'}</span>}
          </p>
          {asAdmin ? (
            <div className="flex gap-2 flex-wrap">
              {confirmReset ? (
                <>
                  <button type="button" onClick={() => setConfirmReset(false)} className="px-3.5 py-2 rounded-xl text-xs bg-surface-3 border border-line text-muted">Cancelar</button>
                  <button type="button" onClick={async () => { await resetBrief(order.id); setConfirmReset(false); onDone?.(); }}
                    className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-red-500 text-white flex items-center gap-1.5"><RotateCcw size={13} /> Sí, borrar y pedir que lo rehaga</button>
                </>
              ) : (
                <>
                  <button type="button" onClick={() => setConfirmReset(true)} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium bg-surface-3 border border-red-500/30 text-red-400 hover:bg-red-500/10">
                    <RotateCcw size={13} /> Borrar y pedir que lo rehaga
                  </button>
                  <button type="button" disabled={busy} onClick={() => void saveAsAdminNow(false)} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium bg-surface-3 border border-line text-muted hover:text-text disabled:opacity-50">
                    {busy ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Guardar
                  </button>
                  <button type="button" disabled={busy} onClick={() => void saveAsAdminNow(true)} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-accent text-on-accent hover:bg-accent-strong disabled:opacity-50">
                    {busy ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />} Guardar y avisar al cliente
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className="flex gap-2">
              <button type="button" onClick={() => saveAsClient(false)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium bg-surface-3 border border-line text-muted hover:text-text">
                <Save size={13} /> Guardar borrador
              </button>
              <button type="button" onClick={() => saveAsClient(true)} disabled={!complete}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-accent text-on-accent hover:bg-accent-strong disabled:opacity-40 disabled:cursor-not-allowed">
                <CheckCircle2 size={13} /> Confirmar brief
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
