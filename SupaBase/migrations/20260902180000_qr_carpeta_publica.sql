-- T6: control final (gate 6) + carpeta pública por QR.
--
-- 1) enable_obra() deja de confiar únicamente en los flags gate_* --
--    verifica directo contra la fuente de verdad de cada versión
--    (contrato_versiones.estado='firmado', plan_hitos_versiones.estado=
--    'confirmado') y contra el estado ACTUAL de cada participante
--    (hito_participantes.estado='completo'), no solo un flag histórico
--    que pudo haber quedado desactualizado.
-- 2) obra_qr_tokens / qr_accesos: token opaco y aleatorio (pgcrypto,
--    no derivable del id de obra), revocable, con vigencia.
-- 3) carpeta_publica(token): única puerta de entrada para la vista
--    pública -- RPC SECURITY DEFINER otorgada a "anon" (nadie más en
--    este proyecto tiene acceso anónimo) que arma a mano un jsonb con
--    solo los campos públicos. El filtrado es server-side: ninguna
--    tabla real queda expuesta a anon vía RLS, todo pasa por acá.

-- ---------------------------------------------------------------
-- 1) Habilitación: verificación real, no solo flags
-- ---------------------------------------------------------------
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
    SELECT 1 FROM public.hito_participantes hp JOIN public.hitos h ON h.id = hp.hito_id
    WHERE h.request_id = p_request_id
  ) INTO v_sin_participantes;
  IF v_sin_participantes THEN
    RAISE EXCEPTION 'Todavía no asignaste participantes';
  END IF;

  SELECT COUNT(*) INTO v_participantes_incompletos
    FROM public.hito_participantes hp JOIN public.hitos h ON h.id = hp.hito_id
    WHERE h.request_id = p_request_id AND hp.estado <> 'completo';
  IF v_participantes_incompletos > 0 THEN
    RAISE EXCEPTION 'Hay % participante(s) con documentación incompleta o vencida', v_participantes_incompletos;
  END IF;

  UPDATE public.obra_preparacion SET gate_habilitada = true WHERE request_id = p_request_id;

  UPDATE public.requests SET status = 'active'
    WHERE id = p_request_id AND status = 'preparing';
END;
$$;

-- ---------------------------------------------------------------
-- 2) QR: token opaco, revocable, con vigencia
-- ---------------------------------------------------------------
CREATE TABLE public.obra_qr_tokens (
  token         text PRIMARY KEY,
  obra_id       uuid NOT NULL REFERENCES public.requests(id) ON DELETE CASCADE,
  creado_por    uuid NOT NULL,
  creado_en     timestamptz NOT NULL DEFAULT now(),
  vence_en      timestamptz,
  revocado_en   timestamptz
);

CREATE INDEX obra_qr_tokens_obra_id_idx ON public.obra_qr_tokens(obra_id);

ALTER TABLE public.obra_qr_tokens ENABLE ROW LEVEL SECURITY;

-- Solo el pro adjudicado o el dueño de la solicitud pueden ver/gestionar
-- sus propios tokens (para listarlos y revocarlos desde la UI). Sin
-- policy de INSERT/UPDATE para authenticated: todo pasa por las RPCs.
CREATE POLICY "obra_qr_tokens_select" ON public.obra_qr_tokens
  FOR SELECT TO authenticated
  USING (
    public.pro_has_accepted_quote(obra_id)
    OR EXISTS (SELECT 1 FROM public.requests r WHERE r.id = obra_qr_tokens.obra_id AND r.user_id = auth.uid())
  );

CREATE TABLE public.qr_accesos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token           text NOT NULL REFERENCES public.obra_qr_tokens(token) ON DELETE CASCADE,
  accedido_en     timestamptz NOT NULL DEFAULT now(),
  user_agent      text,
  ip              text
);

CREATE INDEX qr_accesos_token_idx ON public.qr_accesos(token);

ALTER TABLE public.qr_accesos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "qr_accesos_select" ON public.qr_accesos
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.obra_qr_tokens t
      WHERE t.token = qr_accesos.token
        AND (
          public.pro_has_accepted_quote(t.obra_id)
          OR EXISTS (SELECT 1 FROM public.requests r WHERE r.id = t.obra_id AND r.user_id = auth.uid())
        )
    )
  );

-- Genera un token nuevo (hex de 24 bytes random -- opaco, no derivable
-- del id de obra). No revoca los anteriores automáticamente: la UI
-- decide si quiere revocar el vigente antes de generar uno nuevo.
CREATE OR REPLACE FUNCTION public.generar_qr_obra(p_request_id uuid, p_dias_vigencia int DEFAULT 90)
RETURNS public.obra_qr_tokens
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.obra_qr_tokens;
BEGIN
  IF NOT public.pro_has_accepted_quote(p_request_id) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  INSERT INTO public.obra_qr_tokens (token, obra_id, creado_por, vence_en)
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

REVOKE ALL ON FUNCTION public.generar_qr_obra(uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generar_qr_obra(uuid, int) TO authenticated;

CREATE OR REPLACE FUNCTION public.revocar_qr_obra(p_token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_obra_id uuid;
BEGIN
  SELECT obra_id INTO v_obra_id FROM public.obra_qr_tokens WHERE token = p_token;
  IF v_obra_id IS NULL THEN
    RAISE EXCEPTION 'Token inexistente';
  END IF;
  IF NOT public.pro_has_accepted_quote(v_obra_id) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  UPDATE public.obra_qr_tokens SET revocado_en = now() WHERE token = p_token AND revocado_en IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.revocar_qr_obra(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revocar_qr_obra(text) TO authenticated;

-- ---------------------------------------------------------------
-- 3) Vista pública (carpeta.html?t=<token>): única puerta de entrada
-- para "anon". Devuelve NULL si el token no existe, está vencido o
-- revocado -- la página pública lo traduce a "enlace no válido", nada
-- más (ni un mensaje que confirme o niegue que el token alguna vez
-- existió). Nunca incluye DNI/CUIT, domicilios, montos, emails,
-- teléfonos ni las rutas/archivos de documentación.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.carpeta_publica(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_qr public.obra_qr_tokens;
  v_result jsonb;
  v_user_agent text;
  v_ip text;
BEGIN
  SELECT * INTO v_qr FROM public.obra_qr_tokens WHERE token = p_token;

  IF v_qr.token IS NULL OR v_qr.revocado_en IS NOT NULL
     OR (v_qr.vence_en IS NOT NULL AND v_qr.vence_en < now()) THEN
    RETURN NULL;
  END IF;

  -- Registro de acceso, best-effort (headers no siempre disponibles,
  -- ej. si se llama desde el SQL editor).
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
      FROM public.hito_participantes hp
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

REVOKE ALL ON FUNCTION public.carpeta_publica(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.carpeta_publica(text) TO anon, authenticated;
