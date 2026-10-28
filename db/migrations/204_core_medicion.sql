-- Ciclo 3 -- Bloque MESO/TRANSVERSAL de medicion: periodo, medicion_indicador y
-- evidencia_medicion (medios de verificacion con huella SHA-256).
--
-- El usuario de v2.2 es la cuenta de Supabase: usuario.id = auth.users.id (D-02), y su
-- rol vive en core.perfil. Por eso las llaves de usuario apuntan a core.perfil(id_usuario).

create table core.periodo (
  id            integer generated always as identity primary key,
  anio          integer not null check (anio between 2000 and 2100),
  etiqueta      text not null unique check (btrim(etiqueta) <> ''),
  tipo_periodo  text check (tipo_periodo in ('anual','semestral','trimestral','mensual')),
  fecha_inicio  date,
  fecha_fin     date,
  constraint periodo_fechas check (fecha_fin is null or fecha_inicio is null or fecha_fin >= fecha_inicio)
);

create table core.medicion_indicador (
  id                  uuid primary key default gen_random_uuid(),
  id_indicador        varchar(10) not null references core.indicador(id),
  id_unidad           varchar(9)  not null references core.unidad_territorial(id),
  id_periodo          integer     not null references core.periodo(id),
  usuario_captura     uuid        not null references core.perfil(id_usuario),
  usuario_validacion  uuid        references core.perfil(id_usuario),
  valor               numeric,
  valor_texto         text,
  desagregaciones     jsonb not null default '{}'::jsonb,
  estado              text  not null default 'borrador'
                      check (estado in ('borrador','revision','rechazado','vigente_admin','vigente_publico')),
  fecha_captura       timestamptz not null default now(),
  fecha_validacion    timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint medicion_unica unique (id_indicador, id_unidad, id_periodo),
  constraint medicion_con_valor check (valor is not null or btrim(coalesce(valor_texto, '')) <> ''),
  -- cuatro ojos: quien captura no valida su propia medicion
  constraint medicion_cuatro_ojos check (usuario_validacion is null or usuario_validacion <> usuario_captura),
  -- COMPUERTA DE VALIDACION: sin firma y fecha de validacion no hay vigente ni rechazo
  constraint medicion_firma_validacion check (
    estado in ('borrador','revision')
    or (usuario_validacion is not null and fecha_validacion is not null)),
  constraint medicion_desagregaciones_obj check (jsonb_typeof(desagregaciones) = 'object')
);
create index medicion_indicador_ind_idx on core.medicion_indicador (id_indicador);
create index medicion_indicador_uni_idx on core.medicion_indicador (id_unidad);
create index medicion_indicador_per_idx on core.medicion_indicador (id_periodo);
create index medicion_indicador_est_idx on core.medicion_indicador (estado);
create index medicion_indicador_cap_idx on core.medicion_indicador (usuario_captura);

-- Solo se captura sobre fichas aprobadas y activas (D-13). Es regla entre tablas, por eso va
-- en trigger y no en CHECK.
create or replace function core.fn_medicion_exige_indicador_aprobado()
returns trigger language plpgsql set search_path = core, public as $$
declare v_ok boolean;
begin
  select (estatus_aprobado and activo) into v_ok from core.indicador where id = new.id_indicador;
  if not coalesce(v_ok, false) then
    raise exception 'El indicador % no esta aprobado o esta dado de baja: no admite mediciones.', new.id_indicador
      using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger trg_medicion_indicador_aprobado
  before insert on core.medicion_indicador
  for each row execute function core.fn_medicion_exige_indicador_aprobado();

create table core.evidencia_medicion (
  id              uuid primary key default gen_random_uuid(),
  id_medicion     uuid not null references core.medicion_indicador(id) on delete cascade,
  id_usuario      uuid not null references core.perfil(id_usuario),
  url_archivo     text not null check (btrim(url_archivo) <> ''),
  tipo_documento  text not null check (btrim(tipo_documento) <> ''),
  hash_archivo    char(64) not null unique check (hash_archivo ~ '^[0-9a-f]{64}$'),
  fecha_subida    timestamptz not null default now()
);
create index evidencia_medicion_med_idx on core.evidencia_medicion (id_medicion);
