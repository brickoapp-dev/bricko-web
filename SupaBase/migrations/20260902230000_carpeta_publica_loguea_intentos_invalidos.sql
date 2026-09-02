-- T-checklist: "QR revocado o vencido -> sin acceso, y el intento queda
-- registrado". carpeta_publica() hacía RETURN NULL apenas detectaba un
-- token revocado o vencido, ANTES del INSERT en qr_accesos -- el intento
-- nunca quedaba logueado, solo los accesos con token vigente. Se mueve el
-- registro del intento (mismo INSERT, mismo best-effort de headers) antes
-- del chequeo de validez: todo intento sobre un token que existe en
-- qr_tokens queda registrado, exista o no, y solo se devuelven datos si
-- es válido. Un token que ni siquiera existe en qr_tokens no puede
-- loguearse (qr_accesos.token tiene FK a qr_tokens(token)) y tampoco hay
-- nada real que asociarle -- se sigue devolviendo NULL sin insertar.
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
    ), '[]'::jsonb)
  ) INTO v_result
  FROM public.requests r
  LEFT JOIN public.obra_preparacion op ON op.request_id = r.id
  LEFT JOIN public.profiles cp ON cp.id = r.user_id
  WHERE r.id = v_qr.obra_id;

  RETURN v_result;
END;
$function$;
