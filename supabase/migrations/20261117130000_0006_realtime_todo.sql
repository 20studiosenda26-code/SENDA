-- Tiempo real en todas las tablas que comparten datos entre roles
-- (pedidos/tareas en platform_kv, perfiles, chat, contratos y avisos).
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['platform_kv','profiles','contracts','contract_signed_uploads','chat_groups','chat_group_members','chat_messages','notifications_log']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = t)
       AND NOT EXISTS (
         SELECT 1 FROM pg_publication_tables
         WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
       ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

-- Para que los avisos de borrado también lleguen con su clave
ALTER TABLE public.platform_kv REPLICA IDENTITY FULL;

-- Comprobar: debe listar las 8 tablas
SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime' ORDER BY tablename;
