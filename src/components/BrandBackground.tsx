// Fondo de marca "v3" aprobado: fragmentos de rama tipo circuito
// (inspirados/diseccionados del logo de Senda) regados con muy baja
// opacidad en los bordes/esquinas, más un resplandor de color sutil.
// No es la imagen del logo puesta de fondo; son trazos dibujados con el
// mismo lenguaje visual: líneas blancas gruesas de esquinas redondeadas,
// conectores finos cian, y 3 tipos de nodo (punto cian sólido, punto
// blanco sólido, anillo hueco).
export function BrandBackground() {
  return (
    <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden" aria-hidden="true">
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 12% 8%, rgba(49,216,232,0.05), transparent 40%),' +
            'radial-gradient(circle at 92% 12%, rgba(111,231,200,0.04), transparent 40%),' +
            'radial-gradient(circle at 90% 92%, rgba(201,168,255,0.04), transparent 42%),' +
            'radial-gradient(circle at 6% 94%, rgba(49,216,232,0.04), transparent 42%)',
        }}
      />

      <svg className="absolute overflow-visible" style={{ top: -60, left: -70, width: 420, opacity: 0.16 }} viewBox="0 0 420 420" fill="none">
        <path stroke="#E7ECEF" strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" d="M -10 10 L 60 10 L 60 70 L 120 130 L 120 210" />
        <path stroke="#E7ECEF" strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" d="M 120 130 L 190 130 L 190 90" />
        <path stroke="var(--accent)" strokeWidth={2} strokeLinecap="round" d="M 60 70 L 20 110" />
        <path stroke="var(--accent)" strokeWidth={2} strokeLinecap="round" d="M 120 210 L 180 260" />
        <path stroke="var(--accent)" strokeWidth={2} strokeLinecap="round" d="M 190 90 L 250 60" />
        <circle cx={60} cy={10} r={9} fill="#E7ECEF" />
        <circle cx={20} cy={110} r={7} fill="none" stroke="var(--accent)" strokeWidth={2.5} />
        <circle cx={180} cy={260} r={6} fill="var(--accent)" />
        <circle cx={190} cy={90} r={7} fill="#E7ECEF" />
        <circle cx={250} cy={60} r={6} fill="none" stroke="#E7ECEF" strokeWidth={2} />
        <circle cx={120} cy={130} r={5.5} fill="var(--accent)" />
      </svg>

      <svg className="absolute overflow-visible" style={{ top: 140, right: -90, width: 380, opacity: 0.13, transform: 'scaleX(-1)' }} viewBox="0 0 380 380" fill="none">
        <path stroke="#E7ECEF" strokeWidth={6.5} strokeLinecap="round" strokeLinejoin="round" d="M -10 30 L 70 30 L 70 100 L 140 170 L 140 240" />
        <path stroke="var(--accent)" strokeWidth={2} strokeLinecap="round" d="M 70 100 L 30 150" />
        <path stroke="var(--accent)" strokeWidth={2} strokeLinecap="round" d="M 140 170 L 210 150" />
        <circle cx={70} cy={30} r={8} fill="#E7ECEF" />
        <circle cx={30} cy={150} r={6} fill="none" stroke="var(--accent)" strokeWidth={2.5} />
        <circle cx={210} cy={150} r={5.5} fill="var(--accent)" />
        <circle cx={140} cy={240} r={6.5} fill="none" stroke="#E7ECEF" strokeWidth={2} />
      </svg>

      <svg className="absolute overflow-visible" style={{ bottom: -50, left: '6%', width: 360, opacity: 0.12 }} viewBox="0 0 360 360" fill="none">
        <path stroke="#E7ECEF" strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" d="M 30 380 L 30 300 L 90 240 L 90 170" />
        <path stroke="var(--accent)" strokeWidth={2} strokeLinecap="round" d="M 90 240 L 150 220" />
        <path stroke="var(--accent)" strokeWidth={2} strokeLinecap="round" d="M 30 300 L -20 270" />
        <circle cx={90} cy={170} r={6.5} fill="var(--accent)" />
        <circle cx={150} cy={220} r={6} fill="none" stroke="var(--accent)" strokeWidth={2.5} />
        <circle cx={-20} cy={270} r={6} fill="#E7ECEF" />
      </svg>

      <svg className="absolute overflow-visible" style={{ bottom: -80, right: -60, width: 460, opacity: 0.15, transform: 'scaleX(-1)' }} viewBox="0 0 460 460" fill="none">
        <path stroke="#E7ECEF" strokeWidth={7.5} strokeLinecap="round" strokeLinejoin="round" d="M 40 460 L 40 360 L 110 290 L 110 210 L 170 150" />
        <path stroke="var(--accent)" strokeWidth={2} strokeLinecap="round" d="M 110 290 L 180 270" />
        <path stroke="var(--accent)" strokeWidth={2} strokeLinecap="round" d="M 40 360 L -20 320" />
        <path stroke="var(--accent)" strokeWidth={2} strokeLinecap="round" d="M 170 150 L 230 120" />
        <circle cx={110} cy={210} r={7} fill="#E7ECEF" />
        <circle cx={180} cy={270} r={6.5} fill="none" stroke="var(--accent)" strokeWidth={2.5} />
        <circle cx={-20} cy={320} r={6} fill="var(--accent)" />
        <circle cx={230} cy={120} r={6} fill="var(--accent)" />
        <circle cx={170} cy={150} r={7} fill="none" stroke="#E7ECEF" strokeWidth={2} />
      </svg>

      <svg className="absolute overflow-visible" style={{ top: '38%', left: -40, width: 220, opacity: 0.1 }} viewBox="0 0 220 220" fill="none">
        <path stroke="#E7ECEF" strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" d="M -10 110 L 60 110 L 100 150" />
        <circle cx={100} cy={150} r={5.5} fill="var(--accent)" />
        <circle cx={60} cy={110} r={5.5} fill="none" stroke="#E7ECEF" strokeWidth={2} />
      </svg>

      <svg className="absolute overflow-visible" style={{ top: '55%', right: -30, width: 200, opacity: 0.1, transform: 'scaleX(-1)' }} viewBox="0 0 200 200" fill="none">
        <path stroke="#E7ECEF" strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" d="M -10 90 L 50 90 L 90 130" />
        <circle cx={90} cy={130} r={5} fill="var(--accent)" />
        <circle cx={50} cy={90} r={5.5} fill="none" stroke="var(--accent)" strokeWidth={2} />
      </svg>
    </div>
  );
}

// Pequeño detalle de "nodo" de marca para la esquina de las tarjetas,
// del mismo lenguaje visual (punto sólido + anillo hueco conectados por
// una rama fina). `color` controla el color de los nodos para que
// combine con el acento de cada tarjeta.
export function CardNodeDeco({ color = 'var(--accent)' }: { color?: string }) {
  return (
    <svg
      className="absolute top-2.5 right-3 pointer-events-none"
      style={{ width: 46, height: 30, opacity: 0.9 }}
      viewBox="0 0 46 30"
      fill="none"
      aria-hidden="true"
    >
      <path d="M2 22 L18 22 L28 8" stroke="#3A3F47" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={18} cy={22} r={3} fill={color} />
      <circle cx={28} cy={8} r={3} fill="none" stroke={color} strokeWidth={1.6} />
    </svg>
  );
}
