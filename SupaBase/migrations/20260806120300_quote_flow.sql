-- Flujo de cotizaciones robusto.
--
-- Problema 1: cuando un pro cotizaba, el JS hacía
--   update requests set status='quoted'
-- pero RLS lo bloqueaba (el pro no es dueño de la request) → 0 filas, sin
-- error. El status quedaba 'pending' en la DB. Ahora lo hace un trigger
-- server-side al insertar la quote.
--
-- Problema 2: aceptar un presupuesto eran 3 updates sueltos desde el cliente
-- (no atómico, se podía aceptar más de uno, quedaba inconsistente si se
-- cortaba). Ahora es una función accept_quote() transaccional.

-- ── pending → quoted al insertar una quote ──
CREATE OR REPLACE FUNCTION public.set_request_quoted_on_quote()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.requests
    SET status = 'quoted'
    WHERE id = NEW.request_id AND status = 'pending';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_request_quoted ON public.quotes;
CREATE TRIGGER trg_set_request_quoted
  AFTER INSERT ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.set_request_quoted_on_quote();

-- ── Aceptación atómica de un presupuesto ──
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
    SET status = 'active'
    WHERE id = v_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_quote(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.accept_quote(uuid) TO authenticated;

-- Refuerzo del guard de columnas de quotes: el cliente NO puede setear
-- status='accepted' con un update directo (debe pasar por accept_quote,
-- que corre como definer). Sí puede rechazar. Reemplaza la versión anterior.
CREATE OR REPLACE FUNCTION public.protect_quote_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    NEW.amount      := OLD.amount;
    NEW.description := OLD.description;
    NEW.features    := OLD.features;
    NEW.request_id  := OLD.request_id;
    NEW.pro_id      := OLD.pro_id;
    NEW.created_at  := OLD.created_at;

    IF NEW.status = 'accepted' AND COALESCE(OLD.status, '') <> 'accepted' THEN
      RAISE EXCEPTION 'Usá accept_quote() para aceptar un presupuesto';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Backfill: solicitudes que ya tenían presupuestos pero quedaron en 'pending'
-- por el bug anterior de la transición.
UPDATE public.requests
  SET status = 'quoted'
  WHERE status = 'pending'
    AND EXISTS (SELECT 1 FROM public.quotes q WHERE q.request_id = requests.id);
