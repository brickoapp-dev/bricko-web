-- Hitos preliminares: el profesional propone un cronograma de pagos/
-- etapas al cotizar (no recién tras adjudicarse la obra), para que viaje
-- dentro del contrato que el cliente ve por cada oferta. Se modela como
-- filas de "hitos" con quote_id seteado (borrador de esa oferta); al
-- aceptar la oferta (accept_quote, próxima migración) esos mismos hitos
-- pasan a ser los hitos reales de la obra (quote_id -> NULL), sin
-- reescribir el resto del módulo de hitos (plan_hitos_versiones, gates
-- 4/5 de pro-preobra.js, etc. siguen viendo hitos "reales" igual que hoy).

ALTER TABLE public.hitos
  ADD COLUMN quote_id uuid REFERENCES public.quotes(id) ON DELETE CASCADE;

-- UNIQUE(request_id, numero) asumía un solo hilo de hitos por obra. Con
-- varias ofertas proponiendo cada una su propia numeración 1..N sobre la
-- misma request_id, hace falta separar el espacio de unicidad por quote.
ALTER TABLE public.hitos DROP CONSTRAINT hitos_request_id_numero_key;
CREATE UNIQUE INDEX hitos_quote_numero_key
  ON public.hitos (quote_id, numero) WHERE quote_id IS NOT NULL;
CREATE UNIQUE INDEX hitos_request_numero_confirmados_key
  ON public.hitos (request_id, numero) WHERE quote_id IS NULL;

-- El profesional gestiona los hitos preliminares de su PROPIA oferta
-- mientras esa oferta siga 'pending' (una vez aceptada/rechazada, el
-- ciclo de vida lo maneja accept_quote()). Se agrega como rama adicional
-- a las policies existentes (que ya cubren el caso post-adjudicación vía
-- pro_has_accepted_quote) -- no se reemplaza nada, solo se amplía el USING.
DROP POLICY "hitos_pro_insert" ON public.hitos;
CREATE POLICY "hitos_pro_insert" ON public.hitos
  FOR INSERT TO authenticated
  WITH CHECK (
    public.pro_has_accepted_quote(request_id)
    OR EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = hitos.quote_id AND q.pro_id = auth.uid() AND q.status = 'pending')
  );

DROP POLICY "hitos_pro_update" ON public.hitos;
CREATE POLICY "hitos_pro_update" ON public.hitos
  FOR UPDATE TO authenticated
  USING (
    public.pro_has_accepted_quote(request_id)
    OR EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = hitos.quote_id AND q.pro_id = auth.uid() AND q.status = 'pending')
  )
  WITH CHECK (
    public.pro_has_accepted_quote(request_id)
    OR EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = hitos.quote_id AND q.pro_id = auth.uid() AND q.status = 'pending')
  );

DROP POLICY "hitos_pro_delete" ON public.hitos;
CREATE POLICY "hitos_pro_delete" ON public.hitos
  FOR DELETE TO authenticated
  USING (
    (public.pro_has_accepted_quote(request_id) AND status = 'pending')
    OR EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = hitos.quote_id AND q.pro_id = auth.uid() AND q.status = 'pending')
  );

-- hitos_select no cambia: el cliente ya puede leer TODOS los hitos de su
-- request_id sin filtrar por quote (por diseño, para poder revisar el
-- cronograma propuesto por cada oferente antes de elegir).
