-- T2: campos [7],[8],[10],[11] del contrato en properfil.html.
-- professional_verification ya tenía dni_number (nunca se editaba desde
-- ninguna pantalla -- properfil.html solo subía las fotos de DNI). Se
-- deja dni_number intacto (sin perder datos históricos) y se agrega
-- cuit como columna hermana: ambas conviven, el JS decide cuál pedir
-- como obligatoria según condicion_fiscal.
--
-- razon_social [6] no necesita columna nueva: ya vive en profiles
-- (agregada en T1 sin estar restringida a role='cliente' -- el
-- profesional también tiene fila en profiles).

ALTER TABLE public.professional_verification
  ADD COLUMN IF NOT EXISTS cuit text
    CHECK (cuit IS NULL OR cuit ~ '^[0-9]{11}$'),
  ADD COLUMN IF NOT EXISTS condicion_fiscal text
    CHECK (condicion_fiscal IS NULL OR condicion_fiscal IN (
      'responsable_inscripto', 'monotributo', 'exento', 'no_alcanzado', 'consumidor_final'
    )),
  ADD COLUMN IF NOT EXISTS usa_domicilio_alt boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS domicilio_contractual_alt text,
  ADD COLUMN IF NOT EXISTS matricula_entidad text,
  ADD COLUMN IF NOT EXISTS matricula_numero text,
  ADD COLUMN IF NOT EXISTS matricula_vencimiento date,
  ADD COLUMN IF NOT EXISTS matricula_adjunto_path text;

-- Bucket privado para el adjunto de matrícula -- mismo patrón que 'dni'
-- (carpeta = uid del dueño, solo el dueño lee/escribe).
INSERT INTO storage.buckets (id, name, public)
VALUES ('matricula', 'matricula', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "matricula_select_own" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'matricula' AND (storage.foldername(name))[1] = (select auth.uid())::text);

CREATE POLICY "matricula_insert_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'matricula' AND (storage.foldername(name))[1] = (select auth.uid())::text);

CREATE POLICY "matricula_update_own" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'matricula' AND (storage.foldername(name))[1] = (select auth.uid())::text);

CREATE POLICY "matricula_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'matricula' AND (storage.foldername(name))[1] = (select auth.uid())::text);
