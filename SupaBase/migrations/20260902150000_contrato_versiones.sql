-- T3: máquina de estados del contrato (BORRADOR -> ENVIADO ->
-- ACEPTADO_CLIENTE/ACEPTADO_CONTRATISTA -> FIRMADO), reemplaza el
-- mecanismo de "subir un PDF y marcarlo firmado" de CONTRATO-1/CONTRATO-2
-- por un contrato generado desde datos (getContractData()), versionado
-- y aceptado en la app por las dos partes.
--
-- BORRADOR no tiene fila propia: es la ausencia de una versión activa
-- (ninguna fila, o la última quedó 'invalidado'). Una fila solo se crea
-- al ENVIAR -- ahí se congela payload+hash+version. FIRMADO nunca se
-- setea a mano: surge de que existan las dos aceptaciones (cliente +
-- contratista) sobre la MISMA versión, vía contrato_aceptar(). Ninguna
-- policy de INSERT/UPDATE/DELETE se le da a 'authenticated': todo
-- escritura pasa por las RPCs SECURITY DEFINER de más abajo.

CREATE TABLE public.contrato_versiones (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id   uuid NOT NULL REFERENCES public.requests(id) ON DELETE CASCADE,
  version      int NOT NULL,
  payload      jsonb NOT NULL,
  hash         text NOT NULL,
  estado       text NOT NULL DEFAULT 'enviado'
                 CHECK (estado IN ('enviado', 'aceptado_cliente', 'aceptado_contratista', 'firmado', 'invalidado')),
  enviado_at   timestamptz NOT NULL DEFAULT now(),
  firmado_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (request_id, version)
);

ALTER TABLE public.contrato_versiones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contrato_versiones_select" ON public.contrato_versiones
  FOR SELECT TO authenticated
  USING (
    public.pro_has_accepted_quote(request_id)
    OR EXISTS (SELECT 1 FROM public.requests r WHERE r.id = contrato_versiones.request_id AND r.user_id = auth.uid())
  );

CREATE TABLE public.contrato_aceptaciones (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_version_id   uuid NOT NULL REFERENCES public.contrato_versiones(id) ON DELETE CASCADE,
  usuario_id            uuid NOT NULL,
  rol                   text NOT NULL CHECK (rol IN ('cliente', 'contratista')),
  hash                  text NOT NULL,
  aceptado_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contrato_version_id, rol)
);

ALTER TABLE public.contrato_aceptaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contrato_aceptaciones_select" ON public.contrato_aceptaciones
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.contrato_versiones cv
      WHERE cv.id = contrato_aceptaciones.contrato_version_id
        AND (
          public.pro_has_accepted_quote(cv.request_id)
          OR EXISTS (SELECT 1 FROM public.requests r WHERE r.id = cv.request_id AND r.user_id = auth.uid())
        )
    )
  );

-- ---------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------

-- ENVIAR: congela la versión actual (solo el contratista puede enviar
-- -- es quien arma el contrato en pro-preobra.html). El hash lo calcula
-- el cliente vía crypto.subtle antes de llamar acá; no se re-valida
-- server-side contra el payload (mismo nivel de confianza que el resto
-- de las RPCs de este proyecto -- ver limitación documentada en README).
CREATE OR REPLACE FUNCTION public.contrato_enviar(p_request_id uuid, p_payload jsonb, p_hash text)
RETURNS public.contrato_versiones
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next_version int;
  v_row public.contrato_versiones;
BEGIN
  IF NOT public.pro_has_accepted_quote(p_request_id) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  UPDATE public.contrato_versiones
    SET estado = 'invalidado'
    WHERE request_id = p_request_id AND estado NOT IN ('invalidado', 'firmado');

  SELECT COALESCE(MAX(version), 0) + 1 INTO v_next_version
    FROM public.contrato_versiones WHERE request_id = p_request_id;

  INSERT INTO public.contrato_versiones (request_id, version, payload, hash, estado)
  VALUES (p_request_id, v_next_version, p_payload, p_hash, 'enviado')
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.contrato_enviar(uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contrato_enviar(uuid, jsonb, text) TO authenticated;

-- FIRMAR (aceptar): registra la aceptación del usuario logueado (rol
-- derivado de si es el pro adjudicado o el dueño de la solicitud) sobre
-- una versión puntual. Si ya está la aceptación del otro rol sobre esa
-- misma versión, pasa a 'firmado' -- es la única forma en que ese estado
-- puede aparecer.
CREATE OR REPLACE FUNCTION public.contrato_aceptar(p_version_id uuid)
RETURNS public.contrato_versiones
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request_id uuid;
  v_hash text;
  v_estado_actual text;
  v_rol text;
  v_otro_rol_aceptado boolean;
  v_row public.contrato_versiones;
BEGIN
  SELECT request_id, hash, estado INTO v_request_id, v_hash, v_estado_actual
    FROM public.contrato_versiones WHERE id = p_version_id;

  IF v_request_id IS NULL THEN
    RAISE EXCEPTION 'La versión % no existe', p_version_id;
  END IF;
  IF v_estado_actual = 'invalidado' THEN
    RAISE EXCEPTION 'Esta versión del contrato quedó invalidada por un cambio de datos -- generá y enviá una nueva.';
  END IF;

  IF public.pro_has_accepted_quote(v_request_id) THEN
    v_rol := 'contratista';
  ELSIF EXISTS (SELECT 1 FROM public.requests r WHERE r.id = v_request_id AND r.user_id = auth.uid()) THEN
    v_rol := 'cliente';
  ELSE
    RAISE EXCEPTION 'No autorizado';
  END IF;

  INSERT INTO public.contrato_aceptaciones (contrato_version_id, usuario_id, rol, hash)
  VALUES (p_version_id, auth.uid(), v_rol, v_hash)
  ON CONFLICT (contrato_version_id, rol) DO NOTHING;

  SELECT EXISTS (
    SELECT 1 FROM public.contrato_aceptaciones
    WHERE contrato_version_id = p_version_id AND rol <> v_rol
  ) INTO v_otro_rol_aceptado;

  UPDATE public.contrato_versiones
    SET estado = CASE
          WHEN v_otro_rol_aceptado THEN 'firmado'
          WHEN v_rol = 'cliente' THEN 'aceptado_cliente'
          ELSE 'aceptado_contratista'
        END,
        firmado_at = CASE WHEN v_otro_rol_aceptado THEN now() ELSE firmado_at END
    WHERE id = p_version_id
    RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.contrato_aceptar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contrato_aceptar(uuid) TO authenticated;

-- Reconciliación: se llama al cargar la pantalla con el hash recién
-- calculado desde los datos actuales. Si la última versión activa (no
-- invalidada, no firmada) tiene un hash distinto, algún dato de origen
-- cambió desde que se envió -> se invalida (vuelve a BORRADOR; el
-- próximo ENVIAR crea version+1). Una vez 'firmado' ya no se invalida
-- por cambios posteriores.
CREATE OR REPLACE FUNCTION public.contrato_invalidar_si_cambio(p_request_id uuid, p_hash_actual text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.contrato_versiones;
BEGIN
  IF NOT (
    public.pro_has_accepted_quote(p_request_id)
    OR EXISTS (SELECT 1 FROM public.requests r WHERE r.id = p_request_id AND r.user_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT * INTO v_row FROM public.contrato_versiones
    WHERE request_id = p_request_id AND estado <> 'invalidado'
    ORDER BY version DESC LIMIT 1;

  IF v_row.id IS NOT NULL AND v_row.estado <> 'firmado' AND v_row.hash <> p_hash_actual THEN
    UPDATE public.contrato_versiones SET estado = 'invalidado' WHERE id = v_row.id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.contrato_invalidar_si_cambio(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contrato_invalidar_si_cambio(uuid, text) TO authenticated;

-- confirm_contrato (CONTRATO-2) pasa a validar contra la nueva máquina
-- de estados en vez de los documentos subidos a mano de CONTRATO-1: el
-- gate se confirma cuando la versión vigente del contrato está 'firmado'.
CREATE OR REPLACE FUNCTION public.confirm_contrato(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.pro_has_accepted_quote(p_request_id) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.contrato_versiones
    WHERE request_id = p_request_id AND estado = 'firmado'
  ) THEN
    RAISE EXCEPTION 'El contrato todavía no está firmado por las dos partes';
  END IF;

  UPDATE public.obra_preparacion
    SET gate_contrato = true, current_gate = GREATEST(current_gate, 4)
    WHERE request_id = p_request_id AND pro_id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_contrato(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_contrato(uuid) TO authenticated;
