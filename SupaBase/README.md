# Supabase — esquema y migraciones

Este directorio versiona los cambios de backend (base de datos) que antes se
hacían a mano por el dashboard. El proyecto es `wkyqetwyswocrohayiss`.

## ⚠️ Este directorio no es 100% fiel a producción

Al inspeccionar el esquema real (2026-08-13, por el SQL editor, ver
`…_move_dni_to_private_table.sql` y `…_request_images.sql`) se confirmó que
**`…_pro_profile_fields.sql` nunca se aplicó** — `profiles` no tenía
`username/address/province` y `professionals` nunca tuvo
`dni_number/dni_front_url/dni_back_url` — mientras que migraciones
posteriores (`…_professional_profile_fields.sql`, `…_storage_buckets.sql`)
sí. Además, producción tiene columnas y buckets que no vinieron de ningún
archivo de acá (`requests.fotos`, `requests.ciudad/provincia`, tablas
`messages`/`payments`/`pro_applications`, buckets `request-photos` y
`solicitudes` creados a mano). Si vas a escribir una migración nueva,
**no asumas que el estado acá descripto es el real** — confirmá contra la
base antes de escribir `ALTER`/`DROP`.

## Migraciones (`migrations/`)

Listadas en orden. "Aplicada" refleja lo confirmado contra producción, no
solo que el archivo exista acá.

| Archivo | Qué hace |
|---|---|
| `…_fix_requests_rls.sql` | **Fix crítico de privacidad.** Antes cualquiera con la anon key podía leer todas las solicitudes (con dirección). Ahora el SELECT es solo para el dueño y para profesionales autenticados (solo solicitudes abiertas). |
| `…_dedupe_rls_policies.sql` | Elimina las policies duplicadas (inglés + español) de `profiles`, `professionals`, `quotes`. Deja un único set que usa `(select auth.uid())`. Restringe la lectura de `professionals` a autenticados. |
| `…_protect_columns.sql` | Triggers que impiden que un pro se auto-verifique (`verified/rating/jobs_completed`) y que un cliente edite el monto de un presupuesto. Índice único: un solo presupuesto aceptado por solicitud. |
| `…_quote_flow.sql` | Trigger `pending → quoted` al insertar una quote (antes RLS lo bloqueaba silenciosamente). RPC atómico `accept_quote()`. Backfill de solicitudes inconsistentes. |
| `…_ticket_and_new_user.sql` | `ticket_id` asignado server-side de forma única (antes random de 4 dígitos en el cliente → colisiones). Trigger `handle_new_user` que crea el perfil al registrarse (evita usuarios huérfanos). |
| `…_perf_and_updated_at.sql` | Índices para FKs sin cubrir. Auto-actualización de `updated_at`. |
| `…_harden_functions_and_merge_policy.sql` | Revoca `EXECUTE` de las funciones de trigger (no deben ser RPC). Unifica las policies de SELECT de `requests`. |
| `…_accept_cascade_compat.sql` | Compatibilidad de `accept_quote()` con el borrado en cascada de solicitudes/presupuestos. |
| `…_pro_profile_fields.sql` | **Nunca se aplicó a producción** (confirmado 2026-08-13). El archivo queda como registro de la intención original; los campos de `profiles` que agregaba los repuso `…_move_dni_to_private_table.sql`, y los de `professionals` (DNI) deliberadamente NO se repusieron ahí — ver esa migración. |
| `…_professional_profile_fields.sql` | Agrega `avatar_url/rubros/localidad/residencia` a `professionals` (directorio). Crea `professional_verification` (tabla privada, solo el dueño) para DNI y dirección exacta — `professionals` es legible por cualquier autenticado, esos datos no pueden vivir ahí. |
| `…_storage_buckets.sql` | Buckets `avatars` (público) y `dni` (privado, solo el dueño), con policies por carpeta `<user_id>/…`. |
| `…_move_dni_to_private_table.sql` | **Aplicada 2026-08-13.** Agrega `username/address/province` a `profiles` y `dni_number` a `professional_verification` (los que `pro_profile_fields.sql` iba a poner en `professionals`, legible por cualquier autenticado — no correspondía). Actualiza `handle_new_user` para poblar los campos nuevos de `profiles` y crear la fila de `professionals` sin tocar datos de DNI. |
| `…_request_images.sql` | **Aplicada 2026-08-13.** No agrega columna — `requests.fotos text[]` ya existía. Encontró DOS intentos previos incompletos hechos a mano: bucket `request-photos` (privado, folder=uploader, un profesional no podía ver fotos ajenas) y bucket `solicitudes` (público, cualquiera veía cualquier foto). Se dejó `solicitudes` como bucket único, ahora privado, con policies calcadas de `requests_select` (dueño o profesional mientras está abierta). El bucket `request-photos` (vacío, sin uso) se borró a mano desde Storage → Buckets del dashboard, no por SQL — Supabase bloquea `DELETE` directo sobre `storage.objects`/`storage.buckets` (trigger `storage.protect_delete()`, hay que usar la Storage API/UI). El `DELETE FROM` que queda en el archivo documenta la intención pero **falla si se corre por el SQL editor**. |
| `…_fix_client_quote_visibility.sql` | **Aplicada 2026-08-17.** El cliente no veía en "Mis obras" los presupuestos que le llegaban: `mis-obras.js`/`client-solicitud.js` pedían `profiles!quotes_pro_id_fkey(...)` — esa FK (`quotes.pro_id`) apunta a `professionals`, no a `profiles`, y además pedían una columna `email` que `profiles` no tiene, así que PostgREST rechazaba el `select` completo (error silenciado con `console.warn` o ni siquiera chequeado). Y aunque se arreglara el `select`, `profiles_select_own` solo deja leer el propio perfil — el cliente jamás podría leer `first_name/last_name` del pro. RPC nueva `get_quote_professionals(p_request_ids)` (`SECURITY DEFINER`): expone solo nombre/apellido, y solo de pros que cotizaron en solicitudes del que llama (no se amplió la policy de `profiles`, para no exponer `phone/address/city/province/username` a terceros). |

## Paso manual pendiente (no se puede hacer por SQL)

- **Activar "Leaked password protection"** en el panel: Authentication → Policies /
  Password. Chequea contraseñas contra HaveIBeenPwned. Lo marca el linter de
  seguridad de Supabase.

## Cómo se aplicaron

La mayoría vía el MCP de Supabase (`apply_migration`) contra el proyecto de
producción. `…_move_dni_to_private_table.sql` y `…_request_images.sql`
(2026-08-13) se aplicaron a mano por el SQL editor del dashboard porque el
MCP devolvía error de autenticación contra la base — por eso convenía
verificar el esquema real antes de escribir esas dos (ver advertencia
arriba). Si en el futuro se usa el CLI de Supabase, estos archivos ya sirven
como historial reproducible del esquema — pero confirmá contra la base antes
de asumir que algo de acá está aplicado.
