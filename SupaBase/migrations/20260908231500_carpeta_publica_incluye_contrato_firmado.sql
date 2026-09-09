-- Pedido del usuario: una vez firmado el contrato por las dos partes, la
-- carpeta pública por QR (carpeta_publica(), el único acceso anónimo real
-- del proyecto) tiene que dar acceso al contrato completo -- mismo
-- contenido detallado que BRICKO_01_Contrato_Tipo_Referencias.pdf, con
-- los campos [1]-[31] ya completados -- para poder verlo/descargarlo
-- (imprimible, igual que downloadContratoFinal() en pro-preobra.js).
--
-- Decisión de producto confirmada con el usuario (no inferida): esto
-- expone datos que carpeta_publica() excluía a propósito hasta ahora
-- (DNI/CUIT, domicilios, montos -- ver el comentario de
-- …_carpeta_publica_loguea_intentos_invalidos.sql y el README). Se le
-- preguntó explícitamente por esta tensión -- QR público sin login vs.
-- requerir sesión vs. opt-in por obra -- y eligió mantenerlo público sin
-- login, igual que el resto de la carpeta. Solo se expone la versión con
-- estado='firmado' (nunca un borrador ni una versión firmada por una sola
-- parte): antes de la firma de las dos partes, 'contrato' viaja en null y
-- la UI pública no muestra nada de esto.

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
    'contrato', (
      SELECT jsonb_build_object(
        'version', cv.version, 'payload', cv.payload, 'hash', cv.hash, 'firmado_at', cv.firmado_at
      )
      FROM public.contrato_versiones cv
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
