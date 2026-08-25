-- ============================================================
-- HITOS: sistema de gestión de obra post-adjudicación.
--
-- Hoy accept_quote() sólo pone requests.status='active' y ahí termina
-- todo — no hay forma de dividir la obra en hitos, asignar equipo,
-- trackear avance/pagos ni documentar la preparación previa al inicio.
-- Esta migración agrega ese módulo completo:
--
--   obra_preparacion  — estado del wizard de 6 pasos (1:1 con requests,
--                        se crea sola cuando se acepta una quote)
--   hitos              — los hitos/milestones de la obra
--   hito_participantes — equipo asignado a cada hito (modalidad
--                        autodeclarada por el contratista — informativo,
--                        Brickø no valida ni certifica el encuadre legal)
--   pro_equipo         — directorio/roster propio del profesional
--   obra_documentos    — contrato/anexos + evidencias/facturas por hito
--
-- Convenciones: mismo patrón que accept_quote/get_quote_professionals/
-- pro_has_accepted_quote — RPCs SECURITY DEFINER con
-- REVOKE ALL FROM PUBLIC, anon; GRANT EXECUTE TO authenticated, y
-- triggers "protect columns" SECURITY INVOKER que sólo actúan cuando
-- current_user IN ('authenticated','anon') (así una RPC DEFINER, que
-- corre como "postgres", puede setear esas columnas igual).
-- ============================================================

-- ---------------------------------------------------------------
-- obra_preparacion: estado del wizard, 1:1 con requests
-- ---------------------------------------------------------------
CREATE TABLE public.obra_preparacion (
  request_id         uuid PRIMARY KEY REFERENCES public.requests(id) ON DELETE CASCADE,
  pro_id              uuid NOT NULL REFERENCES public.professionals(id),
  gate_comision       boolean NOT NULL DEFAULT false,
  gate_contrato       boolean NOT NULL DEFAULT false,
  gate_hitos          boolean NOT NULL DEFAULT false,
  gate_participantes  boolean NOT NULL DEFAULT false,
  gate_habilitada     boolean NOT NULL DEFAULT false,
  current_gate        int NOT NULL DEFAULT 2,
  comision_pct        numeric NOT NULL DEFAULT 10,
  comision_monto      numeric NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.obra_preparacion ENABLE ROW LEVEL SECURITY;

CREATE POLICY "obra_preparacion_select" ON public.obra_preparacion
  FOR SELECT TO authenticated
  USING (
    pro_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.requests r WHERE r.id = obra_preparacion.request_id AND r.user_id = auth.uid())
  );

CREATE POLICY "obra_preparacion_pro_update" ON public.obra_preparacion
  FOR UPDATE TO authenticated
  USING (pro_id = auth.uid())
  WITH CHECK (pro_id = auth.uid());

CREATE TRIGGER trg_obra_preparacion_updated_at BEFORE UPDATE ON public.obra_preparacion
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- request_id/pro_id/comision_* son fijos al crear la fila; gate_hitos/
-- gate_participantes/gate_habilitada sólo se setean desde las RPCs
-- (confirm_milestones_plan / confirm_participants / enable_obra), que
-- validan requisitos antes de tocarlos. gate_comision/gate_contrato/
-- current_gate sí quedan editables directo por el pro (son togglees
-- simples de estado, sin precondición real que validar).
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
    NEW.gate_hitos := OLD.gate_hitos;
    NEW.gate_participantes := OLD.gate_participantes;
    NEW.gate_habilitada := OLD.gate_habilitada;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_obra_preparacion_columns() FROM public, anon, authenticated;

CREATE TRIGGER trg_protect_obra_preparacion_columns BEFORE UPDATE ON public.obra_preparacion
  FOR EACH ROW EXECUTE FUNCTION public.protect_obra_preparacion_columns();

-- Se crea sola al aceptar una quote (comisión = 10% del monto adjudicado).
-- Trigger adicional sobre quotes — no reemplaza a trg_cascade_on_quote_accepted,
-- ambos AFTER UPDATE conviven.
CREATE OR REPLACE FUNCTION public.create_obra_preparacion_on_accept()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'accepted' AND COALESCE(OLD.status, '') <> 'accepted' THEN
    INSERT INTO public.obra_preparacion (request_id, pro_id, comision_monto)
    VALUES (NEW.request_id, NEW.pro_id, ROUND(NEW.amount * 0.10, 2))
    ON CONFLICT (request_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.create_obra_preparacion_on_accept() FROM public, anon, authenticated;

CREATE TRIGGER trg_create_obra_preparacion AFTER UPDATE ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.create_obra_preparacion_on_accept();

-- ---------------------------------------------------------------
-- hitos
-- ---------------------------------------------------------------
CREATE TABLE public.hitos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id      uuid NOT NULL REFERENCES public.requests(id) ON DELETE CASCADE,
  numero          int NOT NULL,
  titulo          text NOT NULL,
  descripcion     text,
  monto           numeric NOT NULL,
  fecha_estimada  date,
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','review','done')),
  pago_estado     text NOT NULL DEFAULT 'pending' CHECK (pago_estado IN ('pending','approved','paid')),
  avance_pct      int NOT NULL DEFAULT 0 CHECK (avance_pct BETWEEN 0 AND 100),
  avance_nota     text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (request_id, numero)
);

ALTER TABLE public.hitos ENABLE ROW LEVEL SECURITY;

-- Reutiliza pro_has_accepted_quote (ya SECURITY DEFINER, ya probado
-- contra la recursión requests<->quotes) como único punto de verdad
-- de "sos el pro adjudicado de esta request".
CREATE POLICY "hitos_select" ON public.hitos
  FOR SELECT TO authenticated
  USING (
    public.pro_has_accepted_quote(request_id)
    OR EXISTS (SELECT 1 FROM public.requests r WHERE r.id = hitos.request_id AND r.user_id = auth.uid())
  );

CREATE POLICY "hitos_pro_insert" ON public.hitos
  FOR INSERT TO authenticated
  WITH CHECK (public.pro_has_accepted_quote(request_id));

CREATE POLICY "hitos_pro_update" ON public.hitos
  FOR UPDATE TO authenticated
  USING (public.pro_has_accepted_quote(request_id))
  WITH CHECK (public.pro_has_accepted_quote(request_id));

CREATE POLICY "hitos_pro_delete" ON public.hitos
  FOR DELETE TO authenticated
  USING (public.pro_has_accepted_quote(request_id) AND status = 'pending');

CREATE TRIGGER trg_hitos_updated_at BEFORE UPDATE ON public.hitos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- El cliente nunca hace UPDATE directo sobre hitos (no tiene policy de
-- UPDATE): aprueba avance / marca pagado únicamente vía RPC. Mismo
-- espíritu que accept_quote() para quotes.

-- ---------------------------------------------------------------
-- hito_participantes: equipo asignado a cada hito
-- ---------------------------------------------------------------
CREATE TABLE public.hito_participantes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hito_id             uuid NOT NULL REFERENCES public.hitos(id) ON DELETE CASCADE,
  nombre              text NOT NULL,
  especialidad        text,
  modalidad           text NOT NULL CHECK (modalidad IN ('contratista','colaborador_independiente','dependiente','subcontratista','profesional')),
  documentacion_nota  text,
  monto_pactado       numeric,
  estado              text NOT NULL DEFAULT 'vigente' CHECK (estado IN ('vigente','revisar')),
  created_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.hito_participantes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hito_participantes_select" ON public.hito_participantes
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.hitos h
      WHERE h.id = hito_participantes.hito_id
        AND (
          public.pro_has_accepted_quote(h.request_id)
          OR EXISTS (SELECT 1 FROM public.requests r WHERE r.id = h.request_id AND r.user_id = auth.uid())
        )
    )
  );

CREATE POLICY "hito_participantes_pro_insert" ON public.hito_participantes
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.hitos h WHERE h.id = hito_id AND public.pro_has_accepted_quote(h.request_id))
  );

CREATE POLICY "hito_participantes_pro_update" ON public.hito_participantes
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.hitos h WHERE h.id = hito_id AND public.pro_has_accepted_quote(h.request_id))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.hitos h WHERE h.id = hito_id AND public.pro_has_accepted_quote(h.request_id))
  );

CREATE POLICY "hito_participantes_pro_delete" ON public.hito_participantes
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.hitos h WHERE h.id = hito_id AND public.pro_has_accepted_quote(h.request_id))
  );

-- ---------------------------------------------------------------
-- pro_equipo: directorio/roster propio del profesional ("Mi equipo")
-- ---------------------------------------------------------------
CREATE TABLE public.pro_equipo (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pro_id              uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  nombre              text NOT NULL,
  cuit                text,
  especialidad        text,
  modalidad           text NOT NULL CHECK (modalidad IN ('contratista','colaborador_independiente','dependiente','subcontratista','profesional')),
  documentacion_nota  text,
  estado              text NOT NULL DEFAULT 'vigente' CHECK (estado IN ('vigente','revisar')),
  created_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pro_equipo ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pro_equipo_select_own" ON public.pro_equipo
  FOR SELECT TO authenticated USING (pro_id = auth.uid());
CREATE POLICY "pro_equipo_insert_own" ON public.pro_equipo
  FOR INSERT TO authenticated WITH CHECK (pro_id = auth.uid());
CREATE POLICY "pro_equipo_update_own" ON public.pro_equipo
  FOR UPDATE TO authenticated USING (pro_id = auth.uid()) WITH CHECK (pro_id = auth.uid());
CREATE POLICY "pro_equipo_delete_own" ON public.pro_equipo
  FOR DELETE TO authenticated USING (pro_id = auth.uid());

-- ---------------------------------------------------------------
-- obra_documentos: contrato/anexos (hito_id null) + evidencias/
-- facturas por hito (hito_id set). Bucket privado 'obra-docs'.
-- ---------------------------------------------------------------
CREATE TABLE public.obra_documentos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id    uuid NOT NULL REFERENCES public.requests(id) ON DELETE CASCADE,
  hito_id       uuid REFERENCES public.hitos(id) ON DELETE CASCADE,
  tipo          text NOT NULL CHECK (tipo IN ('contrato','anexo','evidencia','factura')),
  nombre        text NOT NULL,
  storage_path  text,
  estado        text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','borrador','firmado','vigente')),
  subido_por    uuid NOT NULL DEFAULT auth.uid(),
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.obra_documentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "obra_documentos_select" ON public.obra_documentos
  FOR SELECT TO authenticated
  USING (
    public.pro_has_accepted_quote(request_id)
    OR EXISTS (SELECT 1 FROM public.requests r WHERE r.id = obra_documentos.request_id AND r.user_id = auth.uid())
  );

CREATE POLICY "obra_documentos_pro_insert" ON public.obra_documentos
  FOR INSERT TO authenticated
  WITH CHECK (public.pro_has_accepted_quote(request_id));

CREATE POLICY "obra_documentos_pro_update" ON public.obra_documentos
  FOR UPDATE TO authenticated
  USING (public.pro_has_accepted_quote(request_id))
  WITH CHECK (public.pro_has_accepted_quote(request_id));

CREATE POLICY "obra_documentos_pro_delete" ON public.obra_documentos
  FOR DELETE TO authenticated
  USING (public.pro_has_accepted_quote(request_id));

-- Bucket privado, path: <request_id>/<archivo> — mismo esquema que el
-- bucket 'solicitudes' (folder = id de la request dueña, no uid del
-- que sube).
INSERT INTO storage.buckets (id, name, public)
VALUES ('obra-docs', 'obra-docs', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "obra_docs_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'obra-docs' AND (
      public.pro_has_accepted_quote(((storage.foldername(name))[1])::uuid)
      OR EXISTS (
        SELECT 1 FROM public.requests r
        WHERE r.id::text = (storage.foldername(name))[1] AND r.user_id = auth.uid()
      )
    )
  );

CREATE POLICY "obra_docs_pro_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'obra-docs'
    AND public.pro_has_accepted_quote(((storage.foldername(name))[1])::uuid)
  );

CREATE POLICY "obra_docs_pro_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'obra-docs'
    AND public.pro_has_accepted_quote(((storage.foldername(name))[1])::uuid)
  );

-- ---------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------

-- Pro presenta avance de un hito.
CREATE OR REPLACE FUNCTION public.submit_milestone_progress(p_hito_id uuid, p_avance_pct int, p_nota text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request_id uuid;
BEGIN
  SELECT request_id INTO v_request_id FROM public.hitos WHERE id = p_hito_id;
  IF v_request_id IS NULL THEN
    RAISE EXCEPTION 'El hito % no existe', p_hito_id;
  END IF;
  IF NOT public.pro_has_accepted_quote(v_request_id) THEN
    RAISE EXCEPTION 'No autorizado para presentar avance de este hito';
  END IF;

  UPDATE public.hitos
    SET avance_pct = GREATEST(0, LEAST(100, p_avance_pct)),
        avance_nota = p_nota,
        status = CASE WHEN status = 'pending' THEN 'in_progress' ELSE status END
    WHERE id = p_hito_id;

  UPDATE public.hitos SET status = 'review' WHERE id = p_hito_id AND avance_pct >= 100;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_milestone_progress(uuid, int, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_milestone_progress(uuid, int, text) TO authenticated;

-- Cliente aprueba el avance de un hito (lo da por finalizado y
-- habilita el pago).
CREATE OR REPLACE FUNCTION public.approve_milestone(p_hito_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
BEGIN
  SELECT r.user_id INTO v_owner
    FROM public.hitos h JOIN public.requests r ON r.id = h.request_id
    WHERE h.id = p_hito_id;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'El hito % no existe', p_hito_id;
  END IF;
  IF v_owner IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'No autorizado para aprobar este hito';
  END IF;

  UPDATE public.hitos
    SET status = 'done', pago_estado = 'approved', avance_pct = 100
    WHERE id = p_hito_id;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_milestone(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_milestone(uuid) TO authenticated;

-- Cliente marca un hito aprobado como pagado (tracking de estado,
-- sin pasarela real).
CREATE OR REPLACE FUNCTION public.mark_milestone_paid(p_hito_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
BEGIN
  SELECT r.user_id INTO v_owner
    FROM public.hitos h JOIN public.requests r ON r.id = h.request_id
    WHERE h.id = p_hito_id;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'El hito % no existe', p_hito_id;
  END IF;
  IF v_owner IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'No autorizado para marcar este hito como pagado';
  END IF;

  UPDATE public.hitos SET pago_estado = 'paid'
    WHERE id = p_hito_id AND pago_estado = 'approved';
END;
$$;

REVOKE ALL ON FUNCTION public.mark_milestone_paid(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_milestone_paid(uuid) TO authenticated;

-- Gate 4: confirmar el plan de hitos (requiere al menos un hito creado).
CREATE OR REPLACE FUNCTION public.confirm_milestones_plan(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.pro_has_accepted_quote(p_request_id) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.hitos WHERE request_id = p_request_id) THEN
    RAISE EXCEPTION 'Definí al menos un hito antes de confirmar el plan';
  END IF;

  UPDATE public.obra_preparacion
    SET gate_hitos = true, current_gate = GREATEST(current_gate, 5)
    WHERE request_id = p_request_id AND pro_id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_milestones_plan(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_milestones_plan(uuid) TO authenticated;

-- Gate 5: confirmar participantes y documentación (self-declarada).
CREATE OR REPLACE FUNCTION public.confirm_participants(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.pro_has_accepted_quote(p_request_id) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  UPDATE public.obra_preparacion
    SET gate_participantes = true, current_gate = GREATEST(current_gate, 6)
    WHERE request_id = p_request_id AND pro_id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_participants(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_participants(uuid) TO authenticated;

-- Gate 6: habilitar la obra (requiere los 4 gates previos completos).
CREATE OR REPLACE FUNCTION public.enable_obra(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ready boolean;
BEGIN
  IF NOT public.pro_has_accepted_quote(p_request_id) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT gate_comision AND gate_contrato AND gate_hitos AND gate_participantes
    INTO v_ready
    FROM public.obra_preparacion
    WHERE request_id = p_request_id;

  IF NOT COALESCE(v_ready, false) THEN
    RAISE EXCEPTION 'Faltan requisitos para habilitar la obra';
  END IF;

  UPDATE public.obra_preparacion SET gate_habilitada = true WHERE request_id = p_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.enable_obra(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enable_obra(uuid) TO authenticated;

-- Cliente da por finalizada la obra (todos los hitos terminados y
-- pagados). Reutiliza el status 'done' que ya existe en request_status.
CREATE OR REPLACE FUNCTION public.finish_obra(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_all_done boolean;
BEGIN
  SELECT user_id INTO v_owner FROM public.requests WHERE id = p_request_id;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'La solicitud % no existe', p_request_id;
  END IF;
  IF v_owner IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT COALESCE(bool_and(status = 'done' AND pago_estado = 'paid'), false)
    INTO v_all_done
    FROM public.hitos WHERE request_id = p_request_id;

  IF NOT v_all_done THEN
    RAISE EXCEPTION 'Todavía hay hitos sin finalizar o sin pagar';
  END IF;

  UPDATE public.requests SET status = 'done' WHERE id = p_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.finish_obra(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finish_obra(uuid) TO authenticated;
