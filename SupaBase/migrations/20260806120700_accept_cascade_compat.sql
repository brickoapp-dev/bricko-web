-- Compatibilidad + integridad de la aceptación de presupuestos.
--
-- El RPC accept_quote() es la vía recomendada, pero el frontend desplegado
-- todavía acepta con un UPDATE directo (update quotes set status='accepted').
-- Para no romper producción y garantizar integridad venga de donde venga la
-- aceptación, la cascada la hace la propia DB con un trigger:
--   al pasar una quote a 'accepted' -> se rechazan las demás de esa solicitud
--   y la solicitud pasa a 'active'.
--
-- Por eso se quita el RAISE que bloqueaba el UPDATE directo (el trigger de
-- protección de columnas sigue impidiendo tocar amount/description/etc.).

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
REVOKE ALL ON FUNCTION public.protect_quote_columns() FROM public, anon, authenticated;

-- Cascada al aceptar (venga del RPC o de un UPDATE directo del dueño).
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
      SET status = 'active'
      WHERE id = NEW.request_id;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.cascade_on_quote_accepted() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS trg_cascade_on_quote_accepted ON public.quotes;
CREATE TRIGGER trg_cascade_on_quote_accepted
  AFTER UPDATE ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.cascade_on_quote_accepted();
