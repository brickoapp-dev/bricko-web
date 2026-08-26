-- Bloque 4 de "Mi equipo": dos huecos en datos que ya existían pero no se
-- capturaban.
--
-- 1) pro_equipo no tenía forma de registrar vencimiento de documentación.
--    "estado" (CHECK vigente/revisar, default 'vigente') queda tal cual en
--    la tabla pero pasa a ser DERIVADO en el frontend a partir de
--    vencimiento — el frontend nunca lo escribió y sigue sin escribirlo,
--    así que no hace falta ampliar ese CHECK ni migrar filas existentes.
--
-- 2) hito_participantes ya tenía monto_pactado pero el insert del gate 5
--    del wizard (confirm_participants) nunca lo mandaba, y no había dónde
--    registrar qué entrega esa persona, para cuándo, ni si aceptó los
--    términos de esa asignación puntual dentro del hito.
ALTER TABLE public.pro_equipo
  ADD COLUMN vencimiento date;

ALTER TABLE public.hito_participantes
  ADD COLUMN entregable text,
  ADD COLUMN plazo date,
  ADD COLUMN aceptacion text NOT NULL DEFAULT 'pendiente'
    CHECK (aceptacion IN ('pendiente','aceptado','rechazado'));
