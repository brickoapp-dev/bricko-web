-- Pedido del usuario: en "Dividí la obra en hitos" (gate 5 de
-- pro-preobra.html) las únicas modalidades que se pueden asignar a un
-- participante pasan a ser 'colaborador_independiente' y 'profesional'.
-- Se decidió (confirmado con el usuario) extender el mismo recorte a
-- "Mi equipo" (pro_equipo) y a la base: 'contratista', 'dependiente' y
-- 'subcontratista' dejan de ser modalidades válidas en cualquier tabla.
--
-- Las filas existentes con esas tres modalidades se reasignan a
-- 'profesional' (decisión confirmada con el usuario) antes de endurecer
-- el CHECK, para no dejar datos que lo violen.

UPDATE public.participantes
  SET modalidad = 'profesional'
  WHERE modalidad IN ('contratista', 'dependiente', 'subcontratista');

UPDATE public.pro_equipo
  SET modalidad = 'profesional'
  WHERE modalidad IN ('contratista', 'dependiente', 'subcontratista');

-- El CHECK de modalidad quedó con el nombre autogenerado por Postgres al
-- crear la tabla (hito_participantes_modalidad_check / pro_equipo_modalidad_check):
-- el ALTER TABLE...RENAME TO participantes (20260902200000) no renombra
-- constraints, solo policies. Se busca por definición en vez de asumir el
-- nombre exacto, por si alguna vez se corrigió a mano en producción.
DO $$
DECLARE
  v_conname text;
BEGIN
  SELECT conname INTO v_conname
    FROM pg_constraint
    WHERE conrelid = 'public.participantes'::regclass
      AND pg_get_constraintdef(oid) LIKE 'CHECK ((modalidad%';
  IF v_conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.participantes DROP CONSTRAINT %I', v_conname);
  END IF;

  SELECT conname INTO v_conname
    FROM pg_constraint
    WHERE conrelid = 'public.pro_equipo'::regclass
      AND pg_get_constraintdef(oid) LIKE 'CHECK ((modalidad%';
  IF v_conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.pro_equipo DROP CONSTRAINT %I', v_conname);
  END IF;
END $$;

ALTER TABLE public.participantes
  ADD CONSTRAINT participantes_modalidad_check CHECK (modalidad IN ('colaborador_independiente', 'profesional'));

ALTER TABLE public.pro_equipo
  ADD CONSTRAINT pro_equipo_modalidad_check CHECK (modalidad IN ('colaborador_independiente', 'profesional'));

-- modalidad_requisitos: espejo SQL de REQUISITOS_POR_MODALIDAD
-- (scripts/contract-fields.js) -- se sacan los requisitos de las
-- modalidades que ya no existen, mismo cambio hecho a mano del lado JS.
DELETE FROM public.modalidad_requisitos WHERE modalidad IN ('contratista', 'dependiente', 'subcontratista');
