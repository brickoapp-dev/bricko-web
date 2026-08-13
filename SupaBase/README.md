# Supabase — esquema y migraciones

Este directorio versiona los cambios de backend (base de datos) que antes se
hacían a mano por el dashboard. El proyecto es `wkyqetwyswocrohayiss`.

## Migraciones (`migrations/`)

Aplicadas en orden. Cada archivo es idempotente en lo posible.

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
| `…_pro_profile_fields.sql` | Campos extendidos de registro (`profiles`: username/avatar/address/province; `professionals`: rubros/DNI). `handle_new_user` empieza a leer esos campos de la metadata del signup. |
| `…_professional_profile_fields.sql` | Agrega `avatar_url/rubros/localidad/residencia` a `professionals` (directorio). Crea `professional_verification` (tabla privada, solo el dueño) para DNI y dirección exacta — `professionals` es legible por cualquier autenticado, esos datos no pueden vivir ahí. |
| `…_storage_buckets.sql` | Buckets `avatars` (público) y `dni` (privado, solo el dueño), con policies por carpeta `<user_id>/…`. |
| `…_move_dni_to_private_table.sql` | **Fix crítico de privacidad.** `pro_profile_fields.sql` había dejado `dni_number/dni_front_url/dni_back_url` en `professionals` (legible por cualquier autenticado) a pesar de que ya existía `professional_verification`. Migra los datos existentes y elimina esas columnas de la tabla pública; `handle_new_user` deja de escribirlas ahí. |
| `…_request_images.sql` | Columna `imagenes text[]` en `requests` + bucket privado `solicitudes` (antes las fotos se comprimían a base64 y se pegaban como texto dentro de `descripcion`, sin bucket real). Policies de lectura calcadas de `requests_select` (dueño o profesional mientras está abierta), escritura solo del dueño. |

## Paso manual pendiente (no se puede hacer por SQL)

- **Activar "Leaked password protection"** en el panel: Authentication → Policies /
  Password. Chequea contraseñas contra HaveIBeenPwned. Lo marca el linter de
  seguridad de Supabase.

## Cómo se aplicaron

Vía el MCP de Supabase (`apply_migration`) contra el proyecto de producción.
Si en el futuro se usa el CLI de Supabase, estos archivos ya sirven como
historial reproducible del esquema.
