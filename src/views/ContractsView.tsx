import { LiquidMetalButton } from "../components/ui/liquid-metal-button";
import { useStore } from '../store';
import { useAuth } from '../lib/auth';
import { uploadSharedFile, isSupabaseConfigured } from '../lib/supabaseClient';
import { useState, useMemo, useRef } from 'react';
import { EmptyState } from '../components/home/home-bits';
import { FileText, Download, Upload, Trash2, Plus, X, CheckCircle2, Loader2, UserRound } from 'lucide-react';

export function ContractsView() {
  const { role, contracts, contractSignedUploads, workers, uploadSignedContract } = useStore();
  const { user } = useAuth();
  const isAdmin = role === 'admin';

  if (!isSupabaseConfigured) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="bg-surface-2 border border-line rounded-xl p-6 text-sm text-muted">
          Los contratos en vivo necesitan que Supabase esté configurado (ver <code>.env</code>).
        </div>
      </div>
    );
  }

  return isAdmin ? <AdminContracts /> : <WorkerContracts role={role as 'clipper' | 'editor'} workerId={user?.id || ''} contracts={contracts} signedUploads={contractSignedUploads} onUploadSigned={uploadSignedContract} workers={workers} />;
}

function WorkerContracts({
  role, workerId, contracts, signedUploads, onUploadSigned,
}: {
  role: 'clipper' | 'editor';
  workerId: string;
  contracts: ReturnType<typeof useStore>['contracts'];
  signedUploads: ReturnType<typeof useStore>['contractSignedUploads'];
  onUploadSigned: (contractId: string, fileName: string, fileUrl: string) => void;
  workers: ReturnType<typeof useStore>['workers'];
}) {
  const myContracts = useMemo(
    // Rol único: ve los contratos de clipper y los antiguos de editor
    () => contracts.filter(c => (c.workerId === null || c.workerId === workerId) && (role === 'clipper' || c.role === role)),
    [contracts, role, workerId]
  );
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const handleUpload = async (contractId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploadingId(contractId);
    setUploadError(null);
    try {
      const url = await uploadSharedFile(f, 'contracts-signed');
      onUploadSigned(contractId, f.name, url);
    } catch {
      setUploadError('No se pudo subir el archivo. Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      setUploadingId(null);
      e.target.value = '';
    }
  };
  const pending = myContracts.filter(c => !signedUploads.some(s => s.contractId === c.id && s.workerId === workerId)).length;

  return (
    <div className="px-6 xl:px-8 py-6 max-w-[1100px] mx-auto space-y-5 animate-fadeIn">
      <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-4">
        <div>
          <p className="text-[11px] font-tech uppercase tracking-[0.18em] text-accent flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-mint animate-pulse" /> En vivo
          </p>
          <h2 className="font-display text-3xl xl:text-4xl font-bold mt-1">Mis contratos</h2>
          <p className="text-muted text-sm mt-1">Descarga cada contrato, fírmalo y sube la versión firmada. El admin recibe el aviso.</p>
        </div>
        <div className={`rounded-xl border px-4 py-3 text-sm ${pending ? 'border-amber/30 bg-amber/10 text-amber' : 'border-mint/30 bg-mint-dim text-mint'}`}>
          {pending ? `${pending} contrato(s) por firmar` : myContracts.length ? 'Todo firmado ✓' : 'Sin contratos'}
        </div>
      </div>
      {uploadError && <p className="text-sm text-red-400 bg-red-400/10 border border-red-400/30 rounded-lg px-3 py-2">{uploadError}</p>}

      {myContracts.length === 0 && (
        <EmptyState icon={<FileText size={20} />} title="Sin contratos por ahora" text="Cuando el admin suba un contrato para ti, aparecerá aquí y te llegará un aviso." />
      )}

      {myContracts.map(c => {
        const mySigned = signedUploads.find(s => s.contractId === c.id && s.workerId === workerId);
        return (
          <div key={c.id} className={`glow-card bg-surface-2 border rounded-xl p-5 hover:border-accent/30 transition-colors ${mySigned ? 'border-line' : 'border-amber/30'}`}>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-surface-3 flex items-center justify-center shrink-0">
                  <FileText size={18} className="text-muted" />
                </div>
                <div>
                  <p className="font-medium">{c.title}</p>
                  <p className="text-sm text-muted mt-0.5">{c.fileName}</p>
                  {mySigned ? (
                    <span className="inline-flex items-center gap-1 text-xs text-mint mt-1"><CheckCircle2 size={12} /> Contrato firmado subido</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-amber mt-1">Pendiente de firmar y subir</span>
                  )}
                </div>
              </div>
              <div className="flex gap-2 shrink-0 items-center">
                <a href={c.fileUrl} download={c.fileName} className="w-9 h-9 rounded-lg bg-surface-3 border border-line flex items-center justify-center text-muted hover:text-accent transition-colors" title="Descargar contrato">
                  <Download size={16} />
                </a>
                <input
                  ref={el => { inputRefs.current[c.id] = el; }}
                  type="file"
                  className="hidden"
                  onChange={e => handleUpload(c.id, e)}
                />
                <button
                  onClick={() => inputRefs.current[c.id]?.click()}
                  disabled={uploadingId === c.id}
                  className="flex items-center gap-1.5 text-xs font-medium bg-mint-dim text-mint rounded-lg px-3 py-2 hover:bg-mint/20 transition-colors disabled:opacity-50"
                >
                  {uploadingId === c.id ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                  {mySigned ? 'Reemplazar contrato firmado' : 'Contrato firmado'}
                </button>
              </div>
            </div>
            {mySigned && (
              <div className="mt-3 pt-3 border-t border-line flex items-center justify-between text-xs text-muted">
                <span>Subiste: {mySigned.fileName}</span>
                <a href={mySigned.fileUrl} download={mySigned.fileName} className="text-accent flex items-center gap-1"><Download size={12} /> Ver mi archivo</a>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function AdminContracts() {
  const { contracts, contractSignedUploads, workers, uploadContract, deleteContract } = useStore();
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [targetRole, setTargetRole] = useState<'clipper' | 'editor'>('clipper');
  const [targetWorker, setTargetWorker] = useState<string>('');
  const [fileName, setFileName] = useState('');
  const [fileUrl, setFileUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const ordered = useMemo(() => {
    const clipperContracts = contracts.filter(c => c.role === 'clipper');
    const editorContracts = contracts.filter(c => c.role === 'editor');
    return [...clipperContracts, ...editorContracts];
  }, [contracts]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploading(true);
    setFormError(null);
    try {
      const url = await uploadSharedFile(f, 'contracts-templates');
      setFileName(f.name);
      setFileUrl(url);
    } catch {
      setFormError('No se pudo subir el archivo. Inténtalo de nuevo.');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const team = workers.filter(w => w.role === 'clipper' || w.role === 'editor');
  const expectedFor = (c: { workerId: string | null }) => (c.workerId ? team.filter(w => w.id === c.workerId) : team);
  const totalPending = contracts.reduce((n, c) => n + expectedFor(c).filter(w => !contractSignedUploads.some(s => s.contractId === c.id && s.workerId === w.id)).length, 0);
  const totalSigned = contractSignedUploads.filter(s => contracts.some(c => c.id === s.contractId)).length;
  const removeContract = (id: string, t: string) => {
    if (window.confirm(`¿Eliminar el contrato "${t}"? También se pierde el registro de firmas.`)) deleteContract(id);
  };

  const handleSubmit = () => {
    if (!title.trim() || !fileUrl) return;
    uploadContract(title.trim(), targetRole, targetWorker || null, fileName, fileUrl);
    setTitle(''); setFileName(''); setFileUrl(''); setTargetWorker(''); setShowForm(false);
  };

  const workerName = (id: string) => workers.find(w => w.id === id)?.name || 'Desconocido';

  return (
    <div className="px-6 xl:px-8 py-6 max-w-[1440px] mx-auto space-y-5 animate-fadeIn">
      <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-4">
        <div>
          <p className="text-[11px] font-tech uppercase tracking-[0.18em] text-accent flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-mint animate-pulse" /> En vivo
          </p>
          <h2 className="font-display text-3xl xl:text-4xl font-bold mt-1">Contratos</h2>
          <p className="text-muted text-sm mt-1">Sube contratos para todo el equipo o para una persona y revisa quién ya firmó.</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="rounded-xl border border-line bg-surface-2 px-4 py-2 text-center"><p className="font-tech text-xl font-bold">{contracts.length}</p><p className="text-[11px] text-muted-2">contratos</p></div>
          <div className="rounded-xl border border-mint/30 bg-mint-dim px-4 py-2 text-center"><p className="font-tech text-xl font-bold text-mint">{totalSigned}</p><p className="text-[11px] text-muted-2">firmados</p></div>
          <div className={`rounded-xl border px-4 py-2 text-center ${totalPending ? 'border-amber/30 bg-amber/10' : 'border-line bg-surface-2'}`}><p className={`font-tech text-xl font-bold ${totalPending ? 'text-amber' : ''}`}>{totalPending}</p><p className="text-[11px] text-muted-2">por firmar</p></div>
          <button onClick={() => setShowForm(s => !s)} className="flex items-center gap-2 bg-accent text-on-accent rounded-lg px-4 py-2.5 text-sm font-semibold hover:bg-accent-strong transition-colors shadow-[0_0_20px_rgba(53,214,228,0.25)]">
            <Plus size={16} /> Subir contrato
          </button>
        </div>
      </div>

      {showForm && (
        <div className="glow-card bg-surface-2 border border-accent/30 rounded-xl p-5 space-y-3 animate-fadeIn">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-semibold flex items-center gap-2"><FileText size={16} className="text-accent" /> Nuevo contrato</h3>
            <button onClick={() => setShowForm(false)}><X size={16} className="text-muted" /></button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Título del contrato" className="w-full bg-surface-3 border border-line rounded-md px-3 py-2 text-sm outline-none focus:border-accent" />
            <select value={targetRole} onChange={e => { setTargetRole(e.target.value as 'clipper' | 'editor'); setTargetWorker(''); }} className="w-full bg-surface-3 border border-line rounded-md px-3 py-2 text-sm outline-none focus:border-accent">
              <option value="clipper">Clipper · Asistente de edición</option>
            </select>
            <select value={targetWorker} onChange={e => setTargetWorker(e.target.value)} className="w-full bg-surface-3 border border-line rounded-md px-3 py-2 text-sm outline-none focus:border-accent md:col-span-2">
              <option value="">Plantilla general (todo el equipo)</option>
              {workers.filter(w => w.role === targetRole).map(w => (
                <option key={w.id} value={w.id}>Solo para {w.name}</option>
              ))}
            </select>
            <label className="flex items-center gap-2 bg-surface-3 border border-line border-dashed rounded-md px-3 py-2 text-sm text-muted cursor-pointer hover:border-accent transition-colors md:col-span-2">
              {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              {fileName || (uploading ? 'Subiendo...' : 'Subir archivo (cualquier formato)')}
              <input type="file" className="hidden" onChange={handleFile} disabled={uploading} />
            </label>
          </div>
          {formError && <p className="text-xs text-red-400">{formError}</p>}
          <p className="text-[11px] text-muted-2">Al guardar, {targetWorker ? 'esa persona recibe' : 'todo el equipo recibe'} un aviso para descargarlo y subirlo firmado.</p>
          <LiquidMetalButton
                onClick={handleSubmit}
                disabled={!title.trim() || !fileUrl}
                loading={uploading}
                fullWidth
                label="Guardar contrato"
                loadingLabel="Subiendo..."
                variant="cyan"
              />
        </div>
      )}

      {ordered.length === 0 && (
        <EmptyState icon={<FileText size={20} />} title="Aún no hay contratos" text="Sube el primer contrato: puede ser una plantilla para todo el equipo o uno para una persona." action={{ label: 'Subir contrato', onClick: () => setShowForm(true) }} />
      )}

      {ordered.map(c => {
        const signatures = contractSignedUploads.filter(s => s.contractId === c.id);
        const missing = expectedFor(c).filter(w => !signatures.some(s => s.workerId === w.id));
        return (
          <div key={c.id} className="glow-card bg-surface-2 border border-line rounded-xl p-5">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-surface-3 flex items-center justify-center shrink-0">
                  <FileText size={18} className="text-muted" />
                </div>
                <div>
                  <p className="font-medium">{c.title}</p>
                  <p className="text-sm text-muted mt-0.5">{c.fileName}</p>
                  <div className="flex gap-2 mt-1.5 text-xs">
                    <span className={`px-2 py-0.5 rounded ${c.role === 'clipper' ? 'bg-accent-dim text-accent' : 'bg-mint-dim text-mint'}`}>
                      Equipo
                    </span>
                    <span className="text-muted-2">{c.workerId ? `Para ${workerName(c.workerId)}` : 'Plantilla general'}</span>
                  </div>
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <a href={c.fileUrl} download={c.fileName} className="w-9 h-9 rounded-lg bg-surface-3 border border-line flex items-center justify-center text-muted hover:text-accent transition-colors" title="Descargar">
                  <Download size={16} />
                </a>
                <button onClick={() => removeContract(c.id, c.title)} className="w-9 h-9 rounded-lg bg-surface-3 border border-line flex items-center justify-center text-muted hover:text-red-400 transition-colors" title="Eliminar">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>

            <div className="mt-3 pt-3 border-t border-line">
              <p className="text-xs text-muted-2 mb-2 flex items-center gap-1"><UserRound size={12} /> Contratos firmados recibidos ({signatures.length})</p>
              {signatures.length === 0 ? (
                <p className="text-xs text-muted-2">Nadie ha subido su contrato firmado todavía</p>
              ) : (
                <div className="space-y-1.5">
                  {signatures.map(s => (
                    <div key={s.id} className="flex items-center justify-between bg-surface-3 rounded-lg px-3 py-2 text-xs">
                      <span className="font-medium">{workerName(s.workerId)}</span>
                      <a href={s.fileUrl} download={s.fileName} className="text-accent flex items-center gap-1"><Download size={12} /> {s.fileName}</a>
                    </div>
                  ))}
                </div>
              )}
              {missing.length > 0 && (
                <p className="text-xs text-amber mt-2">Falta firmar: {missing.map(w => w.name).join(', ')}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
