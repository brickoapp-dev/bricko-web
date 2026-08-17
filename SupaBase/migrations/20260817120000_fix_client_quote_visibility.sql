-- Fix: el cliente no veía los presupuestos recibidos en "Mis obras".
--
-- Causa 1: mis-obras.js y client-solicitud.js pedían
--   profiles!quotes_pro_id_fkey(...)
-- pero esa FK (quotes.pro_id → professionals.id) no apunta a profiles, y
-- además pedían una columna "email" que no existe en profiles. PostgREST
-- rechazaba el select completo → 0 presupuestos mostrados (el error se
-- silenciaba con console.warn o se ignoraba directamente).
--
-- Causa 2 (de fondo, independiente de la anterior): aunque se arregle el
-- embed, "profiles_select_own" solo deja leer el propio perfil. El cliente
-- nunca podría ver first_name/last_name del profesional que cotizó. Se
-- resuelve con una función SECURITY DEFINER que expone únicamente
-- nombre/apellido, y solo de profesionales que cotizaron en solicitudes del
-- que llama — no amplía la policy de profiles (evita exponer phone/address/
-- city/province/username a terceros).

CREATE OR REPLACE FUNCTION public.get_quote_professionals(p_request_ids uuid[])
RETURNS TABLE(pro_id uuid, first_name text, last_name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.first_name, p.last_name
  FROM public.profiles p
  WHERE p.id IN (
    SELECT q.pro_id
    FROM public.quotes q
    JOIN public.requests r ON r.id = q.request_id
    WHERE q.request_id = ANY(p_request_ids)
      AND r.user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.get_quote_professionals(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_quote_professionals(uuid[]) TO authenticated;
