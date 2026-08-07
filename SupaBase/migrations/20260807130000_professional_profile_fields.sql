-- Campos de perfil profesional (basado en los parámetros del perfil en pro.html:
-- foto/avatar, oficio/rubro, + datos de verificación pedidos).
--
-- IMPORTANTE: professionals tiene RLS de lectura USING (true) — todos los
-- autenticados leen todas las filas (directorio). Por eso los datos sensibles
-- (DNI, dirección exacta) NO van acá: van en una tabla privada aparte.

-- ── Directorio (visible para autenticados) ──
ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS rubros     text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS localidad  text,
  ADD COLUMN IF NOT EXISTS residencia text;

-- Migrar el rubro único existente a la lista rubros[].
UPDATE public.professionals
  SET rubros = ARRAY[rubro]
  WHERE rubro IS NOT NULL AND rubro <> '' AND (rubros IS NULL OR rubros = '{}');

-- ── Datos sensibles: tabla privada, solo el dueño (y service_role) la ve ──
CREATE TABLE IF NOT EXISTS public.professional_verification (
  id           uuid PRIMARY KEY REFERENCES public.professionals(id) ON DELETE CASCADE,
  dni_front_url text,
  dni_back_url  text,
  direccion     text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.professional_verification ENABLE ROW LEVEL SECURITY;

-- Solo el propio profesional lee/escribe sus documentos. El resto de usuarios,
-- ni ven la fila. El service_role (panel admin/verificación) bypasea RLS.
CREATE POLICY "prof_verif_select_own" ON public.professional_verification
  FOR SELECT TO authenticated USING ((select auth.uid()) = id);
CREATE POLICY "prof_verif_insert_own" ON public.professional_verification
  FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = id);
CREATE POLICY "prof_verif_update_own" ON public.professional_verification
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = id) WITH CHECK ((select auth.uid()) = id);

DROP TRIGGER IF EXISTS trg_prof_verif_updated_at ON public.professional_verification;
CREATE TRIGGER trg_prof_verif_updated_at
  BEFORE UPDATE ON public.professional_verification
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
