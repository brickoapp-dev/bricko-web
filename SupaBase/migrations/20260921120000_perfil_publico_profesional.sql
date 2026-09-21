-- Perfil público del profesional, visible para el cliente que recibió su
-- presupuesto.
--
-- Dos pedidos del usuario, con la misma causa de fondo:
--
--   1) En "Mis obras" / el detalle de una solicitud, cada presupuesto
--      recibido mostraba SIEMPRE la inicial del profesional en el círculo
--      naranja, nunca su foto. No era un bug de CSS: `get_quote_professionals()`
--      (…_fix_client_quote_visibility.sql) devolvía únicamente
--      first_name/last_name. `profiles_select_own` impide que el cliente lea
--      `profiles.avatar_url` de un tercero, así que la foto nunca llegaba al
--      front y `renderAvatarChip` no tenía nada que mostrar.
--
--   2) El cliente no tenía forma de saber QUIÉN es el profesional que le
--      cotizó: ni rubros, ni localidad, ni si está verificado, ni qué obras
--      hizo antes. Toda esa información existe (`professionals` es legible por
--      cualquier autenticado: `professionals_select … USING (true)`), pero el
--      nombre y la foto viven en `profiles`, que no lo es, y las obras
--      anteriores viven en `requests`, cuya policy solo deja ver las propias.
--
-- Se resuelve con el mismo patrón que ya usan `get_quote_professionals()` y
-- `get_request_owners()`: funciones SECURITY DEFINER que exponen un subconjunto
-- explícito de campos, solo a quien tiene una relación real con ese
-- profesional — NO se amplía ninguna policy (si se ampliara `profiles_select`,
-- quedarían expuestos phone/address/dni/cuit/domicilio a cualquier autenticado).
--
-- Qué se considera público acá: nombre, foto, razón social, rubros, localidad,
-- verificado, rating, antigüedad y el recuento/listado de obras adjudicadas
-- (título, tipo, rubros, superficie, ciudad/provincia, estado y avance). Qué
-- NO: DNI/CUIT, domicilio, matrícula, teléfono, email, montos de cualquier
-- presupuesto u hito, y el nombre o la dirección del cliente de esas obras.
-- Mismo criterio que `carpeta_publica()` tras …_carpeta_publica_sin_pii_contrato.sql
-- (que sí expone localidad, por eso ciudad/provincia se consideran públicas).

-- ── Quién puede ver el perfil público de un profesional ──────────────────
-- El propio profesional, o un cliente que recibió al menos un presupuesto
-- suyo (cualquiera sea el estado: pendiente, aceptado o rechazado — el
-- cliente tiene que poder mirar el perfil ANTES de decidir).
CREATE OR REPLACE FUNCTION public.puede_ver_perfil_pro(p_pro_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    auth.uid() = p_pro_id
    OR EXISTS (
      SELECT 1
      FROM public.quotes q
      JOIN public.requests r ON r.id = q.request_id
      WHERE q.pro_id = p_pro_id
        AND r.user_id = auth.uid()
    )
  );
$$;

REVOKE ALL ON FUNCTION public.puede_ver_perfil_pro(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.puede_ver_perfil_pro(uuid) TO authenticated;

-- ── [1] La miniatura en la tarjeta del presupuesto ───────────────────────
-- Se agrega avatar_url al resultado. Hay que DROP + CREATE: PostgreSQL no
-- deja cambiar el tipo de retorno de una función con CREATE OR REPLACE.
--
-- La foto sale de `profiles.avatar_url`, NO de `professionals.avatar_url`:
-- esa segunda columna existe (…_professional_profile_fields.sql) pero ninguna
-- pantalla la escribe — properfil.js guarda siempre en `profiles` — así que
-- en producción está vacía o desactualizada (confirmado 2026-09-21: un pro
-- tiene ahí un .jpg viejo mientras su foto real es un .png posterior).
DROP FUNCTION IF EXISTS public.get_quote_professionals(uuid[]);

CREATE FUNCTION public.get_quote_professionals(p_request_ids uuid[])
RETURNS TABLE(pro_id uuid, first_name text, last_name text, avatar_url text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.first_name, p.last_name, p.avatar_url
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

-- ── [2a] Ficha pública del profesional ───────────────────────────────────
-- `obras_*` se cuentan desde `quotes`/`requests` en vez de leer
-- `professionals.jobs_completed`: esa columna está protegida contra escritura
-- del propio pro (…_protect_columns.sql) pero ningún trigger ni RPC la
-- incrementa, así que vale 0 para todos. Contarlas al vuelo es el único dato
-- real. `rating` sí se devuelve tal cual está en la tabla — hoy no hay sistema
-- de reseñas que la alimente (queda en su default), y por eso el front no
-- muestra estrellas mientras no haya obras finalizadas.
CREATE OR REPLACE FUNCTION public.get_public_pro_profile(p_pro_id uuid)
RETURNS TABLE(
  pro_id            uuid,
  first_name        text,
  last_name         text,
  avatar_url        text,
  razon_social      text,
  rubro             text,
  rubros            text[],
  localidad         text,
  residencia        text,
  verified          boolean,
  rating            numeric,
  years_experience  integer,
  bio               text,
  miembro_desde     timestamptz,
  obras_adjudicadas integer,
  obras_finalizadas integer,
  obras_en_curso    integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    pro.id,
    pf.first_name,
    pf.last_name,
    pf.avatar_url,
    pf.razon_social,
    pro.rubro,
    pro.rubros,
    pro.localidad,
    pro.residencia,
    pro.verified,
    pro.rating,
    pro.years_experience,
    pro.bio,
    pro.created_at,
    (SELECT count(*)::int FROM public.quotes q JOIN public.requests r ON r.id = q.request_id
      WHERE q.pro_id = pro.id AND q.status = 'accepted'),
    (SELECT count(*)::int FROM public.quotes q JOIN public.requests r ON r.id = q.request_id
      WHERE q.pro_id = pro.id AND q.status = 'accepted' AND r.status = 'done'),
    (SELECT count(*)::int FROM public.quotes q JOIN public.requests r ON r.id = q.request_id
      WHERE q.pro_id = pro.id AND q.status = 'accepted' AND r.status IN ('preparing', 'active'))
  FROM public.professionals pro
  JOIN public.profiles pf ON pf.id = pro.id
  WHERE pro.id = p_pro_id
    AND public.puede_ver_perfil_pro(p_pro_id);
$$;

REVOKE ALL ON FUNCTION public.get_public_pro_profile(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_public_pro_profile(uuid) TO authenticated;

-- ── [2b] Trabajos anteriores del profesional ─────────────────────────────
-- Solo obras que le fueron adjudicadas (presupuesto aceptado). Sin dirección,
-- sin descripción (texto libre del cliente, puede tener datos de contacto),
-- sin montos y sin ningún dato del cliente dueño de la obra. El avance sale
-- del promedio de `hitos.avance_pct`, igual que `attachAvance()` en
-- mis-obras.js.
CREATE OR REPLACE FUNCTION public.get_public_pro_trabajos(p_pro_id uuid)
RETURNS TABLE(
  request_id   uuid,
  ticket_id    text,
  titulo       text,
  tipo         text,
  rubros       text[],
  superficie   integer,
  ciudad       text,
  provincia    text,
  status       text,
  iniciada_en  timestamptz,
  actualizada_en timestamptz,
  avance_pct   integer,
  hitos_total  integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    r.id,
    r.ticket_id,
    r.titulo,
    r.tipo::text,
    r.rubros,
    r.superficie,
    r.ciudad,
    r.provincia,
    r.status::text,
    r.created_at,
    r.updated_at,
    (SELECT round(avg(h.avance_pct))::int FROM public.hitos h WHERE h.request_id = r.id),
    (SELECT count(*)::int FROM public.hitos h WHERE h.request_id = r.id)
  FROM public.requests r
  JOIN public.quotes q ON q.request_id = r.id
  WHERE q.pro_id = p_pro_id
    AND q.status = 'accepted'
    AND r.status IN ('preparing', 'active', 'done')
    AND public.puede_ver_perfil_pro(p_pro_id)
  ORDER BY (r.status = 'done') DESC, r.updated_at DESC;
$$;

REVOKE ALL ON FUNCTION public.get_public_pro_trabajos(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_public_pro_trabajos(uuid) TO authenticated;
