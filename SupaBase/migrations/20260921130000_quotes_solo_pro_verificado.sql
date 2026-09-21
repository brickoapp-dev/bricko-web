-- Pedido del usuario: un profesional sin verificar puede ver las
-- oportunidades de trabajo, pero no puede mandar presupuestos -- solo los
-- verificados (professionals.verified = true, ver
-- 20260921120000_verificacion_dni_flujo_revision.sql) pueden cotizar.
--
-- quotes_pro_insert (creada en 20260806120100_dedupe_rls_policies.sql, y
-- nunca tocada por ninguna migración posterior -- confirmado grepeando
-- todo SupaBase/migrations/) solo exigía auth.uid() = pro_id, sin mirar
-- verified. El gate real es este ALTER POLICY: el resto (properfil.js,
-- pro.html, pro-cotizar.html) es UX -- avisa antes de intentarlo, pero la
-- fuente de verdad es RLS, no el JS del cliente.

alter policy "quotes_pro_insert" on public.quotes
  with check (
    (select auth.uid()) = pro_id
    and exists (
      select 1 from public.professionals p
      where p.id = pro_id and p.verified = true
    )
  );
