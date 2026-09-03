-- QA en navegador: probando el flujo de "nuevas oportunidades" del
-- profesional apareció "Cliente: ." en cada tarjeta -- un punto, nada más.
-- pro-dashboard.js y pro-cotizar.js piden profiles!requests_user_id_fkey
-- (first_name/last_name/city/province) embebido en el select de requests.
-- profiles_select_own solo deja leer el propio perfil (auth.uid() = id);
-- para cualquier request ajena PostgREST no falla la query entera, pero
-- el embed vuelve null -- de ahí que la plantilla de nombre
-- (first_name + ' ' + last_name[0] + '.') dé exactamente "." (string no
-- vacío, así que el || 'Cliente' de respaldo nunca se activa) y que el
-- filtro de ciudad/provincia del dashboard nunca matchee nada por ese
-- campo. Mismo patrón que get_quote_professionals() (dirección opuesta,
-- para que el cliente vea el nombre de los profesionales que cotizaron):
-- una RPC SECURITY DEFINER que expone solo nombre/apellido/ciudad/
-- provincia, y solo para las mismas requests que ya son visibles para
-- el profesional según requests_select (pendiente/cotizada mientras es
-- profesional verificado, o ya adjudicada a él).
CREATE OR REPLACE FUNCTION public.get_request_owners(p_request_ids uuid[])
 RETURNS TABLE(request_id uuid, first_name text, last_name text, city text, province text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT r.id, p.first_name, p.last_name, p.city, p.province
  FROM public.requests r
  JOIN public.profiles p ON p.id = r.user_id
  WHERE r.id = ANY(p_request_ids)
    AND (
      r.user_id = auth.uid()
      OR (
        r.status = ANY (ARRAY['pending'::request_status, 'quoted'::request_status])
        AND EXISTS (SELECT 1 FROM public.professionals prof WHERE prof.id = auth.uid())
      )
      OR public.pro_has_accepted_quote(r.id)
    );
$function$;

REVOKE ALL ON FUNCTION public.get_request_owners(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_request_owners(uuid[]) TO authenticated;
