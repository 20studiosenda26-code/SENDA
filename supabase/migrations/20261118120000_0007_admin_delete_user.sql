-- Permite al administrador borrar usuarios (cuenta de acceso + perfil + sus chats).
-- Se ejecuta como SECURITY DEFINER porque borrar de auth.users no se puede desde el navegador.

CREATE OR REPLACE FUNCTION public.admin_delete_user(target uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo los administradores pueden borrar usuarios';
  END IF;
  IF target = auth.uid() THEN
    RAISE EXCEPTION 'No puedes borrar tu propia cuenta';
  END IF;

  -- Referencias que no se borran solas
  DELETE FROM public.chat_messages WHERE sender_id = target;
  UPDATE public.contracts SET uploaded_by = NULL WHERE uploaded_by = target;
  UPDATE public.chat_groups SET created_by = NULL WHERE created_by = target;

  -- Conversación privada del usuario con el admin (si era el dueño)
  DELETE FROM public.chat_groups g
  WHERE g.is_dm AND EXISTS (SELECT 1 FROM public.chat_group_members m WHERE m.group_id = g.id AND m.user_id = target)
    AND (SELECT count(*) FROM public.chat_group_members m2 JOIN public.profiles p ON p.id = m2.user_id WHERE m2.group_id = g.id AND p.role <> 'admin' AND m2.user_id <> target) = 0;

  DELETE FROM auth.users WHERE id = target; -- el perfil y las membresías se borran en cascada
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(uuid) TO authenticated;
