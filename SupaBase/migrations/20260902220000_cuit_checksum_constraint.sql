-- T-checklist: "CUIT inválido no se guarda (validación de dígito
-- verificador)". client-perfil.js y properfil.js ya validan el checksum
-- módulo 11 en el cliente y frenan el guardado (save() corta si
-- validateIdentityFields() da false), pero profiles/professional_verification
-- se actualizan por policy UPDATE normal (no por RPC) -- un POST directo a
-- PostgREST evitando la UI podía persistir un CUIT con formato válido
-- (11 dígitos) pero dígito verificador incorrecto. Mismo algoritmo que
-- validarCuit() en JS, para no divergir entre cliente y base.
CREATE OR REPLACE FUNCTION public.es_cuit_valido(p_cuit text)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  mult int[] := ARRAY[5,4,3,2,7,6,5,4,3,2];
  suma int := 0;
  i int;
  verificador int;
BEGIN
  IF p_cuit IS NULL THEN RETURN true; END IF;
  IF p_cuit !~ '^[0-9]{11}$' THEN RETURN false; END IF;
  FOR i IN 1..10 LOOP
    suma := suma + (substr(p_cuit, i, 1)::int * mult[i]);
  END LOOP;
  verificador := 11 - (suma % 11);
  IF verificador = 11 THEN verificador := 0; END IF;
  IF verificador = 10 THEN RETURN false; END IF;
  RETURN verificador = substr(p_cuit, 11, 1)::int;
END;
$function$;

ALTER TABLE public.profiles DROP CONSTRAINT profiles_cuit_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_cuit_check CHECK (public.es_cuit_valido(cuit));

ALTER TABLE public.professional_verification DROP CONSTRAINT professional_verification_cuit_check;
ALTER TABLE public.professional_verification ADD CONSTRAINT professional_verification_cuit_check CHECK (public.es_cuit_valido(cuit));
