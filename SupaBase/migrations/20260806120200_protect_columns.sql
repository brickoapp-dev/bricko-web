-- Protección de columnas sensibles a nivel de DB.
-- RLS controla QUÉ filas se tocan, pero no QUÉ columnas; estos triggers
-- impiden que el cliente/pro modifique campos que no le corresponden.
-- Los roles privilegiados (service_role, postgres) no se ven afectados.

-- ── professionals: un pro NO puede auto-verificarse ni tocar su rating/jobs ──
-- SECURITY INVOKER (default) a propósito: con SECURITY DEFINER, current_user
-- pasaría a ser el dueño de la función (postgres) y la comprobación de rol
-- nunca se cumpliría. Con INVOKER, current_user es el rol real que ejecuta
-- el UPDATE (authenticated / service_role / postgres).
CREATE OR REPLACE FUNCTION public.protect_professional_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    NEW.verified       := OLD.verified;
    NEW.rating         := OLD.rating;
    NEW.jobs_completed := OLD.jobs_completed;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_professional_columns ON public.professionals;
CREATE TRIGGER trg_protect_professional_columns
  BEFORE UPDATE ON public.professionals
  FOR EACH ROW EXECUTE FUNCTION public.protect_professional_columns();

-- ── quotes: el cliente solo puede cambiar `status`, no el monto ni el resto ──
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
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_quote_columns ON public.quotes;
CREATE TRIGGER trg_protect_quote_columns
  BEFORE UPDATE ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.protect_quote_columns();

-- ── Integridad: como máximo un presupuesto aceptado por solicitud ──
CREATE UNIQUE INDEX IF NOT EXISTS one_accepted_quote_per_request
  ON public.quotes (request_id)
  WHERE status = 'accepted';
