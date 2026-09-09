-- QA en navegador probando el envío real del contrato: los campos [1]-[3],[5]
-- del comitente aparecían "vacío" para el profesional aunque ya estaban
-- cargados en profiles -- mismo bug que get_request_owners()/get_quote_professionals()
-- ya habían resuelto para nombre/ciudad (…_get_request_owners.sql), pero acá
-- sin corregir: getContractData() (contract-data.js) lee el perfil del
-- cliente con un SELECT directo a "profiles" desde la sesión del
-- profesional, y profiles_select_own solo deja leer el propio perfil --
-- PostgREST no falla, devuelve null, y todo el bloque PARTES/COMITENTE
-- del contrato quedaba marcado "vacío" para siempre.
--
-- Se agrega una RPC angosta y específica del contrato (no se reutiliza
-- get_request_owners(): esa se llama para listados con varias filas de
-- oportunidades/ofertas y no debería devolver DNI/CUIT/domicilio ahí).

CREATE OR REPLACE FUNCTION public.get_contract_client_profile(p_request_id uuid)
RETURNS TABLE(
  first_name text, last_name text, razon_social text, tipo_persona text,
  dni text, cuit text, address text, usa_domicilio_alt boolean,
  domicilio_contractual text, caracter_inmueble text, caracter_inmueble_detalle text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT p.first_name, p.last_name, p.razon_social, p.tipo_persona,
         p.dni, p.cuit, p.address, p.usa_domicilio_alt,
         p.domicilio_contractual, p.caracter_inmueble, p.caracter_inmueble_detalle
  FROM public.profiles p
  JOIN public.requests r ON r.user_id = p.id
  WHERE r.id = p_request_id AND public.pro_has_accepted_quote(p_request_id);
$function$;

REVOKE ALL ON FUNCTION public.get_contract_client_profile(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_contract_client_profile(uuid) TO authenticated;
