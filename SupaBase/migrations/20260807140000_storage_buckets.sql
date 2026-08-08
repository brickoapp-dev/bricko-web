-- Buckets de Storage para el perfil profesional.
--
-- avatars: foto de perfil. Lectura pública (se muestra en el directorio),
--          escritura solo del dueño (carpeta = su user id).
-- dni:     fotos de DNI. PRIVADO. Todo (leer/escribir) restringido al dueño.
--
-- Convención de rutas: '<user_id>/<archivo>' — el primer segmento de la ruta
-- es el uid del profesional, y las políticas lo comparan con auth.uid().

INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true),
       ('dni',     'dni',     false)
ON CONFLICT (id) DO NOTHING;

-- ── avatars ──
DROP POLICY IF EXISTS "avatars_read_all"   ON storage.objects;
DROP POLICY IF EXISTS "avatars_insert_own" ON storage.objects;
DROP POLICY IF EXISTS "avatars_update_own" ON storage.objects;
DROP POLICY IF EXISTS "avatars_delete_own" ON storage.objects;

CREATE POLICY "avatars_read_all" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'avatars');

CREATE POLICY "avatars_insert_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = (select auth.uid())::text);

CREATE POLICY "avatars_update_own" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = (select auth.uid())::text);

CREATE POLICY "avatars_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = (select auth.uid())::text);

-- ── dni (privado) ──
DROP POLICY IF EXISTS "dni_select_own" ON storage.objects;
DROP POLICY IF EXISTS "dni_insert_own" ON storage.objects;
DROP POLICY IF EXISTS "dni_update_own" ON storage.objects;
DROP POLICY IF EXISTS "dni_delete_own" ON storage.objects;

CREATE POLICY "dni_select_own" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'dni' AND (storage.foldername(name))[1] = (select auth.uid())::text);

CREATE POLICY "dni_insert_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'dni' AND (storage.foldername(name))[1] = (select auth.uid())::text);

CREATE POLICY "dni_update_own" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'dni' AND (storage.foldername(name))[1] = (select auth.uid())::text);

CREATE POLICY "dni_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'dni' AND (storage.foldername(name))[1] = (select auth.uid())::text);
