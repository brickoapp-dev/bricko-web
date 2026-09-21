-- Estadísticas públicas de la landing (index.html): "Profesionales verificados"
-- y "Clientes registrados". Ninguna de las dos tablas fuente es legible por
-- anon (professionals_select y profiles_select_own exigen authenticated), así
-- que se expone únicamente el conteo agregado -- nunca filas -- vía una RPC
-- SECURITY DEFINER angosta, mismo patrón que carpeta_publica().

create or replace function public.landing_stats()
returns table (
  profesionales_verificados bigint,
  clientes_registrados bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*) from public.professionals where verified = true) as profesionales_verificados,
    (select count(*) from public.profiles where role = 'cliente') as clientes_registrados;
$$;

revoke all on function public.landing_stats() from public;
grant execute on function public.landing_stats() to anon, authenticated;
