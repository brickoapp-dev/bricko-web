-- Resuelve [4]/[9] del diccionario de campos del contrato (contract-fields.js,
-- estado 'existe_no_expuesto'): el cliente y el profesional ya dieron su
-- email al registrarse (auth.users.email), pero profiles no lo guardaba y
-- profiles_select_own no deja leer el perfil de otro usuario -- ninguna de
-- las dos partes podía leer el email de la otra para el contrato.
--
-- Se agrega profiles.email (poblada por handle_new_user en el registro,
-- backfill para las cuentas existentes) y una RPC angosta,
-- get_contract_parties_email(), que expone el email de las dos partes de
-- una obra puntual SOLO a esas dos partes -- no se amplía
-- get_request_owners()/get_quote_professionals() (se usan en listados con
-- muchas filas; agregarles email ahí sería sobre-exponer un dato sensible
-- donde no hace falta).

ALTER TABLE public.profiles ADD COLUMN email text;

UPDATE public.profiles p SET email = u.email
FROM auth.users u WHERE u.id = p.id AND p.email IS NULL;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_rubros text[];
  v_oficio text;
BEGIN
  INSERT INTO public.profiles (id, first_name, last_name, phone, role, city, username, avatar_url, address, province, email)
  VALUES (
    NEW.id,
    coalesce(NEW.raw_user_meta_data->>'first_name', ''),
    coalesce(NEW.raw_user_meta_data->>'last_name', ''),
    NEW.raw_user_meta_data->>'phone',
    coalesce((NEW.raw_user_meta_data->>'role')::public.user_role, 'cliente'),
    coalesce(NEW.raw_user_meta_data->>'city', ''),
    NEW.raw_user_meta_data->>'username',
    NEW.raw_user_meta_data->>'avatar_url',
    NEW.raw_user_meta_data->>'address',
    NEW.raw_user_meta_data->>'province',
    NEW.email
  )
  ON CONFLICT (id) DO UPDATE SET
    username = COALESCE(EXCLUDED.username, public.profiles.username),
    avatar_url = COALESCE(EXCLUDED.avatar_url, public.profiles.avatar_url),
    address = COALESCE(EXCLUDED.address, public.profiles.address),
    province = COALESCE(EXCLUDED.province, public.profiles.province),
    city = COALESCE(EXCLUDED.city, public.profiles.city),
    email = COALESCE(EXCLUDED.email, public.profiles.email);

  IF coalesce(NEW.raw_user_meta_data->>'role', '') = 'profesional' THEN
    v_oficio := NEW.raw_user_meta_data->>'oficio';
    IF NEW.raw_user_meta_data->'rubros' IS NOT NULL THEN
      SELECT ARRAY(SELECT jsonb_array_elements_text(NEW.raw_user_meta_data->'rubros')) INTO v_rubros;
    ELSIF v_oficio IS NOT NULL THEN
      v_rubros := ARRAY[v_oficio];
    ELSE
      v_rubros := '{}';
    END IF;

    INSERT INTO public.professionals (id, rubro, rubros)
    VALUES (
      NEW.id,
      coalesce(v_oficio, v_rubros[1], 'albanileria'),
      v_rubros
    )
    ON CONFLICT (id) DO UPDATE SET
      rubros = CASE WHEN array_length(EXCLUDED.rubros, 1) > 0 THEN EXCLUDED.rubros ELSE public.professionals.rubros END;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_contract_parties_email(p_request_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'cliente_email', (SELECT p.email FROM public.profiles p JOIN public.requests r ON r.user_id = p.id WHERE r.id = p_request_id),
    'contratista_email', (SELECT p.email FROM public.profiles p JOIN public.obra_preparacion op ON op.pro_id = p.id WHERE op.request_id = p_request_id)
  )
  WHERE EXISTS (
    SELECT 1 FROM public.requests r WHERE r.id = p_request_id AND r.user_id = auth.uid()
  ) OR public.pro_has_accepted_quote(p_request_id);
$function$;

REVOKE ALL ON FUNCTION public.get_contract_parties_email(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_contract_parties_email(uuid) TO authenticated;
