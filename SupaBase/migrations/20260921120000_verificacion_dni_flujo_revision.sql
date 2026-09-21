-- Flujo de revisión de verificación de DNI (Fase 1 de la decisión build-vs-buy
-- del 2026-09-21, confirmada con el usuario): hoy `professionals.verified`
-- solo se puede tocar con service_role a mano por el SQL editor -- no existe
-- ningún camino en la app, ni manual ni automático, para verificar a un
-- profesional, y tampoco existe ningún concepto de "admin" en todo el
-- proyecto. Esta migración agrega lo mínimo para que eso exista:
--   1) estado de revisión en `professional_verification` (pending/approved/
--      rejected + quién y cuándo revisó, con motivo si se rechaza);
--   2) un cruce automático y gratis contra el código de barras PDF417 del
--      dorso del DNI argentino, decodificado en el browser (ver
--      properfil.js) -- NO prueba autenticidad del documento ni identidad de
--      quien lo sube, solo avisa si el número tipeado no coincide con el que
--      trae la foto, para ahorrarle trabajo al revisor humano;
--   3) una tabla `admins` angosta + `is_admin()`, y dos RPCs SECURITY
--      DEFINER (listar pendientes / aprobar-rechazar) más la policy de
--      Storage que le permite al admin generar signed URLs de las fotos
--      (antes solo el dueño podía vía `dni_select_own`).
-- Decisión explícita con el usuario: no se contrata ningún proveedor de KYC
-- por ahora -- autenticidad del documento, liveness y face match quedan
-- pendientes para si el volumen o el riesgo de fraude lo justifican.

-- 1) Estado de revisión --------------------------------------------------

alter table public.professional_verification
  add column status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  add column reviewed_by uuid references auth.users(id),
  add column reviewed_at timestamptz,
  add column rejection_reason text,
  add column barcode_raw jsonb,
  add column barcode_dni_match boolean;

comment on column public.professional_verification.barcode_raw is
  'Payload best-effort decodificado del código PDF417 del dorso del DNI vía BarcodeDetector en el browser. Informativo para el revisor -- nunca es un gate automático.';
comment on column public.professional_verification.barcode_dni_match is
  'true si algún token del código de barras coincide con dni_number tipeado; false si se leyó un DNI distinto; null si no se pudo leer (browser sin soporte, sin código visible, etc).';

-- Al subir una foto nueva (p.ej. tras un rechazo) vuelve a pending y limpia
-- la revisión anterior; y de paso impide que el propio profesional setee
-- status/reviewed_by/reviewed_at/rejection_reason a mano -- mismo patrón que
-- protect_professional_columns() (20260806120200_protect_columns.sql).
create or replace function public.protect_verification_review_columns()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.status            := old.status;
    new.reviewed_by       := old.reviewed_by;
    new.reviewed_at       := old.reviewed_at;
    new.rejection_reason  := old.rejection_reason;

    if new.dni_front_url is distinct from old.dni_front_url
       or new.dni_back_url is distinct from old.dni_back_url then
      new.status           := 'pending';
      new.reviewed_by      := null;
      new.reviewed_at      := null;
      new.rejection_reason := null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_verification_review on public.professional_verification;
create trigger trg_protect_verification_review
  before update on public.professional_verification
  for each row execute function public.protect_verification_review_columns();

-- 2) Admin: tabla angosta + helper ---------------------------------------

create table public.admins (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;
-- Sin policies para authenticated/anon a propósito: la tabla solo la puede
-- leer su dueño (las funciones SECURITY DEFINER de abajo). Nadie se puede
-- auto-agregar ni ver quién más es admin.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (select 1 from public.admins where id = auth.uid());
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- Alan (gurfinkel.alan2@gmail.com, cuenta "Guillermo Arzani" en profiles),
-- único operador del producto hoy. Ajustar/ampliar a mano si corresponde
-- otra cuenta -- no hay UI para autogestionar esta tabla, a propósito.
insert into public.admins (id) values ('603774fc-e999-4c8c-ac97-20d5a09d858d');

-- 3) RPCs de revisión -----------------------------------------------------

create or replace function public.admin_list_pending_verifications()
returns table (
  professional_id uuid,
  first_name text,
  last_name text,
  city text,
  province text,
  rubros text[],
  dni_number text,
  dni_front_url text,
  dni_back_url text,
  barcode_dni_match boolean,
  barcode_raw jsonb,
  submitted_at timestamptz
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if not public.is_admin() then
    raise exception 'No autorizado';
  end if;

  return query
    select
      pv.id,
      pr.first_name,
      pr.last_name,
      pr.city,
      pr.province,
      p.rubros,
      pv.dni_number,
      pv.dni_front_url,
      pv.dni_back_url,
      pv.barcode_dni_match,
      pv.barcode_raw,
      pv.updated_at
    from public.professional_verification pv
    join public.profiles pr on pr.id = pv.id
    join public.professionals p on p.id = pv.id
    where pv.status = 'pending'
    order by pv.updated_at asc;
end;
$$;
revoke all on function public.admin_list_pending_verifications() from public;
grant execute on function public.admin_list_pending_verifications() to authenticated;

create or replace function public.admin_review_verification(
  p_professional_id uuid,
  p_decision text,
  p_rejection_reason text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_admin() then
    raise exception 'No autorizado';
  end if;

  if p_decision not in ('approved', 'rejected') then
    raise exception 'Decisión inválida: %', p_decision;
  end if;

  if p_decision = 'rejected' and coalesce(btrim(p_rejection_reason), '') = '' then
    raise exception 'El rechazo necesita un motivo';
  end if;

  update public.professional_verification
    set status = p_decision,
        reviewed_by = auth.uid(),
        reviewed_at = now(),
        rejection_reason = case when p_decision = 'rejected' then p_rejection_reason else null end
    where id = p_professional_id;

  if not found then
    raise exception 'No hay una verificación cargada para ese profesional';
  end if;

  update public.professionals
    set verified = (p_decision = 'approved')
    where id = p_professional_id;
end;
$$;
revoke all on function public.admin_review_verification(uuid, text, text) from public;
grant execute on function public.admin_review_verification(uuid, text, text) to authenticated;

-- 4) Storage: el admin necesita poder generar signed URLs de las fotos ----

create policy dni_select_admin on storage.objects
  for select to authenticated
  using (bucket_id = 'dni' and public.is_admin());
