// Envía las notificaciones de SENDA por correo (breve y con la marca).
// Seguridad: el destinatario se busca aquí en el servidor; solo personas del equipo
// con "Recibir notificaciones al correo" activado. El cliente nunca elige la dirección.
//
// Configuración (una sola vez):
//   supabase secrets set RESEND_API_KEY=re_xxx MAIL_FROM="SENDA <notificaciones@tudominio.com>" APP_URL=https://tu-senda.com
//   supabase functions deploy send-email
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function template(name: string, text: string, appUrl: string) {
  return `<!doctype html><html><body style="margin:0;background:#0f1114;font-family:Inter,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px;"><tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#1A1D22;border:1px solid #2A2E36;border-radius:14px;">
      <tr><td style="padding:22px 26px 6px;font-size:13px;letter-spacing:3px;font-weight:700;color:#35D6E4;">SENDA</td></tr>
      <tr><td style="padding:6px 26px 4px;color:#F1F3F5;font-size:15px;">Hola ${esc(name.split(" ")[0] || "")},</td></tr>
      <tr><td style="padding:6px 26px 18px;color:#C9CED6;font-size:15px;line-height:1.5;">${esc(text)}</td></tr>
      <tr><td style="padding:0 26px 24px;"><a href="${appUrl}" style="display:inline-block;background:#35D6E4;color:#03151A;text-decoration:none;font-weight:700;font-size:14px;padding:10px 18px;border-radius:8px;">Abrir SENDA</a></td></tr>
      <tr><td style="padding:14px 26px;border-top:1px solid #2A2E36;color:#5C6470;font-size:11px;">Recibes este aviso porque activaste las notificaciones por correo en tu Perfil de SENDA.</td></tr>
    </table>
  </td></tr></table></body></html>`;
}

// ---- Duración de videos MP4/MOV de Google Drive (lee el encabezado "mvhd" del archivo) ----
const DRIVE_DL = (id: string) => `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`;

function readMvhd(buf: Uint8Array): number | null {
  for (let i = 4; i < buf.length - 32; i++) {
    if (buf[i] === 0x6d && buf[i + 1] === 0x76 && buf[i + 2] === 0x68 && buf[i + 3] === 0x64) { // "mvhd"
      const dv = new DataView(buf.buffer, buf.byteOffset + i + 4);
      const version = dv.getUint8(0);
      let timescale: number, duration: number;
      if (version === 1) {
        if (i + 4 + 32 > buf.length) return null;
        timescale = dv.getUint32(20);
        duration = Number(dv.getBigUint64(24));
      } else {
        timescale = dv.getUint32(12);
        duration = dv.getUint32(16);
      }
      if (timescale > 0 && duration > 0) return duration / timescale;
    }
  }
  return null;
}

async function fetchRange(id: string, range: string): Promise<{ bytes: Uint8Array; total: number } | null> {
  const res = await fetch(DRIVE_DL(id), { headers: { Range: `bytes=${range}` }, redirect: "follow" });
  if (!res.ok && res.status !== 206) return null;
  const type = res.headers.get("content-type") || "";
  if (type.includes("text/html")) { await res.body?.cancel(); return null; } // no es público o no es un archivo
  const total = Number((res.headers.get("content-range") || "").split("/")[1]) || Number(res.headers.get("content-length")) || 0;
  return { bytes: new Uint8Array(await res.arrayBuffer()), total };
}

async function driveVideoDuration(id: string): Promise<number | null> {
  const head = await fetchRange(id, "0-1048575");
  if (!head) return null;
  const fromHead = readMvhd(head.bytes);
  if (fromHead) return Math.round(fromHead);
  // El índice ("moov") suele ir al final en videos exportados: se leen los últimos 4 MB
  if (head.total > head.bytes.length) {
    const start = Math.max(0, head.total - 4 * 1024 * 1024);
    const tail = await fetchRange(id, `${start}-${head.total - 1}`);
    const fromTail = tail ? readMvhd(tail.bytes) : null;
    if (fromTail) return Math.round(fromTail);
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const auth = req.headers.get("Authorization") || "";
    // Solo usuarios con sesión iniciada pueden disparar avisos
    const caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await caller.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Sin sesión" }), { status: 401, headers: cors });

    const body = await req.json();

    // Duración real de un video de Drive (la línea de tiempo del feedback la necesita)
    if (body?.action === "video-duration") {
      const id = String(body.driveId || "");
      if (!/^[\w-]{10,}$/.test(id)) return new Response(JSON.stringify({ error: "Id inválido" }), { status: 400, headers: cors });
      const seconds = await driveVideoDuration(id);
      return new Response(JSON.stringify({ seconds }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    const { workerId, text } = body;
    if (!workerId || !text || String(text).length > 500) {
      return new Response(JSON.stringify({ error: "Datos inválidos" }), { status: 400, headers: cors });
    }
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: p } = await admin.from("profiles").select("name, contact_email, email_notifications").eq("id", workerId).maybeSingle();
    if (!p?.email_notifications || !p.contact_email) {
      return new Response(JSON.stringify({ skipped: true }), { headers: cors });
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: Deno.env.get("MAIL_FROM") || "SENDA <onboarding@resend.dev>",
        to: [p.contact_email],
        subject: `SENDA · ${String(text).slice(0, 60)}`,
        html: template(p.name || "", String(text), Deno.env.get("APP_URL") || "https://senda.app"),
      }),
    });
    return new Response(JSON.stringify({ sent: res.ok }), { status: res.ok ? 200 : 502, headers: cors });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: cors });
  }
});
