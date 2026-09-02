-- T4: plan por hitos [22]-[27],[31] con campos nuevos, validaciones y
-- versionado/hash (mismo mecanismo que el contrato de T3). Reemplaza
-- confirm_milestones_plan() por plan_hitos_confirmar(), que además
-- valida montos/campos obligatorios y congela una versión. Una vez
-- confirmado, los hitos quedan de solo lectura a nivel RLS (no solo en
-- el JS): hitos_pro_insert/update/delete ahora exigen que no haya una
-- versión 'confirmado' vigente. plan_hitos_reabrir() es la única forma
-- de volver a editar -- invalida la versión confirmada (y, en la
-- siguiente carga de pro-preobra.html, contrato_invalidar_si_cambio()
-- de T3 va a detectar que el hash del contrato cambió y lo invalida
-- también, con o sin este mecanismo).

-- ---------------------------------------------------------------
-- hitos: campos nuevos
-- ---------------------------------------------------------------
ALTER TABLE public.hitos
  ADD COLUMN IF NOT EXISTS criterio_aceptacion text,
  ADD COLUMN IF NOT EXISTS responsable_equipo_id uuid REFERENCES public.pro_equipo(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS responsable_nombre text,
  ADD COLUMN IF NOT EXISTS plazo_propio boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS plazo_observacion_dias int CHECK (plazo_observacion_dias IS NULL OR plazo_observacion_dias > 0);

-- Plazo de observación por defecto, configurable una vez por obra
-- (cada hito puede overridearlo con plazo_propio).
ALTER TABLE public.obra_preparacion
  ADD COLUMN IF NOT EXISTS plazo_observacion_dias_default int CHECK (plazo_observacion_dias_default IS NULL OR plazo_observacion_dias_default > 0);

-- ---------------------------------------------------------------
-- plan_hitos_versiones: mismo patrón que contrato_versiones (T3) --
-- BORRADOR = sin versión activa; una fila solo se crea al confirmar.
-- Sin policy de escritura para authenticated, todo pasa por las RPCs.
-- ---------------------------------------------------------------
CREATE TABLE public.plan_hitos_versiones (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id      uuid NOT NULL REFERENCES public.requests(id) ON DELETE CASCADE,
  version         int NOT NULL,
  payload         jsonb NOT NULL,
  hash            text NOT NULL,
  estado          text NOT NULL DEFAULT 'confirmado' CHECK (estado IN ('confirmado', 'invalidado')),
  confirmado_at   timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (request_id, version)
);

ALTER TABLE public.plan_hitos_versiones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "plan_hitos_versiones_select" ON public.plan_hitos_versiones
  FOR SELECT TO authenticated
  USING (
    public.pro_has_accepted_quote(request_id)
    OR EXISTS (SELECT 1 FROM public.requests r WHERE r.id = plan_hitos_versiones.request_id AND r.user_id = auth.uid())
  );

CREATE OR REPLACE FUNCTION public.plan_hitos_confirmado(p_request_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.plan_hitos_versiones
    WHERE request_id = p_request_id AND estado = 'confirmado'
  );
$$;

REVOKE ALL ON FUNCTION public.plan_hitos_confirmado(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plan_hitos_confirmado(uuid) TO authenticated;

-- Hitos de solo lectura mientras el plan está confirmado (a nivel RLS,
-- no solo en el JS). Las RPCs de ejecución (submit_milestone_progress,
-- approve_milestone, mark_milestone_paid) siguen funcionando igual: son
-- SECURITY DEFINER de dueño postgres, que bypasea RLS.
DROP POLICY IF EXISTS "hitos_pro_insert" ON public.hitos;
CREATE POLICY "hitos_pro_insert" ON public.hitos
  FOR INSERT TO authenticated
  WITH CHECK (public.pro_has_accepted_quote(request_id) AND NOT public.plan_hitos_confirmado(request_id));

DROP POLICY IF EXISTS "hitos_pro_update" ON public.hitos;
CREATE POLICY "hitos_pro_update" ON public.hitos
  FOR UPDATE TO authenticated
  USING (public.pro_has_accepted_quote(request_id) AND NOT public.plan_hitos_confirmado(request_id))
  WITH CHECK (public.pro_has_accepted_quote(request_id) AND NOT public.plan_hitos_confirmado(request_id));

DROP POLICY IF EXISTS "hitos_pro_delete" ON public.hitos;
CREATE POLICY "hitos_pro_delete" ON public.hitos
  FOR DELETE TO authenticated
  USING (public.pro_has_accepted_quote(request_id) AND status = 'pending' AND NOT public.plan_hitos_confirmado(request_id));

-- ---------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------

-- Confirma el plan: valida que cada hito tenga resultado verificable,
-- criterio de aceptación y responsable; que la suma de montos coincida
-- con el monto adjudicado; y que el plazo de observación (default o
-- propio) esté cargado. Congela payload+hash+version y setea
-- gate_hitos, igual que hacía confirm_milestones_plan.
CREATE OR REPLACE FUNCTION public.plan_hitos_confirmar(p_request_id uuid, p_payload jsonb, p_hash text)
RETURNS public.plan_hitos_versiones
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next_version int;
  v_row public.plan_hitos_versiones;
  v_monto_hitos numeric;
  v_monto_adjudicado numeric;
  v_plazo_default int;
  v_titulo_incompleto text;
BEGIN
  IF NOT public.pro_has_accepted_quote(p_request_id) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.hitos WHERE request_id = p_request_id) THEN
    RAISE EXCEPTION 'Definí al menos un hito antes de confirmar el plan';
  END IF;

  SELECT titulo INTO v_titulo_incompleto FROM public.hitos
    WHERE request_id = p_request_id
      AND (
        coalesce(btrim(descripcion), '') = ''
        OR coalesce(btrim(criterio_aceptacion), '') = ''
        OR coalesce(btrim(responsable_nombre), '') = ''
      )
    LIMIT 1;
  IF v_titulo_incompleto IS NOT NULL THEN
    RAISE EXCEPTION 'El hito "%" todavía no tiene resultado verificable, criterio de aceptación o responsable completos', v_titulo_incompleto;
  END IF;

  SELECT plazo_observacion_dias_default INTO v_plazo_default
    FROM public.obra_preparacion WHERE request_id = p_request_id;
  IF v_plazo_default IS NULL THEN
    RAISE EXCEPTION 'Definí el plazo de observación de la obra antes de confirmar el plan';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.hitos
    WHERE request_id = p_request_id AND plazo_propio AND plazo_observacion_dias IS NULL
  ) THEN
    RAISE EXCEPTION 'Hay un hito marcado con "plazo propio" sin la cantidad de días cargada';
  END IF;

  SELECT COALESCE(SUM(monto), 0) INTO v_monto_hitos FROM public.hitos WHERE request_id = p_request_id;

  SELECT q.amount INTO v_monto_adjudicado
    FROM public.quotes q
    WHERE q.request_id = p_request_id AND q.pro_id = auth.uid() AND q.status = 'accepted';

  IF v_monto_adjudicado IS NOT NULL AND v_monto_hitos <> v_monto_adjudicado THEN
    RAISE EXCEPTION 'La suma de los hitos ($%) no coincide con el monto adjudicado ($%)', v_monto_hitos, v_monto_adjudicado;
  END IF;

  UPDATE public.plan_hitos_versiones
    SET estado = 'invalidado'
    WHERE request_id = p_request_id AND estado <> 'invalidado';

  SELECT COALESCE(MAX(version), 0) + 1 INTO v_next_version
    FROM public.plan_hitos_versiones WHERE request_id = p_request_id;

  INSERT INTO public.plan_hitos_versiones (request_id, version, payload, hash, estado)
  VALUES (p_request_id, v_next_version, p_payload, p_hash, 'confirmado')
  RETURNING * INTO v_row;

  UPDATE public.obra_preparacion
    SET gate_hitos = true, current_gate = GREATEST(current_gate, 5)
    WHERE request_id = p_request_id AND pro_id = auth.uid();

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.plan_hitos_confirmar(uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plan_hitos_confirmar(uuid, jsonb, text) TO authenticated;

-- Reabre el plan para editar: invalida la versión confirmada (vuelve a
-- BORRADOR, los hitos dejan de ser de solo lectura) y resetea
-- gate_hitos. La UI debe avisar explícitamente que esto puede invalidar
-- el contrato ya firmado (contrato_invalidar_si_cambio de T3 lo detecta
-- solo en la próxima carga, comparando el hash).
CREATE OR REPLACE FUNCTION public.plan_hitos_reabrir(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.pro_has_accepted_quote(p_request_id) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  UPDATE public.plan_hitos_versiones
    SET estado = 'invalidado'
    WHERE request_id = p_request_id AND estado = 'confirmado';

  UPDATE public.obra_preparacion
    SET gate_hitos = false
    WHERE request_id = p_request_id AND pro_id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.plan_hitos_reabrir(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plan_hitos_reabrir(uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.confirm_milestones_plan(uuid);
