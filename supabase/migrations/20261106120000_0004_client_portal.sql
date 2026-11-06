/*
# Portal de clientes (rol "cliente") — aislamiento de datos

Un usuario con rol `cliente` NO puede leer los datos internos de la plataforma
(pedidos de otras marcas, precios, pagos, nómina, datos bancarios, equipo).

1. Funciones auxiliares `current_user_role()` e `is_client()`.
2. `platform_kv`:
   - Equipo y admin: igual que antes (leen/escriben todo).
   - Cliente: solo lee `clientCatalog`, `gdrive_config` y sus propias claves
     `client_view_<id>`, `client_inbox_<id>`, `client_ack_<id>`;
     solo escribe `client_inbox_<id>` (sus acciones: brief, feedback, aprobación).
3. `notifications_log`: el cliente solo ve las notificaciones dirigidas a él.
5. `profiles`: un trigger impide que un usuario se cambie su propio rol.
4. `contracts`: los usuarios que antes eran "editor" ven también los contratos
   del rol único Clipper · Asistente de edición.
*/

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.is_client()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT role = 'cliente' FROM public.profiles WHERE id = auth.uid()), false)
$$;

-- ------------------------------------------------------------
-- platform_kv
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "platform_kv_select" ON public.platform_kv;
CREATE POLICY "platform_kv_select"
ON public.platform_kv FOR SELECT
TO authenticated
USING (
  NOT public.is_client()
  OR key IN ('clientCatalog', 'gdrive_config')
  OR key = 'client_view_' || auth.uid()::text
  OR key = 'client_inbox_' || auth.uid()::text
  OR key = 'client_ack_' || auth.uid()::text
);

DROP POLICY IF EXISTS "platform_kv_upsert" ON public.platform_kv;
CREATE POLICY "platform_kv_upsert"
ON public.platform_kv FOR INSERT
TO authenticated
WITH CHECK (
  NOT public.is_client()
  OR key = 'client_inbox_' || auth.uid()::text
);

DROP POLICY IF EXISTS "platform_kv_update" ON public.platform_kv;
CREATE POLICY "platform_kv_update"
ON public.platform_kv FOR UPDATE
TO authenticated
USING (
  NOT public.is_client()
  OR key = 'client_inbox_' || auth.uid()::text
)
WITH CHECK (
  NOT public.is_client()
  OR key = 'client_inbox_' || auth.uid()::text
);

-- ------------------------------------------------------------
-- notifications_log
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "notif_log_select" ON public.notifications_log;
CREATE POLICY "notif_log_select" ON public.notifications_log FOR SELECT TO authenticated
USING (
  public.is_admin()
  OR worker_id = auth.uid()
  OR (worker_id IS NULL AND NOT public.is_client())
);

-- ------------------------------------------------------------
-- contracts: rol único de equipo
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "contracts_select" ON public.contracts;
CREATE POLICY "contracts_select" ON public.contracts FOR SELECT TO authenticated
USING (
  public.is_admin()
  OR worker_id = auth.uid()
  OR (
    worker_id IS NULL
    AND public.current_user_role() IN ('clipper', 'editor')
    AND role IN ('clipper', 'editor')
  )
);

-- ------------------------------------------------------------
-- profiles: nadie puede cambiarse su propio rol (solo un admin
-- o la función create-user con service role)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_profile_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role
     AND auth.uid() IS NOT NULL
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede cambiar roles';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profile_role ON public.profiles;
CREATE TRIGGER protect_profile_role
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_profile_role();
