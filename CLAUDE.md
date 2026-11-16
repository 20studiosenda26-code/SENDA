# SENDA · Instrucciones para Claude (se leen solas en cada chat nuevo)

Plataforma de gestión para creadores. React + Vite + TypeScript + Tailwind + Supabase.
Repo: github.com/20studiosenda26-code/SENDA (rama `main` = producción). Todo en ESPAÑOL (mensajes, textos, botones, commits).

## 1. Al empezar cada chat (OBLIGATORIO)
1. Lee `docs/SECCIONES.md` (estado) y `docs/DISENO.md` (estándar visual OBLIGATORIO). El resultado debe verse IGUAL que Inicio y Tareas.
2. Pregunta al usuario: **"¿Qué sección trabajamos?"** mostrando solo las secciones pendientes.
3. Trabaja esa sección para los TRES roles a la vez (Admin, Clipper · Asistente, Cliente) cuando aplique.
4. No crees páginas nuevas si no son necesarias.

## 2. Ahorro de créditos (regla dura)
- PROHIBIDO probar en el navegador (clics, capturas, recorridos, vistas previas con datos falsos). El usuario prueba en la página publicada y cuenta qué ve.
- Verifica solo con código: `npx tsc --noEmit -p tsconfig.app.json` y `npx vite build` (y eslint en los archivos tocados).
- Lee solo la parte del archivo que necesitas (`grep -n` + rango de líneas). Nunca archivos enormes completos sin necesidad.
- Respuestas cortas. Agrupa el trabajo; pocas idas y vueltas.
- Node no está en el PATH: `export PATH="/Users/karencuchillo/.local/node/bin:$HOME/.local/bin:$PATH"` (node, npm, gh).

## 3. Proceso de cada sección
1. Revisar con `grep` la sección en los 3 roles y armar una checklist corta en `docs/SECCIONES.md` (funciones, errores, mejoras).
2. Antes de programar, abre por partes UNA referencia de `docs/DISENO.md` (p. ej. `AdminHomePanels.tsx`) y copia su estructura: esqueleto, GlowCard, StatChip, pestañas, EmptyState.
3. Proponer en 5-8 líneas qué se va a mejorar (diseño + funcionamiento + ideas propias que sumen) y empezar.
4. Rama nueva: `git switch -c actualizacion-<seccion>` desde `main` actualizado.
5. Programar → tsc + build sin errores → marcar checklist en `docs/SECCIONES.md`.
6. Commit + push + Pull Request con `gh` (cuerpo en español, termina con `🤖 Generated with [Claude Code](https://claude.com/claude-code)`). Unir a `main` SOLO cuando el usuario diga "únelo".
7. Resumen final corto: qué cambió, qué corregiste, qué debe probar el usuario en la página publicada.

## 4. Marca y diseño (identidad fija)
- Oscuro (principal): `--surface #131519`, `--surface-2 #1A1D22`, `--surface-3 #22262D`. Acento cian `--accent #35D6E4` / `--accent-strong #22B4C2`. Mint `#6FE7C8` = aprobado. Amber `#FFC857` = pendiente. Rojo de Tailwind = error/riesgo.
- Claro: `--surface #FFFFFF`, `--accent #0EA6B8`. Usar SIEMPRE los tokens (`bg-surface-2`, `text-accent`, `border-line`…), nunca colores sueltos. Todo debe verse bien en oscuro y claro.
- Títulos Space Grotesk (`font-display`), texto Inter, cifras JetBrains Mono (`font-tech`). Tarjetas `rounded-xl` + `border-line`, sin sombras pesadas.
- PENSADO PARA COMPUTADOR: layout bento de 12 columnas, `max-w-[1440px]`, `px-6 xl:px-8`. En celular solo apilar sin romperse.
- Cuidar: hover/disabled/carga, estados vacíos con mensaje útil, feedback de guardado/error, Escape cierra paneles.
- Componentes listos para reutilizar (no reinventar):
  - `src/components/ui/`: `GlowCard` (spotlight-card), `NumberTicker`/`CountTicker`, `AnimatedRadialChart`, `AvatarStack`, `TeamOrbit`, `cn` en `src/lib/utils.ts`.
  - `src/components/home/home-bits.tsx`: AttentionTile, FollowUpRow, VideoList, MoneyCard, Modal, EmptyState, Avatar, Stat, `countdownLabel`, `deadlineMs`, `fmtDate`.
  - `src/components/tasks/WorkerPicker.tsx`: elegir responsable con carga real.
- Recursos nuevos de 21st.dev: PEDIRLOS al usuario por nombre (no inventarlos). Copia adaptada + catálogo en `~/Downloads/senda app/LEEME.md`.

## 5. Reglas de negocio (no romper)
- Roles: `admin`, `clipper` (= "Clipper · Asistente de edición", rol ÚNICO; `editor` es heredado y se trata igual), `cliente`. No existe rol editor separado: no agregar nada de "Editor".
- Flujo de cada video (`src/lib/videoFlow.ts`): Imagen principal (admin aprueba) → Clips (admin acepta) → Video final por enlace de Drive (admin aprueba = **Aprobado Senda**: se publica al cliente) → Cliente aprueba (**Aprobado Cliente**) o deja feedback (1 ronda, admin puede dar extra).
- Pago (`src/lib/economics.ts`, única fuente): **$5 por video** a la persona responsable = 50% ($2,50) al Aprobado Senda + 50% al Aprobado Cliente. Nóminas paga por tramos. Dinero con `fmtMoney` (centavos cuando hacen falta). No hay "puntos".
- Datos: estado compartido en Supabase `platform_kv` (brands, orders…) vía `src/store.tsx`. El cliente solo ve su copia limpia (`src/lib/clientSync.ts`); sus acciones se procesan cuando un admin tiene SENDA abierta.
- Nunca datos inventados ni nombres de ejemplo en la app. Nunca subir `.env*` (ya está en `.gitignore`).
- Navegar a una pestaña concreta de otra vista: `setNavIntent(vista, destino)` en `src/lib/navIntent.ts`.

## 6. Mapa rápido de archivos
- Navegación por rol: `src/components/Rail.tsx` · router: `src/App.tsx` · encabezado/campana: `src/components/TopBar.tsx`
- Store y acciones: `src/store.tsx` · tipos: `src/types.ts`
- Vistas: `src/views/*.tsx` (ver tabla de `docs/SECCIONES.md`)
