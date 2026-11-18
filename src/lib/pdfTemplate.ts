// Plantilla de documentos PDF de SENDA (marca: oscuro #131519, cian #35D6E4, Space Grotesk / Inter).
// Todos los documentos de la plataforma usan este mismo encabezado, secciones y pie de página.
// Se arma con HTML con estilos propios y se convierte a un PDF real (descargable y subible a la nube).
import sendaLogo from '../assets/senda-logo.png';
import type { CatalogAvatar, CatalogStyle, ClientCatalog, Order, OrderScript, ScriptChoice } from '../types';

const C = {
  dark: '#131519', dark2: '#1A1D22', accent: '#35D6E4', deep: '#0EA6B8', mint: '#2FBF9B',
  text: '#1F2937', muted: '#6B7280', line: '#E5E7EB', soft: '#F3F7F9',
};
const FONT = "'Inter','Helvetica Neue',Arial,sans-serif";
const DISPLAY = "'Space Grotesk','Inter',Arial,sans-serif";

const esc = (t: unknown) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const nl2br = (t: string) => esc(t).replace(/\n/g, '<br/>');
const today = () => new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
export const pdfFileName = (kind: string, brand: string) => `${kind} - ${brand.replace(/[\\/:*?"<>|]/g, '').trim() || 'proyecto'}.pdf`;

// ---------- Piezas de la plantilla ----------
function header(kicker: string, title: string, subtitle: string, meta: [string, string][]): string {
  return `
  <div style="background:linear-gradient(135deg,${C.dark} 0%,${C.dark2} 100%);padding:40px 48px 30px;color:#fff;font-family:${FONT};position:relative">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:34px">
      <div style="width:38px;height:38px;border-radius:10px;background:#22262D;display:flex;align-items:center;justify-content:center;border:1px solid #2A2E36">
        <img src="${sendaLogo}" style="width:24px;height:24px;object-fit:contain" />
      </div>
      <span style="font-family:${DISPLAY};font-weight:700;letter-spacing:5px;font-size:15px;color:${C.accent}">SENDA</span>
    </div>
    <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:${C.accent};font-weight:600">${esc(kicker)}</div>
    <div style="font-family:${DISPLAY};font-size:34px;font-weight:700;line-height:1.15;margin-top:8px">${esc(title)}</div>
    <div style="font-size:14px;color:#AEB6C2;margin-top:8px">${esc(subtitle)}</div>
    <div style="display:flex;gap:28px;margin-top:26px;flex-wrap:wrap">
      ${meta.map(([k, v]) => `<div><div style="font-size:9.5px;letter-spacing:2px;text-transform:uppercase;color:#7C8696">${esc(k)}</div><div style="font-size:13.5px;font-weight:600;margin-top:3px">${esc(v)}</div></div>`).join('')}
    </div>
    <div style="position:absolute;left:0;right:0;bottom:0;height:4px;background:linear-gradient(90deg,${C.accent},${C.mint})"></div>
  </div>`;
}

function section(n: number | string, title: string, body: string, hint?: string): string {
  return `
  <div style="padding:26px 48px 4px;font-family:${FONT};color:${C.text}">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">
      <div style="min-width:28px;height:28px;border-radius:8px;background:${C.dark};color:${C.accent};font-family:${DISPLAY};font-weight:700;font-size:13px;display:flex;align-items:center;justify-content:center;padding:0 6px">${esc(n)}</div>
      <div>
        <div style="font-family:${DISPLAY};font-size:19px;font-weight:700;color:${C.dark}">${esc(title)}</div>
        ${hint ? `<div style="font-size:11.5px;color:${C.muted};margin-top:2px">${esc(hint)}</div>` : ''}
      </div>
    </div>
    ${body ? `<div style="border-left:3px solid ${C.accent};padding-left:18px;margin-left:13px">${body}</div>` : ''}
  </div>`;
}

const empty = (t: string) => `<div style="font-size:13px;color:${C.muted};font-style:italic;padding:6px 0 14px">${esc(t)}</div>`;

function avatarCard(a: CatalogAvatar | null, customText?: string | null, refUrl?: string | null, w = 190): string {
  const h = Math.round((w * 16) / 9);
  if (!a && !customText && !refUrl) return empty('Sin avatar elegido todavía.');
  if (a) {
    return `<div style="display:flex;gap:22px;align-items:flex-start;padding-bottom:16px">
      ${a.imageUrl ? `<img crossorigin="anonymous" src="${esc(a.imageUrl)}" style="width:${w}px;height:${h}px;object-fit:cover;border-radius:14px;border:1px solid ${C.line};background:${C.soft}" />` : ''}
      <div style="flex:1">
        <div style="font-family:${DISPLAY};font-size:20px;font-weight:700;color:${C.dark}">${esc(a.name)}</div>
        <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">
          ${a.gender ? `<span style="font-size:11px;background:${C.soft};border:1px solid ${C.line};border-radius:20px;padding:3px 10px;color:${C.muted};text-transform:capitalize">${esc(a.gender)}</span>` : ''}
          ${a.background ? `<span style="font-size:11px;background:${C.soft};border:1px solid ${C.line};border-radius:20px;padding:3px 10px;color:${C.muted}">Fondo ${esc(a.background)}</span>` : ''}
        </div>
        ${a.description ? `<div style="font-size:13px;line-height:1.55;margin-top:12px;color:${C.text}">${nl2br(a.description)}</div>` : ''}
        <div style="font-size:11.5px;color:${C.muted};margin-top:12px">Avatar de la galería de SENDA · imagen con todos sus ángulos.</div>
      </div>
    </div>`;
  }
  return `<div style="display:flex;gap:22px;align-items:flex-start;padding-bottom:16px">
    ${refUrl ? `<img crossorigin="anonymous" src="${esc(refUrl)}" style="width:${w}px;height:${h}px;object-fit:cover;border-radius:14px;border:1px solid ${C.line};background:${C.soft}" />` : ''}
    <div style="flex:1">
      <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:${C.deep};font-weight:700">Avatar propio del cliente</div>
      ${customText ? `<div style="font-size:14px;line-height:1.6;margin-top:8px">${nl2br(customText)}</div>` : ''}
      ${refUrl ? `<div style="font-size:11.5px;color:${C.muted};margin-top:10px">Imagen de referencia adjunta.</div>` : ''}
    </div>
  </div>`;
}

function styleCard(s: CatalogStyle | null, fallbackName?: string | null): string {
  if (!s && !fallbackName) return empty('Sin estilo de edición elegido todavía.');
  const vids = s ? [...(s.videos || []), ...(s.exampleUrl ? [{ id: 'ex', name: 'Video de ejemplo', url: s.exampleUrl }] : [])] : [];
  return `<div style="padding-bottom:16px">
    <div style="font-family:${DISPLAY};font-size:19px;font-weight:700;color:${C.dark}">${esc(s?.name || fallbackName)}</div>
    ${s?.description ? `<div style="font-size:13px;line-height:1.6;margin-top:8px;color:${C.text}">${nl2br(s.description)}</div>` : ''}
    ${vids.length ? `<div style="margin-top:12px;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:${C.muted};font-weight:700">Videos de este estilo</div>
      <ul style="margin:6px 0 0;padding:0;list-style:none">${vids.map(v => `<li style="font-size:12px;padding:5px 0;border-bottom:1px solid ${C.line};color:${C.text}">▶ ${esc(v.name)} <span style="color:${C.deep};font-size:10.5px">${esc(v.url.length > 60 ? v.url.slice(0, 57) + '…' : v.url)}</span></li>`).join('')}</ul>` : ''}
  </div>`;
}

// ---------- Documentos ----------
export function briefBlocks(order: Order, catalog: ClientCatalog): string[] {
  const blocks: string[] = [];
  const delivery = order.deliveryDate ? new Date(`${order.deliveryDate}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Por definir';
  blocks.push(header('Brief del proyecto', order.brand, 'Documento de dirección creativa para el equipo SENDA', [
    ['Videos', String(order.videoCount)], ['Entrega', delivery],
    ['Estado', order.briefConfirmedAt ? 'Brief confirmado' : 'Borrador'], ['Generado', today()],
  ]));

  const choices = order.scriptChoices || [];
  const scripts = order.scripts || [];
  if (order.scriptsService && scripts.length) {
    blocks.push(section('1', 'Guiones, avatares y estilos', '', 'Cada guión es un video: su avatar y su estilo de edición están abajo.'));
    scripts.forEach((sc, i) => {
      const ch: ScriptChoice | undefined = choices.find(c => c.scriptId === sc.id);
      const av = ch?.avatarId ? catalog.avatars.find(a => a.id === ch.avatarId) || null : null;
      const st = ch?.styleId ? catalog.styles.find(s => s.id === ch.styleId) || null : null;
      blocks.push(`
      <div style="padding:6px 48px 4px;font-family:${FONT};color:${C.text}">
        <div style="border:1px solid ${C.line};border-radius:16px;overflow:hidden">
          <div style="background:${C.soft};padding:12px 20px;display:flex;align-items:center;gap:10px;border-bottom:1px solid ${C.line}">
            <span style="background:${C.dark};color:${C.accent};font-family:${DISPLAY};font-weight:700;font-size:12px;border-radius:7px;padding:4px 10px">VIDEO ${i + 1}</span>
            <span style="font-family:${DISPLAY};font-weight:700;font-size:15px;color:${C.dark}">${esc(sc.title || `Guión ${i + 1}`)}</span>
          </div>
          <div style="padding:16px 20px;font-size:13px;line-height:1.7;white-space:normal">${nl2br(sc.text)}</div>
          <div style="display:flex;border-top:1px solid ${C.line}">
            <div style="flex:1;padding:14px 20px;border-right:1px solid ${C.line}">
              <div style="font-size:9.5px;letter-spacing:2px;text-transform:uppercase;color:${C.deep};font-weight:700;margin-bottom:8px">Avatar</div>
              ${avatarCard(av, ch?.avatarCustomText, ch?.avatarRefUrl, 118)}
            </div>
            <div style="flex:1;padding:14px 20px">
              <div style="font-size:9.5px;letter-spacing:2px;text-transform:uppercase;color:${C.deep};font-weight:700;margin-bottom:8px">Estilo de edición</div>
              ${styleCard(st, ch?.styleName)}
            </div>
          </div>
        </div>
      </div>`);
    });
  } else {
    const av = order.avatarId ? catalog.avatars.find(a => a.id === order.avatarId) || null : null;
    const st = order.editingStyleId ? catalog.styles.find(s => s.id === order.editingStyleId) || null : null;
    blocks.push(section('1', 'Avatar', avatarCard(av, order.avatarCustomText || (!av ? order.avatarName : null), order.avatarRefUrl), 'La persona que aparece en los videos.'));
    blocks.push(section('2', 'Estilo de edición', styleCard(st, order.editingStyleName), 'Ritmo, subtítulos, transiciones y música.'));
  }

  const n0 = order.scriptsService && scripts.length ? 2 : 3;
  const refs = order.references || [];
  blocks.push(section(n0, 'Referencias', refs.length
    ? `<ul style="margin:0;padding:0;list-style:none">${refs.map(r => `<li style="padding:9px 0;border-bottom:1px solid ${C.line};font-size:13px"><b style="color:${C.dark}">${esc(r.name)}</b><br/><span style="color:${C.deep};font-size:11.5px;word-break:break-all">${esc(r.url)}</span></li>`).join('')}</ul>`
    : empty('Sin referencias.'), 'Videos o cuentas que le gustan al cliente.'));
  blocks.push(section(n0 + 1, 'Notas para el equipo', order.clientNotes
    ? `<div style="font-size:13.5px;line-height:1.7;padding-bottom:12px">${nl2br(order.clientNotes)}</div>` : empty('Sin notas adicionales.'), 'Mensajes clave, ofertas y lo que no se quiere ver.'));
  return blocks;
}

export function scriptsBlocks(order: Order): string[] {
  const scripts: OrderScript[] = order.scripts || [];
  const blocks: string[] = [header('Servicio de guiones', `Guiones de ${order.brand}`, 'Propuesta de guiones para tus videos. Revísalos y elige el avatar y el estilo de cada uno.', [
    ['Guiones', String(scripts.length)], ['Videos', String(order.videoCount)], ['Generado', today()],
  ])];
  scripts.forEach((sc, i) => {
    blocks.push(`
    <div style="padding:22px 48px 4px;font-family:${FONT};color:${C.text}">
      <div style="border:1px solid ${C.line};border-radius:16px;overflow:hidden">
        <div style="background:${C.dark};padding:14px 22px;display:flex;align-items:center;gap:12px">
          <span style="background:${C.accent};color:${C.dark};font-family:${DISPLAY};font-weight:700;font-size:12px;border-radius:7px;padding:4px 10px">GUIÓN ${i + 1}</span>
          <span style="font-family:${DISPLAY};font-weight:700;font-size:17px;color:#fff">${esc(sc.title || `Guión ${i + 1}`)}</span>
        </div>
        <div style="padding:20px 24px 22px;font-size:14px;line-height:1.8">${nl2br(sc.text)}</div>
      </div>
    </div>`);
  });
  blocks.push(section('→', 'Siguiente paso', `<div style="font-size:13.5px;line-height:1.7;padding-bottom:14px">Entra a <b>Mis proyectos</b> en SENDA y, para cada guión, elige el <b>avatar</b> de la galería (o describe el tuyo) y el <b>estilo de edición</b> de su video. Con eso armamos tu brief y empezamos a producir.</div>`));
  return blocks;
}

// ---------- Motor: HTML → PDF real ----------
async function waitImages(el: HTMLElement) {
  await Promise.all(Array.from(el.querySelectorAll('img')).map(img => (img.complete ? Promise.resolve() : new Promise<void>(res => { img.onload = () => res(); img.onerror = () => res(); }))));
}

export async function renderPdf(blocks: string[], footerLabel: string): Promise<Blob> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:794px;background:#fff;pointer-events:none';
  document.body.appendChild(host);
  try {
    // Esperar a que carguen las tipografías de la marca
    try { await (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready; } catch { /* sin fonts API */ }
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
    const pageW = 210, pageH = 297, bottom = 16;
    const usable = pageH - bottom;
    let y = 0;
    let first = true;
    for (const html of blocks) {
      host.innerHTML = `<div style="width:794px;background:#fff;font-family:${FONT}">${html}</div>`;
      const el = host.firstElementChild as HTMLElement;
      await waitImages(el);
      const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false });
      const hMm = (canvas.height / canvas.width) * pageW;
      if (hMm <= usable) {
        if (!first && y + hMm > usable) { pdf.addPage(); y = 0; }
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, y, pageW, hMm);
        y += hMm;
      } else {
        // Bloque más alto que una página: se corta en tramos
        const sliceH = Math.floor((usable / pageW) * canvas.width);
        for (let off = 0; off < canvas.height; off += sliceH) {
          const h = Math.min(sliceH, canvas.height - off);
          const part = document.createElement('canvas');
          part.width = canvas.width; part.height = h;
          part.getContext('2d')!.drawImage(canvas, 0, off, canvas.width, h, 0, 0, canvas.width, h);
          if (!first || off > 0) { pdf.addPage(); y = 0; }
          const pm = (h / canvas.width) * pageW;
          pdf.addImage(part.toDataURL('image/jpeg', 0.92), 'JPEG', 0, y, pageW, pm);
          y += pm; first = false;
        }
      }
      first = false;
    }
    const total = pdf.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
      pdf.setPage(i);
      pdf.setDrawColor(229, 231, 235);
      pdf.line(14, 287, 196, 287);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.setTextColor(107, 114, 128);
      pdf.text(`SENDA · ${footerLabel}`, 14, 292);
      pdf.text(`Página ${i} de ${total}`, 196, 292, { align: 'right' });
    }
    return pdf.output('blob');
  } finally {
    host.remove();
  }
}

export const buildBriefPdf = (order: Order, catalog: ClientCatalog) => renderPdf(briefBlocks(order, catalog), `Brief · ${order.brand}`);
export const buildScriptsPdf = (order: Order) => renderPdf(scriptsBlocks(order), `Guiones · ${order.brand}`);
