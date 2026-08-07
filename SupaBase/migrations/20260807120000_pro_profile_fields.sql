-- Migration: Add extended profile & professional fields for registration & onboarding

-- 1) Extend public.profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username text UNIQUE,
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS province text;

-- 2) Extend public.professionals
ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS rubros text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS dni_number text,
  ADD COLUMN IF NOT EXISTS dni_front_url text,
  ADD COLUMN IF NOT EXISTS dni_back_url text;

-- 3) Update handle_new_user trigger to save new fields from metadata
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

    INSERT INTO public.professionals (id, rubro, rubros, dni_number, dni_front_url, dni_back_url)
    VALUES (
      NEW.id,
      coalesce(v_oficio, v_rubros[1], 'albanileria'),
      v_rubros,
      NEW.raw_user_meta_data->>'dni_number',
      NEW.raw_user_meta_data->>'dni_front_url',
      NEW.raw_user_meta_data->>'dni_back_url'
    )
    ON CONFLICT (id) DO UPDATE SET
      rubros = CASE WHEN array_length(EXCLUDED.rubros, 1) > 0 THEN EXCLUDED.rubros ELSE public.professionals.rubros END,
      dni_number = COALESCE(EXCLUDED.dni_number, public.professionals.dni_number),
      dni_front_url = COALESCE(EXCLUDED.dni_front_url, public.professionals.dni_front_url),
      dni_back_url = COALESCE(EXCLUDED.dni_back_url, public.professionals.dni_back_url);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
