-- Permite a un profesional leer una request cuando tiene una quote
-- 'accepted' sobre ella, aunque la request ya no esté en pending/quoted
-- (por ejemplo cuando pasó a 'active' al aceptarse su presupuesto).
-- Policy aditiva: en Postgres, varias policies permissive sobre el mismo
-- comando se combinan con OR, así que esto no reemplaza requests_select.
CREATE POLICY "requests_select_awarded_pro" ON public.requests
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.quotes q
      WHERE q.request_id = requests.id
        AND q.pro_id = (select auth.uid())
        AND q.status = 'accepted'
    )
  );
