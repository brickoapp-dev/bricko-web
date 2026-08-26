-- ================================================================
-- Vincula el directorio "Mi equipo" (pro_equipo) con los
-- participantes asignados a cada hito (hito_participantes).
--
-- Antes, asignar a alguien a una obra (pro-preobra.html, paso
-- "Participantes y encuadre") era un formulario de texto libre sin
-- ninguna relación con "Mi equipo": el profesional retipeaba nombre,
-- especialidad y modalidad de una persona que ya tenía cargada en su
-- directorio. Con esta columna, el formulario puede elegir a alguien
-- de pro_equipo y la fila queda trazable a esa persona.
-- ================================================================

ALTER TABLE public.hito_participantes
  ADD COLUMN equipo_id uuid REFERENCES public.pro_equipo(id) ON DELETE SET NULL;

CREATE INDEX hito_participantes_equipo_id_idx ON public.hito_participantes(equipo_id);
