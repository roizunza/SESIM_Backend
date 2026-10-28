-- Ciclo 3 -- Bloque TRANSVERSAL: bitacora general de cambios (solo insercion), dictamenes
-- de revision, hallazgos de auditoria e invitaciones.
--
-- Nota de equivalencia con el documento v2.2: `usuario` y `perfil` del documento viven en
-- auth.users (credencial) + core.perfil (rol, baja logica) -- Ciclo 1. `bitacora` del documento
-- es core.bitacora_cambio (esta); core.bitacora (Ciclo 1) registra solo las cuentas.

create table core.bitacora_cambio (
  id              uuid primary key default gen_random_uuid(),
  id_usuario      uuid references core.perfil(id_usuario),
  tabla_afectada  text not null,
  id_registro     text not null,
  accion          text not null check (accion in ('INSERT','UPDATE','DELETE','CAMBIO_ESTADO')),
  datos_previos   jsonb,
  datos_nuevos    jsonb,
  ip_origen       inet,
  fecha           timestamptz not null default now(),
  constraint bitacora_cambio_fotos check (
    (accion = 'INSERT' and datos_previos is null and datos_nuevos is not null)
    or (accion = 'DELETE' and datos_previos is not null and datos_nuevos is null)
    or (accion in ('UPDATE','CAMBIO_ESTADO') and datos_previos is not null and datos_nuevos is not null))
);
create index bitacora_cambio_tabla_idx on core.bitacora_cambio (tabla_afectada, fecha desc);
create index bitacora_cambio_reg_idx   on core.bitacora_cambio (tabla_afectada, id_registro);

-- Insert-only: ni UPDATE ni DELETE ni TRUNCATE, ni siquiera el dueno de la tabla.
create or replace function core.fn_bitacora_cambio_solo_insercion()
returns trigger language plpgsql as $$
begin
  raise exception 'core.bitacora_cambio es de solo insercion (% bloqueado).', tg_op
    using errcode = 'insufficient_privilege';
end $$;
create trigger trg_bitacora_cambio_inmutable
  before update or delete on core.bitacora_cambio
  for each row execute function core.fn_bitacora_cambio_solo_insercion();
create trigger trg_bitacora_cambio_no_truncate
  before truncate on core.bitacora_cambio
  for each statement execute function core.fn_bitacora_cambio_solo_insercion();

-- Dictamen de revision (D-04): el Administrador deja constancia de cada decision sobre un objeto.
create table core.dictamen (
  id            uuid primary key default gen_random_uuid(),
  objeto_tipo   text not null check (objeto_tipo in ('medicion','capa','indicador')),
  objeto_id     text not null,
  decision      text not null check (decision in ('validar','rechazar','publicar')),
  estado_previo text,
  estado_nuevo  text,
  comentario    text,
  id_usuario    uuid not null references core.perfil(id_usuario),
  fecha         timestamptz not null default now(),
  -- rechazar exige comentario (regla 4 del flujo)
  constraint dictamen_rechazo_con_comentario check (decision <> 'rechazar' or btrim(coalesce(comentario, '')) <> '')
);
create index dictamen_objeto_idx on core.dictamen (objeto_tipo, objeto_id, fecha desc);

-- Hallazgo del Auditor sobre una medicion (el Auditor no modifica datos: observa).
create table core.hallazgo_auditoria (
  id            uuid primary key default gen_random_uuid(),
  id_medicion   uuid not null references core.medicion_indicador(id),
  id_auditor    uuid not null references core.perfil(id_usuario),
  descripcion   text not null check (btrim(descripcion) <> ''),
  severidad     text not null check (severidad in ('baja','media','alta')),
  estado        text not null default 'abierto' check (estado in ('abierto','atendido','cerrado')),
  respuesta     text,
  fecha         timestamptz not null default now(),
  fecha_cierre  timestamptz,
  constraint hallazgo_cierre check (estado <> 'cerrado' or fecha_cierre is not null)
);
create index hallazgo_medicion_idx on core.hallazgo_auditoria (id_medicion);

-- Invitacion de alta (R24-R26). La decision vigente es ALTA DIRECTA por el Administrador
-- Titular (Alcances); la tabla queda como mecanismo latente y NO se expone por la API.
create table core.invitacion (
  id                 uuid primary key default gen_random_uuid(),
  token_hash         char(64) not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  rol                text not null check (rol in ('capturista','administrador','administrador_titular','auditor')),
  correo_destino     text not null check (correo_destino ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  id_usuario_emisor  uuid not null references core.perfil(id_usuario),
  expira_en          timestamptz not null,
  usada_en           timestamptz,
  id_usuario_creado  uuid unique references core.perfil(id_usuario),
  revocada           boolean not null default false,
  created_at         timestamptz not null default now(),
  constraint invitacion_vigencia check (expira_en > created_at),
  constraint invitacion_uso check (usada_en is null or not revocada)
);
