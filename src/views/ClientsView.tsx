import { useState, useMemo, useRef } from 'react';
import { useStore } from '../store';
import { uploadSharedFile } from '../lib/supabaseClient';
import { CardNodeDeco } from '../components/BrandBackground';
import { fmtMoneyClean } from '../lib/payrollPdf';
import type { Order, Video } from '../types';
import {
  Briefcase, PlusCircle, Calendar, Clock, Layers, DollarSign,
  CheckCircle2, AlertTriangle, Upload, FileText, Loader2,
  Sparkles, Scissors, Film, Eye,
  Users, Cpu, Receipt, Search, ExternalLink, Printer, FolderOpen, Gauge,
  Play, MessageSquare, Lock, Unlock, Plus, Trash2, Send, ArrowLeft
} from 'lucide-react';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(baseIso: string, days: number): string {
  const d = new Date(`${baseIso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatHour(h: number): string {
  const clamped = Math.max(0, Math.min(23, Math.floor(h)));
  const mins = Math.round((h - Math.floor(h)) * 60);
  return `${String(clamped).padStart(2, '0')}:${mins >= 30 ? '30' : '00'}`;
}

function formatCreatedAt(iso?: string): string {
  if (!iso) return 'Fecha registrada en sistema';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('es-CO', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fmtTime(t: number) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function buildInvoiceCode(brand: string, dateIso?: string): string {
  const clean = (brand || 'CLI').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 4) || 'CLI';
  const datePart = (dateIso || todayIso()).replace(/-/g, '');
  const rand = Math.floor(100 + Math.random() * 900);
  return `FAC-${datePart}-${clean}-${rand}`;
}

export function ClientsView() {
  const {
    orders, brands, workers, financeSettings, capacityConfig,
    getWorkerCapacity, addOrder, updateOrder, deleteOrder, setView, setQc,
    submitClientFeedbackBatch, enableExtraClientFeedbackRound,
  } = useStore();

  const [activeTab, setActiveTab] = useState<'portal_videos' | 'nuevo_pedido' | 'cartera'>('portal_videos');
  const [selectedClientBrand, setSelectedClientBrand] = useState<string | null>(null);
  const [selectedPortalBrandId, setSelectedPortalBrandId] = useState<string | null>(null);
  const [selectedPortalVideoId, setSelectedPortalVideoId] = useState<string | null>(null);
  const [searchClient, setSearchClient] = useState('');

  // Borrador de varios puntos de feedback para 1 sola ronda de envío
  const [draftTime, setDraftTime] = useState<string>('');
  const [draftText, setDraftText] = useState<string>('');
  const [draftFeedbackList, setDraftFeedbackList] = useState<{ time: number; text: string }[]>([]);
  const [feedbackToast, setFeedbackToast] = useState<string | null>(null);

  const [brandName, setBrandName] = useState('');
  const [videoCount, setVideoCount] = useState<number>(5);
  const [deliveryDate, setDeliveryDate] = useState<string>(() => todayIso());
  const [deliveryTime, setDeliveryTime] = useState<string>('18:00');
  const [complexity, setComplexity] = useState<'simple' | 'estandar' | 'alta'>('estandar');

  const [unitPriceClient, setUnitPriceClient] = useState<number>(() => financeSettings.clientPricePerVideo || 25);
  const [unitClipperPay, setUnitClipperPay] = useState<number>(() => financeSettings.defaultClipperCost || 3);
  const [unitEditorPay, setUnitEditorPay] = useState<number>(() => financeSettings.defaultEditorCost || 4);

  const [clientNotes, setClientNotes] = useState('');
  const [briefFile, setBriefFile] = useState<{ name: string; url: string } | null>(null);
  const [invoiceFile, setInvoiceFile] = useState<{ name: string; url: string } | null>(null);
  const [uploadingBrief, setUploadingBrief] = useState(false);
  const [uploadingInvoice, setUploadingInvoice] = useState(false);
  const [uploadingOrderBriefId, setUploadingOrderBriefId] = useState<string | null>(null);
  const [uploadingOrderInvoiceId, setUploadingOrderInvoiceId] = useState<string | null>(null);
  const [createdToast, setCreatedToast] = useState<string | null>(null);
  const [confirmDeleteOrderId, setConfirmDeleteOrderId] = useState<string | null>(null);

  const briefInputRef = useRef<HTMLInputElement | null>(null);
  const invoiceInputRef = useRef<HTMLInputElement | null>(null);
  const portalPlayerRef = useRef<HTMLVideoElement | null>(null);

  const clippers = useMemo(() => workers.filter(w => w.role === 'clipper'), [workers]);
  const editors = useMemo(() => workers.filter(w => w.role === 'editor'), [workers]);
  const allVideos = useMemo(() => brands.flatMap(b => b.videos), [brands]);

  const activePortalBrand = useMemo(() => {
    if (brands.length === 0) return null;
    if (selectedPortalBrandId) {
      const found = brands.find(b => b.id === selectedPortalBrandId);
      if (found) return found;
    }
    return brands[0];
  }, [brands, selectedPortalBrandId]);

  const activePortalVideo: Video | null = useMemo(() => {
    if (!activePortalBrand || !selectedPortalVideoId) return null;
    return activePortalBrand.videos.find(v => v.id === selectedPortalVideoId) || null;
  }, [activePortalBrand, selectedPortalVideoId]);

  const capacityPreview = useMemo(() => {
    const safetyFactor = Math.max(0.5, (100 - capacityConfig.safetyMarginPct) / 100);
    const physicalClip = clippers.reduce((s, w) => s + getWorkerCapacity(w.id), 0);
    const physicalEdit = editors.reduce((s, w) => s + getWorkerCapacity(w.id), 0);
    const safeClip = Math.max(1, Math.floor(physicalClip * safetyFactor));
    const safeEdit = Math.max(1, Math.floor(physicalEdit * safetyFactor));
    const safeDailyLimit = Math.min(safeClip, safeEdit);
    const bottleneckStage = safeEdit <= safeClip ? 'Edición' : 'Clipping';

    const activeOrders = orders.filter(o => o.status !== 'finalizado');
    const committedByDate: Record<string, number> = {};
    for (const o of activeOrders) {
      const d = o.deliveryDate || todayIso();
      committedByDate[d] = (committedByDate[d] || 0) + Math.max(1, o.videoCount || 1);
    }

    const inProgressBoard = allVideos.filter(v => v.qc !== 'aprobado_cliente' && v.qc !== 'sin_iniciar').length;
    const targetDate = deliveryDate || todayIso();
    const committedOnTarget =
      (committedByDate[targetDate] || 0) + (targetDate === todayIso() ? inProgressBoard : 0);

    const complexityMultiplier = complexity === 'alta' ? 1.3 : complexity === 'simple' ? 0.85 : 1.0;
    const freeSafeOnTarget = Math.max(0, safeDailyLimit - committedOnTarget);
    const maxAcceptableOnTarget = Math.floor(freeSafeOnTarget / complexityMultiplier);
    const fitsInSingleDay = videoCount <= maxAcceptableOnTarget;

    const nowMs = Date.now();
    const deadlineMs = new Date(`${targetDate}T${deliveryTime || '18:00'}:00`).getTime();
    const hoursUntilDeadline = Math.max(1, Math.round((deadlineMs - nowMs) / 3600000));
    const loadRatio = (committedOnTarget + videoCount * complexityMultiplier) / Math.max(1, safeDailyLimit);

    let autoPriority: 'normal' | 'prioritario' | 'urgente' | 'critico' = 'normal';
    let priorityReason = 'Holgura suficiente y carga dentro del rango operativo.';

    if (hoursUntilDeadline <= capacityConfig.urgentThresholdHours || (targetDate <= todayIso() && !fitsInSingleDay)) {
      autoPriority = 'critico';
      priorityReason = `Entrega en ~${hoursUntilDeadline}h con alta exigencia sobre el cupo del día.`;
    } else if (hoursUntilDeadline <= 24 || !fitsInSingleDay || (complexity === 'alta' && videoCount >= 10)) {
      autoPriority = 'urgente';
      priorityReason = !fitsInSingleDay
        ? 'El volumen supera el cupo libre del día; el motor activa partición automática por tandas.'
        : `Ventana menor a 24h (${hoursUntilDeadline}h restantes).`;
    } else if (hoursUntilDeadline <= 48 || loadRatio >= 0.75 || complexity === 'alta') {
      autoPriority = 'prioritario';
      priorityReason = `Ocupación proyectada del ${Math.min(100, Math.round(loadRatio * 100))}% en la fecha objetivo.`;
    }

    const batches: { index: number; date: string; videos: number }[] = [];
    let remaining = Math.max(1, videoCount);
    let cursor = 0;

    while (remaining > 0 && cursor < 20) {
      const dStr = addDaysIso(targetDate, cursor);
      const already = (committedByDate[dStr] || 0) + (dStr === todayIso() ? inProgressBoard : 0);
      const freeRaw = Math.max(0, safeDailyLimit - already);
      const maxDay = Math.max(cursor === 0 ? 0 : 1, Math.floor(freeRaw / complexityMultiplier));

      if (maxDay > 0) {
        const alloc = Math.min(remaining, maxDay);
        batches.push({ index: batches.length + 1, date: dStr, videos: alloc });
        remaining -= alloc;
      }
      cursor++;
    }

    const finalDate = batches.length > 0 ? batches[batches.length - 1].date : targetDate;
    const workHours = Math.max(4, capacityConfig.workdayEndHour - capacityConfig.workdayStartHour);
    const prioSpeed = autoPriority === 'critico' ? 0.65 : autoPriority === 'urgente' ? 0.8 : autoPriority === 'prioritario' ? 0.9 : 1.0;
    const lastBatch = batches[batches.length - 1];
    const ratio = lastBatch ? Math.min(1, lastBatch.videos / Math.max(1, safeDailyLimit)) : 0.5;
    const startH = capacityConfig.workdayStartHour + Math.max(1.5, ratio * (workHours - 2) * prioSpeed);
    const winStart = Math.min(capacityConfig.workdayEndHour - 2, Math.max(capacityConfig.workdayStartHour + 1, startH));
    const winEnd = Math.min(capacityConfig.workdayEndHour, winStart + 2);

    const etaText = `${finalDate === todayIso() ? 'Hoy' : finalDate} entre ${formatHour(winStart)} y ${formatHour(winEnd)}`;

    const avgClipperCap = Math.max(1, capacityConfig.defaultClipperDailyVideos || 4);
    const avgEditorCap = Math.max(1, capacityConfig.defaultEditorDailyVideos || 4);
    const firstBatchVideos = batches[0]?.videos || videoCount;
    const recommendedClippers = Math.min(Math.max(1, clippers.length), Math.max(1, Math.ceil((firstBatchVideos * complexityMultiplier) / avgClipperCap)));
    const recommendedEditors = Math.min(Math.max(1, editors.length), Math.max(1, Math.ceil((firstBatchVideos * complexityMultiplier) / avgEditorCap)));
    const daySaturationPct = Math.min(100, Math.round(((committedOnTarget + firstBatchVideos) / Math.max(1, safeDailyLimit)) * 100));
    const pacePerHour = +(firstBatchVideos / workHours).toFixed(1);

    return {
      safeDailyLimit,
      bottleneckStage,
      committedOnTarget,
      freeSafeOnTarget,
      maxAcceptableOnTarget,
      fitsInSingleDay,
      batches,
      finalDate,
      etaText,
      autoPriority,
      priorityReason,
      hoursUntilDeadline,
      recommendedClippers,
      recommendedEditors,
      daySaturationPct,
      pacePerHour,
      workHours,
    };
  }, [
    clippers,
    editors,
    orders,
    allVideos,
    deliveryDate,
    deliveryTime,
    videoCount,
    complexity,
    capacityConfig,
    getWorkerCapacity,
  ]);

  const financialPreview = useMemo(() => {
    const count = Math.max(1, videoCount || 1);
    const grossTotal = count * Math.max(0, unitPriceClient);
    const clipperTotal = count * Math.max(0, unitClipperPay);
    const editorTotal = count * Math.max(0, unitEditorPay);
    const payrollTotal = clipperTotal + editorTotal;
    const netMargin = grossTotal - payrollTotal;
    const marginPct = grossTotal > 0 ? Math.round((netMargin / grossTotal) * 100) : 0;

    return {
      grossTotal,
      clipperTotal,
      editorTotal,
      payrollTotal,
      netMargin,
      marginPct,
    };
  }, [videoCount, unitPriceClient, unitClipperPay, unitEditorPay]);

  const clientDirectory = useMemo(() => {
    const map = new Map<string, {
      brand: string;
      totalOrders: number;
      totalVideosOrdered: number;
      videosCompletedClient: number;
      videosApprovedSenda: number;
      grossBilled: number;
      creatorCost: number;
      netProfit: number;
      latestOrderAt: string;
      ordersList: Order[];
    }>();

    for (const o of orders) {
      const rawBrand = o.brand.trim();
      if (!rawBrand) continue;
      const baseBrand = rawBrand.split(' · Tanda ')[0].trim();

      const existing = map.get(baseBrand) || {
        brand: baseBrand,
        totalOrders: 0,
        totalVideosOrdered: 0,
        videosCompletedClient: 0,
        videosApprovedSenda: 0,
        grossBilled: 0,
        creatorCost: 0,
        netProfit: 0,
        latestOrderAt: o.createdAt || '',
        ordersList: [],
      };

      const count = Math.max(1, o.videoCount || 1);
      const uPrice = o.unitPriceClient ?? financeSettings.clientPricePerVideo;
      const uClip = o.unitClipperPay ?? financeSettings.defaultClipperCost;
      const uEdit = o.unitEditorPay ?? financeSettings.defaultEditorCost;

      const gross = count * uPrice;
      const cost = count * (uClip + uEdit);

      existing.totalOrders += 1;
      existing.totalVideosOrdered += count;
      existing.grossBilled += gross;
      existing.creatorCost += cost;
      existing.netProfit += gross - cost;
      if (o.createdAt && (!existing.latestOrderAt || o.createdAt > existing.latestOrderAt)) {
        existing.latestOrderAt = o.createdAt;
      }
      existing.ordersList.push(o);

      const brandObj = brands.find(b => b.name.trim().toLowerCase() === baseBrand.toLowerCase());
      if (brandObj) {
        existing.videosCompletedClient = brandObj.videos.filter(v => v.qc === 'aprobado_cliente').length;
        existing.videosApprovedSenda = brandObj.videos.filter(v => v.qc === 'aprobado_senda').length;
      }

      map.set(baseBrand, existing);
    }

    return Array.from(map.values()).sort((a, b) => b.grossBilled - a.grossBilled);
  }, [orders, brands, financeSettings]);

  const filteredClients = useMemo(() => {
    return clientDirectory.filter(c => {
      return !searchClient.trim() || c.brand.toLowerCase().includes(searchClient.trim().toLowerCase());
    });
  }, [clientDirectory, searchClient]);

  const activeClient = useMemo(() => {
    if (!filteredClients.length) return null;
    if (selectedClientBrand) {
      const found = filteredClients.find(c => c.brand === selectedClientBrand);
      if (found) return found;
    }
    return filteredClients[0];
  }, [filteredClients, selectedClientBrand]);

  const handleUploadBrief = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploadingBrief(true);
    try {
      const url = await uploadSharedFile(f, 'client-briefs');
      setBriefFile({ name: f.name, url });
    } finally {
      setUploadingBrief(false);
    }
  };

  const handleUploadInvoice = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploadingInvoice(true);
    try {
      const url = await uploadSharedFile(f, 'client-invoices');
      setInvoiceFile({ name: f.name, url });
    } finally {
      setUploadingInvoice(false);
    }
  };

  const handleUploadExistingOrderBrief = async (orderId: string, f: File) => {
    setUploadingOrderBriefId(orderId);
    try {
      const url = await uploadSharedFile(f, 'client-briefs');
      updateOrder(orderId, { briefFileName: f.name, briefFileUrl: url });
    } finally {
      setUploadingOrderBriefId(null);
    }
  };

  const handleUploadExistingOrderInvoice = async (orderId: string, f: File) => {
    setUploadingOrderInvoiceId(orderId);
    try {
      const url = await uploadSharedFile(f, 'client-invoices');
      updateOrder(orderId, {
        invoiceFileName: f.name,
        invoiceFileUrl: url,
        paymentStatus: 'completado',
      });
    } finally {
      setUploadingOrderInvoiceId(null);
    }
  };

  const handlePrintInvoice = (ord: Order) => {
    const count = Math.max(1, ord.videoCount || 1);
    const unitPrice = ord.unitPriceClient ?? financeSettings.clientPricePerVideo;
    const total = count * unitPrice;
    const invCode = ord.invoiceNumber || buildInvoiceCode(ord.brand, ord.deliveryDate);
    const win = window.open('', '_blank', 'width=840,height=720');
    if (!win) return;

    win.document.write(`<!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="utf-8" />
        <title>Factura ${invCode} - SENDA</title>
        <style>
          body { font-family: 'Inter', -apple-system, sans-serif; background: #0f1216; color: #f1f5f9; padding: 40px; }
          .card { max-width: 720px; margin: 0 auto; background: #181c22; border: 1px solid #2a303c; border-radius: 20px; padding: 36px; }
          .row { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
          .brand { font-size: 24px; font-weight: 800; letter-spacing: 0.08em; color: #35D6E4; }
          .badge { display: inline-block; padding: 6px 12px; border-radius: 999px; font-size: 12px; font-weight: 700; text-transform: uppercase; background: rgba(111,231,200,0.15); color: #6FE7C8; border: 1px solid #6FE7C8; }
          table { width: 100%; border-collapse: collapse; margin-top: 28px; }
          th, td { padding: 14px 12px; text-align: left; border-bottom: 1px solid #2a303c; font-size: 14px; }
          th { color: #94a3b8; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; }
          .total { font-size: 22px; font-weight: 800; color: #6FE7C8; }
          .meta { color: #94a3b8; font-size: 13px; line-height: 1.6; }
          @media print { body { background: #fff; color: #111; padding: 0; } .card { border: 1px solid #ddd; background: #fff; color: #111; } }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="row">
            <div>
              <div class="brand">SENDA STUDIO</div>
              <p class="meta">Factura Comercial de Producción Audiovisual<br/>Folio: <strong>${invCode}</strong></p>
            </div>
            <div style="text-align:right">
              <span class="badge">PAGO 100% VERIFICADO</span>
              <p class="meta" style="margin-top:8px">Fecha de solicitud: ${formatCreatedAt(ord.createdAt)}<br/>Fecha límite entrega: ${ord.deliveryDate} · ${ord.deliveryTime}</p>
            </div>
          </div>
          <hr style="border:none;border-top:1px solid #2a303c;margin:20px 0"/>
          <div class="row">
            <div>
              <p class="meta" style="margin:0">CLIENTE / MARCA TITULAR</p>
              <h2 style="margin:4px 0 0 0;font-size:20px">${ord.brand}</h2>
            </div>
            <div style="text-align:right">
              <p class="meta" style="margin:0">COMPLEJIDAD / PRIORIDAD MOTOR</p>
              <p style="margin:4px 0 0 0;font-weight:700;text-transform:uppercase">${ord.complexity || 'estandar'} · ${ord.priority || 'normal'}</p>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Concepto</th>
                <th>Cantidad</th>
                <th>Tarifa Unitaria</th>
                <th>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Producción y Edición de Videos Comerciales (${ord.brand})</td>
                <td>${count} videos</td>
                <td>${fmtMoneyClean(unitPrice)}</td>
                <td><strong>${fmtMoneyClean(total)}</strong></td>
              </tr>
            </tbody>
          </table>
          <div class="row" style="margin-top:24px;align-items:center">
            <div class="meta">
              <strong>Brief / Notas:</strong> ${ord.clientNotes || 'Sin notas adicionales'}<br/>
              <strong>Factura adjunta:</strong> ${ord.invoiceFileName || 'Verificada en sistema'}
            </div>
            <div style="text-align:right">
              <span class="meta">TOTAL FACTURADO (100%)</span>
              <div class="total">${fmtMoneyClean(total)}</div>
            </div>
          </div>
        </div>
        <script>setTimeout(() => window.print(), 300);</script>
      </body>
      </html>`);
    win.document.close();
  };

  // SOLO permite ingresar el pedido si la factura de pago (100%) ya fue subida
  const handleInjectOrder = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanBrand = brandName.trim();
    if (!cleanBrand || videoCount <= 0 || !invoiceFile) return;

    const baseInvoice = buildInvoiceCode(cleanBrand, deliveryDate);

    addOrder({
      brand: cleanBrand,
      videoCount,
      deliveryDate,
      deliveryTime,
      status: "sin_asignar",
      assignedWorkerIds: [],
      clipperId: null,
      editorId: null,
      unitPriceClient,
      unitClipperPay,
      unitEditorPay,
      complexity,
      priority: capacityPreview.autoPriority,
      paymentStatus: "completado",
      invoiceNumber: baseInvoice,
      invoiceDate: todayIso(),
      invoiceFileName: invoiceFile.name,
      invoiceFileUrl: invoiceFile.url,
      briefFileName: briefFile?.name || null,
      briefFileUrl: briefFile?.url || null,
      clientNotes: clientNotes.trim() || `ETA: ${capacityPreview.etaText}`,
    });

    setSelectedClientBrand(cleanBrand);
    setBrandName("");
    setClientNotes("");
    setBriefFile(null);
    setInvoiceFile(null);
    setView("tareas");
  };

  const handleAddDraftCorrection = () => {
    if (!draftText.trim()) return;
    const sec = Math.max(0, parseInt(draftTime, 10) || Math.floor(portalPlayerRef.current?.currentTime || 0));
    setDraftFeedbackList(prev => [...prev, { time: sec, text: draftText.trim() }]);
    setDraftText('');
    setDraftTime('');
  };

  const handleSendSingleRoundFeedback = (video: Video) => {
    if (draftFeedbackList.length === 0) return;
    submitClientFeedbackBatch(video.id, draftFeedbackList);
    setDraftFeedbackList([]);
    setFeedbackToast('Ronda de correcciones enviada a Tareas. El límite de 1 tanda de feedback ha quedado cerrado para este video.');
    setTimeout(() => setFeedbackToast(null), 4500);
  };

  const priorityBadgeStyle = (p?: string) => {
    switch (p) {
      case 'critico':
        return 'bg-red-500/15 text-red-400 border-red-500/40';
      case 'urgente':
        return 'bg-amber-dim text-amber border-amber/40';
      case 'prioritario':
        return 'bg-accent-dim text-accent border-accent/40';
      default:
        return 'bg-mint-dim/40 text-mint border-mint/30';
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Cabecera con las 3 pestañas entrelazadas: Portal Clientes (Videos y Feedback) | Nuevo Pedido (Factura 100%) | Cartera */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-accent-dim border border-accent/40 text-accent flex items-center justify-center shadow-[0_0_24px_-4px_rgba(53,214,228,0.4)]">
            <Briefcase size={22} />
          </div>
          <div>
            <h2 className="font-display text-2xl sm:text-3xl font-bold">Clientes y Pedidos Comerciales</h2>
            <p className="text-xs text-muted">
              Portal de revisión de videos por cliente (1 ronda de feedback), ingreso con factura 100% pagada y expedientes
            </p>
          </div>
        </div>

        <div className="flex items-center bg-surface-2 border border-line rounded-2xl p-1 gap-1 flex-wrap">
          <button
            type="button"
            onClick={() => setActiveTab('portal_videos')}
            className={`px-4 py-2 rounded-xl text-xs font-display font-bold flex items-center gap-2 transition-all ${
              activeTab === 'portal_videos'
                ? 'bg-accent text-on-accent shadow-[0_0_20px_-4px_rgba(53,214,228,0.55)]'
                : 'text-muted hover:text-text'
            }`}
          >
            <Play size={14} />
            Clientes · Videos y Feedback
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('nuevo_pedido')}
            className={`px-4 py-2 rounded-xl text-xs font-display font-bold flex items-center gap-2 transition-all ${
              activeTab === 'nuevo_pedido'
                ? 'bg-mint text-on-accent shadow-[0_0_20px_-4px_rgba(111,231,200,0.55)]'
                : 'text-muted hover:text-text'
            }`}
          >
            <PlusCircle size={14} />
            Nuevo Pedido (Pago 100%)
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('cartera')}
            className={`px-4 py-2 rounded-xl text-xs font-display font-bold flex items-center gap-2 transition-all ${
              activeTab === 'cartera'
                ? 'bg-surface-3 text-accent border border-accent/40'
                : 'text-muted hover:text-text'
            }`}
          >
            <FolderOpen size={14} />
            Facturas y Expedientes ({clientDirectory.length})
          </button>
        </div>
      </div>

      {/* =========================================================================
          PESTAÑA 1: PORTAL DE CLIENTES (SELECCIONAR MARCA -> VIDEO 1, VIDEO 2... -> 1 RONDA DE FEEDBACK)
         ========================================================================= */}
      {activeTab === 'portal_videos' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Columna izquierda: Marcas / Pedidos */}
          <div className="lg:col-span-4 bg-surface-2 border border-line rounded-3xl p-4 space-y-3">
            <div className="px-2 py-1 flex items-center justify-between border-b border-line/60">
              <span className="text-xs font-tech uppercase text-accent font-semibold">
                Pedidos por Marca ({brands.length})
              </span>
              <span className="text-[11px] text-muted-2">Selecciona una marca</span>
            </div>

            <div className="space-y-2">
              {brands.map(b => {
                const isSelected = activePortalBrand?.id === b.id;
                const uploadedToClientCount = b.videos.filter(
                  v => v.publishedToClient || v.qc === 'aprobado_senda' || v.qc === 'aprobado_cliente'
                ).length;
                const clientApprovedCount = b.videos.filter(v => v.qc === 'aprobado_cliente').length;

                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => {
                      setSelectedPortalBrandId(b.id);
                      setSelectedPortalVideoId(null);
                      setDraftFeedbackList([]);
                    }}
                    className={`w-full text-left p-4 rounded-2xl border transition-all space-y-2 ${
                      isSelected
                        ? 'bg-accent-dim/40 border-accent shadow-[0_0_24px_-8px_rgba(53,214,228,0.4)]'
                        : 'bg-surface-3/70 border-line hover:border-accent/40'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-display text-base font-bold truncate">{b.name}</p>
                      <span className="font-tech text-xs px-2.5 py-0.5 rounded-full bg-surface-2 border border-line text-accent">
                        {b.videos.length} videos
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] font-tech text-muted-2">
                      <span>Subidos a cliente: <strong className="text-mint">{uploadedToClientCount}/{b.videos.length}</strong></span>
                      <span>Aprobados: <strong className="text-text">{clientApprovedCount}/{b.videos.length}</strong></span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Columna derecha: Lista de Videos (Video 1, Video 2...) o Interfaz de Revisión de un Video */}
          <div className="lg:col-span-8 bg-surface-2 border border-line rounded-3xl p-6 space-y-5 relative overflow-hidden">
            <CardNodeDeco color="var(--accent)" />

            {!activePortalBrand ? (
              <p className="text-sm text-muted text-center py-12">Selecciona una marca a la izquierda para ver sus videos.</p>
            ) : !activePortalVideo ? (
              /* Vista de todos los videos individuales de la marca (Video 1, Video 2, Video 3...) */
              <div className="space-y-4 relative z-10">
                <div className="flex items-center justify-between gap-3 flex-wrap border-b border-line pb-4">
                  <div>
                    <span className="text-[11px] font-tech uppercase text-accent">Portal de Entregas del Cliente</span>
                    <h3 className="font-display text-2xl font-bold mt-0.5">
                      {activePortalBrand.name} · {activePortalBrand.videos.length} Videos
                    </h3>
                    <p className="text-xs text-muted mt-0.5">
                      Cuando apruebas un video con <strong>"Aprobar Senda"</strong> en Tareas, se sube inmediatamente aquí al número de video que corresponde.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {activePortalBrand.videos
                    .slice()
                    .sort((a, b) => (a.videoNumber || 0) - (b.videoNumber || 0))
                    .map((v, idx) => {
                      const num = v.videoNumber || idx + 1;
                      const isUploadedForClient = Boolean(
                        v.publishedToClient || v.qc === 'aprobado_senda' || v.qc === 'aprobado_cliente'
                      );
                      const roundsUsed = v.clientFeedbackRoundsUsed ?? 0;
                      const maxRounds = v.clientFeedbackMaxRounds ?? 1;

                      return (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => {
                            setSelectedPortalVideoId(v.id);
                            setDraftFeedbackList([]);
                          }}
                          className="text-left p-4 rounded-2xl bg-surface-3/90 hover:bg-surface-3 border border-line hover:border-accent/50 transition-all space-y-3 flex flex-col justify-between"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-display text-base font-bold text-text flex items-center gap-2">
                              <span className="w-7 h-7 rounded-lg bg-accent-dim text-accent font-tech text-xs flex items-center justify-center">
                                #{num}
                              </span>
                              Video {num}
                            </span>

                            {v.qc === 'aprobado_cliente' ? (
                              <span className="text-[10px] font-tech font-bold px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                Aprobado por Cliente
                              </span>
                            ) : v.qc === 'correcciones' && isUploadedForClient ? (
                              <span className="text-[10px] font-tech font-bold px-2.5 py-1 rounded-full bg-red-500/15 text-red-400 border border-red-500/30">
                                Feedback enviado a Edición
                              </span>
                            ) : isUploadedForClient ? (
                              <span className="text-[10px] font-tech font-bold px-2.5 py-1 rounded-full bg-mint-dim text-mint border border-mint/30">
                                Video subido · Pendiente Cliente
                              </span>
                            ) : (
                              <span className="text-[10px] font-tech px-2.5 py-1 rounded-full bg-surface-2 text-muted-2 border border-line">
                                En producción interna ({v.qc.replace(/_/g, ' ')})
                              </span>
                            )}
                          </div>

                          <div className="flex items-center justify-between text-xs text-muted pt-2 border-t border-line/60">
                            <span className="font-tech text-[11px]">
                              Feedback: {roundsUsed}/{maxRounds} tanda usada
                            </span>
                            <span className="text-accent font-semibold flex items-center gap-1">
                              Abrir Video {num} <Eye size={13} />
                            </span>
                          </div>
                        </button>
                      );
                    })}
                </div>
              </div>
            ) : (
              /* Vista individual dentro de p.ej. "Video 1": Reproductor + 1 Ronda de Feedback + Botón Admin de Habilitar nueva tanda */
              (() => {
                const v = activePortalVideo;
                const isUploadedForClient = Boolean(
                  v.publishedToClient || v.qc === 'aprobado_senda' || v.qc === 'aprobado_cliente'
                );
                const finalClip = v.finalVideos[v.finalVideos.length - 1] || v.clips[0] || null;
                const roundsUsed = v.clientFeedbackRoundsUsed ?? 0;
                const maxRounds = v.clientFeedbackMaxRounds ?? 1;
                const canClientSendFeedback = isUploadedForClient && roundsUsed < maxRounds && v.qc !== 'aprobado_cliente';

                return (
                  <div className="space-y-5 relative z-10">
                    <div className="flex items-center justify-between gap-3 flex-wrap border-b border-line pb-4">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedPortalVideoId(null);
                            setDraftFeedbackList([]);
                          }}
                          className="w-9 h-9 rounded-xl bg-surface-3 border border-line flex items-center justify-center text-muted hover:text-text"
                        >
                          <ArrowLeft size={16} />
                        </button>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-display text-xl font-bold">
                              {activePortalBrand.name} · {v.name}
                            </h3>
                            {v.qc === 'aprobado_cliente' ? (
                              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                Aprobado por el Cliente
                              </span>
                            ) : isUploadedForClient ? (
                              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-mint-dim text-mint border border-mint/30">
                                Video subido · Pendiente de aprobación del cliente
                              </span>
                            ) : (
                              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-dim text-amber border border-amber/30">
                                Pendiente de "Aprobado Senda" en Tareas
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted mt-0.5">
                            Tandas de corrección utilizadas por el cliente: <strong className="text-accent font-tech">{roundsUsed} de {maxRounds}</strong>
                          </p>
                        </div>
                      </div>

                      {/* Botón exclusivo de Admin para habilitar una nueva tanda de feedback a este cliente */}
                      <button
                        type="button"
                        onClick={() => {
                          enableExtraClientFeedbackRound(v.id);
                          setFeedbackToast(`Se habilitó 1 nueva tanda de feedback para ${activePortalBrand.name} (${v.name}).`);
                          setTimeout(() => setFeedbackToast(null), 4000);
                        }}
                        className="px-3.5 py-2 rounded-xl bg-surface-3 hover:bg-accent-dim border border-accent/40 text-accent text-xs font-semibold flex items-center gap-1.5 transition-colors"
                      >
                        <Unlock size={13} /> Habilitar nueva tanda a este cliente
                      </button>
                    </div>

                    {feedbackToast && (
                      <div className="bg-mint-dim border border-mint/40 text-mint rounded-xl px-4 py-2.5 text-xs font-semibold flex items-center gap-2">
                        <CheckCircle2 size={15} /> {feedbackToast}
                      </div>
                    )}

                    {/* Reproductor del video subido */}
                    <div className="aspect-video bg-surface-3 border border-line rounded-2xl overflow-hidden flex items-center justify-center">
                      {!isUploadedForClient ? (
                        <div className="text-center p-6 space-y-2">
                          <Clock size={36} className="text-amber mx-auto" />
                          <p className="text-sm font-semibold">Este video aún no ha sido enviado desde Tareas</p>
                          <p className="text-xs text-muted max-w-md">
                            Ve a <strong>Tareas → Proyectos iniciados → {activePortalBrand.name} → {v.name}</strong> y presiona <strong>"Aprobar Senda"</strong> para que el video se suba automáticamente aquí.
                          </p>
                        </div>
                      ) : finalClip?.fileUrl ? (
                        <video
                          ref={portalPlayerRef}
                          src={finalClip.fileUrl}
                          controls
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <div className="text-center p-6 space-y-2">
                          <Film size={36} className="text-mint mx-auto" />
                          <p className="text-sm font-semibold">{v.name} subido para revisión del cliente</p>
                          <p className="text-xs text-muted">Listo para recibir visto bueno o la ronda única de feedback.</p>
                        </div>
                      )}
                    </div>

                    {/* Acciones de Aprobación del Cliente o Ronda Única de Feedback */}
                    {isUploadedForClient && (
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
                        <div className="md:col-span-7 bg-surface-3/90 border border-line rounded-2xl p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold flex items-center gap-1.5">
                              <MessageSquare size={14} className="text-amber" /> Feedback del Cliente (1 sola tanda por contrato)
                            </span>
                            <span className="font-tech text-[11px] text-muted-2">
                              Ronda {roundsUsed}/{maxRounds}
                            </span>
                          </div>

                          {canClientSendFeedback ? (
                            <div className="space-y-3">
                              <p className="text-[11px] text-muted leading-relaxed">
                                El cliente puede anotar <strong>varios puntos de corrección</strong> en esta lista. Una vez presione <strong>"Mandar correcciones"</strong>, se enviarán todas juntas y quedará cerrada la ronda.
                              </p>

                              <div className="flex gap-2">
                                <input
                                  type="number"
                                  min={0}
                                  value={draftTime}
                                  onChange={e => setDraftTime(e.target.value)}
                                  placeholder="Seg (ej. 12)"
                                  className="w-28 bg-surface-2 border border-line rounded-xl px-2.5 py-2 text-xs font-tech outline-none focus:border-accent"
                                />
                                <input
                                  value={draftText}
                                  onChange={e => setDraftText(e.target.value)}
                                  placeholder="Escribe una corrección para agregar a la tanda..."
                                  className="flex-1 bg-surface-2 border border-line rounded-xl px-3 py-2 text-xs outline-none focus:border-accent"
                                />
                                <button
                                  type="button"
                                  onClick={handleAddDraftCorrection}
                                  disabled={!draftText.trim()}
                                  className="px-3 py-2 rounded-xl bg-surface-2 hover:bg-accent-dim border border-line text-accent text-xs font-semibold flex items-center gap-1 disabled:opacity-40"
                                >
                                  <Plus size={14} /> Añadir punto
                                </button>
                              </div>

                              {draftFeedbackList.length > 0 && (
                                <div className="space-y-1.5 bg-surface-2 border border-line rounded-xl p-3">
                                  <p className="text-[10px] font-tech uppercase text-amber">
                                    Puntos acumulados para enviar en esta tanda ({draftFeedbackList.length}):
                                  </p>
                                  {draftFeedbackList.map((item, i) => (
                                    <div key={i} className="flex items-center justify-between gap-2 text-xs py-1 border-b border-line/40 last:border-none">
                                      <span>
                                        <strong className="text-amber font-tech mr-2">{fmtTime(item.time)}</strong>
                                        {item.text}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => setDraftFeedbackList(prev => prev.filter((_, idx) => idx !== i))}
                                        className="text-muted-2 hover:text-red-400"
                                      >
                                        <Trash2 size={12} />
                                      </button>
                                    </div>
                                  ))}

                                  <button
                                    type="button"
                                    onClick={() => handleSendSingleRoundFeedback(v)}
                                    className="w-full mt-2 py-2.5 rounded-xl bg-amber text-on-accent font-display text-xs font-bold flex items-center justify-center gap-1.5 hover:opacity-95"
                                  >
                                    <Send size={13} /> Mandar correcciones ({draftFeedbackList.length} punto(s) · Consumir tanda)
                                  </button>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="bg-surface-2 border border-line rounded-xl p-3.5 text-xs text-muted flex items-start gap-2.5">
                              <Lock size={15} className="text-amber shrink-0 mt-0.5" />
                              <div>
                                <p className="font-semibold text-text">
                                  {v.qc === 'aprobado_cliente'
                                    ? 'Video aprobado definitivamente por el cliente'
                                    : 'Tanda única de correcciones ya utilizada por el cliente'}
                                </p>
                                <p className="text-[11px] text-muted-2 mt-0.5">
                                  Por contrato solo se permite 1 tanda de feedback por video. Si necesitas autorizar otra ronda excepcional, usa el botón superior <strong>"Habilitar nueva tanda a este cliente"</strong>.
                                </p>
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="md:col-span-5 bg-surface-3/90 border border-line rounded-2xl p-4 space-y-3">
                          <span className="text-xs font-semibold block">Decisión Final del Cliente</span>
                          <button
                            type="button"
                            onClick={() => setQc(v.id, 'aprobado_cliente')}
                            disabled={v.qc === 'aprobado_cliente'}
                            className="w-full py-3 rounded-xl bg-mint text-on-accent font-display text-xs font-bold flex items-center justify-center gap-2 hover:opacity-95 disabled:opacity-50"
                          >
                            <CheckCircle2 size={16} />
                            {v.qc === 'aprobado_cliente' ? 'Video Aprobado por Cliente (100%)' : 'Aprobar Video Cliente (Liberar 100%)'}
                          </button>

                          {v.corrections.length > 0 && (
                            <div className="pt-2 border-t border-line/60 space-y-1.5">
                              <span className="text-[10px] font-tech uppercase text-muted-2 block">
                                Historial de correcciones de {v.name} ({v.corrections.length})
                              </span>
                              <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                                {v.corrections.map(c => (
                                  <div key={c.id} className="text-xs bg-surface-2 rounded-lg px-2.5 py-1.5">
                                    <span className="text-amber font-tech mr-1.5">{fmtTime(c.time)}</span>
                                    <span>{c.text}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()
            )}
          </div>
        </div>
      )}

      {/* =========================================================================
          PESTAÑA 2: NUEVO PEDIDO DE CLIENTE (PAGO 100% Y FACTURA OBLIGATORIA)
         ========================================================================= */}
      {activeTab === 'nuevo_pedido' && (
        <form onSubmit={handleInjectOrder} className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          <div className="lg:col-span-7 bg-surface-2 border border-line rounded-3xl p-6 space-y-5 relative overflow-hidden">
            <CardNodeDeco color="var(--accent)" />

            <div className="flex items-center justify-between relative z-10">
              <span className="font-tech text-xs uppercase tracking-wider text-accent font-semibold flex items-center gap-1.5">
                <PlusCircle size={14} /> Nuevo Pedido de Cliente
              </span>
              <span className="text-[11px] font-tech text-mint">Requisito obligatorio: Pago 100% + Factura adjunta</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 relative z-10">
              <div className="sm:col-span-8">
                <label className="text-xs text-muted block mb-1">Nombre del Cliente / Marca</label>
                <input
                  value={brandName}
                  onChange={e => setBrandName(e.target.value)}
                  placeholder="Ej. Nike, Gymshark, Ecommerce..."
                  required
                  className="w-full bg-surface-3 border border-line rounded-xl px-3.5 py-2.5 text-sm font-medium outline-none focus:border-accent"
                />
              </div>

              <div className="sm:col-span-4">
                <label className="text-xs text-muted block mb-1">Cantidad de videos</label>
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={videoCount}
                  onChange={e => setVideoCount(Math.max(1, Number(e.target.value) || 1))}
                  className="w-full bg-surface-3 border border-line rounded-xl px-3.5 py-2.5 text-sm font-tech font-bold text-accent outline-none focus:border-accent"
                />
              </div>
            </div>

            <div className="bg-surface-3/80 border border-line rounded-2xl p-4 space-y-3 relative z-10">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-tech uppercase tracking-wider text-mint font-semibold flex items-center gap-1.5">
                  <DollarSign size={13} /> Base Comercial por Video (Finanzas y Nóminas)
                </span>
                <span className="font-tech text-xs text-mint font-bold">
                  Margen proyecto: {financialPreview.marginPct}%
                </span>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <label className="block">
                  <span className="text-[11px] text-muted-2 block mb-1">Cobro Cliente / vid</span>
                  <input
                    type="number"
                    min={1}
                    value={unitPriceClient}
                    onChange={e => setUnitPriceClient(Math.max(1, Number(e.target.value) || 1))}
                    className="w-full bg-surface-2 border border-line rounded-lg px-3 py-1.5 text-sm font-tech text-text outline-none focus:border-mint"
                  />
                </label>

                <label className="block">
                  <span className="text-[11px] text-muted-2 block mb-1 flex items-center gap-1">
                    <Scissors size={10} className="text-accent" /> Pago Clipper / vid
                  </span>
                  <input
                    type="number"
                    min={0}
                    value={unitClipperPay}
                    onChange={e => setUnitClipperPay(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full bg-surface-2 border border-line rounded-lg px-3 py-1.5 text-sm font-tech text-accent outline-none focus:border-accent"
                  />
                </label>

                <label className="block">
                  <span className="text-[11px] text-muted-2 block mb-1 flex items-center gap-1">
                    <Film size={10} className="text-mint" /> Pago Editor / vid
                  </span>
                  <input
                    type="number"
                    min={0}
                    value={unitEditorPay}
                    onChange={e => setUnitEditorPay(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full bg-surface-2 border border-line rounded-lg px-3 py-1.5 text-sm font-tech text-mint outline-none focus:border-mint"
                  />
                </label>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 relative z-10">
              <div className="bg-surface-3/80 border border-line rounded-2xl p-3.5 space-y-2">
                <span className="text-[11px] font-tech uppercase text-muted-2 flex items-center gap-1">
                  <Calendar size={12} className="text-accent" /> Fecha y Hora Límite
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="date"
                    value={deliveryDate}
                    onChange={e => setDeliveryDate(e.target.value)}
                    className="bg-surface-2 border border-line rounded-lg px-2.5 py-1.5 text-xs font-tech outline-none focus:border-accent"
                  />
                  <input
                    type="time"
                    value={deliveryTime}
                    onChange={e => setDeliveryTime(e.target.value)}
                    className="bg-surface-2 border border-line rounded-lg px-2.5 py-1.5 text-xs font-tech outline-none focus:border-accent"
                  />
                </div>
              </div>

              <div className="bg-surface-3/80 border border-line rounded-2xl p-3.5 space-y-2">
                <span className="text-[11px] font-tech uppercase text-muted-2 flex items-center gap-1">
                  <Layers size={12} className="text-mint" /> Complejidad Operativa
                </span>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['simple', 'estandar', 'alta'] as const).map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setComplexity(c)}
                      className={`py-1.5 rounded-lg text-xs font-semibold capitalize border transition-all ${
                        complexity === c
                          ? 'bg-accent text-on-accent border-accent'
                          : 'bg-surface-2 text-muted border-line hover:text-text'
                      }`}
                    >
                      {c === 'alta' ? 'Compleja' : c}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-surface-3/90 border border-line rounded-2xl p-4 space-y-2.5 relative z-10">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-[11px] font-tech uppercase text-muted-2 flex items-center gap-1.5">
                  <Cpu size={13} className="text-accent" /> Regla de Prioridad y Motor de Capacidad (Automático)
                </span>
                <span className={`font-tech text-[11px] uppercase font-bold px-2.5 py-0.5 rounded-full border ${priorityBadgeStyle(capacityPreview.autoPriority)}`}>
                  Prioridad Motor: {capacityPreview.autoPriority}
                </span>
              </div>
              <p className="text-xs text-muted leading-relaxed">
                {capacityPreview.priorityReason}
              </p>
            </div>

            {/* Factura de Pago 100% Obligatoria + Brief del Cliente */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 relative z-10">
              <div>
                <span className="text-[11px] font-tech uppercase text-mint font-semibold block mb-1.5 flex items-center gap-1">
                  <Receipt size={12} /> Factura de Pago 100% (Obligatoria *)
                </span>
                <input
                  ref={invoiceInputRef}
                  type="file"
                  accept=".pdf,image/*,*/*"
                  className="hidden"
                  onChange={e => void handleUploadInvoice(e)}
                />
                <button
                  type="button"
                  onClick={() => invoiceInputRef.current?.click()}
                  disabled={uploadingInvoice}
                  className={`w-full py-2.5 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-colors ${
                    invoiceFile
                      ? 'bg-mint-dim/60 border-mint text-mint'
                      : 'bg-amber-dim/20 border-amber/50 border-dashed text-amber hover:border-amber'
                  }`}
                >
                  {uploadingInvoice ? <Loader2 size={14} className="animate-spin" /> : invoiceFile ? <CheckCircle2 size={14} /> : <Upload size={14} />}
                  <span className="truncate">
                    {uploadingInvoice ? 'Subiendo factura...' : invoiceFile ? `Factura cargada: ${invoiceFile.name}` : 'Subir Factura del Pago 100% (Requerido)'}
                  </span>
                </button>
              </div>

              <div>
                <span className="text-[11px] font-tech uppercase text-muted-2 block mb-1.5">Brief del Cliente</span>
                <input
                  ref={briefInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx,image/*,*/*"
                  className="hidden"
                  onChange={e => void handleUploadBrief(e)}
                />
                <button
                  type="button"
                  onClick={() => briefInputRef.current?.click()}
                  disabled={uploadingBrief}
                  className={`w-full py-2.5 px-3 rounded-xl border text-xs font-medium flex items-center justify-center gap-2 transition-colors ${
                    briefFile
                      ? 'bg-accent-dim/60 border-accent text-accent'
                      : 'bg-surface-3 border-line border-dashed text-muted hover:text-text hover:border-accent/40'
                  }`}
                >
                  {uploadingBrief ? <Loader2 size={14} className="animate-spin" /> : briefFile ? <FileText size={14} /> : <Upload size={14} />}
                  <span className="truncate">
                    {uploadingBrief ? 'Subiendo...' : briefFile ? briefFile.name : 'Adjuntar Brief'}
                  </span>
                </button>
              </div>
            </div>

            <div className="relative z-10">
              <label className="text-[11px] font-tech uppercase text-muted-2 block mb-1">
                Especificaciones del Brief / Notas Operativas
              </label>
              <input
                value={clientNotes}
                onChange={e => setClientNotes(e.target.value)}
                placeholder="Indicaciones de estilo, referencias, formato de entrega o links del cliente..."
                className="w-full bg-surface-3 border border-line rounded-xl px-3.5 py-2 text-xs outline-none focus:border-accent"
              />
            </div>
          </div>

          <div className="lg:col-span-5 bg-surface-2 border border-mint/35 rounded-3xl p-6 flex flex-col justify-between space-y-5 relative overflow-hidden shadow-[0_0_45px_-18px_rgba(111,231,200,0.25)]">
            <CardNodeDeco color="var(--mint)" />

            <div className="space-y-4 relative z-10">
              <div className="flex items-center justify-between">
                <span className="font-tech text-xs uppercase tracking-wider text-mint font-semibold flex items-center gap-1.5">
                  <Sparkles size={14} /> Impacto del Pedido en Vivo
                </span>
                <span className="font-tech text-[11px] text-muted-2">Pago 100% anticipado</span>
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <div className="bg-surface-3/90 border border-line rounded-2xl p-3.5">
                  <span className="text-[10px] font-tech uppercase text-amber block">Ingreso Bruto</span>
                  <p className="font-display text-xl font-bold font-tech text-text mt-1">
                    {fmtMoneyClean(financialPreview.grossTotal)}
                  </p>
                  <span className="text-[10px] text-muted-2 font-tech">Facturación 100%</span>
                </div>

                <div className="bg-surface-3/90 border border-line rounded-2xl p-3.5">
                  <span className="text-[10px] font-tech uppercase text-accent block">Nómina (C+E)</span>
                  <p className="font-display text-xl font-bold font-tech text-accent mt-1">
                    {fmtMoneyClean(financialPreview.payrollTotal)}
                  </p>
                  <span className="text-[10px] text-muted-2 font-tech">
                    C:{fmtMoneyClean(financialPreview.clipperTotal)} E:{fmtMoneyClean(financialPreview.editorTotal)}
                  </span>
                </div>

                <div className="bg-mint-dim/30 border border-mint/40 rounded-2xl p-3.5">
                  <span className="text-[10px] font-tech uppercase text-mint font-bold block">Neto SENDA</span>
                  <p className="font-display text-xl font-bold font-tech text-mint mt-1">
                    {fmtMoneyClean(financialPreview.netMargin)}
                  </p>
                  <span className="text-[10px] text-mint font-tech">Libre ({financialPreview.marginPct}%)</span>
                </div>
              </div>

              <div className={`rounded-2xl p-4 border space-y-3 ${
                capacityPreview.fitsInSingleDay
                  ? 'bg-mint-dim/20 border-mint/40'
                  : 'bg-amber-dim/20 border-amber/40'
              }`}>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="font-tech text-xs uppercase font-bold flex items-center gap-1.5">
                    {capacityPreview.fitsInSingleDay ? (
                      <><CheckCircle2 size={15} className="text-mint" /> Cabe en la fecha solicitada</>
                    ) : (
                      <><AlertTriangle size={15} className="text-amber" /> Supera el cupo del día ({capacityPreview.maxAcceptableOnTarget} libres)</>
                    )}
                  </span>
                  <span className="font-tech text-[11px] text-accent">{capacityPreview.etaText}</span>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-1">
                  <div className="bg-surface-2/80 border border-line rounded-xl p-2.5">
                    <span className="text-[10px] font-tech uppercase text-muted-2 flex items-center gap-1">
                      <Users size={11} className="text-accent" /> Fuerza Sugerida
                    </span>
                    <p className="font-tech text-xs font-bold text-text mt-1">
                      {capacityPreview.recommendedClippers}C + {capacityPreview.recommendedEditors}E
                    </p>
                  </div>

                  <div className="bg-surface-2/80 border border-line rounded-xl p-2.5">
                    <span className="text-[10px] font-tech uppercase text-muted-2 flex items-center gap-1">
                      <Gauge size={11} className="text-mint" /> Ritmo / Hora
                    </span>
                    <p className="font-tech text-xs font-bold text-mint mt-1">
                      {capacityPreview.pacePerHour} vid/h
                    </p>
                  </div>

                  <div className="bg-surface-2/80 border border-line rounded-xl p-2.5">
                    <span className="text-[10px] font-tech uppercase text-muted-2 flex items-center gap-1">
                      <Clock size={11} className="text-amber" /> Etapa Crítica
                    </span>
                    <p className="font-tech text-xs font-bold text-amber mt-1">
                      {capacityPreview.bottleneckStage}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-3 relative z-10">
              {!invoiceFile && (
                <div className="bg-amber-dim/30 border border-amber/40 text-amber rounded-xl px-3.5 py-2.5 text-xs flex items-center gap-2">
                  <Lock size={14} className="shrink-0" />
                  <span>Debes subir la <strong>Factura del Pago (100%)</strong> para poder habilitar el ingreso del pedido.</span>
                </div>
              )}



              <button
                type="submit"
                disabled={!invoiceFile || !brandName.trim()}
                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-accent to-mint text-on-accent font-display text-sm font-bold hover:opacity-95 transition-all flex items-center justify-center gap-2 shadow-[0_10px_28px_-6px_rgba(53,214,228,0.55)] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <PlusCircle size={17} />
                Ingresar Pedido al Sistema SENDA
              </button>
            </div>
          </div>
        </form>
      )}

      {/* =========================================================================
          PESTAÑA 3: EXPEDIENTES Y FACTURAS (TODOS 100% PAGADOS)
         ========================================================================= */}
      {activeTab === 'cartera' && (
        <div className="space-y-5">
          <div className="bg-surface-2 border border-line rounded-3xl p-5 flex items-center justify-between gap-4 flex-wrap">
            <div className="relative flex-1 max-w-md">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
              <input
                value={searchClient}
                onChange={e => setSearchClient(e.target.value)}
                placeholder="Buscar cliente o marca en los expedientes..."
                className="w-full bg-surface-3 border border-line rounded-xl pl-9 pr-3.5 py-2 text-xs outline-none focus:border-accent"
              />
            </div>

            <button
              type="button"
              onClick={() => setActiveTab('nuevo_pedido')}
              className="px-4 py-2 rounded-xl bg-accent-dim border border-accent/40 text-accent text-xs font-display font-bold flex items-center gap-1.5 hover:bg-accent hover:text-on-accent transition-all"
            >
              <PlusCircle size={14} /> Nuevo Pedido
            </button>
          </div>

          {filteredClients.length === 0 ? (
            <div className="bg-surface-2 border border-line rounded-3xl p-12 text-center space-y-3">
              <Briefcase size={32} className="text-muted mx-auto" />
              <p className="font-display text-base font-bold">No hay expedientes registrados</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <div className="lg:col-span-4 space-y-2.5">
                {filteredClients.map(client => {
                  const isSelected = activeClient?.brand === client.brand;
                  return (
                    <button
                      key={client.brand}
                      type="button"
                      onClick={() => setSelectedClientBrand(client.brand)}
                      className={`w-full text-left p-4 rounded-2xl border transition-all space-y-3 ${
                        isSelected
                          ? 'bg-surface-2 border-accent shadow-[0_0_25px_-8px_rgba(53,214,228,0.4)]'
                          : 'bg-surface-2/70 border-line hover:border-accent/40'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-xl bg-accent-dim text-accent font-display font-bold text-base flex items-center justify-center shrink-0">
                            {client.brand.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="font-display text-base font-bold truncate">{client.brand}</p>
                            <p className="text-[11px] text-muted font-tech">
                              {client.totalOrders} pedido(s) · {client.totalVideosOrdered} videos
                            </p>
                          </div>
                        </div>

                        <span className="px-2 py-0.5 rounded-full text-[10px] font-tech font-bold uppercase border bg-mint-dim/40 text-mint border-mint/40 shrink-0">
                          Factura 100%
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-1 border-t border-line/60 font-tech text-xs">
                        <div>
                          <span className="text-[10px] text-muted-2 uppercase block">Facturado</span>
                          <strong className="text-text">{fmtMoneyClean(client.grossBilled)}</strong>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] text-mint uppercase block">Neto SENDA</span>
                          <strong className="text-mint">{fmtMoneyClean(client.netProfit)}</strong>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {activeClient && (
                <div className="lg:col-span-8 bg-surface-2 border border-line rounded-3xl p-6 space-y-6 relative overflow-hidden">
                  <CardNodeDeco color="var(--accent)" />

                  <div className="flex items-start justify-between gap-4 flex-wrap relative z-10 border-b border-line pb-5">
                    <div>
                      <h3 className="font-display text-2xl font-bold">{activeClient.brand}</h3>
                      <p className="text-xs text-muted mt-1">
                        {activeClient.totalVideosOrdered} videos solicitados en {activeClient.totalOrders} lote(s) · Pago 100% verificado con factura
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4 relative z-10">
                    {activeClient.ordersList.map((ord, idx) => {
                      const count = Math.max(1, ord.videoCount || 1);
                      const uPrice = ord.unitPriceClient ?? financeSettings.clientPricePerVideo;
                      const uClip = ord.unitClipperPay ?? financeSettings.defaultClipperCost;
                      const uEdit = ord.unitEditorPay ?? financeSettings.defaultEditorCost;
                      const orderTotal = count * uPrice;
                      const orderNet = orderTotal - count * (uClip + uEdit);
                      const invCode = ord.invoiceNumber || buildInvoiceCode(ord.brand, ord.deliveryDate);

                      return (
                        <div
                          key={ord.id}
                          className="bg-surface-3/90 border border-line rounded-2xl p-5 space-y-4 hover:border-accent/35 transition-all"
                        >
                          <div className="flex items-start justify-between gap-3 flex-wrap">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-tech text-xs font-bold px-2.5 py-0.5 rounded-lg bg-accent-dim text-accent">
                                  Pedido #{activeClient.ordersList.length - idx} · {count} videos
                                </span>
                                <span className="font-display text-sm font-bold text-text">{ord.brand}</span>
                              </div>
                              <p className="text-xs text-muted font-tech">
                                Fecha límite: <strong className="text-accent">{ord.deliveryDate} a las {ord.deliveryTime}</strong> · Folio: <strong>{invCode}</strong>
                              </p>
                            </div>

                            <span className="px-3 py-1 rounded-xl bg-mint-dim/40 border border-mint/40 text-mint text-xs font-tech font-bold flex items-center gap-1.5">
                              <CheckCircle2 size={13} /> Factura Pagada (100%)
                            </span>
                          </div>

                          <div className="grid grid-cols-3 gap-2.5 font-tech text-xs">
                            <div className="bg-surface-2 border border-line rounded-xl p-3">
                              <span className="text-[10px] uppercase text-muted-2 block">Videos</span>
                              <strong className="text-sm text-accent">{count} videos ({fmtMoneyClean(uPrice)}/vid)</strong>
                            </div>
                            <div className="bg-surface-2 border border-line rounded-xl p-3">
                              <span className="text-[10px] uppercase text-muted-2 block">Total Factura</span>
                              <strong className="text-sm text-text">{fmtMoneyClean(orderTotal)}</strong>
                            </div>
                            <div className="bg-surface-2 border border-line rounded-xl p-3">
                              <span className="text-[10px] uppercase text-mint block">Neto SENDA</span>
                              <strong className="text-sm text-mint">{fmtMoneyClean(orderNet)}</strong>
                            </div>
                          </div>

                          <div className="flex items-center justify-end gap-2 flex-wrap pt-2 border-t border-line/60">
                            {ord.briefFileUrl ? (
                              <a
                                href={ord.briefFileUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="px-3 py-1.5 rounded-xl bg-accent-dim/50 border border-accent/40 text-accent text-xs font-semibold flex items-center gap-1.5"
                              >
                                <FileText size={13} /> Brief: {ord.briefFileName || 'Abrir'} <ExternalLink size={11} />
                              </a>
                            ) : (
                              <label className="px-3 py-1.5 rounded-xl bg-surface-2 border border-line border-dashed text-muted hover:text-text text-xs font-medium flex items-center gap-1.5 cursor-pointer">
                                {uploadingOrderBriefId === ord.id ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                                <span>Subir Brief</span>
                                <input
                                  type="file"
                                  className="hidden"
                                  onChange={e => {
                                    const f = e.target.files?.[0];
                                    if (f) void handleUploadExistingOrderBrief(ord.id, f);
                                  }}
                                />
                              </label>
                            )}

                            {ord.invoiceFileUrl ? (
                              <a
                                href={ord.invoiceFileUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="px-3 py-1.5 rounded-xl bg-mint-dim/50 border border-mint/40 text-mint text-xs font-semibold flex items-center gap-1.5"
                              >
                                <Receipt size={13} /> Factura: {ord.invoiceFileName || 'Ver'} <ExternalLink size={11} />
                              </a>
                            ) : (
                              <label className="px-3 py-1.5 rounded-xl bg-surface-2 border border-line border-dashed text-muted hover:text-text text-xs font-medium flex items-center gap-1.5 cursor-pointer">
                                {uploadingOrderInvoiceId === ord.id ? <Loader2 size={13} className="animate-spin" /> : <Receipt size={13} />}
                                <span>Reemplazar Factura</span>
                                <input
                                  type="file"
                                  className="hidden"
                                  onChange={e => {
                                    const f = e.target.files?.[0];
                                    if (f) void handleUploadExistingOrderInvoice(ord.id, f);
                                  }}
                                />
                              </label>
                            )}

                            <button
                              type="button"
                              onClick={() => handlePrintInvoice(ord)}
                              className="px-3 py-1.5 rounded-xl bg-surface-2 hover:bg-surface-3 border border-line text-text text-xs font-semibold flex items-center gap-1.5"
                            >
                              <Printer size={13} className="text-mint" /> Factura PDF
                            </button>

                            <button
                              type="button"
                              onClick={() => setView('tareas')}
                              className="px-3 py-1.5 rounded-xl bg-surface-2 hover:bg-surface-3 border border-line text-accent text-xs font-semibold flex items-center gap-1"
                            >
                              <Eye size={13} /> Ir a Tareas
                            </button>

                            {confirmDeleteOrderId === ord.id ? (
                              <div className="flex items-center gap-1.5 bg-red-500/10 border border-red-500/40 rounded-xl px-2.5 py-1">
                                <span className="text-[11px] text-red-300 font-semibold">¿Borrar pedido?</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    deleteOrder(ord.id);
                                    setConfirmDeleteOrderId(null);
                                  }}
                                  className="px-2 py-0.5 rounded-lg bg-red-500 text-white text-[11px] font-bold hover:bg-red-600"
                                >
                                  Sí, borrar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteOrderId(null)}
                                  className="px-2 py-0.5 rounded-lg bg-surface-2 text-muted text-[11px] hover:text-text"
                                >
                                  Cancelar
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteOrderId(ord.id)}
                                className="px-3 py-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                              >
                                <Trash2 size={13} /> Borrar
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
