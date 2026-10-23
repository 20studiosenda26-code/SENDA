# SENDA

[![Open in Bolt](https://bolt.new/static/open-in-bolt.svg)](https://bolt.new/~/sb1-hx9uwx93)

## Persistencia real (Clippers / Admin)

Las tareas, clips, imágenes principales, notas y notificaciones ahora se
guardan en Supabase (base de datos + storage), no solo en el navegador. Para
activarlo:

1. Crear un proyecto en [supabase.com](https://supabase.com) (gratis).
2. En el SQL Editor del proyecto, ejecutar en orden el contenido completo de:
   - `supabase/migrations/0001_platform_persistence.sql`
   - `supabase/migrations/20260923060715_0002_auth_and_profiles.sql`
   - `supabase/migrations/20260923080000_0003_contracts_chat_realtime.sql`

   Esto crea `platform_kv`, `profiles`, `contracts`, `contract_signed_uploads`,
   `chat_groups`, `chat_group_members`, `chat_messages`, `notifications_log`,
   el bucket público `senda-media`, y activa Supabase Realtime en todas esas
   tablas para que la plataforma funcione en vivo (sin recargar la página).
3. En "Project Settings → API", copiar el "Project URL" y la "anon public key".
4. Crear un archivo `.env` (a partir de `.env.example`) con:
   ```
   VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
   VITE_SUPABASE_ANON_KEY=tu-anon-key
   ```
   En Bolt, esto se configura conectando Supabase desde el propio Bolt
   ("Connect to Supabase"), que crea estas variables automáticamente.
5. Reiniciar/recompilar la app.

Sin este paso, la plataforma sigue funcionando igual que antes (guarda solo
en el navegador local), para que nada se rompa mientras se configura.
