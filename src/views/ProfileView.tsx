import { useStore } from '../store';
import {
  Flame, TrendingUp, Target, CheckCircle2, Award, Star,
  Phone, Mail, Landmark, Globe2, BellRing, FileText, Download, Wallet, Building2, CreditCard, UserCheck,
} from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import {
  parseBankInfo, serializeBankInfo, openWorkerPayrollReportPdf, fmtMoneyClean,
} from '../lib/payrollPdf';
import type { PayrollReportItem, Order } from '../types';

export function ProfileView() {
  const {
    workers, currentWorkerId, brands, orders, financeSettings,
    getWorkerGoals, role, updateWorkerProfile, payrollPayments,
  } = useStore();
  const worker = workers.find(w => w.id === currentWorkerId);

  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [country, setCountry] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountHolder, setAccountHolder] = useState('');
  const [accountType, setAccountType] = useState('Ahorros');
  const [emailNotifOn, setEmailNotifOn] = useState(false);
  const [savedProfileToast, setSavedProfileToast] = useState(false);

  useEffect(() => {
    if (worker) {
      setPhone(worker.phone || '');
      setEmail(worker.email || '');
      setCountry(worker.country || '');
      setEmailNotifOn(!!worker.emailNotifications);

      const parsed = parseBankInfo(worker.bankInfo, worker.name);
      setBankName(parsed.bankName === 'Sin registrar' ? '' : parsed.bankName);
      setAccountNumber(parsed.accountNumber === 'Sin registrar' || parsed.accountNumber === 'Ver detalle en banco' ? '' : parsed.accountNumber);
      setAccountHolder(parsed.accountHolder === 'Titular sin especificar' ? worker.name : parsed.accountHolder);
      setAccountType(parsed.accountType || 'Ahorros');
    }
  }, [worker?.id]);

  const myVideos = useMemo(() => {
    return brands.flatMap(b => b.videos.map(v => ({ ...v, brandName: b.name }))).filter(v =>
      role === 'admin' ? true : role === 'clipper' ? v.clipperId === currentWorkerId : v.editorId === currentWorkerId
    );
  }, [brands, role, currentWorkerId]);

  const completed = useMemo(() => myVideos.filter(v => v.qc === 'aprobado_cliente'), [myVideos]);

  // Informe automático de todos los pedidos finalizados (Aprobado Cliente) desde la página del propio Clipper/Editor
  const myReportItems = useMemo<PayrollReportItem[]>(() => {
    if (!worker) return [];
    const defClipper = financeSettings.defaultClipperCost;
    const defEditor = financeSettings.defaultEditorCost;

    const linkedOrderByVideoId = new Map<string, Order>();
    const linkedOrderByBrand = new Map<string, Order>();
    for (const o of orders) {
      if (o.boardVideoId) linkedOrderByVideoId.set(o.boardVideoId, o);
      linkedOrderByBrand.set(o.brand.trim().toLowerCase(), o);
    }

    return completed.map(v => {
      const linked = linkedOrderByVideoId.get(v.id) || linkedOrderByBrand.get(v.brandName.trim().toLowerCase());
      const videosCount = linked ? Math.max(1, linked.videoCount || 1) : 1;
      const unitPay = worker.role === 'clipper'
        ? (v.tierSnapshot ? v.tierSnapshot.clipperPay : defClipper)
        : (v.tierSnapshot ? v.tierSnapshot.editorPay : defEditor);
      return {
        videoId: v.id,
        projectName: v.name,
        brandName: v.brandName,
        date: v.date,
        videosCount,
        unitPay,
        subtotal: videosCount * unitPay,
      };
    });
  }, [worker, completed, orders, financeSettings]);

  const myPayments = useMemo(
    () => payrollPayments.filter(p => p.workerId === currentWorkerId),
    [payrollPayments, currentWorkerId]
  );

  if (!worker) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="bg-surface-2 border border-line rounded-xl p-6 text-center text-sm text-muted">
          Cargando tu perfil…
        </div>
      </div>
    );
  }

  const goals = getWorkerGoals(worker.id, worker.role);
  const myTotalApprovedAmount = myReportItems.reduce((s, i) => s + i.subtotal, 0);

  const handleSavePersonalInfo = () => {
    const serializedBank = serializeBankInfo({
      bankName: bankName || 'Sin especificar',
      accountNumber: accountNumber || 'Sin especificar',
      accountHolder: accountHolder || worker.name,
      accountType: accountType || 'Ahorros',
    });
    updateWorkerProfile(worker.id, { phone, email, country, bankInfo: serializedBank });
    setSavedProfileToast(true);
    setTimeout(() => setSavedProfileToast(false), 2400);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">
      <div className="bg-surface-2 border border-line rounded-xl p-6">
        <div className="flex items-center gap-5 flex-wrap">
          <div className="w-16 h-16 rounded-2xl bg-accent-dim flex items-center justify-center">
            <span className="font-display text-2xl font-bold text-accent">{worker.name.charAt(0)}</span>
          </div>
          <div className="flex-1 min-w-[200px]">
            <h2 className="font-display text-2xl font-bold">{worker.name}</h2>
            <p className="text-muted">{worker.cargo} · Ingresó {worker.ingreso}</p>
            <div className="flex items-center gap-3 mt-1">
              <span className="inline-flex items-center gap-1 text-xs text-mint"><CheckCircle2 size={12} /> {worker.estado}</span>
              {role !== 'admin' && (
                <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${worker.online ? 'text-mint' : 'text-muted-2'}`}>
                  <span className={`w-2 h-2 rounded-full ${worker.online ? 'bg-mint' : 'bg-muted-2'}`} />
                  {worker.online ? 'En línea' : 'No en línea'}
                </span>
              )}
            </div>
          </div>
          <div className="text-right">
            <div className="flex items-center gap-1 text-amber justify-end">
              <Star size={16} />
              <span className="font-display text-xl font-bold">{worker.pointsMonth}</span>
            </div>
            <p className="text-xs text-muted-2">puntos este mes</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MiniStat icon={Target} label="Puntos hoy" value={worker.pointsToday} color="accent" />
        <MiniStat icon={TrendingUp} label="Puntos mes" value={worker.pointsMonth} color="mint" />
        <MiniStat icon={Flame} label="Racha actual" value={worker.streak} color="amber" />
        <MiniStat icon={Award} label="Mejor racha" value={worker.bestStreak} color="violet" />
      </div>

      {/* Mis Pagos, Comprobantes e Informe PDF Automático (Sincronizado con Nóminas Admin) */}
      <div className="bg-surface-2 border border-line rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-mint-dim text-mint flex items-center justify-center">
              <Wallet size={18} />
            </div>
            <div>
              <h3 className="font-display text-base font-semibold">Mis Pagos, Comprobantes e Informe PDF</h3>
              <p className="text-xs text-muted">
                Resumen de tus videos finalizados (Aprobado Cliente) y comprobantes de transferencia enviados.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() =>
              openWorkerPayrollReportPdf({
                worker,
                weekendLabel: 'Historial Acumulado',
                items: myReportItems,
                totalAmount: myTotalApprovedAmount,
                isPaid: myPayments.length > 0,
                paidAt: myPayments[0]?.paidAt,
                receiptFileName: myPayments[0]?.receiptFileName,
              })
            }
            className="flex items-center gap-1.5 bg-accent text-on-accent rounded-lg px-3.5 py-2 text-xs font-semibold hover:bg-accent-strong transition-colors"
          >
            <FileText size={14} /> Descargar mi Informe PDF ({fmtMoneyClean(myTotalApprovedAmount)})
          </button>
        </div>

        {myPayments.length > 0 ? (
          <div className="space-y-2">
            {myPayments.map(pay => (
              <div key={pay.id} className="bg-surface-3 border border-mint/30 rounded-xl p-3.5 flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-mint flex items-center gap-1">
                      <CheckCircle2 size={13} /> Pago transferido · {fmtMoneyClean(pay.amount)}
                    </span>
                    <span className="text-[11px] font-tech text-muted-2">{pay.weekendLabel}</span>
                  </div>
                  <p className="text-[11px] text-muted mt-0.5">
                    Fecha: {new Date(pay.paidAt).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      openWorkerPayrollReportPdf({
                        worker,
                        weekendLabel: pay.weekendLabel,
                        items: pay.reportItems && pay.reportItems.length > 0 ? pay.reportItems : myReportItems,
                        totalAmount: pay.amount,
                        isPaid: true,
                        paidAt: pay.paidAt,
                        receiptFileName: pay.receiptFileName,
                      })
                    }
                    className="text-xs bg-surface-2 hover:bg-accent-dim text-accent border border-line rounded-lg px-3 py-1.5 flex items-center gap-1 font-medium transition-colors"
                  >
                    <FileText size={13} /> Informe PDF del pago
                  </button>

                  {pay.receiptFileUrl && (
                    <a
                      href={pay.receiptFileUrl}
                      download={pay.receiptFileName || 'comprobante-pago'}
                      className="text-xs bg-mint-dim text-mint border border-mint/30 rounded-lg px-3 py-1.5 flex items-center gap-1 font-semibold hover:opacity-90 transition-opacity"
                    >
                      <Download size={13} /> Comprobante
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted bg-surface-3 rounded-lg p-3">
            Tus pedidos en estado <strong className="text-text">Aprobado Cliente</strong> ya están pre-cargados en tu Informe PDF ({completed.length} proyectos · {fmtMoneyClean(myTotalApprovedAmount)}). Cuando se realice el pago del fin de semana verás aquí tu comprobante de transferencia junto con el PDF.
          </p>
        )}
      </div>

      {/* Información personal + Datos Bancarios Detallados (Banco, Número de cuenta, Titular) */}
      {role !== 'admin' && (
        <div className="bg-surface-2 border border-line rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-base font-semibold flex items-center gap-2">
              <Landmark size={16} className="text-accent" /> Información personal y Cuenta Bancaria
            </h3>
            {savedProfileToast && (
              <span className="text-xs text-mint flex items-center gap-1">
                <CheckCircle2 size={13} /> Guardado en Nóminas
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="text-xs text-muted space-y-1">
              <span className="flex items-center gap-1.5"><Phone size={12} /> Celular</span>
              <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+57 300 000 0000" className="w-full bg-surface-3 border border-line rounded-md px-3 py-2 text-sm text-text placeholder:text-muted-2 outline-none focus:border-accent" />
            </label>
            <label className="text-xs text-muted space-y-1">
              <span className="flex items-center gap-1.5"><Mail size={12} /> Correo</span>
              <input value={email} onChange={e => setEmail(e.target.value)} placeholder="correo@ejemplo.com" className="w-full bg-surface-3 border border-line rounded-md px-3 py-2 text-sm text-text placeholder:text-muted-2 outline-none focus:border-accent" />
            </label>
            <label className="text-xs text-muted space-y-1">
              <span className="flex items-center gap-1.5"><Globe2 size={12} /> País</span>
              <input value={country} onChange={e => setCountry(e.target.value)} placeholder="Colombia" className="w-full bg-surface-3 border border-line rounded-md px-3 py-2 text-sm text-text placeholder:text-muted-2 outline-none focus:border-accent" />
            </label>
          </div>

          <div className="pt-3 border-t border-line/60 grid grid-cols-1 sm:grid-cols-4 gap-3">
            <label className="text-xs text-muted space-y-1">
              <span className="flex items-center gap-1.5"><Building2 size={12} className="text-accent" /> Banco</span>
              <input value={bankName} onChange={e => setBankName(e.target.value)} placeholder="Bancolombia, Nequi..." className="w-full bg-surface-3 border border-line rounded-md px-3 py-2 text-sm text-text placeholder:text-muted-2 outline-none focus:border-accent" />
            </label>
            <label className="text-xs text-muted space-y-1 sm:col-span-2">
              <span className="flex items-center gap-1.5"><CreditCard size={12} className="text-mint" /> Número de cuenta</span>
              <input value={accountNumber} onChange={e => setAccountNumber(e.target.value)} placeholder="000-000000-00" className="w-full bg-surface-3 border border-line rounded-md px-3 py-2 text-sm font-tech text-text placeholder:text-muted-2 outline-none focus:border-accent" />
            </label>
            <label className="text-xs text-muted space-y-1">
              <span className="flex items-center gap-1.5"><UserCheck size={12} className="text-violet" /> Titular de la cuenta</span>
              <input value={accountHolder} onChange={e => setAccountHolder(e.target.value)} placeholder={worker.name} className="w-full bg-surface-3 border border-line rounded-md px-3 py-2 text-sm text-text placeholder:text-muted-2 outline-none focus:border-accent" />
            </label>
          </div>

          <button
            type="button"
            onClick={handleSavePersonalInfo}
            className="bg-accent text-on-accent rounded-lg px-4 py-2 text-sm font-medium hover:bg-accent-strong transition-colors"
          >
            Guardar información y cuenta bancaria
          </button>
        </div>
      )}

      <div className="bg-surface-2 border border-line rounded-xl p-5">
        <h3 className="font-display text-base font-semibold mb-4">Metas asignadas</h3>
        <div className="space-y-3">
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span>Diaria</span>
              <span className="text-muted font-tech">{worker.pointsToday} / {goals.daily}</span>
            </div>
            <div className="h-2 bg-surface-3 rounded-full overflow-hidden">
              <div className="h-full bg-accent rounded-full transition-all duration-500" style={{ width: `${Math.min(100, (worker.pointsToday / Math.max(goals.daily, 1)) * 100)}%` }} />
            </div>
          </div>
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span>Mensual</span>
              <span className="text-muted font-tech">{worker.pointsMonth} / {goals.monthly}</span>
            </div>
            <div className="h-2 bg-surface-3 rounded-full overflow-hidden">
              <div className="h-full bg-mint rounded-full transition-all duration-500" style={{ width: `${Math.min(100, (worker.pointsMonth / Math.max(goals.monthly, 1)) * 100)}%` }} />
            </div>
          </div>
        </div>
      </div>

      <div className="bg-surface-2 border border-line rounded-xl p-5">
        <h3 className="font-display text-base font-semibold mb-4 flex items-center gap-2">
          <BellRing size={16} className="text-accent" /> Notificaciones por correo
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
          <label className="text-xs text-muted space-y-1">
            <span className="flex items-center gap-1.5"><Mail size={12} /> Correo de contacto</span>
            <input
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="correo@ejemplo.com"
              className="w-full bg-surface-3 border border-line rounded-md px-3 py-2 text-sm text-text placeholder:text-muted-2 outline-none focus:border-accent"
            />
          </label>
          <button
            type="button"
            onClick={() => setEmailNotifOn(v => !v)}
            className={`flex items-center gap-2.5 rounded-md px-3 py-2.5 text-sm font-medium border transition-colors ${
              emailNotifOn ? 'bg-mint-dim text-mint border-mint/30' : 'bg-surface-3 text-muted border-line'
            }`}
          >
            <span className={`w-9 h-5 rounded-full relative shrink-0 transition-colors ${emailNotifOn ? 'bg-mint' : 'bg-surface-2 border border-line'}`}>
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${emailNotifOn ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </span>
            Recibir notificaciones de Senda al correo
          </button>
        </div>
        <button
          onClick={() => updateWorkerProfile(worker.id, { email, emailNotifications: emailNotifOn })}
          className="mt-3 bg-accent text-on-accent rounded-md px-4 py-2 text-sm font-medium hover:bg-accent-strong transition-colors"
        >
          Guardar preferencia
        </button>
      </div>

      <div className="bg-surface-2 border border-line rounded-xl p-5">
        <h3 className="font-display text-base font-semibold mb-3">Videos completados · Aprobado Cliente ({completed.length})</h3>
        {completed.length === 0 ? (
          <p className="text-sm text-muted text-center py-4">Aún no hay videos completados</p>
        ) : (
          <div className="space-y-2">
            {completed.map(v => (
              <div key={v.id} className="flex items-center gap-3 p-2.5 bg-surface-3 rounded-lg">
                <CheckCircle2 size={16} className="text-mint shrink-0" />
                <span className="text-sm flex-1 font-medium">{v.name}</span>
                <span className="text-xs text-muted-2 font-tech">{v.date}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MiniStat({ icon: Icon, label, value, color }: { icon: typeof Flame; label: string; value: number; color: string }) {
  const map: Record<string, string> = {
    accent: 'text-accent bg-accent-dim',
    mint: 'text-mint bg-mint-dim',
    amber: 'text-amber bg-amber-dim',
    violet: 'text-violet bg-violet-dim',
  };
  return (
    <div className="bg-surface-2 border border-line rounded-xl p-4">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-2 ${map[color]}`}>
        <Icon size={18} />
      </div>
      <p className="font-display text-2xl font-bold">{value}</p>
      <p className="text-xs text-muted-2">{label}</p>
    </div>
  );
}
