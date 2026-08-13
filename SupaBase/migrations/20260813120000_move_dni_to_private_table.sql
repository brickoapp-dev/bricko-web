-- NOTA: esta migración se reescribió después de inspeccionar el esquema
-- real en producción vía el SQL editor -- el archivo original asumía que
-- pro_profile_fields.sql (20260807120000) se había aplicado, pero en los
-- hechos public.profiles NUNCA tuvo username/address/province, y
-- public.professionals NUNCA tuvo dni_number/dni_front_url/dni_back_url.
-- Esas columnas simplemente no existen en producción: no hay nada que
-- migrar/backfillear ni columnas que borrar de professionals. Lo único que
-- falta de verdad es lo de abajo.

-- profiles: username/address/province los pide el formulario de registro y
-- el dashboard (01-auth.js, properfil.js) pero la tabla real nunca los tuvo
-- -- el upsert del cliente fallaba en silencio (columna inexistente) y solo
-- quedaba lo que el trigger alcanzaba a insertar (first_name/last_name/
-- phone/role/city).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username text UNIQUE,
  ADD COLUMN IF NOT EXISTS address  text,
  ADD COLUMN IF NOT EXISTS province text;

-- professional_verification: el número de DNI es un dato tan sensible como
-- las fotos (que ya vivían acá) y no debe terminar en professionals, que
-- cualquier autenticado puede leer vía la policy "professionals_select"
-- (USING (true) -- es el directorio).
ALTER TABLE public.professional_verification
  ADD COLUMN IF NOT EXISTS dni_number text;

-- handle_new_user: crea el perfil (con los campos nuevos) al registrarse.
-- El DNI (número + fotos) NO se toca acá -- lo sube el cliente ya
-- autenticado, directo contra professional_verification (RLS: solo dueño).
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
