-- Rendimiento y consistencia.

-- Índices para foreign keys sin cubrir (evita seq scans en joins/borrados).
CREATE INDEX IF NOT EXISTS messages_sender_id_idx  ON public.messages (sender_id);
CREATE INDEX IF NOT EXISTS payments_request_id_idx ON public.payments (request_id);

-- Auto-actualización de updated_at (antes quedaba con el valor del INSERT).
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_requests_updated_at ON public.requests;
CREATE TRIGGER trg_requests_updated_at
  BEFORE UPDATE ON public.requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
