-- T1: campos [1],[2],[3],[5] del contrato en el perfil del cliente
-- (client-perfil.html). Confirmado contra producción antes de escribir
-- esto: profiles no tenía ninguna de estas columnas (razon_social,
-- tipo_persona, dni, cuit, usa_domicilio_alt, domicilio_contractual_alt,
-- caracter_inmueble, caracter_inmueble_aclaracion).
--
-- Formato validado a nivel DB (dígitos únicamente, sin guiones/puntos);
-- el dígito verificador de CUIT (módulo 11) y la obligatoriedad
-- condicional (DNI si es persona humana, aclaración si el carácter no es
-- "propietario") se validan en client-perfil.js antes de guardar -- no
-- se agregó como CHECK porque todas las filas existentes hoy tienen
-- estos campos en null y una constraint condicional los rompería en el
-- momento de aplicar la migración.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS razon_social text,
  ADD COLUMN IF NOT EXISTS tipo_persona text NOT NULL DEFAULT 'humana'
    CHECK (tipo_persona IN ('humana', 'juridica')),
  ADD COLUMN IF NOT EXISTS dni text
    CHECK (dni IS NULL OR dni ~ '^[0-9]{7,8}$'),
  ADD COLUMN IF NOT EXISTS cuit text
    CHECK (cuit IS NULL OR cuit ~ '^[0-9]{11}$'),
  ADD COLUMN IF NOT EXISTS usa_domicilio_alt boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS domicilio_contractual_alt text,
  ADD COLUMN IF NOT EXISTS caracter_inmueble text
    CHECK (caracter_inmueble IS NULL OR caracter_inmueble IN (
      'propietario', 'copropietario', 'poseedor',
      'inquilino_autorizado', 'representante_apoderado', 'administrador_consorcio'
    )),
  ADD COLUMN IF NOT EXISTS caracter_inmueble_aclaracion text;
