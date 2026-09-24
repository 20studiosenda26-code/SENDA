/*
# Contratos, Chat (grupos + privados) y Tiempo Real

## Qué hace esta migración

1. Extiende `profiles` con los campos que antes solo vivían en localStorage
   (teléfono, correo de contacto, banco, país, día de descanso, cargo,
   preferencia de notificaciones por correo, historial de racha) para que
   cada usuario real registrado tenga esta información guardada en la
   base de datos y visible desde cualquier dispositivo.

2. Crea el módulo de **Contratos**:
   - `contracts`: documentos subidos por el Admin (plantilla general para
     todo un rol, o dirigido a una persona puntual), con título libre y
     archivo en cualquier formato.
   - `contract_signed_uploads`: el contrato ya firmado que cada Clipper o
     Editor sube como respuesta a un contrato. Un registro por persona y
     por contrato (si vuelve a subir, se reemplaza).

3. Crea el módulo de **Chat** estilo WhatsApp:
   - `chat_groups`: cada conversación (un chat privado 1 a 1 con el Admin,
     o un grupo con varias personas). `is_dm` marca si es un privado.
   - `chat_group_members`: quién pertenece a cada conversación.
   - `chat_messages`: los mensajes de cada conversación.
   Las políticas obligan a que Clipper/Editor SOLO puedan mandar mensajes
   dentro de conversaciones de las que ya son miembros (nunca crean chats
   nuevos ni le escriben a otro Clipper/Editor directamente); solo el
   Admin puede crear conversaciones y agregar miembros.

4. Crea `notifications_log`: un archivo permanente de notificaciones para
   la pestaña "Notificaciones" de la bandeja de mensajes, que nunca se
   borra (a diferencia de la campanita, que sigue reiniciándose sola cada
   24 horas del lado del cliente).

5. Agrega todas las tablas nuevas (y las existentes `platform_kv` y
   `profiles`) a la publicación `supabase_realtime`, para que cualquier
   cambio (subir un video, mandar un mensaje, aprobar un clip, etc.) se
   vea al instante en todas las sesiones conectadas, sin recargar la
   página.
*/

-- ============================================================
-- 1. Extender profiles
-- ============================================================
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS cargo text NOT NULL DEFAULT '';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone text NOT NULL DEFAULT '';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS contact_email text NOT NULL DEFAULT '';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bank_info text NOT NULL DEFAULT '';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS country text NOT NULL DEFAULT '';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS rest_day text NOT NULL DEFAULT '';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email_notifications boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS streak_log jsonb NOT NULL DEFAULT '[]'::jsonb;

-- ============================================================
-- 2. Contratos
-- ============================================================
CREATE TABLE IF NOT EXISTS public.contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  role text NOT NULL CHECK (role IN ('clipper', 'editor')),
  worker_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_url text NOT NULL,
  uploaded_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contracts_select" ON public.contracts;
CREATE POLICY "contracts_select" ON public.contracts FOR SELECT TO authenticated
USING (
  public.is_admin()
  OR worker_id = auth.uid()
  OR (worker_id IS NULL AND role = (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()))
);

DROP POLICY IF EXISTS "contracts_insert_admin" ON public.contracts;
CREATE POLICY "contracts_insert_admin" ON public.contracts FOR INSERT TO authenticated
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "contracts_update_admin" ON public.contracts;
CREATE POLICY "contracts_update_admin" ON public.contracts FOR UPDATE TO authenticated
USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "contracts_delete_admin" ON public.contracts;
CREATE POLICY "contracts_delete_admin" ON public.contracts FOR DELETE TO authenticated
USING (public.is_admin());

CREATE TABLE IF NOT EXISTS public.contract_signed_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_url text NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contract_id, worker_id)
);

ALTER TABLE public.contract_signed_uploads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "signed_select" ON public.contract_signed_uploads;
CREATE POLICY "signed_select" ON public.contract_signed_uploads FOR SELECT TO authenticated
USING (public.is_admin() OR worker_id = auth.uid());

DROP POLICY IF EXISTS "signed_insert_own" ON public.contract_signed_uploads;
CREATE POLICY "signed_insert_own" ON public.contract_signed_uploads FOR INSERT TO authenticated
WITH CHECK (worker_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "signed_update_own" ON public.contract_signed_uploads;
CREATE POLICY "signed_update_own" ON public.contract_signed_uploads FOR UPDATE TO authenticated
USING (worker_id = auth.uid() OR public.is_admin()) WITH CHECK (worker_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "signed_delete_admin" ON public.contract_signed_uploads;
CREATE POLICY "signed_delete_admin" ON public.contract_signed_uploads FOR DELETE TO authenticated
USING (public.is_admin() OR worker_id = auth.uid());

-- ============================================================
-- 3. Chat: grupos, miembros y mensajes
-- ============================================================
CREATE TABLE IF NOT EXISTS public.chat_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  is_dm boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.chat_groups ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.chat_group_members (
  group_id uuid NOT NULL REFERENCES public.chat_groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);

ALTER TABLE public.chat_group_members ENABLE ROW LEVEL SECURITY;

-- Helper: ¿el usuario actual pertenece a este grupo?
CREATE OR REPLACE FUNCTION public.is_group_member(gid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_group_members
    WHERE group_id = gid AND user_id = auth.uid()
  );
$$;

DROP POLICY IF EXISTS "groups_select" ON public.chat_groups;
CREATE POLICY "groups_select" ON public.chat_groups FOR SELECT TO authenticated
USING (public.is_admin() OR public.is_group_member(id));

DROP POLICY IF EXISTS "groups_insert_admin" ON public.chat_groups;
CREATE POLICY "groups_insert_admin" ON public.chat_groups FOR INSERT TO authenticated
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "groups_update_admin" ON public.chat_groups;
CREATE POLICY "groups_update_admin" ON public.chat_groups FOR UPDATE TO authenticated
USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "groups_delete_admin" ON public.chat_groups;
CREATE POLICY "groups_delete_admin" ON public.chat_groups FOR DELETE TO authenticated
USING (public.is_admin());

DROP POLICY IF EXISTS "members_select" ON public.chat_group_members;
CREATE POLICY "members_select" ON public.chat_group_members FOR SELECT TO authenticated
USING (public.is_admin() OR user_id = auth.uid() OR public.is_group_member(group_id));

DROP POLICY IF EXISTS "members_insert_admin" ON public.chat_group_members;
CREATE POLICY "members_insert_admin" ON public.chat_group_members FOR INSERT TO authenticated
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "members_delete_admin" ON public.chat_group_members;
CREATE POLICY "members_delete_admin" ON public.chat_group_members FOR DELETE TO authenticated
USING (public.is_admin());

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.chat_groups(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.profiles(id),
  text text NOT NULL DEFAULT '',
  file_name text,
  file_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "messages_select" ON public.chat_messages;
CREATE POLICY "messages_select" ON public.chat_messages FOR SELECT TO authenticated
USING (public.is_admin() OR public.is_group_member(group_id));

-- Solo se puede escribir en una conversación de la que ya se es miembro:
-- esto es lo que impide que Clipper/Editor se manden mensajes privados
-- entre ellos (nunca son agregados juntos a un grupo sin el Admin).
DROP POLICY IF EXISTS "messages_insert_member" ON public.chat_messages;
CREATE POLICY "messages_insert_member" ON public.chat_messages FOR INSERT TO authenticated
WITH CHECK (sender_id = auth.uid() AND (public.is_admin() OR public.is_group_member(group_id)));

DROP POLICY IF EXISTS "messages_delete_admin" ON public.chat_messages;
CREATE POLICY "messages_delete_admin" ON public.chat_messages FOR DELETE TO authenticated
USING (public.is_admin());

-- ============================================================
-- 4. Notificaciones permanentes (para la pestaña "Notificaciones" del chat)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.notifications_log (
  id text PRIMARY KEY,
  role text NOT NULL,
  worker_id uuid,
  category text NOT NULL,
  text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notif_log_select" ON public.notifications_log;
CREATE POLICY "notif_log_select" ON public.notifications_log FOR SELECT TO authenticated
USING (public.is_admin() OR worker_id = auth.uid() OR worker_id IS NULL);

DROP POLICY IF EXISTS "notif_log_insert" ON public.notifications_log;
CREATE POLICY "notif_log_insert" ON public.notifications_log FOR INSERT TO authenticated
WITH CHECK (true);

-- Nunca se borra desde la app (ni update ni delete expuestos a clientes).

-- ============================================================
-- 5. Tiempo real: publicar todas las tablas compartidas
-- ============================================================
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['platform_kv','profiles','contracts','contract_signed_uploads','chat_groups','chat_group_members','chat_messages','notifications_log']
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
