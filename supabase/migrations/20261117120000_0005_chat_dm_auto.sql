-- Conversación privada con el admin, creada automáticamente para cada cliente y persona del equipo.
-- Las políticas solo dejan crear chats al admin; esta función (SECURITY DEFINER) la crea para
-- quien la llame, sin depender de que un admin tenga SENDA abierta.

CREATE OR REPLACE FUNCTION public.ensure_admin_dm_for(target uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  gid uuid;
  uname text;
  urole text;
BEGIN
  SELECT coalesce(nullif(name, ''), 'Usuario'), role INTO uname, urole FROM profiles WHERE id = target;
  IF urole IS NULL OR urole = 'admin' THEN RETURN NULL; END IF;

  SELECT g.id INTO gid
  FROM chat_groups g JOIN chat_group_members m ON m.group_id = g.id
  WHERE g.is_dm AND m.user_id = target
  LIMIT 1;

  IF gid IS NULL THEN
    INSERT INTO chat_groups (name, is_dm, created_by) VALUES ('Admin · ' || uname, true, target) RETURNING id INTO gid;
    INSERT INTO chat_group_members (group_id, user_id) VALUES (gid, target) ON CONFLICT DO NOTHING;
  END IF;

  -- Todos los admins en la conversación (también los que se agreguen después)
  INSERT INTO chat_group_members (group_id, user_id)
  SELECT gid, id FROM profiles WHERE role = 'admin'
  ON CONFLICT DO NOTHING;

  RETURN gid;
END;
$$;

-- Lo llama cada usuario al entrar: solo puede crear la suya
CREATE OR REPLACE FUNCTION public.ensure_my_admin_dm()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$ SELECT public.ensure_admin_dm_for(auth.uid()); $$;

REVOKE ALL ON FUNCTION public.ensure_admin_dm_for(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_my_admin_dm() TO authenticated;

-- Crear de una vez las que faltan para clientes y equipo existentes
SELECT public.ensure_admin_dm_for(id) FROM public.profiles WHERE role IN ('cliente', 'clipper', 'editor');
