-- Ciclo 2 (Ambientes) -- control de migraciones.
--
-- Por que existe: el arranque inicial de Postgres (initdb) solo corre las
-- migraciones UNA vez, cuando el volumen de datos esta vacio. Un cambio de
-- esquema posterior (migracion nueva) no llegaba a servidores ya creados.
-- scripts/migrar.sh aplica las pendientes y esta tabla dice cuales ya
-- corrieron, con la huella SHA-256 del archivo para detectar si una migracion
-- ya aplicada fue editada despues (no se debe: se corrige con una nueva).
--
-- Idempotente a proposito: la corre initdb, y tambien la corre migrar.sh antes
-- de revisar pendientes. No es accesible desde la API (sin grants, con RLS).

create schema if not exists core;

create table if not exists core.schema_migraciones (
  nombre      text primary key,
  sha256      text not null,
  origen      text not null check (origen in ('initdb', 'runner', 'adoptada')),
  aplicada_en timestamptz not null default now()
);

comment on table core.schema_migraciones is 'Control de migraciones del backend: una fila por archivo de db/migrations ya aplicado. Lo escriben el arranque inicial (origen initdb), scripts/migrar.sh (runner) o una adopcion manual (adoptada). Nunca se edita a mano.';
comment on column core.schema_migraciones.nombre is 'Nombre del archivo, por ejemplo 121_rename_rol_administrador_titular.sql.';
comment on column core.schema_migraciones.sha256 is 'Huella SHA-256 del contenido del archivo en el momento de aplicarse.';
comment on column core.schema_migraciones.origen is 'initdb = aplicada al crear la base; runner = aplicada por scripts/migrar.sh; adoptada = base preexistente marcada a mano con --adoptar-hasta.';
comment on column core.schema_migraciones.aplicada_en is 'Momento en que se registro como aplicada.';

alter table core.schema_migraciones enable row level security;
revoke all on core.schema_migraciones from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on core.schema_migraciones from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on core.schema_migraciones from authenticated';
  end if;
end $$;
