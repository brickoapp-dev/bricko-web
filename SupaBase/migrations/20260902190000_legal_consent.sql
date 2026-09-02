-- T7: consentimiento de Términos y Condiciones / Política de Privacidad
-- en el registro. Guarda versión + fecha/hora (UTC) aceptadas, para
-- poder pedir re-consentimiento el día que suba la versión del
-- documento (el chequeo queda escrito en scripts/legal-versions.js,
-- sin aplicarlo todavía -- ver needsReconsent()).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS terminos_version text,
  ADD COLUMN IF NOT EXISTS terminos_aceptado_en timestamptz,
  ADD COLUMN IF NOT EXISTS privacidad_version text,
  ADD COLUMN IF NOT EXISTS privacidad_leida_en timestamptz;
