-- Fix crítico de privacidad en public.requests
--
-- Antes: la policy "Users can read requests" estaba para el rol `public`
-- (incluye `anon`) con la condición `auth.uid() = user_id OR status <> 'cancelled'`,
-- lo que permitía a CUALQUIER visitante con la anon key leer todas las
-- solicitudes con dirección y descripción. "Pros can read open requests"
-- también estaba abierta a `anon`.
--
-- Ahora: acceso solo para usuarios autenticados. El dueño ve sus solicitudes;
-- un profesional autenticado ve solo las abiertas (pending/quoted) para el feed.

-- Limpieza de las tres policies de SELECT existentes (duplicadas + inseguras)
DROP POLICY IF EXISTS "El usuario ve sus propias solicitudes" ON public.requests;
DROP POLICY IF EXISTS "Pros can read open requests" ON public.requests;
DROP POLICY IF EXISTS "Users can read requests" ON public.requests;

-- El dueño ve sus propias solicitudes (cualquier estado)
CREATE POLICY "requests_owner_select" ON public.requests
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

-- Un profesional autenticado ve solo las solicitudes abiertas (feed)
CREATE POLICY "requests_pro_select_open" ON public.requests
  FOR SELECT TO authenticated
  USING (
    status IN ('pending', 'quoted')
    AND EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = (select auth.uid()))
  );

-- INSERT: dedupe (queda una sola, autenticado, para sí mismo)
DROP POLICY IF EXISTS "El usuario crea solicitudes para sí mismo" ON public.requests;
DROP POLICY IF EXISTS "Users can insert own requests" ON public.requests;
CREATE POLICY "requests_owner_insert" ON public.requests
  FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

-- UPDATE: el dueño actualiza sus propias solicitudes (se recrea normalizada)
DROP POLICY IF EXISTS "El usuario actualiza sus propias solicitudes" ON public.requests;
CREATE POLICY "requests_owner_update" ON public.requests
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);
