-- Ciclo 3 -- Bloque MACRO: lo que ordena el marco de planeacion (ejes, sectores, fuentes,
-- instrumentos de origen y la matriz de indicadores de cada PIMUS).

create table core.eje_tematico (
  id          integer primary key,
  numero_eje  integer not null unique check (numero_eje between 1 and 5),
  nombre      text not null check (btrim(nombre) <> ''),
  activo      boolean not null default true
);

create table core.sector (
  id      varchar(5) primary key,
  nombre  text not null check (btrim(nombre) <> ''),
  tipo    text not null check (tipo in ('original','definitivo')),
  activo  boolean not null default true,
  -- SD-xx = sector definitivo; SO-xx = sector original (OBS-11: equivalencia SO->SD pendiente)
  constraint sector_prefijo_tipo check (
    (tipo = 'definitivo' and id like 'SD-%') or (tipo = 'original' and id like 'SO-%'))
);

create table core.fuente_informacion (
  id      integer primary key,
  nombre  text not null check (btrim(nombre) <> ''),
  siglas  text,
  activo  boolean not null default true
);

create table core.instrumento_origen (
  id                varchar(12) primary key,
  uuid_legado       uuid unique,
  clave             text not null unique,
  nombre            text not null,
  ambito            text not null check (ambito in ('Estatal','Municipal')),
  id_unidad_ambito  varchar(9) references core.unidad_territorial(id),
  competencia       text,
  vigencia_desde    date,
  vigencia_hasta    date,
  activo            boolean not null default true,
  constraint instrumento_ambito_municipio check (
    (ambito = 'Estatal' and id_unidad_ambito is null)
    or (ambito = 'Municipal' and id_unidad_ambito is not null)),
  constraint instrumento_vigencia check (vigencia_hasta is null or vigencia_desde is null or vigencia_hasta >= vigencia_desde)
);

create table core.matriz_instrumento (
  id               varchar(14) primary key,
  id_instrumento   varchar(12) not null references core.instrumento_origen(id),
  clave_oe         text,
  objetivo         text,
  meta             text,
  indicador_origen text,
  tendencia        text
);
create index matriz_instrumento_instr_idx on core.matriz_instrumento (id_instrumento);
