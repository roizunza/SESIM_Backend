-- Esquema core: el nucleo de datos de la plataforma. Este archivo solo
-- trae la tabla de perfiles (Ciclo 1); el resto de core.* (indicadores,
-- capas, etc.) se agrega en los ciclos siguientes.
--
-- Cambio de fondo respecto a la version anterior (pre-Supabase): ya no
-- existe un esquema "auth" propio con auth.usuario/auth.token_restablecimiento.
-- Las credenciales viven en auth.users, que trae y administra Supabase
-- (GoTrue) de fabrica. core.perfil solo guarda lo que es del NEGOCIO de
-- SESIM (rol, ambito, dependencia): una fila por persona, ligada 1 a 1 con
-- auth.users.

create schema if not exists core;
comment on schema core is 'Nucleo de datos de SESIM: catalogo, territorio y hechos. No se expone directo por la API; api.* consulta sobre esto.';

create table if not exists core.perfil (
  id           uuid primary key default gen_random_uuid(),
  id_usuario   uuid not null unique references auth.users(id) on delete cascade,
  nombre       text not null,
  rol          text not null,
  ambito       text not null default 'estatal',
  cve_mun      text,
  dependencia  text,
  activo       boolean not null default true,
  creado_en    timestamptz not null default now(),

  constraint perfil_rol_valido
    check (rol in ('capturista', 'administrador', 'administrador_vip', 'auditor')),

  constraint perfil_ambito_valido
    check (ambito in ('estatal', 'municipal')),

  -- El manejo de la plataforma es solo estatal por ahora (decision vigente
  -- desde el arranque de este ciclo): todo perfil se da de alta con
  -- ambito = 'estatal' y cve_mun en null. La columna y el candado se dejan
  -- listos por si el alcance municipal se reactiva mas adelante, para no
  -- tener que migrar de nuevo.
  constraint perfil_ambito_municipio_consistente
    check (
      (ambito = 'municipal' and cve_mun is not null)
      or
      (ambito = 'estatal' and cve_mun is null)
    )
);

comment on table core.perfil is 'Rol, ambito y dependencia de cada persona que usa la plataforma. Una fila por persona, ligada 1 a 1 con auth.users (la tabla de Supabase, no una tabla propia).';
comment on column core.perfil.id_usuario is 'FK a auth.users(id) -- la tabla de credenciales de Supabase. On delete cascade: si se borra la cuenta de auth, se borra el perfil (en la practica no se borra, solo se desactiva con activo=false).';
comment on column core.perfil.rol is 'Catalogo cerrado: capturista | administrador | administrador_vip | auditor. administrador_vip: unica diferencia frente a administrador es que puede dar de alta credenciales nuevas (ver servicio-procesos, endpoint /admin/alta-usuario, y docs/decisiones-pendientes.md).';
comment on column core.perfil.ambito is 'estatal | municipal. Fijo en estatal mientras el manejo de la plataforma sea solo estatal.';
comment on column core.perfil.cve_mun is 'Clave INEGI de municipio. Solo aplica si ambito = municipal; hoy siempre null. No confundir con el cve_mun de los datos territoriales (ese vive en core.observacion/core.capa y sigue activo para filtrar informacion por municipio, aunque el acceso a la plataforma ya no se reparta por municipio).';
comment on column core.perfil.dependencia is 'Area o dependencia institucional de la persona. Pendiente: aun no existe el catalogo real de dependencias (queda NULL hasta tenerlo).';
comment on column core.perfil.activo is 'Baja logica. Dar de baja no borra la fila, solo la desactiva (se conserva su historial en la bitacora).';

create index if not exists perfil_rol_idx on core.perfil (rol);

---------------------------------------------------------------------------
-- core.rol_actual(): rol de negocio de quien hace la consulta ACTUAL,
-- segun auth.uid() (funcion que trae Supabase: uuid del usuario autenticado,
-- o null si la sesion es anonima).
--
-- Va como SECURITY DEFINER a proposito: las policies de RLS de core.perfil
-- (siguiente archivo) llaman a esta funcion para decidir el permiso, y si
-- la funcion NO fuera security definer, entonces resolverla implicaria leer
-- core.perfil, que es la misma tabla que la policy esta evaluando -- eso es
-- exactamente la recursion de RLS que Supabase recomienda evitar con este
-- patron (ver "RLS Performance and Best Practices" en la documentacion de
-- Supabase). Como es security definer, se fija su propio search_path para
-- no depender de con que search_path se llame.
---------------------------------------------------------------------------
create or replace function core.rol_actual()
returns text
language sql
stable
security definer
set search_path = core, auth, public
as $$
  select rol from core.perfil where id_usuario = auth.uid();
$$;

comment on function core.rol_actual() is 'Rol de negocio (capturista | administrador | administrador_vip | auditor) de quien hace la consulta actual, segun auth.uid(). Null si no hay sesion o esa persona no tiene perfil.';

revoke all on function core.rol_actual() from public;
grant execute on function core.rol_actual() to authenticated;
