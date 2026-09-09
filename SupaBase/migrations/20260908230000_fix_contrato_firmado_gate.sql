-- QA en navegador (obra BX-2026-326371, gate 3): siguiendo el checklist de
-- aceptación llegamos al paso de firma y aparecieron dos bugs que dejaban
-- gate_contrato inalcanzable en la práctica para CUALQUIER obra real:
--
-- 1) contrato_aceptar() (T-checklist, la firma con trazabilidad que
--    reemplazó la carga manual de PDF de CONTRATO-1..4) nunca tocaba
--    obra_preparacion. Quien seteaba el gate era confirm_contrato(),
--    pero esa función quedó escrita para el modelo VIEJO: chequeaba
--    obra_documentos.tipo IN ('contrato','anexo') AND estado='firmado',
--    una tabla/flujo que el rediseño de contrato_versiones/contrato_aceptar
--    dejó de alimentar. Con el flujo actual esos documentos nunca existen,
--    así que confirm_contrato() iba a fallar con "Falta subir y marcar
--    como firmado el contrato marco de obra" siempre, sin importar que
--    las dos partes ya hubieran firmado la versión vigente.
--
-- 2) Encima, pro-preobra.js solo llamaba a confirm_contrato() cuando
--    quien apretaba "Firmar" era el profesional Y esa firma cerraba el
--    contrato. En el orden más común -- el profesional genera, envía y
--    firma primero, el cliente revisa y firma después -- la firma que
--    completa el contrato es la del CLIENTE, y nadie desde el cliente
--    llamaba a confirm_contrato: contrato_aceptar() solo se invocaba
--    desde pro-preobra.js, una pantalla a la que el cliente ni siquiera
--    puede entrar (SESSION.role !== 'profesional' lo redirige a
--    client.html). El cliente no tenía ninguna forma de firmar.
--
-- Se resuelve seteando el gate directamente en contrato_aceptar() en el
-- mismo UPDATE que marca la versión 'firmado' -- ya se ejecuta ahí
-- mismo, ya sabemos que las dos partes aceptaron, y al ser
-- SECURITY DEFINER no importa cuál de las dos partes ejecutó la firma
-- que completó el contrato. confirm_contrato() queda huérfana (nada más
-- la llamaba) y con un chequeo que ya no tiene sentido: se elimina.
-- El JS que la invocaba se corrige en el mismo commit, y se agrega la
-- firma del lado del cliente (hasta ahora inexistente).

CREATE OR REPLACE FUNCTION public.contrato_aceptar(p_version_id uuid)
 RETURNS contrato_versiones
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_request_id uuid;
  v_hash text;
  v_estado_actual text;
  v_rol text;
  v_otro_rol_aceptado boolean;
  v_row public.contrato_versiones;
BEGIN
  SELECT request_id, hash, estado INTO v_request_id, v_hash, v_estado_actual
    FROM public.contrato_versiones WHERE id = p_version_id;

  IF v_request_id IS NULL THEN
    RAISE EXCEPTION 'La versión % no existe', p_version_id;
  END IF;
  IF v_estado_actual = 'invalidado' THEN
    RAISE EXCEPTION 'Esta versión del contrato quedó invalidada por un cambio de datos -- generá y enviá una nueva.';
  END IF;

  IF public.pro_has_accepted_quote(v_request_id) THEN
    v_rol := 'contratista';
  ELSIF EXISTS (SELECT 1 FROM public.requests r WHERE r.id = v_request_id AND r.user_id = auth.uid()) THEN
    v_rol := 'cliente';
  ELSE
    RAISE EXCEPTION 'No autorizado';
  END IF;

  INSERT INTO public.contrato_aceptaciones (contrato_version_id, usuario_id, rol, hash)
  VALUES (p_version_id, auth.uid(), v_rol, v_hash)
  ON CONFLICT (contrato_version_id, rol) DO NOTHING;

  SELECT EXISTS (
    SELECT 1 FROM public.contrato_aceptaciones
    WHERE contrato_version_id = p_version_id AND rol <> v_rol
  ) INTO v_otro_rol_aceptado;

  UPDATE public.contrato_versiones
    SET estado = CASE
          WHEN v_otro_rol_aceptado THEN 'firmado'
          WHEN v_rol = 'cliente' THEN 'aceptado_cliente'
          ELSE 'aceptado_contratista'
        END,
        firmado_at = CASE WHEN v_otro_rol_aceptado THEN now() ELSE firmado_at END
    WHERE id = p_version_id
    RETURNING * INTO v_row;

  IF v_otro_rol_aceptado THEN
    UPDATE public.obra_preparacion
      SET gate_contrato = true, current_gate = GREATEST(current_gate, 4)
      WHERE request_id = v_request_id;
  END IF;

  RETURN v_row;
END;
$function$;

DROP FUNCTION IF EXISTS public.confirm_contrato(uuid);
