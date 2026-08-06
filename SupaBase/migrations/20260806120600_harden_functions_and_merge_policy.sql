-- Hardening final.

-- 1) Las funciones de trigger NO deben ser invocables como RPC vía PostgREST.
--    (Los triggers se disparan igual sin EXECUTE para los roles de API.)
REVOKE ALL ON FUNCTION public.assign_ticket_id()             FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user()              FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_request_quoted_on_quote()  FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_professional_columns() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_quote_columns()        FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_updated_at()               FROM public, anon, authenticated;

-- accept_quote SÍ es un RPC legítimo, pero solo para usuarios logueados.
REVOKE ALL ON FUNCTION public.accept_quote(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.accept_quote(uuid) TO authenticated;

-- 2) Unificar las dos policies de SELECT de requests en una sola (evita el
--    warning multiple_permissive_policies y es equivalente).
DROP POLICY IF EXISTS "requests_owner_select" ON public.requests;
DROP POLICY IF EXISTS "requests_pro_select_open" ON public.requests;

CREATE POLICY "requests_select" ON public.requests
  FOR SELECT TO authenticated
  USING (
    (select auth.uid()) = user_id
    OR (
      status IN ('pending', 'quoted')
      AND EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = (select auth.uid()))
    )
  );
