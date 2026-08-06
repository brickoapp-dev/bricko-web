-- Deduplicación de políticas RLS (había un set en inglés y otro en español
-- por tabla → 30+ warnings del linter: multiple_permissive_policies y
-- auth_rls_initplan, porque las de inglés usaban auth.uid() sin envolver).
-- Se deja un único set normalizado que usa (select auth.uid()).

-- ── profiles ──────────────────────────────────────────
DROP POLICY IF EXISTS "Los usuarios ven su propio perfil" ON public.profiles;
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
DROP POLICY IF EXISTS "Los usuarios actualizan su propio perfil" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;

CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT TO authenticated USING ((select auth.uid()) = id);
CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = id);
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = id) WITH CHECK ((select auth.uid()) = id);

-- ── professionals ─────────────────────────────────────
-- Lectura: se restringe a autenticados (antes era pública/anon y exponía
-- matrícula, verified, rating a cualquiera con la anon key).
DROP POLICY IF EXISTS "Anyone can read professionals" ON public.professionals;
DROP POLICY IF EXISTS "Cualquiera puede leer profesionales (lista pública)" ON public.professionals;
DROP POLICY IF EXISTS "Authenticated can insert professionals" ON public.professionals;
DROP POLICY IF EXISTS "Users can insert own professional profile" ON public.professionals;
DROP POLICY IF EXISTS "El profesional actualiza solo su propia ficha" ON public.professionals;
DROP POLICY IF EXISTS "Users can update own professional profile" ON public.professionals;

CREATE POLICY "professionals_select" ON public.professionals
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "professionals_insert_own" ON public.professionals
  FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = id);
CREATE POLICY "professionals_update_own" ON public.professionals
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = id) WITH CHECK ((select auth.uid()) = id);

-- ── quotes ────────────────────────────────────────────
DROP POLICY IF EXISTS "Profesional crea sus propios quotes" ON public.quotes;
DROP POLICY IF EXISTS "Pros can insert quotes" ON public.quotes;
DROP POLICY IF EXISTS "Cliente ve quotes de sus solicitudes" ON public.quotes;
DROP POLICY IF EXISTS "Clients can read their quotes" ON public.quotes;
DROP POLICY IF EXISTS "Profesional ve sus propios quotes" ON public.quotes;
DROP POLICY IF EXISTS "Clients can update quote status" ON public.quotes;

CREATE POLICY "quotes_pro_insert" ON public.quotes
  FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = pro_id);

-- El pro ve sus propios quotes; el cliente ve los quotes de sus solicitudes
CREATE POLICY "quotes_select" ON public.quotes
  FOR SELECT TO authenticated
  USING (
    (select auth.uid()) = pro_id
    OR EXISTS (
      SELECT 1 FROM public.requests r
      WHERE r.id = quotes.request_id AND r.user_id = (select auth.uid())
    )
  );

-- El cliente puede tocar los quotes de sus solicitudes (aceptar/rechazar).
-- La restricción a solo-columna `status` la impone un trigger (ver migración de columnas protegidas).
CREATE POLICY "quotes_client_update" ON public.quotes
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.requests r
      WHERE r.id = quotes.request_id AND r.user_id = (select auth.uid())
    )
  );
