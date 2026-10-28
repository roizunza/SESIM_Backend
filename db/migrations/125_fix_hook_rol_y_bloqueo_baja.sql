-- Ciclo 1 -- correcciones encontradas en la primera corrida real (27-oct-2026,
-- scripts/pruebas-tangibles.sh).
--
-- 1. El pase de sesion NO traia el claim "rol".
--    Causa: GoTrue ejecuta el hook como el rol supabase_auth_admin, y
--    core.perfil tiene RLS FORZADA sin ninguna policy para ese rol: el SELECT
--    del hook devolvia 0 filas, v_rol quedaba null y el claim salia "rol": null.
--    Arreglo: policy de solo lectura para supabase_auth_admin (es la forma que
--    documenta Supabase para los Custom Access Token Hooks).
--
-- 2. Dar de baja una cuenta no impedia que volviera a iniciar sesion.
--    La baja logica (core.perfil.activo = false) ya quita todo permiso de
--    negocio (core.rol_actual() exige activo), pero GoTrue seguia emitiendo
--    pases. Arreglo: un trigger marca la cuenta como bloqueada en GoTrue
--    (auth.users.banned_until) al darla de baja y la desbloquea al
--    reactivarla. Bloquea el inicio de sesion y la renovacion del pase; un
--    pase ya emitido sigue vivo hasta que expire (JWT_EXPIRY, 1 h por defecto)
--    pero sin permisos de negocio.

drop policy if exists perfil_select_auth_admin on core.perfil;
create policy perfil_select_auth_admin on core.perfil
  for select
  to supabase_auth_admin
  using (true);

comment on policy perfil_select_auth_admin on core.perfil is 'Permite al hook de GoTrue (supabase_auth_admin) leer el rol al emitir el pase de sesion. Solo lectura; no expone nada a la API.';

create or replace function core.fn_bloquear_cuenta_en_baja()
returns trigger
language plpgsql
security definer
set search_path = core, auth, public
as $$
begin
  if new.activo is distinct from old.activo then
    update auth.users
       set banned_until = case when new.activo then null else 'infinity'::timestamptz end
     where id = new.id_usuario;
  end if;
  return new;
end;
$$;

comment on function core.fn_bloquear_cuenta_en_baja() is 'Al cambiar core.perfil.activo, bloquea (banned_until = infinity) o desbloquea la cuenta en GoTrue (auth.users) para que una baja logica tambien impida iniciar sesion.';

revoke all on function core.fn_bloquear_cuenta_en_baja() from public;

drop trigger if exists trg_bloquear_cuenta_en_baja on core.perfil;
create trigger trg_bloquear_cuenta_en_baja
  after update of activo on core.perfil
  for each row execute function core.fn_bloquear_cuenta_en_baja();
