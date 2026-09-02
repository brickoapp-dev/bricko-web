-- Fix de dos hallazgos de get_advisors() detectados al aplicar la
-- migración de T6 (no son de esta tarea, pero se corrigen apenas se
-- detectan):
--
-- 1) modalidad_requisitos (T5) quedó con RLS deshabilitado por completo
--    -- ERROR de seguridad: cualquier rol con acceso por default a
--    schemas expuestos podía potencialmente escribir sobre el mapa de
--    requisitos por modalidad. Se habilita RLS con una policy de
--    SELECT únicamente (es data de referencia, la mantienen las
--    migraciones, no un cliente).
-- 2) Los triggers-función de T5 (trg_recalc_participante_from_doc/
--    _from_modalidad) no tenían REVOKE: quedaban invocables como RPC
--    directa por "anon"/"authenticated" (aunque solo están pensadas
--    para dispararse como trigger). Se revoca EXECUTE explícito.

ALTER TABLE public.modalidad_requisitos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "modalidad_requisitos_select" ON public.modalidad_requisitos
  FOR SELECT TO authenticated
  USING (true);

REVOKE ALL ON FUNCTION public.trg_recalc_participante_from_doc() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_recalc_participante_from_modalidad() FROM PUBLIC, anon, authenticated;
