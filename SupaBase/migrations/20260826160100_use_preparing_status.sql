-- Usa el nuevo estado 'preparing' (ver 20260826160000_add_preparing_status.sql)
-- para que aceptar una cotización YA NO mande la obra directo a ejecución.
--
-- Antes: accept_quote() / cascade_on_quote_accepted() ponían requests.status
-- = 'active' apenas se aceptaba un presupuesto, y enable_obra() (gate 6 del
-- wizard de preparación) sólo tocaba obra_preparacion.gate_habilitada sin
-- reflejarlo en requests.status. Resultado: el wizard de 6 pasos era
-- decorativo, la obra ya estaba "activa" (en ejecución) antes de prepararse.
--
-- Ahora: aceptar una cotización deja la solicitud en 'preparing'. Sólo
-- enable_obra() la pasa a 'active', una vez cumplidos los 4 gates.

-- ── accept_quote(): 'active' → 'preparing' ──
CREATE OR REPLACE FUNCTION public.accept_quote(p_quote_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request_id uuid;
  v_owner      uuid;
BEGIN
  SELECT q.request_id, r.user_id
    INTO v_request_id, v_owner
    FROM public.quotes q
    JOIN public.requests r ON r.id = q.request_id
    WHERE q.id = p_quote_id;

  IF v_request_id IS NULL THEN
    RAISE EXCEPTION 'El presupuesto % no existe', p_quote_id;
  END IF;

  -- Solo el dueño de la solicitud puede aceptar
  IF v_owner IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'No autorizado para aceptar este presupuesto';
  END IF;

  -- Rechazar el resto primero (respeta el índice único de un solo aceptado)
  UPDATE public.quotes
    SET status = 'rejected'
    WHERE request_id = v_request_id AND id <> p_quote_id;

  UPDATE public.quotes
    SET status = 'accepted'
    WHERE id = p_quote_id;

  UPDATE public.requests
    SET status = 'preparing'
    WHERE id = v_request_id;
END;
$$;

-- ── cascade_on_quote_accepted(): cubre el UPDATE directo del frontend ──
CREATE OR REPLACE FUNCTION public.cascade_on_quote_accepted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'accepted' AND COALESCE(OLD.status, '') <> 'accepted' THEN
    UPDATE public.quotes
      SET status = 'rejected'
      WHERE request_id = NEW.request_id
        AND id <> NEW.id
        AND status <> 'rejected';

    UPDATE public.requests
      SET status = 'preparing'
      WHERE id = NEW.request_id;
  END IF;
  RETURN NEW;
END;
$$;

-- ── enable_obra(): gate 6, ahora sí mueve requests.status a 'active' ──
CREATE OR REPLACE FUNCTION public.enable_obra(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ready boolean;
BEGIN
  IF NOT public.pro_has_accepted_quote(p_request_id) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT gate_comision AND gate_contrato AND gate_hitos AND gate_participantes
    INTO v_ready
    FROM public.obra_preparacion
    WHERE request_id = p_request_id;

  IF NOT COALESCE(v_ready, false) THEN
    RAISE EXCEPTION 'Faltan requisitos para habilitar la obra';
  END IF;

  UPDATE public.obra_preparacion SET gate_habilitada = true WHERE request_id = p_request_id;

  UPDATE public.requests SET status = 'active'
    WHERE id = p_request_id AND status = 'preparing';
END;
$$;

-- ── Backfill: obras ya adjudicadas cuya preparación sigue sin habilitar ──
-- quedaron en 'active' por el bug anterior; deberían estar en 'preparing'.
UPDATE public.requests r
  SET status = 'preparing'
  FROM public.obra_preparacion p
  WHERE p.request_id = r.id
    AND p.gate_habilitada = false
    AND r.status = 'active';
