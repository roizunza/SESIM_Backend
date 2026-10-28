-- Ciclo 3 -- Bloque MICRO: capas tematicas, sus elementos geograficos y su vinculo con indicadores.
-- La estructura queda completa; la carga de los 490,224 elementos y sus geometrias es del
-- Ciclo 9 (representacion territorial).

create table core.capa (
  id              varchar(12) primary key,
  uuid_legado     uuid unique,
  titulo          text not null check (btrim(titulo) <> ''),
  proposito       text,
  tipo_geometria  text not null check (tipo_geometria in ('Punto','Línea','Polígono')),
  srid_origen     integer,
  estatus         text not null default 'borrador'
                  check (estatus in ('borrador','revision','vigente_admin','vigente_publico')),
  responsable     text,
  conjunto_datos  text,
  id_instrumento  varchar(12) references core.instrumento_origen(id),
  metadatos_extra jsonb not null default '{}'::jsonb check (jsonb_typeof(metadatos_extra) = 'object'),
  archivo         text,
  grupos          text,
  nomenclatura    text,
  n_elementos     integer check (n_elementos >= 0),
  geojson         text,
  activo          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- COMPUERTA DE PUBLICACION: una capa solo sale a vigente_publico con su metadato ISO minimo.
  constraint capa_compuerta_publicacion check (
    estatus <> 'vigente_publico'
    or (   btrim(coalesce(metadatos_extra->>'custodio', ''))             <> ''
       and btrim(coalesce(metadatos_extra->>'fuente_origen', ''))        <> ''
       and btrim(coalesce(metadatos_extra->>'linaje', ''))               <> ''
       and btrim(coalesce(metadatos_extra->>'sistema_coordenadas', ''))  <> ''))
);
create index capa_instrumento_idx on core.capa (id_instrumento);
create index capa_estatus_idx     on core.capa (estatus);

create table core.capa_indicador (
  id_capa       varchar(12) not null references core.capa(id) on delete cascade,
  id_indicador  varchar(10) not null references core.indicador(id) on delete cascade,
  primary key (id_capa, id_indicador)
);
create index capa_indicador_ind_idx on core.capa_indicador (id_indicador);

-- Elemento geografico. Los atributos tematicos (jerarquia, sentido, siniestros...) viven en
-- `propiedades` (jsonb) porque cambian por capa.
create table core.capa_vector (
  id           uuid primary key default gen_random_uuid(),
  id_capa      varchar(12) not null references core.capa(id) on delete cascade,
  id_unidad    varchar(9) references core.unidad_territorial(id),
  id_origen    text not null check (btrim(id_origen) <> ''),
  cve_ent      text not null check (cve_ent ~ '^[0-9]{2}$'),
  cve_mun      text not null check (cve_mun ~ '^[0-9]{3}$'),
  cve_loc      text check (cve_loc ~ '^[0-9]{4}$'),
  nombre       text,
  clasif       text,
  fecha_dato   text,
  metodo_cve_mun text check (metodo_cve_mun in ('interseccion','proximidad<=1000m','proximidad_aguas_estatales','fuera_de_campeche')),
  vig_desde    date,
  vig_hasta    date,
  propiedades  jsonb not null default '{}'::jsonb check (jsonb_typeof(propiedades) = 'object'),
  geom         geometry(Geometry, 4326) check (geom is null or not st_isempty(geom)),
  constraint capa_vector_origen_uq unique (id_capa, id_origen)
);
create index capa_vector_capa_idx on core.capa_vector (id_capa);
create index capa_vector_unid_idx on core.capa_vector (id_unidad);
create index capa_vector_gix      on core.capa_vector using gist (geom);

-- Version de la ficha de metadatos de cada capa (D-05): cada cambio de metadatos o de estatus
-- deja una version; la vigente es la mayor.
create table core.capa_version (
  id           uuid primary key default gen_random_uuid(),
  id_capa      varchar(12) not null references core.capa(id) on delete cascade,
  version      integer not null check (version >= 1),
  estatus      text not null,
  metadatos    jsonb not null,
  id_usuario   uuid references core.perfil(id_usuario),
  nota         text,
  created_at   timestamptz not null default now(),
  constraint capa_version_uq unique (id_capa, version)
);
