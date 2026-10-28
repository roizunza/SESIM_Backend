-- Ciclo 1 -- correccion de la 125, vista en el registro de GoTrue (corrida real
-- del 27-oct-2026): "error finding user: Scan error on column banned_until:
-- unsupported Scan, storing driver.Value type string into type *time.Time".
--
-- Causa: la 125 bloqueaba la cuenta con banned_until = 'infinity', y GoTrue
-- (Go) no sabe leer esa fecha: el inicio de sesion fallaba con un error
-- interno (500) en vez de decir "cuenta bloqueada". Funcionaba por accidente.
-- Arreglo: una fecha finita muy lejana (100 anios), que es lo que usa
-- Supabase para "bloqueo indefinido" (876000 h).

create or replace function core.fn_bloquear_cuenta_en_baja()
returns trigger
language plpgsql
security definer
set search_path = core, auth, public
as $$
begin
  if new.activo is distinct from old.activo then
    update auth.users
       set banned_until = case when new.activo then null else now() + interval '100 years' end
     where id = new.id_usuario;
  end if;
  return new;
end;
$$;

comment on function core.fn_bloquear_cuenta_en_baja() is 'Al cambiar core.perfil.activo, bloquea (banned_until = ahora + 100 anios) o desbloquea la cuenta en GoTrue para que una baja logica tambien impida iniciar sesion. No usa infinity: GoTrue no puede leer esa fecha.';

-- Cuentas que la 125 dejo con infinity: se llevan a la fecha finita.
update auth.users
   set banned_until = now() + interval '100 years'
 where banned_until = 'infinity'::timestamptz;
