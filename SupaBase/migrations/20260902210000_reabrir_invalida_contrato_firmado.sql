-- T-checklist: "modificar un hito confirmado obliga a versión nueva e
-- invalida el contrato firmado". plan_hitos_reabrir() invalidaba el plan
-- de hitos pero nunca tocaba contrato_versiones -- un contrato ya
-- firmado por las dos partes sobrevivía intacto aunque el usuario editara
-- los hitos después de reabrir, contradiciendo el aviso explícito que
-- pro-preobra.js ya le muestra al usuario antes de reabrir ("el contrato
-- firmado va a quedar invalidado"). contrato_invalidar_si_cambio() sigue
-- sin tocar 'firmado' a propósito (esa función corre pasivamente en cada
-- carga de pantalla, sin aviso al usuario -- no debe invalidar un contrato
-- legal firmado por un cambio incidental en otro dato). Reabrir el plan
-- es, en cambio, una acción explícita con aviso previo: invalida acá.
CREATE OR REPLACE FUNCTION public.plan_hitos_reabrir(p_request_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.pro_has_accepted_quote(p_request_id) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  UPDATE public.plan_hitos_versiones
    SET estado = 'invalidado'
    WHERE request_id = p_request_id AND estado = 'confirmado';

  UPDATE public.contrato_versiones
    SET estado = 'invalidado'
    WHERE request_id = p_request_id AND estado <> 'invalidado';

  UPDATE public.obra_preparacion
    SET gate_hitos = false
    WHERE request_id = p_request_id AND pro_id = auth.uid();
END;
$function$;
