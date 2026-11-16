# Guía de diseño SENDA (OBLIGATORIA en cada sección)

El estándar visual son las pantallas YA terminadas. Toda sección nueva debe verse y sentirse IGUAL.
Antes de programar, abre por partes UNA referencia y copia su estructura y clases:

| Referencia (copiar de aquí) | Qué tomar |
|---|---|
| `src/views/AdminHomePanels.tsx` | Encabezado con "En vivo", acciones arriba a la derecha, bento 12 col, GlowCard por sección, tiles de atención, modales |
| `src/views/AdminTasksPanels.tsx` | Contadores (StatChip), pestañas con contador, buscador, vista lista+detalle (5/7 col), kanban |
| `src/views/HomeView.tsx` (WorkerHome) | Columna principal 8 + lateral 4, tarjetas de dinero con NumberTicker, medidor radial |
| `src/views/TasksView.tsx` (VideoDetail) | Encabezado con volver, barra de pasos, tarjetas numeradas por paso |

## 1. Esqueleto de toda pantalla (copiar tal cual)
```tsx
<div className="px-6 xl:px-8 py-6 max-w-[1440px] mx-auto space-y-5 animate-fadeIn">
  {/* Encabezado */}
  <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-4">
    <div>
      <p className="text-[11px] font-tech uppercase tracking-[0.18em] text-accent flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-mint animate-pulse" /> En vivo
      </p>
      <h2 className="font-display text-3xl xl:text-4xl font-bold mt-1">Título</h2>
      <p className="text-muted text-sm mt-1">Una línea que diga para qué sirve.</p>
    </div>
    {/* derecha: contadores (StatChip) y/o botones; primario = bg-accent text-on-accent + glow */}
  </div>
  {/* Pestañas (si hay) + buscador */}
  {/* Contenido: bento */}
  <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
    <div className="lg:col-span-8 space-y-5">{/* GlowCard … */}</div>
    <div className="lg:col-span-4 space-y-5">{/* GlowCard … */}</div>
  </div>
</div>
```

## 2. Cada bloque = GlowCard con título con ícono
```tsx
<GlowCard tone="accent" contentClassName="p-5">
  <div className="flex items-center justify-between gap-3 mb-4">
    <h3 className="font-display text-lg font-semibold flex items-center gap-2">
      <Icono size={18} className="text-accent shrink-0" /> Título
      <span className="text-xs font-normal text-muted-2">dato corto</span>
    </h3>
    <button className="text-sm text-accent hover:text-accent-strong flex items-center gap-1">Ver todo <ChevronRight size={14} /></button>
  </div>
  …
</GlowCard>
```
- `tone`: accent (general), mint (dinero/aprobado), amber (fechas/pendiente), violet (cliente/calendario/clases), red (riesgo).
- Elementos dentro de la tarjeta: `bg-surface-3 border border-line rounded-lg p-3 hover:border-accent/40 transition-colors`.

## 3. Piezas que SIEMPRE se reutilizan (no crear otras)
- `GlowCard` (`components/ui/spotlight-card`), `NumberTicker` para dinero y `CountTicker` para cantidades (`components/ui/number-ticker`), `AnimatedRadialChart` para porcentajes, `AvatarStack` / `TeamOrbit` para personas.
- `components/home/home-bits`: `AttentionTile` ("lo que toca hacer"), `FollowUpRow`, `VideoList`, `MoneyCard`, `Modal` (Escape cierra), `EmptyState`, `Avatar`, `Stat`, `countdownLabel`, `deadlineMs`, `fmtDate`.
- `StatChip` y el patrón de pestañas de `AdminTasksPanels.tsx` (pestaña activa = `bg-accent text-on-accent` + contador `font-tech`).
- Íconos: solo `lucide-react`, tamaño 14-18.

## 4. Reglas visuales
- Solo tokens de marca (`bg-surface-2`, `text-muted`, `border-line`, `text-accent`, `bg-mint-dim`…). Nada de colores sueltos ni grises de Tailwind.
- Tipografía: títulos `font-display`, cifras `font-tech`, textos chicos `text-[11px] text-muted-2`.
- Cada sección arranca con "lo que hay que hacer ahora" (acciones pendientes) y después la información.
- Estados vacíos con `EmptyState` (ícono + título + texto útil + acción). Nunca una caja vacía.
- Botones: hover visible, `disabled:opacity-50`, carga con `Loader2 animate-spin`, éxito con aviso mint y error con aviso rojo.
- Fechas con cuenta regresiva (`countdownLabel`): ámbar = próxima, rojo = vencida. El cliente nunca ve "Vencido".
- Animaciones sutiles: `animate-fadeIn`, `hover:-translate-y-0.5`, punto `animate-pulse` para lo que espera acción.
- Debe verse bien en oscuro y en claro.

## 5. Antes de dar la sección por terminada
- [ ] Usa el esqueleto, GlowCard y los componentes de arriba (se ve igual que Inicio y Tareas)
- [ ] Funciona en los roles que aplica, con datos reales (sin datos inventados)
- [ ] Estados vacío, carga y error cuidados
- [ ] tsc + build sin errores
