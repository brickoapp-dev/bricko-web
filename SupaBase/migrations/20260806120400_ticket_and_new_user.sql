-- 1) ticket_id autoritativo en el servidor.
--    Antes se generaba en el cliente con random de 4 dígitos (BX-YYYY-NNNN),
--    con alto riesgo de colisión contra el UNIQUE. La función generate_ticket_id
--    existía pero no estaba enganchada a nada (código muerto + search_path mutable).
--    Ahora un trigger BEFORE INSERT asigna un ticket único (6 dígitos, verificado),
--    ignorando lo que mande el cliente.

DROP FUNCTION IF EXISTS public.generate_ticket_id();

CREATE OR REPLACE FUNCTION public.assign_ticket_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  candidate text;
  tries int := 0;
BEGIN
  LOOP
    candidate := 'BX-' || to_char(now(), 'YYYY') || '-' ||
                 lpad(floor(random() * 1000000)::int::text, 6, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.requests WHERE ticket_id = candidate);
    tries := tries + 1;
    IF tries > 20 THEN
      -- fallback prácticamente sin colisión
      candidate := 'BX-' || to_char(now(), 'YYYY') || '-' ||
                   substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);
      EXIT;
    END IF;
  END LOOP;
  NEW.ticket_id := candidate;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_ticket_id ON public.requests;
CREATE TRIGGER trg_assign_ticket_id
  BEFORE INSERT ON public.requests
  FOR EACH ROW EXECUTE FUNCTION public.assign_ticket_id();

-- 2) Creación automática de perfil al registrarse.
--    Antes el perfil se creaba desde el cliente después del signUp; si fallaba
--    o el usuario cerraba, quedaba un auth.user huérfano sin profile. Ahora lo
--    garantiza un trigger sobre auth.users, leyendo la metadata del signUp.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, first_name, last_name, phone, role, city)
  VALUES (
    NEW.id,
    coalesce(NEW.raw_user_meta_data->>'first_name', ''),
    coalesce(NEW.raw_user_meta_data->>'last_name', ''),
    NEW.raw_user_meta_data->>'phone',
    coalesce((NEW.raw_user_meta_data->>'role')::public.user_role, 'cliente'),
    ''
  )
  ON CONFLICT (id) DO NOTHING;

  IF coalesce(NEW.raw_user_meta_data->>'role', '') = 'profesional'
     AND NEW.raw_user_meta_data->>'oficio' IS NOT NULL THEN
    INSERT INTO public.professionals (id, rubro)
    VALUES (NEW.id, NEW.raw_user_meta_data->>'oficio')
    ON CONFLICT (id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
