-- NOTA: reescrita después de inspeccionar producción por SQL editor. La
-- versión original de este archivo asumía que no existía nada para fotos de
-- solicitudes y planeaba crear una columna `imagenes` + bucket `solicitudes`
-- desde cero. En los hechos ya existían DOS intentos previos incompletos,
-- hechos a mano por fuera de este directorio de migraciones:
--
--   - requests.fotos (text[])  -- la columna ya existe, no hace falta crearla.
--   - bucket 'request-photos' (privado) con policies que solo dejan ver la
--     foto a quien la subió (carpeta = auth.uid()) -- un profesional nunca
--     podría ver las fotos de una solicitud ajena, que es el caso de uso real.
--   - bucket 'solicitudes' (público=true) con policy de SELECT
--     `USING (bucket_id = 'solicitudes')` sin ninguna otra condición --
--     cualquiera, autenticado o no, podía ver la foto de cualquier
--     solicitud de cualquier persona.
--
-- Ambos buckets estaban vacíos (storage.objects sin filas) al momento de
-- esta migración, así que no hay archivos que migrar. Se consolida todo en
-- 'solicitudes', con las mismas reglas de visibilidad que ya tiene la fila
-- de requests (dueño, o profesional mientras la solicitud sigue abierta --
-- ver policy "requests_select"), y se elimina el bucket 'request-photos'.

-- NOTA: esto documenta la intención pero falla si se corre por el SQL
-- editor -- Supabase bloquea el DELETE directo sobre storage.objects/
-- storage.buckets (trigger storage.protect_delete()). Hay que borrar el
-- bucket desde Storage → Buckets en el dashboard (o la Storage API), que
-- sí limpia los objetos del backend además de las filas. Ya se hizo.
DELETE FROM storage.objects WHERE bucket_id = 'request-photos';
DELETE FROM storage.buckets WHERE id = 'request-photos';

DROP POLICY IF EXISTS "Usuarios leen sus propias fotos"  ON storage.objects;
DROP POLICY IF EXISTS "Usuarios suben sus propias fotos" ON storage.objects;

UPDATE storage.buckets SET public = false WHERE id = 'solicitudes';

DROP POLICY IF EXISTS "solicitudes_read_all"   ON storage.objects;
DROP POLICY IF EXISTS "solicitudes_insert_own" ON storage.objects;
DROP POLICY IF EXISTS "solicitudes_update_own" ON storage.objects;
DROP POLICY IF EXISTS "solicitudes_delete_own" ON storage.objects;
DROP POLICY IF EXISTS "solicitudes_select"        ON storage.objects;
DROP POLICY IF EXISTS "solicitudes_insert_owner"  ON storage.objects;
DROP POLICY IF EXISTS "solicitudes_update_owner"  ON storage.objects;
DROP POLICY IF EXISTS "solicitudes_delete_owner"  ON storage.objects;

-- Lectura: dueño de la solicitud, o profesional mientras esté abierta
-- (mismo criterio que la policy "requests_select").
CREATE POLICY "solicitudes_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'solicitudes' AND EXISTS (
      SELECT 1 FROM public.requests r
      WHERE r.id::text = (storage.foldername(name))[1]
        AND (
          r.user_id = (select auth.uid())
          OR (
            r.status IN ('pending', 'quoted')
            AND EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = (select auth.uid()))
          )
        )
    )
  );

-- Escritura: solo el dueño de la solicitud, y solo dentro de su propia carpeta.
CREATE POLICY "solicitudes_insert_owner" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'solicitudes' AND EXISTS (
      SELECT 1 FROM public.requests r
      WHERE r.id::text = (storage.foldername(name))[1] AND r.user_id = (select auth.uid())
    )
  );

CREATE POLICY "solicitudes_update_owner" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'solicitudes' AND EXISTS (
      SELECT 1 FROM public.requests r
      WHERE r.id::text = (storage.foldername(name))[1] AND r.user_id = (select auth.uid())
    )
  );

CREATE POLICY "solicitudes_delete_owner" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'solicitudes' AND EXISTS (
      SELECT 1 FROM public.requests r
      WHERE r.id::text = (storage.foldername(name))[1] AND r.user_id = (select auth.uid())
    )
  );
