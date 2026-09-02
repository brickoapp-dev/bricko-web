-- Decisión de negocio (confirmada con el usuario, no inferida): el plazo
-- de observación por defecto de los hitos es 10 días corridos -- uso común
-- en contratos de obra en Argentina, da tiempo real de inspección sin
-- frenar demasiado el avance. Antes obra_preparacion.plazo_observacion_dias_default
-- no tenía default (NULL), lo que obligaba a cargarlo a mano en cada obra
-- antes de poder confirmar el plan por hitos (plan_hitos_confirmar() corta
-- si es NULL). El profesional sigue pudiendo cambiarlo por obra, y cada
-- hito individual sigue pudiendo tener su propio plazo_propio como
-- excepción (T4) -- esto solo fija el valor inicial sugerido.
ALTER TABLE public.obra_preparacion
  ALTER COLUMN plazo_observacion_dias_default SET DEFAULT 10;

UPDATE public.obra_preparacion
  SET plazo_observacion_dias_default = 10
  WHERE plazo_observacion_dias_default IS NULL;
