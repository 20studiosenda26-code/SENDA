-- SENDA: persistencia compartida para Clippers/Admin
-- Ejecutar este archivo completo en el SQL Editor de Supabase (una sola vez).

-- 1) Tabla clave/valor para reemplazar localStorage en los datos que deben
--    verse iguales desde cualquier dispositivo/navegador (tareas, clips,
--    imágenes, notas, estados, notificaciones).
create table if not exists public.platform_kv (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.platform_kv enable row level security;

-- La plataforma todavía no tiene login real por usuario (el rol se elige en
-- la propia interfaz), así que por ahora se permite lectura/escritura con la
-- llave anónima, igual que el comportamiento actual con localStorage. Si más
-- adelante se agrega autenticación real, estas políticas deben restringirse
-- por usuario/rol.
drop policy if exists "platform_kv_select" on public.platform_kv;
create policy "platform_kv_select" on public.platform_kv for select using (true);

drop policy if exists "platform_kv_upsert" on public.platform_kv;
create policy "platform_kv_upsert" on public.platform_kv for insert with check (true);

drop policy if exists "platform_kv_update" on public.platform_kv;
create policy "platform_kv_update" on public.platform_kv for update using (true) with check (true);

-- 2) Bucket público para los archivos (clips, imágenes principales, briefs,
--    videos finales), en vez de guardarlos como base64 dentro del navegador.
insert into storage.buckets (id, name, public)
values ('senda-media', 'senda-media', true)
on conflict (id) do nothing;

drop policy if exists "senda_media_public_read" on storage.objects;
create policy "senda_media_public_read" on storage.objects
  for select using (bucket_id = 'senda-media');

drop policy if exists "senda_media_public_upload" on storage.objects;
create policy "senda_media_public_upload" on storage.objects
  for insert with check (bucket_id = 'senda-media');

drop policy if exists "senda_media_public_update" on storage.objects;
create policy "senda_media_public_update" on storage.objects
  for update using (bucket_id = 'senda-media');
