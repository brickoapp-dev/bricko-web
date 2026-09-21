-- Fix encontrado con get_advisors() al aplicar 20260921120000: is_admin(),
-- admin_list_pending_verifications() y admin_review_verification() quedaron
-- ejecutables por `anon` a pesar del `REVOKE ALL ... FROM PUBLIC` -- en este
-- proyecto `anon`/`authenticated` tienen EXECUTE por default privileges
-- sobre toda función nueva del schema public (así es como landing_stats()
-- queda pensado para anon a propósito), así que revocar de PUBLIC no alcanza
-- para sacarle el permiso a `anon` puntualmente. Mismo fix que ya se hizo en
-- get_request_owners.sql: `REVOKE ALL ... FROM PUBLIC, anon` explícito.
-- landing_stats() no se toca: esa sí es pública a propósito.

revoke all on function public.is_admin() from public, anon;
revoke all on function public.admin_list_pending_verifications() from public, anon;
revoke all on function public.admin_review_verification(uuid, text, text) from public, anon;
