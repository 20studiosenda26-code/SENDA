# Secciones de SENDA · estado y pendientes

Leyenda: ✅ terminada · ⏳ pendiente · 🔶 parcial. Actualizar este archivo al cerrar cada sección (marcar ✅ + PR).

| # | Sección | Roles | Archivos principales | Estado |
|---|---|---|---|---|
| 1 | Inicio | Admin · Clipper · Cliente | `HomeView.tsx`, `AdminHomePanels.tsx`, `ClientArea.tsx` (ClientHome) | ✅ PR #3 #4 |
| 2 | Tareas + detalle de video | Admin · Clipper | `AdminTasksPanels.tsx`, `TasksView.tsx` | ✅ PR #5 #6 |
| 3 | Clientes / Pedidos + portal del cliente | Admin (Clientes) · Cliente (Mis proyectos, Revisión de videos) | `ClientsView.tsx`, `ClientArea.tsx` (ClientBriefs), `ClientPortal.tsx`, `lib/clientSync.ts` | ✅ rama actualizacion-clientes-pedidos |
| 4 | Chat + notificaciones | Admin · Clipper · Cliente | `ChatView.tsx`, `TopBar.tsx` (campana) | ⏳ |
| 5 | Calendario (reuniones y capacitaciones) | Admin · Clipper | `CalendarView.tsx` | ⏳ |
| 6 | Classroom (capacitaciones) | Admin · Clipper | `ClassroomView.tsx` | ⏳ |
| 7 | Contratos | Admin · Clipper | `ContractsView.tsx` | ⏳ |
| 8 | Perfil | Clipper | `ProfileView.tsx` | ✅ diseño + ganancias |
| 9 | Finanzas | Admin | `FinancesView.tsx` | ✅ diseño + arreglos (fechas locales, fecha real de aprobación, pagos por persona, centavos, PDF seguro, por cobrar) |
| 10 | Nóminas | Admin | `PayrollView.tsx`, `lib/payrollPdf.ts` | ✅ diseño, deshacer pago, aviso sin datos bancarios, ciclo en hora local |
| 11 | Capacidad / calculadora | Admin | `CapacityView.tsx`, `lib/capacity.ts` | ✅ conectado (cotizador → nuevo pedido, reasignar 1 vez, hora local, rol único) |
| 12 | Admin: usuarios, equipo y ajustes | Admin | `UserManagement.tsx`, `AdminView.tsx`, `SettingsPanel.tsx`, `ClientCatalogEditor.tsx` | ✅ diseño unificado |
| 13 | Acceso y estructura: login, menú lateral, encabezado, correos reales | Todos | `LoginView.tsx`, `Rail.tsx`, `TopBar.tsx`, `App.tsx`, `supabase/functions` | ✅ correos reales listos (falta configurar Resend, ver abajo); Contratos visible para admin |
| 14 | Pulido final: celular, rendimiento, limpieza | Todos | todo | 🔶 limpieza hecha; falta revisar en celular |

## Checklist · Sección 3 (Clientes / Pedidos) — rama `actualizacion-clientes-pedidos`
- [x] Nuevo pedido: vincular la cuenta del cliente al crearlo (hoy no se vincula y el cliente no ve su pedido).
- [x] Nuevo pedido: factura opcional → si falta queda "Pago pendiente" (antes bloqueaba); fecha por defecto +3 días; quedarse con aviso y botón "Asignar en Tareas".
- [x] Folio de factura estable y consecutivo (antes aleatorio y cambiaba en cada impresión).
- [x] Factura PDF: sin datos internos (complejidad/prioridad), estado de pago real, textos escapados.
- [x] Expedientes: resumen arriba (clientes, pedidos activos, por cobrar, facturado), avance de videos por pedido, cuenta del cliente y carpeta Drive editables, "Marcar pagado", más recientes primero.
- [x] Limpiar restos de "clipper/editor" en la previsualización de capacidad.
- [x] Portal (admin y cliente): pedido sin videos aún muestra los N videos "en producción"; no se aprueba mientras se corrige el feedback.
- [x] Cliente: facturas abren en pestaña nueva; ancho de computador (1440px).
- [ ] Pendiente para otra etapa: procesar acciones del cliente en el servidor sin admin conectado (requiere Supabase).

## Activar correos reales (una vez)
1. Crear cuenta en resend.com, verificar el dominio y crear una API key.
2. Terminal: `supabase secrets set RESEND_API_KEY=... MAIL_FROM="SENDA <notificaciones@tudominio.com>" APP_URL=https://tu-senda.com` y `supabase functions deploy send-email`.
3. Cada persona activa "Recibir notificaciones al correo" en su Perfil.

## Pendientes ya detectados (asignar a su sección)
- **3 · Clientes:** lo que hace el cliente (brief, feedback, aprobar) solo se procesa cuando un admin tiene SENDA abierta → evaluar procesarlo en el servidor (Supabase) o avisar mejor.
- **4 · Chat:** las notificaciones del Clipper se borran de la campana cada 24 h (quedan en el historial del chat); revisar si se quiere así.
- **7 · Contratos:** el admin no tiene "Contratos" en su menú lateral (`Rail.tsx`), aunque la vista tiene parte de admin.
- **9/10/11:** quitar lo que queda de "clipping vs edición" en Capacidad (rol único).
- **12 · Admin:** dos cuentas llamadas "admin prueba" tienen rol Clipper (revisar en Gestión de usuarios). Borrar cuentas de prueba (`admin2@`, `editor@`, `cliente@prueba.com`) y el pedido "PRUEBA SENDA".
- **13 · Correos:** las notificaciones por correo no se envían (solo se registran). Deben enviarse de verdad, diseño profesional y breve.
- **Recursos 21st.dev pedidos y faltantes:** Animated tabs (`discrete-tab.tsx`) y Animated diálogo (`warp-dialog.tsx` + `button.tsx`).
- **Supabase:** aviso de facturas pendientes en el panel (si no se paga, pueden pausar el proyecto).

## Hecho (resumen)
- Regla $5/video (50% Senda + 50% Cliente) en toda la plataforma; puntos → ganancias.
- Inicio bento para los 3 roles; Tareas con tablero por etapa, asignar/reasignar; detalle de video con pasos y correcciones de flujo.
- Biblioteca de diseño: `~/Downloads/senda app/` (LEEME.md + componentes + checklists).
