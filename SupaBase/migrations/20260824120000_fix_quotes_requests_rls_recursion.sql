-- Fix: recursión infinita en RLS entre quotes y requests.
--
-- requests_select_awarded_pro (20260823120000) agregó una policy en
-- "requests" que subconsulta "quotes" directamente. Como quotes_select ya
-- subconsulta "requests", Postgres entra en un ciclo policy->policy que
-- termina en "infinite recursion detected in policy for relation quotes"
-- (42P17) ante CUALQUIER select sobre quotes o requests que dispare ambas
-- policies. Esto rompía por completo la carga de presupuestos/perfiles de
-- profesional en "Mis obras" (y cualquier otra pantalla que lea quotes).
--
-- Solución: mover el chequeo "¿este pro tiene una quote aceptada en esta
-- request?" a una función SECURITY DEFINER. Al ser SECURITY DEFINER (dueña
-- "postgres", que no tiene FORCE ROW LEVEL SECURITY sobre quotes), la
-- consulta interna no vuelve a evaluar quotes_select, cortando el ciclo.
-- Mismo patrón que get_quote_professionals (20260817120000).

CREATE OR REPLACE FUNCTION public.pro_has_accepted_quote(p_request_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.quotes q
    WHERE q.request_id = p_request_id
      AND q.pro_id = auth.uid()
      AND q.status = 'accepted'
  );
$$;

REVOKE ALL ON FUNCTION public.pro_has_accepted_quote(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pro_has_accepted_quote(uuid) TO authenticated;

DROP POLICY IF EXISTS "requests_select_awarded_pro" ON public.requests;
CREATE POLICY "requests_select_awarded_pro" ON public.requests
  FOR SELECT TO authenticated
  USING ( public.pro_has_accepted_quote(requests.id) );
