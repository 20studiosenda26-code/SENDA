/*
# Autenticación real + perfiles de usuario con roles

## Qué hace esta migración

1. Crea la tabla `profiles` que extiende `auth.users` con información de
   cada usuario de la plataforma Senda: nombre, rol, estado, puntos, etc.
2. Crea un trigger que inserta automáticamente una fila en `profiles`
   cada vez que un usuario se registra en `auth.users`.
3. Habilita RLS en `profiles` con políticas para que:
   - Cada usuario autenticado puede ver su propio perfil.
   - Los admins pueden ver todos los perfiles.
   - Los admins pueden actualizar cualquier perfil.
   - Cada usuario puede actualizar su propio perfil.
4. Crea una función `is_admin()` reutilizable para verificar si el
   usuario autenticado tiene rol admin.
5. Actualiza las políticas de `platform_kv` para que solo usuarios
   autenticados puedan leer/escribir (antes era público con anon).

## Tablas nuevas

- `profiles`:
  - `id` (uuid, PK, referencia a auth.users.id)
  - `name` (text, nombre del usuario)
  - `role` (text, 'admin' | 'clipper' | 'editor')
  - `estado` (text, 'Activo' | 'Inactivo')
  - `points_today` (int, puntos del día)
  - `points_month` (int, puntos del mes)
  - `streak` (int, racha actual)
  - `best_streak` (int, mejor racha)
  - `day_closed_today` (bool, si cerró el día)
  - `online` (bool, si está en línea)
  - `created_at` (timestamptz)

## Seguridad

- RLS habilitada en `profiles`.
- Solo autenticados pueden acceder a `profiles`.
- Los admins ven y editan todos los perfiles.
- Cada usuario ve y edita su propio perfil.
- `platform_kv` ahora requiere autenticación.
- La función `is_admin()` usa `raw_app_meta_data` (no modificable por el usuario).
*/

-- ============================================================
-- 1. Tabla de perfiles
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'clipper',
  estado text NOT NULL DEFAULT 'Activo',
  points_today int NOT NULL DEFAULT 0,
  points_month int NOT NULL DEFAULT 0,
  streak int NOT NULL DEFAULT 0,
  best_streak int NOT NULL DEFAULT 0,
  day_closed_today boolean NOT NULL DEFAULT false,
  online boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 2. Función helper: ¿el usuario actual es admin?
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'raw_app_meta_data' ->> 'role') = 'admin'
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    ),
    false
  );
$$;

-- ============================================================
-- 3. Políticas RLS para profiles
-- ============================================================

-- SELECT: el usuario ve su propio perfil; los admins ven todos
DROP POLICY IF EXISTS "profiles_select_own_or_admin" ON public.profiles;
CREATE POLICY "profiles_select_own_or_admin"
ON public.profiles FOR SELECT
TO authenticated
USING (auth.uid() = id OR public.is_admin());

-- INSERT: solo admins crean perfiles (via edge function con service role,
-- pero el trigger de registro auto-inserta sin pasar por RLS)
DROP POLICY IF EXISTS "profiles_insert_admin" ON public.profiles;
CREATE POLICY "profiles_insert_admin"
ON public.profiles FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

-- UPDATE: el usuario edita su propio perfil; los admins editan todos
DROP POLICY IF EXISTS "profiles_update_own_or_admin" ON public.profiles;
CREATE POLICY "profiles_update_own_or_admin"
ON public.profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id OR public.is_admin())
WITH CHECK (auth.uid() = id OR public.is_admin());

-- DELETE: solo admins eliminan perfiles
DROP POLICY IF EXISTS "profiles_delete_admin" ON public.profiles;
CREATE POLICY "profiles_delete_admin"
ON public.profiles FOR DELETE
TO authenticated
USING (public.is_admin());

-- ============================================================
-- 4. Trigger: auto-crear perfil al registrarse
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data ->> 'role', 'clipper')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 5. Actualizar platform_kv: ahora requiere autenticación
-- ============================================================
DROP POLICY IF EXISTS "platform_kv_select" ON public.platform_kv;
CREATE POLICY "platform_kv_select"
ON public.platform_kv FOR SELECT
TO authenticated USING (true);

DROP POLICY IF EXISTS "platform_kv_upsert" ON public.platform_kv;
CREATE POLICY "platform_kv_upsert"
ON public.platform_kv FOR INSERT
TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "platform_kv_update" ON public.platform_kv;
CREATE POLICY "platform_kv_update"
ON public.platform_kv FOR UPDATE
TO authenticated USING (true) WITH CHECK (true);
