-- public.professionals es legible por CUALQUIER usuario autenticado (es el
-- directorio, policy "professionals_select" USING (true), ver
-- dedupe_rls_policies.sql). Las columnas dni_number/dni_front_url/dni_back_url
-- quedaron ahí desde pro_profile_fields.sql aunque professional_profile_fields.sql
-- ya había creado professional_verification (tabla privada) justamente para
-- estos datos. El código de la app nunca llegó a escribir/leer de la tabla
-- correcta (bug de nombre de archivo en properfil.html: cargaba
-- 'pro-perfil.js', que no existe, en vez de 'properfil.js'), así que en la
-- práctica el número de DNI y las fotos de cada profesional quedaban
-- expuestos a cualquier usuario logueado. Esta migración cierra el agujero.

ALTER TABLE public.professional_verification
  ADD COLUMN IF NOT EXISTS dni_number text;

-- 1) Backfill: llevar lo que haya en professionals a professional_verification.
INSERT INTO public.professional_verification (id, dni_number, dni_front_url, dni_back_url)
SELECT p.id, p.dni_number, p.dni_front_url, p.dni_back_url
FROM public.professionals p
WHERE (p.dni_number IS NOT NULL OR p.dni_front_url IS NOT NULL OR p.dni_back_url IS NOT NULL)
ON CONFLICT (id) DO UPDATE SET
  dni_number    = COALESCE(public.professional_verification.dni_number, EXCLUDED.dni_number),
  dni_front_url = COALESCE(public.professional_verification.dni_front_url, EXCLUDED.dni_front_url),
  dni_back_url  = COALESCE(public.professional_verification.dni_back_url, EXCLUDED.dni_back_url);

-- 2) Eliminar las columnas sensibles de la tabla pública.
ALTER TABLE public.professionals
  DROP COLUMN IF EXISTS dni_number,
  DROP COLUMN IF EXISTS dni_front_url,
  DROP COLUMN IF EXISTS dni_back_url;

-- 3) handle_new_user ya no debe insertar DNI en professionals (las columnas
--    no existen más). Los datos de verificación los sube el cliente después
--    del alta, directo contra professional_verification (RLS: solo el dueño).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rubros text[];
  v_oficio text;
BEGIN
  INSERT INTO public.profiles (id, first_name, last_name, phone, role, city, username, avatar_url, address, province)
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
    NEW.raw_user_meta_data->>'province'
  )
  ON CONFLICT (id) DO UPDATE SET
    username = COALESCE(EXCLUDED.username, public.profiles.username),
    avatar_url = COALESCE(EXCLUDED.avatar_url, public.profiles.avatar_url),
    address = COALESCE(EXCLUDED.address, public.profiles.address),
    province = COALESCE(EXCLUDED.province, public.profiles.province),
    city = COALESCE(EXCLUDED.city, public.profiles.city);

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
$$;
