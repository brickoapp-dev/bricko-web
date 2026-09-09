-- QA en navegador: probando el flujo de QR para agregar el contrato
-- completo a la carpeta pública, generar_qr_obra() nunca pudo haberse
-- ejecutado con éxito -- llama a gen_random_bytes() (de la extensión
-- pgcrypto, instalada en el schema "extensions" en este proyecto) pero
-- la función tiene SET search_path TO 'public' nada más. Sin pgcrypto
-- en el search_path, cualquier llamada explotaba con
-- "function gen_random_bytes(integer) does not exist". Nadie pudo haber
-- generado un QR de obra hasta ahora. assign_ticket_id() no tenía este
-- problema porque usa gen_random_uuid(), que es de PostgreSQL core
-- (no de pgcrypto) desde PG13.
--
-- Se corrige calificando la llamada al schema (extensions.gen_random_bytes)
-- en vez de tocar el search_path -- más robusto: sigue funcionando aunque
-- pgcrypto se reinstale en otro schema, y no amplía qué funciones no
-- calificadas puede resolver esta SECURITY DEFINER por accidente.

CREATE OR REPLACE FUNCTION public.generar_qr_obra(p_request_id uuid, p_dias_vigencia integer DEFAULT 90)
 RETURNS qr_tokens
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.qr_tokens;
BEGIN
  IF NOT public.pro_has_accepted_quote(p_request_id) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  INSERT INTO public.qr_tokens (token, obra_id, creado_por, vence_en)
  VALUES (
    encode(extensions.gen_random_bytes(24), 'hex'),
    p_request_id,
    auth.uid(),
    CASE WHEN p_dias_vigencia IS NULL THEN NULL ELSE now() + (p_dias_vigencia || ' days')::interval END
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$;
