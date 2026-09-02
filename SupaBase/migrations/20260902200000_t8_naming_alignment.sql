-- T8: alinea nombres de tablas/columnas con el checklist de T8. La
-- mayoría de lo que pide T8 ya existía (construido en T1-T7) con otro
-- nombre; esta migración renombra en vez de duplicar. Dos decisiones
-- explícitas, confirmadas con el usuario antes de escribir esto:
--
-- 1) cuit/condicion_fiscal/matricula_*/domicilio del PROFESIONAL se
--    mantienen en professional_verification (privada), NO se mueven a
--    professionals (que es de lectura pública -- RLS USING(true), el
--    directorio). Sólo se renombran ahí mismo para calzar con los
--    nombres de T8 (matricula_adjunto, domicilio_contractual).
-- 2) profiles.razon_social ya cubre al profesional también (perfil
--    compartido entre roles) -- no se duplica en professionals.
--
-- Todo lo demás se renombra literal:
--   hito_participantes -> participantes
--   obra_qr_tokens -> qr_tokens
--   profiles.domicilio_contractual_alt -> domicilio_contractual
--   profiles.caracter_inmueble_aclaracion -> caracter_inmueble_detalle
--   professional_verification.domicilio_contractual_alt -> domicilio_contractual
--   professional_verification.matricula_adjunto_path -> matricula_adjunto
--
-- Y se agrega la tabla `contratos` (padre de contrato_versiones) que
-- pedía T8 y que no existía -- hoy contrato_versiones colgaba directo
-- de requests.id. contrato_versiones.request_id se mantiene además de
-- contrato_id (denormalizado a propósito): reescribir cada query de
-- pro-preobra.js/contract-data.js para pasar por contrato_id en vez de
-- request_id habría sido un cambio mucho más grande sin beneficio
-- funcional -- ver README para el detalle de esta decisión.
--
-- Nota sobre por qué esto no rompe las RLS policies existentes: los
-- USING/WITH CHECK de las policies se guardan como árboles de expresión
-- resueltos contra el OID de la tabla (igual que una vista), no como
-- texto -- un ALTER TABLE...RENAME los actualiza solo. Lo que si hay
-- que reescribir a mano son las funciones PL/pgSQL que nombran la tabla
-- vieja dentro de su cuerpo (se resuelve de nuevo en cada ejecución).

-- ---------------------------------------------------------------
-- 1) Columnas: profiles
-- ---------------------------------------------------------------
ALTER TABLE public.profiles RENAME COLUMN domicilio_contractual_alt TO domicilio_contractual;
ALTER TABLE public.profiles RENAME COLUMN caracter_inmueble_aclaracion TO caracter_inmueble_detalle;

-- ---------------------------------------------------------------
-- 2) Columnas: professional_verification (privada -- ver nota arriba)
-- ---------------------------------------------------------------
ALTER TABLE public.professional_verification RENAME COLUMN domicilio_contractual_alt TO domicilio_contractual;
ALTER TABLE public.professional_verification RENAME COLUMN matricula_adjunto_path TO matricula_adjunto;

-- ---------------------------------------------------------------
-- 3) Tablas: hito_participantes -> participantes
-- ---------------------------------------------------------------
ALTER TABLE public.hito_participantes RENAME TO participantes;

ALTER POLICY "hito_participantes_select" ON public.participantes RENAME TO "participantes_select";
ALTER POLICY "hito_participantes_pro_insert" ON public.participantes RENAME TO "participantes_pro_insert";
ALTER POLICY "hito_participantes_pro_update" ON public.participantes RENAME TO "participantes_pro_update";
ALTER POLICY "hito_participantes_pro_delete" ON public.participantes RENAME TO "participantes_pro_delete";

-- ---------------------------------------------------------------
-- 4) Tablas: obra_qr_tokens -> qr_tokens
-- ---------------------------------------------------------------
ALTER TABLE public.obra_qr_tokens RENAME TO qr_tokens;
ALTER POLICY "obra_qr_tokens_select" ON public.qr_tokens RENAME TO "qr_tokens_select";

-- ---------------------------------------------------------------
-- 5) Tabla nueva: contratos (padre de contrato_versiones)
-- ---------------------------------------------------------------
CREATE TABLE public.contratos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id   uuid NOT NULL UNIQUE REFERENCES public.requests(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.contratos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contratos_select" ON public.contratos
  FOR SELECT TO authenticated
  USING (
    public.pro_has_accepted_quote(request_id)
    OR EXISTS (SELECT 1 FROM public.requests r WHERE r.id = contratos.request_id AND r.user_id = auth.uid())
  );

-- Backfill: una fila de contratos por cada request_id que ya tenga
-- versiones, y contrato_versiones.contrato_id apuntando a ella.
INSERT INTO public.contratos (request_id)
SELECT DISTINCT request_id FROM public.contrato_versiones
ON CONFLICT (request_id) DO NOTHING;

ALTER TABLE public.contrato_versiones ADD COLUMN contrato_id uuid REFERENCES public.contratos(id) ON DELETE CASCADE;

UPDATE public.contrato_versiones cv
SET contrato_id = c.id
FROM public.contratos c
WHERE c.request_id = cv.request_id;

-- ---------------------------------------------------------------
-- 6) Funciones que nombraban las tablas viejas por texto -- se
-- reescriben con los nombres nuevos. Las RLS policies de estas mismas
-- tablas NO se tocan (ver nota arriba: se actualizan solas).
-- ---------------------------------------------------------------

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
  SELECT modalidad INTO v_modalidad FROM public.participantes WHERE id = p_participante_id;
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

  UPDATE public.participantes SET estado = v_nuevo_estado WHERE id = p_participante_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.enable_obra(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gate_comision boolean;
  v_contrato_firmado boolean;
  v_hitos_confirmado boolean;
  v_sin_participantes boolean;
  v_participantes_incompletos int;
BEGIN
  IF NOT public.pro_has_accepted_quote(p_request_id) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT gate_comision INTO v_gate_comision
    FROM public.obra_preparacion WHERE request_id = p_request_id;
  IF NOT COALESCE(v_gate_comision, false) THEN
    RAISE EXCEPTION 'Falta acreditar la comisión';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.contrato_versiones WHERE request_id = p_request_id AND estado = 'firmado'
  ) INTO v_contrato_firmado;
  IF NOT v_contrato_firmado THEN
    RAISE EXCEPTION 'El contrato todavía no está firmado por las dos partes (o quedó invalidado por un cambio de datos)';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.plan_hitos_versiones WHERE request_id = p_request_id AND estado = 'confirmado'
  ) INTO v_hitos_confirmado;
  IF NOT v_hitos_confirmado THEN
    RAISE EXCEPTION 'El plan por hitos todavía no está confirmado';
  END IF;

  SELECT NOT EXISTS (
    SELECT 1 FROM public.participantes hp JOIN public.hitos h ON h.id = hp.hito_id
    WHERE h.request_id = p_request_id
  ) INTO v_sin_participantes;
  IF v_sin_participantes THEN
    RAISE EXCEPTION 'Todavía no asignaste participantes';
  END IF;

  SELECT COUNT(*) INTO v_participantes_incompletos
    FROM public.participantes hp JOIN public.hitos h ON h.id = hp.hito_id
    WHERE h.request_id = p_request_id AND hp.estado <> 'completo';
  IF v_participantes_incompletos > 0 THEN
    RAISE EXCEPTION 'Hay % participante(s) con documentación incompleta o vencida', v_participantes_incompletos;
  END IF;

  UPDATE public.obra_preparacion SET gate_habilitada = true WHERE request_id = p_request_id;

  UPDATE public.requests SET status = 'active'
    WHERE id = p_request_id AND status = 'preparing';
END;
$$;

CREATE OR REPLACE FUNCTION public.carpeta_publica(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_qr public.qr_tokens;
  v_result jsonb;
  v_user_agent text;
  v_ip text;
BEGIN
  SELECT * INTO v_qr FROM public.qr_tokens WHERE token = p_token;

  IF v_qr.token IS NULL OR v_qr.revocado_en IS NOT NULL
     OR (v_qr.vence_en IS NOT NULL AND v_qr.vence_en < now()) THEN
    RETURN NULL;
  END IF;

  BEGIN
    v_user_agent := current_setting('request.headers', true)::jsonb ->> 'user-agent';
    v_ip := COALESCE(
      NULLIF(split_part(current_setting('request.headers', true)::jsonb ->> 'x-forwarded-for', ',', 1), ''),
      current_setting('request.headers', true)::jsonb ->> 'x-real-ip'
    );
  EXCEPTION WHEN OTHERS THEN
    v_user_agent := NULL; v_ip := NULL;
  END;
  INSERT INTO public.qr_accesos (token, user_agent, ip) VALUES (p_token, v_user_agent, v_ip);

  SELECT jsonb_build_object(
    'ticket_id', r.ticket_id,
    'titulo', r.titulo,
    'localidad', COALESCE(cp.city, ''),
    'habilitada', COALESCE(op.gate_habilitada, false),
    'hitos', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'numero', h.numero, 'titulo', h.titulo, 'resultado', h.descripcion, 'estado', h.status
      ) ORDER BY h.numero)
      FROM public.hitos h WHERE h.request_id = r.id
    ), '[]'::jsonb),
    'participantes', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'nombre', hp.nombre, 'especialidad', hp.especialidad,
        'modalidad', hp.modalidad, 'estado_documentacion', hp.estado
      ))
      FROM public.participantes hp
      JOIN public.hitos h2 ON h2.id = hp.hito_id
      WHERE h2.request_id = r.id
    ), '[]'::jsonb)
  ) INTO v_result
  FROM public.requests r
  LEFT JOIN public.obra_preparacion op ON op.request_id = r.id
  LEFT JOIN public.profiles cp ON cp.id = r.user_id
  WHERE r.id = v_qr.obra_id;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.generar_qr_obra(p_request_id uuid, p_dias_vigencia int DEFAULT 90)
RETURNS public.qr_tokens
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.qr_tokens;
BEGIN
  IF NOT public.pro_has_accepted_quote(p_request_id) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  INSERT INTO public.qr_tokens (token, obra_id, creado_por, vence_en)
  VALUES (
    encode(gen_random_bytes(24), 'hex'),
    p_request_id,
    auth.uid(),
    CASE WHEN p_dias_vigencia IS NULL THEN NULL ELSE now() + (p_dias_vigencia || ' days')::interval END
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.revocar_qr_obra(p_token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_obra_id uuid;
BEGIN
  SELECT obra_id INTO v_obra_id FROM public.qr_tokens WHERE token = p_token;
  IF v_obra_id IS NULL THEN
    RAISE EXCEPTION 'Token inexistente';
  END IF;
  IF NOT public.pro_has_accepted_quote(v_obra_id) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  UPDATE public.qr_tokens SET revocado_en = now() WHERE token = p_token AND revocado_en IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.contrato_enviar(p_request_id uuid, p_payload jsonb, p_hash text)
RETURNS public.contrato_versiones
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next_version int;
  v_contrato_id uuid;
  v_row public.contrato_versiones;
BEGIN
  IF NOT public.pro_has_accepted_quote(p_request_id) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  INSERT INTO public.contratos (request_id) VALUES (p_request_id)
    ON CONFLICT (request_id) DO NOTHING;
  SELECT id INTO v_contrato_id FROM public.contratos WHERE request_id = p_request_id;

  UPDATE public.contrato_versiones
    SET estado = 'invalidado'
    WHERE request_id = p_request_id AND estado NOT IN ('invalidado', 'firmado');

  SELECT COALESCE(MAX(version), 0) + 1 INTO v_next_version
    FROM public.contrato_versiones WHERE request_id = p_request_id;

  INSERT INTO public.contrato_versiones (request_id, contrato_id, version, payload, hash, estado)
  VALUES (p_request_id, v_contrato_id, v_next_version, p_payload, p_hash, 'enviado')
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;
