-- Ciclo 3 -- Bloque MESO: ficha tecnica del indicador (MIR-SMART), su vinculo con
-- ejes (un eje principal + ejes adicionales), con instrumentos y los umbrales del semaforo.

create table core.indicador (
  id                varchar(10) primary key,
  uuid_legado       uuid unique,
  id_eje            integer not null references core.eje_tematico(id),
  id_sector         varchar(5) not null references core.sector(id),
  id_fuente         integer not null references core.fuente_informacion(id),
  clave             text not null unique,
  nombre            text not null check (btrim(nombre) <> ''),
  variable          text,
  meta              text,
  tendencia         text check (tendencia in ('Ascendente','Descendente')),
  valor_meta        numeric,
  linea_base        numeric,
  anio_linea_base   integer check (anio_linea_base between 2000 and 2100),
  nivel_mir         text not null check (nivel_mir in ('Fin','Propósito','Componentes','Actividades')),
  smart_medible     boolean not null default false,
  smart_alcanzable  boolean not null default false,
  smart_temporal    boolean not null default false,
  estatus_aprobado  boolean not null default false,
  responsable       text,
  activo            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- COMPUERTA DE APROBACION (D-13): una ficha no se aprueba sin saber en que sentido mejora
  -- (tendencia) o sin una meta con cifra. Sin ella el semaforo no tendria con que comparar.
  constraint indicador_compuerta_aprobacion check (
    not estatus_aprobado or tendencia is not null or valor_meta is not null),
  constraint indicador_linea_base_anio check (linea_base is null or anio_linea_base is not null)
);
create index indicador_eje_idx    on core.indicador (id_eje);
create index indicador_sector_idx on core.indicador (id_sector);
create index indicador_fuente_idx on core.indicador (id_fuente);

-- Tabla puente: 14 indicadores atienden mas de un eje (127 vinculos en total).
-- indicador.id_eje es el eje principal; aqui estan todos, el principal incluido.
create table core.indicador_eje (
  id_indicador  varchar(10) not null references core.indicador(id) on delete cascade,
  id_eje        integer     not null references core.eje_tematico(id),
  principal     boolean     not null default false,
  primary key (id_indicador, id_eje)
);
create unique index indicador_eje_un_principal on core.indicador_eje (id_indicador) where principal;

create table core.indicador_instrumento (
  id               integer primary key,
  id_indicador     varchar(10) not null references core.indicador(id),
  id_instrumento   varchar(12) not null references core.instrumento_origen(id),
  id_matriz        varchar(14) references core.matriz_instrumento(id),
  correspondencia  text not null check (correspondencia in ('origen','directa','parcial')),
  -- los vinculos con la EEMSV no tienen renglon de matriz cargado
  constraint indicador_instrumento_matriz check (correspondencia = 'origen' or id_matriz is not null)
);
create index indicador_instrumento_ind_idx on core.indicador_instrumento (id_indicador);
create index indicador_instrumento_ins_idx on core.indicador_instrumento (id_instrumento);

-- Umbrales del semaforo, versionados (D-16 abierta: quien los crea). id_indicador NULL = global.
create table core.umbral_semaforo (
  id               integer generated always as identity primary key,
  id_indicador     varchar(10) references core.indicador(id),
  verde_desde      numeric not null default 90,
  amarillo_desde   numeric not null default 70,
  vigente_desde    date    not null default current_date,
  vigente_hasta    date,
  id_usuario       uuid references core.perfil(id_usuario),
  created_at       timestamptz not null default now(),
  constraint umbral_orden check (verde_desde > amarillo_desde and amarillo_desde > 0),
  constraint umbral_vigencia check (vigente_hasta is null or vigente_hasta >= vigente_desde)
);
-- a lo mas un umbral global vigente
create unique index umbral_global_vigente_uq on core.umbral_semaforo ((1)) where id_indicador is null and vigente_hasta is null;
