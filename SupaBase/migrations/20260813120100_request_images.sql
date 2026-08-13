-- Fotos/planos adjuntos a una solicitud de trabajo.
--
-- Antes, request-form.js comprimía las imágenes a base64 en el navegador y
-- las insertaba como texto (`[ArchivosJSON: ...]`) dentro de requests.descripcion.
-- No había bucket, no había columna dedicada, y la regex que intentaba volver
-- a extraer ese JSON en mis-obras.js se rompía con el primer archivo (cortaba
-- en el primer ']', que es el cierre del propio array), así que las fotos
-- nunca se recuperaban. Esta migración agrega almacenamiento real.
--
-- Convención de rutas: '<request_id>/<archivo>' — el mismo criterio de
-- visibilidad que ya usa la tabla requests (dueño, o profesional mientras la
-- solicitud está abierta) se aplica acá vía policy con EXISTS.

ALTER TABLE public.requests
  ADD COLUMN IF NOT EXISTS imagenes text[] NOT NULL DEFAULT '{}';

INSERT INTO storage.buckets (id, name, public)
VALUES ('solicitudes', 'solicitudes', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "solicitudes_select" ON storage.objects;
DROP POLICY IF EXISTS "solicitudes_insert_owner" ON storage.objects;
DROP POLICY IF EXISTS "solicitudes_update_owner" ON storage.objects;
DROP POLICY IF EXISTS "solicitudes_delete_owner" ON storage.objects;

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
