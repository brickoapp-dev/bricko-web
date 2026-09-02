-- Gate 3 (contrato): hasta ahora era el único de los 4 gates de
-- obra_preparacion que no pasaba por una RPC que valide requisitos --
-- gate_hitos/gate_participantes/gate_habilitada se setean vía
-- confirm_milestones_plan/confirm_participants/enable_obra (que chequean
-- que exista al menos un hito, etc.), pero gate_contrato quedaba como un
-- UPDATE directo del cliente sin ninguna verificación real (ver
-- CONTRATO-1: ahora sube contrato/anexo a obra_documentos, pero nada
-- impedía marcar el gate en true sin haber subido ni firmado nada).
--
-- Esta migración agrega confirm_contrato(), mismo patrón que las otras
-- RPCs de gates, y protege gate_contrato en el trigger de columnas para
-- que solo se pueda setear en true a través de la RPC.

CREATE OR REPLACE FUNCTION public.confirm_contrato(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.pro_has_accepted_quote(p_request_id) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.obra_documentos
    WHERE request_id = p_request_id AND hito_id IS NULL AND tipo = 'contrato' AND estado = 'firmado'
  ) THEN
    RAISE EXCEPTION 'Falta subir y marcar como firmado el contrato marco de obra';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.obra_documentos
    WHERE request_id = p_request_id AND hito_id IS NULL AND tipo = 'anexo' AND estado = 'firmado'
  ) THEN
    RAISE EXCEPTION 'Falta subir y marcar como firmado el anexo económico';
  END IF;

  UPDATE public.obra_preparacion
    SET gate_contrato = true, current_gate = GREATEST(current_gate, 4)
    WHERE request_id = p_request_id AND pro_id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_contrato(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_contrato(uuid) TO authenticated;

-- gate_contrato ahora solo se setea en true desde confirm_contrato()
-- (SECURITY DEFINER, corre como current_user='postgres' -> no la afecta
-- este trigger). Un UPDATE directo del pro ya no puede tocarlo.
CREATE OR REPLACE FUNCTION public.protect_obra_preparacion_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    NEW.request_id := OLD.request_id;
    NEW.pro_id := OLD.pro_id;
    NEW.comision_pct := OLD.comision_pct;
    NEW.comision_monto := OLD.comision_monto;
    NEW.gate_contrato := OLD.gate_contrato;
    NEW.gate_hitos := OLD.gate_hitos;
    NEW.gate_participantes := OLD.gate_participantes;
    NEW.gate_habilitada := OLD.gate_habilitada;
  END IF;
  RETURN NEW;
END;
$$;
