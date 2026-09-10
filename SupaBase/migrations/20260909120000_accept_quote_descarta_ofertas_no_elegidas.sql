-- accept_quote() ya rechazaba el resto de las quotes, pero dejaba vivos
-- los hilos de contrato_versiones y los hitos preliminares de las ofertas
-- no elegidas -- con contrato por oferta, esos datos pertenecen a una
-- competencia que ya terminó y no deben seguir mostrándose como vigentes.
-- Se agrega, en la misma transacción:
--   - invalidar los contrato_versiones de las demás ofertas de esa request.
--   - promover los hitos preliminares de la oferta ganadora a hitos
--     "reales" (quote_id -> NULL), que es lo que ya leen gate 4/5 de
--     pro-preobra.js y el resto del módulo de hitos.
--   - descartar (borrar) los hitos preliminares de las ofertas perdedoras.
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

  IF v_owner IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'No autorizado para aceptar este presupuesto';
  END IF;

  UPDATE public.quotes
    SET status = 'rejected'
    WHERE request_id = v_request_id AND id <> p_quote_id;

  UPDATE public.quotes
    SET status = 'accepted'
    WHERE id = p_quote_id;

  UPDATE public.requests
    SET status = 'active'
    WHERE id = v_request_id;

  UPDATE public.contrato_versiones
    SET estado = 'invalidado'
    WHERE request_id = v_request_id AND quote_id IS DISTINCT FROM p_quote_id AND estado <> 'invalidado';

  UPDATE public.hitos
    SET quote_id = NULL
    WHERE quote_id = p_quote_id;

  DELETE FROM public.hitos
    WHERE request_id = v_request_id AND quote_id IS NOT NULL AND quote_id <> p_quote_id;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_quote(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.accept_quote(uuid) TO authenticated;
