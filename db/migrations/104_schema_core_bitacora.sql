-- Bitacora de CUENTAS (Ciclo 1, paso 6): registra altas, cambios de rol,
-- cambios de ambito y bajas/reactivaciones sobre core.perfil.
--
-- No confundir con la "Mi Bitacora" del Capturista (CapturistaBitacora.jsx,
-- front): esa es la bitacora de SOLICITUDES de cartografia (Ciclo 5), vive
-- solo en memoria del navegador porque todavia no existe backend de
-- solicitudes. Esta de aqui es sobre CUENTAS/PERFILES (quien se dio de alta,
-- a quien le cambiaron el rol, a quien se le dio de baja), y si tiene tabla
-- real desde el dia uno porque core.perfil ya existe.

create table if not exists core.bitacora (
  id                 uuid primary key default gen_random_uuid(),

  -- Quien hizo el cambio. Puede ser null en teoria (ej. una migracion de
  -- datos corrida a mano), pero en la practica siempre es un
  -- administrador/administrador_vip (para cambio_rol/cambio_ambito/baja/
  -- reactivacion) o el propio administrador_vip que da de alta (para alta).
  actor_id_usuario   uuid references auth.users(id) on delete set null,
  actor_rol          text,

  -- Sobre que cuenta fue el cambio.
  objetivo_id_usuario uuid not null references auth.users(id) on delete cascade,
  -- Snapshot del rol de la cuenta afectada AL MOMENTO del evento (no una FK
  -- viva a core.perfil.rol): asi un cambio de rol posterior no reescribe la
  -- historia, y las policies de RLS (siguiente archivo) pueden filtrar por
  -- "bitacora de cuentas capturista/administrador/..." sin tener que hacer
  -- join contra el estado actual del perfil.
  objetivo_rol       text not null,

  accion             text not null,
  detalle            jsonb not null default '{}'::jsonb,
  creado_en          timestamptz not null default now(),

  constraint bitacora_accion_valida
    check (accion in ('alta', 'cambio_rol', 'cambio_ambito', 'baja', 'reactivacion'))
);

comment on table core.bitacora is 'Bitacora de cuentas (Ciclo 1, paso 6): alta/cambio_rol/cambio_ambito/baja/reactivacion sobre core.perfil. No es la bitacora de solicitudes de cartografia (esa es Ciclo 5, todavia sin tabla propia).';
comment on column core.bitacora.actor_id_usuario is 'Quien hizo el cambio. Se resuelve via auth.uid() cuando el UPDATE viene de PostgREST (front), o via current_setting(''app.actor_id'') cuando el INSERT viene de servicio-procesos (alta de usuarios, que usa una conexion de servicio sin JWT de PostgREST) -- ver la funcion mas abajo.';
comment on column core.bitacora.objetivo_rol is 'Snapshot del rol de la cuenta afectada al momento del evento, no una referencia viva a core.perfil -- para que un cambio de rol posterior no reescriba entradas pasadas y para que las policies de RLS puedan filtrar sin depender del estado actual.';

create index if not exists bitacora_objetivo_idx on core.bitacora (objetivo_id_usuario, creado_en desc);
create index if not exists bitacora_objetivo_rol_idx on core.bitacora (objetivo_rol, creado_en desc);

---------------------------------------------------------------------------
-- Trigger: escribe en core.bitacora cada vez que cambia core.perfil.
--
-- security definer a proposito (igual que core.rol_actual()): quien hace el
-- UPDATE es el rol de Postgres "authenticated" (un administrador/
-- administrador_vip real, del lado de negocio), y NO tiene ningun GRANT para
-- insertar en core.bitacora (a proposito -- nadie escribe la bitacora a
-- mano, solo este trigger). Sin security definer, el INSERT de aqui abajo
-- fallaria por permisos.
---------------------------------------------------------------------------
create or replace function core.fn_bitacora_perfil()
returns trigger
language plpgsql
security definer
set search_path = core, auth, public
as $$
declare
  v_actor uuid;
  v_actor_rol text;
begin
  -- auth.uid() resuelve solo cuando la sesion viene de PostgREST (tiene el
  -- claim request.jwt.claims). El alta de usuarios (INSERT) la hace
  -- servicio-procesos con una conexion de psycopg2 directa -- sin eso, pero
  -- que hace `SET LOCAL app.actor_id = '<uuid>'` antes del INSERT (ver
  -- servicio-procesos/main.py) con el id de quien esta dando de alta.
  v_actor := coalesce(auth.uid(), nullif(current_setting('app.actor_id', true), '')::uuid);

  if v_actor is not null then
    select rol into v_actor_rol from core.perfil where id_usuario = v_actor;
  end if;

  if tg_op = 'INSERT' then
    insert into core.bitacora (actor_id_usuario, actor_rol, objetivo_id_usuario, objetivo_rol, accion, detalle)
    values (
      v_actor, v_actor_rol, new.id_usuario, new.rol, 'alta',
      jsonb_build_object('rol', new.rol, 'ambito', new.ambito, 'cve_mun', new.cve_mun, 'dependencia', new.dependencia)
    );
    return new;
  end if;

  -- tg_op = 'UPDATE': puede haber mas de un tipo de cambio en el mismo
  -- UPDATE (ej. cambia de rol Y se da de baja en la misma llamada) -- se
  -- registra una fila por cada tipo de cambio detectado, no una sola fila
  -- generica, para que cada entrada de la bitacora describa UN evento.
  if old.rol is distinct from new.rol then
    insert into core.bitacora (actor_id_usuario, actor_rol, objetivo_id_usuario, objetivo_rol, accion, detalle)
    values (
      v_actor, v_actor_rol, new.id_usuario, new.rol, 'cambio_rol',
      jsonb_build_object('rol_anterior', old.rol, 'rol_nuevo', new.rol)
    );
  end if;

  if old.ambito is distinct from new.ambito or old.cve_mun is distinct from new.cve_mun then
    insert into core.bitacora (actor_id_usuario, actor_rol, objetivo_id_usuario, objetivo_rol, accion, detalle)
    values (
      v_actor, v_actor_rol, new.id_usuario, new.rol, 'cambio_ambito',
      jsonb_build_object('ambito_anterior', old.ambito, 'cve_mun_anterior', old.cve_mun, 'ambito_nuevo', new.ambito, 'cve_mun_nuevo', new.cve_mun)
    );
  end if;

  if old.activo = true and new.activo = false then
    insert into core.bitacora (actor_id_usuario, actor_rol, objetivo_id_usuario, objetivo_rol, accion, detalle)
    values (v_actor, v_actor_rol, new.id_usuario, new.rol, 'baja', '{}'::jsonb);
  elsif old.activo = false and new.activo = true then
    insert into core.bitacora (actor_id_usuario, actor_rol, objetivo_id_usuario, objetivo_rol, accion, detalle)
    values (v_actor, v_actor_rol, new.id_usuario, new.rol, 'reactivacion', '{}'::jsonb);
  end if;

  return new;
end;
$$;

comment on function core.fn_bitacora_perfil() is 'Trigger de core.perfil: escribe en core.bitacora en cada alta/cambio_rol/cambio_ambito/baja/reactivacion. security definer para poder insertar en core.bitacora aunque "authenticated" no tenga GRANT directo sobre esa tabla.';

drop trigger if exists trg_bitacora_perfil on core.perfil;
create trigger trg_bitacora_perfil
  after insert or update on core.perfil
  for each row
  execute function core.fn_bitacora_perfil();
