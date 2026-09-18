-- QA en navegador: fuga de PII grave en la carpeta pública. carpeta_publica()
-- (el único endpoint anónimo real del proyecto -- cualquiera con el QR, sin
-- login) devolvía el payload COMPLETO del contrato firmado una vez que
-- ambas partes lo firmaban: cliente_dni_cuit, cliente_domicilio,
-- cliente_email, contratista_dni_cuit, contratista_domicilio,
-- contratista_email y hito_monto quedaban expuestos a cualquiera que
-- escaneara el QR físico de la obra -- exactamente los campos que esta
-- misma función siempre excluyó a propósito para hitos/participantes.
-- Confirmado en vivo llamando la RPC como anónimo.
--
-- Decisión del usuario: el contrato completo (con todos los datos) solo se
-- ve/descarga autenticado como una de las dos partes -- ya existen pantallas
-- para eso (pestaña "Contrato" en client-solicitud.html, gate 3 en
-- pro-preobra.html), ambas protegidas por la policy contrato_versiones_select.
-- La carpeta pública deja de exponer el payload: solo indica si está
-- firmado y cuándo, sin datos personales ni montos.
CREATE OR REPLACE FUNCTION public.carpeta_publica(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_qr public.qr_tokens;
  v_result jsonb;
  v_user_agent text;
  v_ip text;
  v_valido boolean;
BEGIN
  SELECT * INTO v_qr FROM public.qr_tokens WHERE token = p_token;

  IF v_qr.token IS NULL THEN
    RETURN NULL;
  END IF;

  v_valido := v_qr.revocado_en IS NULL AND (v_qr.vence_en IS NULL OR v_qr.vence_en >= now());

  BEGIN
    v_user_agent := current_setting('request.headers', true)::jsonb ->> 'user-agent';
    v_ip := COALESCE(
      NULLIF(split_part(current_setting('request.headers', true)::jsonb ->> 'x-forwarded-for', ',', 1), ''),
      current_setting('request.headers', true)::jsonb ->> 'x-real-ip'
    );
  EXCEPTION WHEN OTHERS THEN
    v_user_agent := NULL; v_ip := NULL;
  END;
  INSERT INTO public.qr_accesos (token, user_agent, ip) VALUES (p_token, v_user_agent, v_ip);

  IF NOT v_valido THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'ticket_id', r.ticket_id,
    'titulo', r.titulo,
    'localidad', COALESCE(cp.city, ''),
    'habilitada', COALESCE(op.gate_habilitada, false),
    'hitos', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'numero', h.numero, 'titulo', h.titulo, 'resultado', h.descripcion, 'estado', h.status
      ) ORDER BY h.numero)
      FROM public.hitos h WHERE h.request_id = r.id
    ), '[]'::jsonb),
    'participantes', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'nombre', hp.nombre, 'especialidad', hp.especialidad,
        'modalidad', hp.modalidad, 'estado_documentacion', hp.estado
      ))
      FROM public.participantes hp
      JOIN public.hitos h2 ON h2.id = hp.hito_id
      WHERE h2.request_id = r.id
    ), '[]'::jsonb),
    'contrato_firmado', EXISTS (
      SELECT 1 FROM public.contrato_versiones cv
      WHERE cv.request_id = r.id AND cv.estado = 'firmado'
    ),
    'contrato_firmado_at', (
      SELECT cv.firmado_at FROM public.contrato_versiones cv
      WHERE cv.request_id = r.id AND cv.estado = 'firmado'
      ORDER BY cv.version DESC LIMIT 1
    )
  ) INTO v_result
  FROM public.requests r
  LEFT JOIN public.obra_preparacion op ON op.request_id = r.id
  LEFT JOIN public.profiles cp ON cp.id = r.user_id
  WHERE r.id = v_qr.obra_id;

  RETURN v_result;
END;
$function$;
