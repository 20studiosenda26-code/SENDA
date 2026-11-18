import { useEffect, useState } from 'react';
import {
  CheckCircle2, Download, FileText, Link2, Loader2, Lock, Palette, Plus, RotateCcw, Save, ScrollText, ShieldCheck, StickyNote, Trash2, UserCircle2,
} from 'lucide-react';
import { useStore } from '../../store';
import type { Order, OrderReference, ScriptChoice } from '../../types';
import { AvatarPicker, StylePicker, avatarChosen, type AvatarChoice, type StyleChoice } from './BriefPickers';

export const briefLocked = (o: Order) => Boolean(o.clipperId);

function SectionTitle({ n, icon: Icon, title, hint }: { n: number; icon: typeof FileText; title: string; hint: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="w-7 h-7 rounded-lg bg-accent-dim text-accent font-tech text-xs font-bold flex items-center justify-center shrink-0">{n}</span>
      <div>
        <p className="font-semibold flex items-center gap-1.5"><Icon size={15} className="text-accent" /> {title}</p>
        <p className="text-xs text-muted-2">{hint}</p>
      </div>
    </div>
  );
}

type Choice = { avatar: AvatarChoice; style: StyleChoice };
const emptyChoice = (): Choice => ({ avatar: {}, style: {} });

/** Brief del proyecto. Lo usa el cliente (Mis proyectos) y el admin al "entrar como cliente" (asAdmin). */
export function BriefEditor({ order, asAdmin, onDone }: { order: Order; asAdmin?: boolean; onDone?: () => void }) {
  const { updateOrder, setView, saveBriefAsAdmin, resetBrief } = useStore();
  const locked = !asAdmin && briefLocked(order);
  const scripts = order.scriptsService ? (order.scripts || []) : [];
  const scriptMode = scripts.length > 0;

  // Elección única (proyecto sin guiones)
  const [single, setSingle] = useState<Choice>({
    avatar: { avatarId: order.avatarId ?? null, avatarName: order.avatarName ?? null, customText: order.avatarCustomText ?? null, refUrl: order.avatarRefUrl ?? null },
    style: { styleId: order.editingStyleId ?? null, styleName: order.editingStyleName ?? null },
  });
  // Elección por guión/video
  const [perScript, setPerScript] = useState<Record<string, Choice>>(() => {
    const m: Record<string, Choice> = {};
    for (const c of order.scriptChoices || []) {
      m[c.scriptId] = {
        avatar: { avatarId: c.avatarId ?? null, avatarName: c.avatarName ?? null, customText: c.avatarCustomText ?? null, refUrl: c.avatarRefUrl ?? null },
        style: { styleId: c.styleId ?? null, styleName: c.styleName ?? null },
      };
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

  useEffect(() => { setSaved(null); }, [order.id]);

  const choiceOf = (id: string) => perScript[id] || emptyChoice();
  const setChoice = (id: string, part: Partial<Choice>) => setPerScript(m => ({ ...m, [id]: { ...(m[id] || emptyChoice()), ...part } }));

  const refUrlValid = /^https?:\/\/\S+\.\S+/.test(refUrl.trim());
  const avatarsDone = scriptMode ? scripts.every(s => avatarChosen(choiceOf(s.id).avatar)) : avatarChosen(single.avatar);
  const stylesDone = scriptMode ? scripts.every(s => Boolean(choiceOf(s.id).style.styleId)) : Boolean(single.style.styleId);
  const steps = [avatarsDone, stylesDone, refs.length > 0];
  const complete = steps.every(Boolean);

  const addRef = () => {
    if (!refUrlValid) return;
    setRefs(r => [...r, { id: `ref-${Date.now()}`, name: refName.trim() || `Referencia ${r.length + 1}`, url: refUrl.trim() }]);
    setRefName(''); setRefUrl('');
  };

  const buildPatch = (confirm: boolean): Partial<Order> => {
    const base: Partial<Order> = {
      references: refs,
      clientNotes: notes.trim() || null,
      briefConfirmedAt: confirm ? new Date().toISOString() : order.briefConfirmedAt ?? null,
    };
    if (scriptMode) {
      const choices: ScriptChoice[] = scripts.map(s => {
        const c = choiceOf(s.id);
        return {
          scriptId: s.id, avatarId: c.avatar.avatarId ?? null, avatarName: c.avatar.avatarName ?? null,
          avatarCustomText: c.avatar.customText ?? null, avatarRefUrl: c.avatar.refUrl ?? null,
          styleId: c.style.styleId ?? null, styleName: c.style.styleName ?? null,
        };
      });
      return { ...base, scriptChoices: choices };
    }
    return {
      ...base,
      avatarId: single.avatar.avatarId ?? null,
      avatarName: single.avatar.avatarName || single.avatar.customText || null,
      avatarCustomText: single.avatar.customText ?? null,
      avatarRefUrl: single.avatar.refUrl ?? null,
      editingStyleId: single.style.styleId ?? null,
      editingStyleName: single.style.styleName ?? null,
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
  const waitingScripts = Boolean(order.scriptsService) && !scriptMode;

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
          {['Avatar', 'Estilo', 'Referencias'].map((label, i) => (
            <span key={label} className={`text-[10px] font-semibold px-2 py-1 rounded-full flex items-center gap-1 ${steps[i] ? 'bg-mint-dim text-mint' : 'bg-surface-3 text-muted-2'}`}>
              {steps[i] ? <CheckCircle2 size={11} /> : <span className="w-2.5 h-2.5 rounded-full border border-current" />} {label}
            </span>
          ))}
        </div>
      </div>

      {asAdmin && (
        <div className="mx-5 mt-5 flex items-start gap-2.5 bg-violet/10 border border-violet/30 rounded-xl px-4 py-3 text-xs text-muted">
          <ShieldCheck size={15} className="text-violet shrink-0 mt-0.5" />
          <span className="flex-1">Estás viendo y editando este brief <strong className="text-text">como si fueras el cliente</strong>. Puedes corregirlo o borrarlo y pedirle que lo rehaga; el PDF se vuelve a generar al guardar.</span>
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
        {/* Guiones (solo si SENDA los escribe para este cliente) */}
        {order.scriptsService && (
          <section className="space-y-3">
            <SectionTitle n={1} icon={ScrollText} title="Tus guiones" hint="Revísalos antes de elegir avatar y estilo." />
            {waitingScripts || !scriptsPublished ? (
              <p className="text-xs text-muted-2 bg-surface-3 border border-dashed border-line rounded-xl px-4 py-4">Estamos escribiendo tus guiones. Te avisaremos por el chat cuando estén listos.</p>
            ) : (
              <>
                {order.scriptsPdfUrl && (
                  <a href={order.scriptsPdfUrl} target="_blank" rel="noreferrer" download={order.scriptsPdfName || undefined}
                    className="inline-flex items-center gap-2 text-xs font-semibold px-3.5 py-2 rounded-xl bg-accent text-on-accent hover:bg-accent-strong">
                    <Download size={14} /> Descargar guiones en PDF
                  </a>
                )}
                <div className="space-y-2.5">
                  {scripts.map((s, i) => (
                    <details key={s.id} className="group bg-surface-3/60 border border-line rounded-xl overflow-hidden" open={i === 0}>
                      <summary className="cursor-pointer list-none flex items-center gap-2.5 px-4 py-3">
                        <span className="font-tech text-[11px] font-bold bg-surface text-accent rounded-md px-2 py-1">GUIÓN {i + 1}</span>
                        <span className="font-semibold text-sm flex-1 truncate">{s.title || `Guión ${i + 1}`}</span>
                      </summary>
                      <p className="px-4 pb-4 text-sm text-text/90 leading-relaxed whitespace-pre-wrap">{s.text}</p>
                    </details>
                  ))}
                </div>
              </>
            )}
          </section>
        )}

        {/* Avatar */}
        <section className="space-y-3">
          <SectionTitle n={order.scriptsService ? 2 : 1} icon={UserCircle2} title={scriptMode ? 'Avatar de cada guión' : 'Elige el avatar'} hint="Elige uno de la galería SENDA, o describe o sube el tuyo." />
          {order.scriptsService && !scriptMode ? (
            <p className="text-xs text-muted-2">Se habilita cuando publiquemos tus guiones.</p>
          ) : scriptMode ? (
            <div className="space-y-2.5">
              {scripts.map((s, i) => (
                <div key={s.id} className="grid grid-cols-1 md:grid-cols-[170px_1fr] gap-2.5 items-center">
                  <p className="text-sm font-semibold flex items-center gap-2"><span className="font-tech text-[11px] bg-surface-3 border border-line rounded-md px-2 py-1 text-accent">GUIÓN {i + 1}</span><span className="truncate text-muted text-xs">{s.title}</span></p>
                  <AvatarPicker compact value={choiceOf(s.id).avatar} onChange={a => setChoice(s.id, { avatar: a })} />
                </div>
              ))}
            </div>
          ) : (
            <AvatarPicker value={single.avatar} onChange={a => setSingle(c => ({ ...c, avatar: a }))} />
          )}
        </section>

        {/* Estilo */}
        <section className="space-y-3">
          <SectionTitle n={order.scriptsService ? 3 : 2} icon={Palette} title={scriptMode ? 'Estilo de edición de cada video' : 'Estilo de edición'} hint="Cada estilo es una categoría: ábrela para ver sus videos." />
          {order.scriptsService && !scriptMode ? (
            <p className="text-xs text-muted-2">Se habilita cuando publiquemos tus guiones.</p>
          ) : scriptMode ? (
            <div className="space-y-2.5">
              {scripts.map((s, i) => (
                <div key={s.id} className="grid grid-cols-1 md:grid-cols-[170px_1fr] gap-2.5 items-center">
                  <p className="text-sm font-semibold flex items-center gap-2"><span className="font-tech text-[11px] bg-surface-3 border border-line rounded-md px-2 py-1 text-accent">VIDEO {i + 1}</span></p>
                  <StylePicker compact value={choiceOf(s.id).style} onChange={st => setChoice(s.id, { style: st })} />
                </div>
              ))}
            </div>
          ) : (
            <StylePicker value={single.style} onChange={st => setSingle(c => ({ ...c, style: st }))} />
          )}
        </section>

        {/* Referencias */}
        <section className="space-y-3">
          <SectionTitle n={order.scriptsService ? 4 : 3} icon={Link2} title="Referencias" hint="Videos o cuentas que te gusten (TikTok, Reels, YouTube, Drive…)." />
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

        {/* Notas */}
        <section className="space-y-3">
          <SectionTitle n={order.scriptsService ? 5 : 4} icon={StickyNote} title="Notas para el equipo" hint="Mensajes clave, ofertas, lo que NO quieres ver…" />
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
              : <span className="text-muted-2">{complete ? 'Todo listo para confirmar' : 'Completa avatar, estilo y al menos una referencia'}</span>}
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
