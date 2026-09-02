-- T5: participantes [29]-[30] con documentación tipada por modalidad en
-- vez de un campo libre único. Confirmado contra producción antes de
-- escribir esto: hito_participantes tiene columnas extra (entregable,
-- plazo, aceptacion) de una migración sin archivo local
-- ("equipo_vencimiento_asignacion_hito", ver README) que no tiene
-- ningún trigger ni lógica todavía y no tiene relación con esta tarea
-- -- se dejan intactas, sin tocar.
--
-- documentacion_nota se renombra a observaciones (sin perder datos):
-- pasa a ser un campo libre puramente informativo que nunca reemplaza
-- a los documentos tipados de participante_documentos.

ALTER TABLE public.hito_participantes RENAME COLUMN documentacion_nota TO observaciones;

-- estado pasa de vigente/revisar (manual) a completo/registrado/revisar
-- (calculado). Nunca se setea a mano: se protege la columna igual que
-- gate_contrato en obra_preparacion, y solo la puede tocar
-- recalcular_estado_participante() (SECURITY DEFINER) vía los triggers
-- de más abajo.
UPDATE public.hito_participantes SET estado = 'revisar' WHERE estado = 'vigente';
ALTER TABLE public.hito_participantes
  ALTER COLUMN estado SET DEFAULT 'revisar',
  DROP CONSTRAINT hito_participantes_estado_check,
  ADD CONSTRAINT hito_participantes_estado_check CHECK (estado IN ('completo', 'registrado', 'revisar'));

CREATE OR REPLACE FUNCTION public.protect_participante_estado()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    NEW.estado := OLD.estado;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_protect_participante_estado BEFORE UPDATE ON public.hito_participantes
  FOR EACH ROW EXECUTE FUNCTION public.protect_participante_estado();

-- ---------------------------------------------------------------
-- modalidad_requisitos: mapa modalidad -> tipos de documento exigidos.
-- Espejo en SQL del mismo mapa declarado en scripts/contract-fields.js
-- (REQUISITOS_POR_MODALIDAD) -- no hay forma de compartir la fuente
-- entre JS y Postgres en este stack, así que hay que mantener los dos
-- sincronizados a mano si se agrega/saca un requisito.
-- ---------------------------------------------------------------
CREATE TABLE public.modalidad_requisitos (
  modalidad       text NOT NULL,
  tipo_documento  text NOT NULL,
  PRIMARY KEY (modalidad, tipo_documento)
);

INSERT INTO public.modalidad_requisitos (modalidad, tipo_documento) VALUES
  ('colaborador_independiente', 'padic_aceptado'),
  ('colaborador_independiente', 'cuit_activo'),
  ('colaborador_independiente', 'asignacion_hito'),
  ('colaborador_independiente', 'factura_propia'),
  ('dependiente', 'registracion_laboral'),
  ('dependiente', 'cobertura_riesgos'),
  ('subcontratista', 'contrato'),
  ('subcontratista', 'cuit'),
  ('subcontratista', 'facturacion'),
  ('subcontratista', 'documentacion_tecnica'),
  ('profesional', 'matricula'),
  ('profesional', 'contrato_profesional'),
  ('profesional', 'documentacion_colegial_previsional');

-- ---------------------------------------------------------------
-- participante_documentos: un documento tipado por participante+tipo,
-- con adjunto + vigencia. El estado (Vigente/Por vencer/Vencido/Faltante)
-- se calcula siempre a partir de storage_path/fecha_vencimiento, nunca
-- se guarda como columna (evita que quede desincronizado del reloj).
-- ---------------------------------------------------------------
CREATE TABLE public.participante_documentos (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participante_id     uuid NOT NULL REFERENCES public.hito_participantes(id) ON DELETE CASCADE,
  tipo                text NOT NULL,
  storage_path        text,
  fecha_emision       date,
  fecha_vencimiento   date,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (participante_id, tipo)
);

ALTER TABLE public.participante_documentos ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_participante_documentos_updated_at BEFORE UPDATE ON public.participante_documentos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "participante_documentos_select" ON public.participante_documentos
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.hito_participantes hp JOIN public.hitos h ON h.id = hp.hito_id
      WHERE hp.id = participante_documentos.participante_id
        AND (
          public.pro_has_accepted_quote(h.request_id)
          OR EXISTS (SELECT 1 FROM public.requests r WHERE r.id = h.request_id AND r.user_id = auth.uid())
        )
    )
  );

CREATE POLICY "participante_documentos_pro_insert" ON public.participante_documentos
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.hito_participantes hp JOIN public.hitos h ON h.id = hp.hito_id
      WHERE hp.id = participante_id AND public.pro_has_accepted_quote(h.request_id)
    )
  );

CREATE POLICY "participante_documentos_pro_update" ON public.participante_documentos
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.hito_participantes hp JOIN public.hitos h ON h.id = hp.hito_id
      WHERE hp.id = participante_id AND public.pro_has_accepted_quote(h.request_id)
    )
  );

CREATE POLICY "participante_documentos_pro_delete" ON public.participante_documentos
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.hito_participantes hp JOIN public.hitos h ON h.id = hp.hito_id
      WHERE hp.id = participante_id AND public.pro_has_accepted_quote(h.request_id)
    )
  );

-- Bucket privado para los adjuntos, mismo patrón que 'obra-docs':
-- carpeta = request_id.
INSERT INTO storage.buckets (id, name, public)
VALUES ('participante-docs', 'participante-docs', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "participante_docs_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'participante-docs' AND (
      public.pro_has_accepted_quote(((storage.foldername(name))[1])::uuid)
      OR EXISTS (
        SELECT 1 FROM public.requests r
        WHERE r.id::text = (storage.foldername(name))[1] AND r.user_id = auth.uid()
      )
    )
  );

CREATE POLICY "participante_docs_pro_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'participante-docs' AND public.pro_has_accepted_quote(((storage.foldername(name))[1])::uuid));

CREATE POLICY "participante_docs_pro_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'participante-docs' AND public.pro_has_accepted_quote(((storage.foldername(name))[1])::uuid));

CREATE POLICY "participante_docs_pro_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'participante-docs' AND public.pro_has_accepted_quote(((storage.foldername(name))[1])::uuid));

-- ---------------------------------------------------------------
-- Cálculo de estado (documento y participante)
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.documento_estado(p_storage_path text, p_fecha_vencimiento date)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN p_storage_path IS NULL THEN 'faltante'
    WHEN p_fecha_vencimiento IS NULL THEN 'vigente'
    WHEN p_fecha_vencimiento < CURRENT_DATE THEN 'vencido'
    WHEN p_fecha_vencimiento <= CURRENT_DATE + 30 THEN 'por_vencer'
    ELSE 'vigente'
  END;
$$;

-- COMPLETO: todos los documentos requeridos están vigentes.
-- REGISTRADO: todos cargados y ninguno vencido/faltante, pero al menos
-- uno por vencer (≤30 días).
-- REVISAR: falta algún documento requerido o alguno está vencido.
CREATE OR REPLACE FUNCTION public.recalcular_estado_participante(p_participante_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_modalidad text;
  v_requeridos text[];
  v_faltante_o_vencido boolean;
  v_por_vencer boolean;
  v_nuevo_estado text;
BEGIN
  SELECT modalidad INTO v_modalidad FROM public.hito_participantes WHERE id = p_participante_id;
  IF v_modalidad IS NULL THEN RETURN; END IF;

  SELECT array_agg(tipo_documento) INTO v_requeridos
    FROM public.modalidad_requisitos WHERE modalidad = v_modalidad;

  SELECT
    bool_or(public.documento_estado(d.storage_path, d.fecha_vencimiento) IN ('faltante', 'vencido')),
    bool_or(public.documento_estado(d.storage_path, d.fecha_vencimiento) = 'por_vencer')
  INTO v_faltante_o_vencido, v_por_vencer
  FROM unnest(COALESCE(v_requeridos, ARRAY[]::text[])) AS req(tipo)
  LEFT JOIN public.participante_documentos d
    ON d.participante_id = p_participante_id AND d.tipo = req.tipo;

  v_nuevo_estado := CASE
    WHEN COALESCE(v_faltante_o_vencido, true) THEN 'revisar'
    WHEN COALESCE(v_por_vencer, false) THEN 'registrado'
    ELSE 'completo'
  END;

  UPDATE public.hito_participantes SET estado = v_nuevo_estado WHERE id = p_participante_id;
END;
$$;

REVOKE ALL ON FUNCTION public.recalcular_estado_participante(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.trg_recalc_participante_from_doc()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.recalcular_estado_participante(COALESCE(NEW.participante_id, OLD.participante_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_participante_documentos_recalc
  AFTER INSERT OR UPDATE OR DELETE ON public.participante_documentos
  FOR EACH ROW EXECUTE FUNCTION public.trg_recalc_participante_from_doc();

CREATE OR REPLACE FUNCTION public.trg_recalc_participante_from_modalidad()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.recalcular_estado_participante(NEW.id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_hito_participantes_recalc_on_modalidad
  AFTER UPDATE OF modalidad ON public.hito_participantes
  FOR EACH ROW
  WHEN (OLD.modalidad IS DISTINCT FROM NEW.modalidad)
  EXECUTE FUNCTION public.trg_recalc_participante_from_modalidad();
