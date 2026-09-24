import { useStore } from '../store';
import { useAuth } from '../lib/auth';
import { uploadSharedFile, isSupabaseConfigured } from '../lib/supabaseClient';
import { useState, useMemo, useRef } from 'react';
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
    () => contracts.filter(c => c.role === role && (c.workerId === null || c.workerId === workerId)),
    [contracts, role, workerId]
  );
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const handleUpload = async (contractId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploadingId(contractId);
    const url = await uploadSharedFile(f, 'contracts-signed');
    onUploadSigned(contractId, f.name, url);
    setUploadingId(null);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <div className="bg-surface-2 border border-line rounded-xl p-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-accent-dim flex items-center justify-center">
            <FileText size={20} className="text-accent" />
          </div>
          <div>
            <h2 className="font-display text-lg font-semibold">Mis Contratos</h2>
            <p className="text-sm text-muted">{role === 'clipper' ? 'Contratos de Clipper' : 'Contratos de Editor(a)'}</p>
          </div>
        </div>
      </div>

      {myContracts.length === 0 && (
        <div className="bg-surface-2 border border-line rounded-xl p-8 text-center text-sm text-muted">
          Todavía no hay contratos disponibles para ti.
        </div>
      )}

      {myContracts.map(c => {
        const mySigned = signedUploads.find(s => s.contractId === c.id && s.workerId === workerId);
        return (
          <div key={c.id} className="bg-surface-2 border border-line rounded-xl p-5 hover:border-accent/30 transition-colors">
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

  const ordered = useMemo(() => {
    const clipperContracts = contracts.filter(c => c.role === 'clipper');
    const editorContracts = contracts.filter(c => c.role === 'editor');
    return [...clipperContracts, ...editorContracts];
  }, [contracts]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploading(true);
    const url = await uploadSharedFile(f, 'contracts-templates');
    setFileName(f.name);
    setFileUrl(url);
    setUploading(false);
  };

  const handleSubmit = () => {
    if (!title.trim() || !fileUrl) return;
    uploadContract(title.trim(), targetRole, targetWorker || null, fileName, fileUrl);
    setTitle(''); setFileName(''); setFileUrl(''); setTargetWorker(''); setShowForm(false);
  };

  const workerName = (id: string) => workers.find(w => w.id === id)?.name || 'Desconocido';

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div className="bg-surface-2 border border-line rounded-xl p-5 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-accent-dim flex items-center justify-center">
            <FileText size={20} className="text-accent" />
          </div>
          <div>
            <h2 className="font-display text-lg font-semibold">Contratos</h2>
            <p className="text-sm text-muted">Clipper primero, luego Editor(a) · sube, titula o elimina cualquier contrato</p>
          </div>
        </div>
        <button onClick={() => setShowForm(s => !s)} className="flex items-center gap-1.5 bg-accent text-on-accent rounded-lg px-3 py-2 text-sm font-medium hover:bg-accent-strong transition-colors">
          <Plus size={16} /> Subir contrato
        </button>
      </div>

      {showForm && (
        <div className="bg-surface-2 border border-line rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Nuevo contrato</h3>
            <button onClick={() => setShowForm(false)}><X size={16} className="text-muted" /></button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Título del contrato" className="w-full bg-surface-3 border border-line rounded-md px-3 py-2 text-sm outline-none focus:border-accent" />
            <select value={targetRole} onChange={e => { setTargetRole(e.target.value as 'clipper' | 'editor'); setTargetWorker(''); }} className="w-full bg-surface-3 border border-line rounded-md px-3 py-2 text-sm outline-none focus:border-accent">
              <option value="clipper">Clipper</option>
              <option value="editor">Editor(a)</option>
            </select>
            <select value={targetWorker} onChange={e => setTargetWorker(e.target.value)} className="w-full bg-surface-3 border border-line rounded-md px-3 py-2 text-sm outline-none focus:border-accent md:col-span-2">
              <option value="">Plantilla general (todos los {targetRole === 'clipper' ? 'clippers' : 'editores'})</option>
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
          <button onClick={handleSubmit} disabled={uploading || !title.trim() || !fileUrl} className="w-full bg-accent text-on-accent rounded-md py-2 text-sm font-medium hover:bg-accent-strong transition-colors disabled:opacity-50">
            Guardar contrato
          </button>
        </div>
      )}

      {ordered.length === 0 && (
        <div className="bg-surface-2 border border-line rounded-xl p-8 text-center text-sm text-muted">
          Aún no has subido ningún contrato.
        </div>
      )}

      {ordered.map(c => {
        const signatures = contractSignedUploads.filter(s => s.contractId === c.id);
        return (
          <div key={c.id} className="bg-surface-2 border border-line rounded-xl p-5">
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
                      {c.role === 'clipper' ? 'Clipper' : 'Editor(a)'}
                    </span>
                    <span className="text-muted-2">{c.workerId ? `Para ${workerName(c.workerId)}` : 'Plantilla general'}</span>
                  </div>
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <a href={c.fileUrl} download={c.fileName} className="w-9 h-9 rounded-lg bg-surface-3 border border-line flex items-center justify-center text-muted hover:text-accent transition-colors" title="Descargar">
                  <Download size={16} />
                </a>
                <button onClick={() => deleteContract(c.id)} className="w-9 h-9 rounded-lg bg-surface-3 border border-line flex items-center justify-center text-muted hover:text-red-400 transition-colors" title="Eliminar">
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
            </div>
          </div>
        );
      })}
    </div>
  );
}
