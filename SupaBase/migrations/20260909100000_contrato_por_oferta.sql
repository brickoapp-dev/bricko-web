-- Contrato al momento de competir por la obra (no solo post-adjudicación).
--
-- Hasta ahora contrato_versiones asumía un solo hilo por request_id (el
-- del pro adjudicado, vía pro_has_accepted_quote()). El nuevo flujo pide
-- que CADA profesional que cotiza pueda adjuntar su propio contrato a la
-- oferta, y que el cliente pueda verlo/descargarlo por cada oferta antes
-- de elegir -- no solo el del ganador. Se agrega quote_id como ancla real
-- de cada hilo; request_id se conserva (denormalizado) porque el resto
-- del sistema post-adjudicación (client-solicitud.js, carpeta pública,
-- pro-preobra.js) sigue consultando por request_id y, tras accept_quote(),
-- solo queda un hilo no invalidado para ese request_id -- no hace falta
-- tocar esas lecturas.
--
-- Backfill: los contratos ya existentes (obras ya adjudicadas antes de
-- este cambio) no tienen quote_id -- se completa con la quote 'accepted'
-- de su request_id, cuando exista. Si no se puede resolver, queda NULL
-- y sigue funcionando por el camino viejo (nada que lea por request_id
-- filtra por quote_id).

ALTER TABLE public.contrato_versiones
  ADD COLUMN quote_id uuid REFERENCES public.quotes(id) ON DELETE CASCADE;

UPDATE public.contrato_versiones cv
  SET quote_id = q.id
  FROM public.quotes q
  WHERE q.request_id = cv.request_id AND q.status = 'accepted' AND cv.quote_id IS NULL;

-- UNIQUE(request_id, version) asumía un solo hilo por obra. Ahora cada
-- oferta versiona su propio hilo -- dos profesionales pueden estar ambos
-- en su "versión 1" de la misma request_id al mismo tiempo.
ALTER TABLE public.contrato_versiones DROP CONSTRAINT contrato_versiones_request_id_version_key;
CREATE UNIQUE INDEX contrato_versiones_quote_version_key
  ON public.contrato_versiones (quote_id, version) WHERE quote_id IS NOT NULL;
-- Filas viejas sin quote_id resuelto (caso borde de backfill): sigue
-- protegido por request_id como antes, para no permitir duplicados ahí.
CREATE UNIQUE INDEX contrato_versiones_request_version_sin_quote_key
  ON public.contrato_versiones (request_id, version) WHERE quote_id IS NULL;

-- El profesional dueño de una oferta (aunque no sea la aceptada) puede
-- ver el hilo de contrato de ESA oferta -- necesario para que, en
-- pro-cotizar.html, pueda revisar/re-enviar su propio borrador. La rama
-- del cliente ya era abierta a todo request_id (dueño de la solicitud),
-- así que ya puede ver el contrato de cualquier oferente sin cambios.
DROP POLICY "contrato_versiones_select" ON public.contrato_versiones;
CREATE POLICY "contrato_versiones_select" ON public.contrato_versiones
  FOR SELECT TO authenticated
  USING (
    public.pro_has_accepted_quote(request_id)
    OR EXISTS (SELECT 1 FROM public.requests r WHERE r.id = contrato_versiones.request_id AND r.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = contrato_versiones.quote_id AND q.pro_id = auth.uid())
  );

-- Mismo alcance en contrato_aceptaciones (join a través de la versión).
DROP POLICY "contrato_aceptaciones_select" ON public.contrato_aceptaciones;
CREATE POLICY "contrato_aceptaciones_select" ON public.contrato_aceptaciones
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.contrato_versiones cv
      WHERE cv.id = contrato_aceptaciones.contrato_version_id
        AND (
          public.pro_has_accepted_quote(cv.request_id)
          OR EXISTS (SELECT 1 FROM public.requests r WHERE r.id = cv.request_id AND r.user_id = auth.uid())
          OR EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = cv.quote_id AND q.pro_id = auth.uid())
        )
    )
  );

-- ENVIAR (oferta): análoga a contrato_enviar(), pero autorizada por ser
-- dueño de la quote en vez de pro_has_accepted_quote -- se usa ANTES de
-- la adjudicación, desde pro-cotizar.html. Versiona por quote_id, no por
-- request_id (dos ofertas de la misma request_id no se pisan entre sí).
CREATE OR REPLACE FUNCTION public.contrato_oferta_enviar(p_quote_id uuid, p_payload jsonb, p_hash text)
RETURNS public.contrato_versiones
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request_id  uuid;
  v_next_version int;
  v_row public.contrato_versiones;
BEGIN
  SELECT request_id INTO v_request_id
    FROM public.quotes
    WHERE id = p_quote_id AND pro_id = auth.uid();

  IF v_request_id IS NULL THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  UPDATE public.contrato_versiones
    SET estado = 'invalidado'
    WHERE quote_id = p_quote_id AND estado NOT IN ('invalidado', 'firmado');

  SELECT COALESCE(MAX(version), 0) + 1 INTO v_next_version
    FROM public.contrato_versiones WHERE quote_id = p_quote_id;

  INSERT INTO public.contrato_versiones (request_id, quote_id, version, payload, hash, estado)
  VALUES (v_request_id, p_quote_id, v_next_version, p_payload, p_hash, 'enviado')
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.contrato_oferta_enviar(uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contrato_oferta_enviar(uuid, jsonb, text) TO authenticated;

-- contrato_enviar() (post-adjudicación, gate 3 de pro-preobra.html) tiene
-- que seguir vinculando cada nueva versión a la quote aceptada -- si no,
-- un reenvío después de adjudicada la obra rompería la cadena de quote_id
-- que el resto de este cambio depende. Se agrega esa resolución; el resto
-- de la función queda igual.
CREATE OR REPLACE FUNCTION public.contrato_enviar(p_request_id uuid, p_payload jsonb, p_hash text)
RETURNS public.contrato_versiones
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quote_id uuid;
  v_next_version int;
  v_row public.contrato_versiones;
BEGIN
  IF NOT public.pro_has_accepted_quote(p_request_id) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT id INTO v_quote_id FROM public.quotes
    WHERE request_id = p_request_id AND status = 'accepted';

  UPDATE public.contrato_versiones
    SET estado = 'invalidado'
    WHERE request_id = p_request_id AND estado NOT IN ('invalidado', 'firmado');

  SELECT COALESCE(MAX(version), 0) + 1 INTO v_next_version
    FROM public.contrato_versiones WHERE request_id = p_request_id;

  INSERT INTO public.contrato_versiones (request_id, quote_id, version, payload, hash, estado)
  VALUES (p_request_id, v_quote_id, v_next_version, p_payload, p_hash, 'enviado')
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;
