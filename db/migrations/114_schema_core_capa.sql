-- Ciclo 3 -- Capa 2 ("el corazon de la plataforma"): catalogo de capas
-- geoespaciales y su multiplicidad real de grupo/eje.
--
-- Estructura basada en la auditoria real de los 7 manifest.json
-- (MapaBase, Diagnostico, Eje_1..Eje_5 -- 81 entradas, 74 id unicos) y una
-- muestra de .geojson reales de cada carpeta -- ver seccion 6.2 y 6.3 de
-- claude/ciclo-3-especificacion-base-datos.md para el detalle completo.
--
-- 1. core.capa NO es "una fila = una geometria". Cada archivo real trae
--    un bloque de ~27 campos de metadata que se repite igual en todas
--    sus features (nomenclatura, proposito, fuente, categoria...) MAS
--    atributos propios por feature que si varian (ej. cada estacion del
--    tranvia tiene su propio nombre y tramo). Diseno confirmado 
--    ("Catalogo + features"): core.capa como catalogo (una fila
--    por archivo/manifest) + core.capa_feature (una fila por feature
--    geografica real, con su propia geometria + sus atributos propios en
--    jsonb) -- asi no se pierde el detalle real y cada feature se puede
--    indexar con GiST de verdad.
--
-- 2. La multiplicidad real de capa NO es capa x eje_estrategico. Se
--    revisaron los 5 manifest de Eje_1 a Eje_5 completos buscando el
--    mismo id en dos ejes distintos (el ejemplo de la ciclovia dado en la
--    sesion anterior) -- no se encontro ningun caso. Lo que si se
--    encontro (5 casos reales) es multiplicidad entre grupo: Mapa
--    Base <-> Diagnostico (4 casos) y Diagnostico <-> Eje 2 (1 caso),
--    nunca Eje <-> Eje. Diseno confirmado ("Generalizar a
--    capa_grupo"): core.grupo, catalogo de 7 valores (Mapa Base,
--    Diagnostico, Eje 1..Eje 5 -- las 5 filas de Eje enlazan por FK a
--    core.eje_estrategico, para no duplicar su nombre/orden) + tabla
--    puente core.capa_grupo(capa_id, grupo_id).
--
-- Nota: la geometria de core.capa_feature se deja generica
-- (geometry(Geometry, 4326), no un solo tipo fijo) porque el propio
-- manifest ya distingue el tipo por capa en capa.geom_tipo (point / line
-- / polygon) -- forzar un solo tipo geometrico a nivel de columna
-- duplicaria ese candado sin necesidad. SRID 4326 (WGS84 / CRS84)
-- confirmado inspeccionando los .geojson reales.
--
-- Sin datos migrados en este archivo: aqui solo va el esquema. Migrar
-- las geometrias reales de los .geojson es un paso aparte (ver seccion 1
-- de la especificacion, paso 3), con su propio conteo de verificacion.

create table core.grupo (
  id                   smallint generated always as identity primary key,
  nombre               text    not null unique,
  eje_estrategico_id   integer references core.eje_estrategico(id) on delete restrict,
  orden                integer not null unique
);

comment on table core.grupo is
  'Catalogo de las 7 categorias reales bajo las que puede vivir una capa: Mapa Base, Diagnostico, Eje 1..Eje 5. Las filas de Eje enlazan a core.eje_estrategico (mismo id/orden que ya usa core.indicador_eje) para no duplicar su nombre; Mapa Base y Diagnostico dejan eje_estrategico_id en null porque no son ejes. Ver seccion 6.3 de claude/ciclo-3-especificacion-base-datos.md.';
comment on column core.grupo.eje_estrategico_id is 'FK a core.eje_estrategico solo para las filas Eje 1..Eje 5. Null en Mapa Base y Diagnostico -- esas dos categorias no son ejes estrategicos.';

create table core.capa (
  id                     text primary key,
  label                  text    not null,
  archivo                text    not null,
  geom_tipo              text    not null,
  tema                   text,
  nomenclatura           text,
  tiene_simbologia       boolean not null default false,

  -- Bloque de metadata real (~27 campos), igual en todas las features de
  -- un mismo archivo -- confirmado inspeccionando .geojson reales de
  -- MapaBase/Diagnostico/EjesEstrategicos (ver seccion 6.2).
  nombre                 text,
  proposito              text,
  descripcion            text,
  fuente                 text,
  categoria              text,
  modulo                 text,
  tema_subgrupo          text,
  cobertura              text,
  fecha                  text,
  instrumento            text,
  horizonte_planeacion   text,
  eje_evaluacion         text,
  periodicidad           text,
  responsable            text,
  restricciones          text,
  proyeccion             text,
  estatus                text,
  tipo_dato              text,
  geometria              text,
  dominio_valores        text,
  tamanio_archivo_kb     numeric,
  extension_norte        numeric,
  extension_sur          numeric,
  extension_este         numeric,
  extension_oeste        numeric,

  creado_en              timestamptz not null default now(),

  constraint capa_geom_tipo_valido
    check (geom_tipo in ('point', 'line', 'polygon'))
);

comment on table core.capa is
  'Catalogo de capas geoespaciales -- una fila por archivo/manifest real (id = el campo "id" del manifest.json de origen). Las geometrias reales viven en core.capa_feature, una fila por feature. Ver seccion 6.2 de claude/ciclo-3-especificacion-base-datos.md.';
comment on column core.capa.id is 'Id real del manifest.json de origen (ej. c04_estacionestm_sedatu_2024). Es la misma capa aunque aparezca en mas de un manifest -- eso es lo que resuelve core.capa_grupo, no una fila duplicada aqui.';
comment on column core.capa.label is 'Campo "label" del manifest: nombre corto para listas/menus.';
comment on column core.capa.archivo is 'Campo "archivo" del manifest: nombre del .geojson de origen.';
comment on column core.capa.geom_tipo is 'Campo "geom" del manifest: point | line | polygon.';
comment on column core.capa.tema is 'Campo "tema" del manifest de origen (ej. eje_estrategico_5) -- se conserva tal cual para trazabilidad, aunque la pertenencia real ya vive en core.capa_grupo.';
comment on column core.capa.nomenclatura is 'Campo "nomenclatura" del manifest/geojson (ej. 5GEN, 1DET, 3MOVACT).';
comment on column core.capa.tiene_simbologia is 'Campo "tieneSimbologia" del manifest.';
comment on column core.capa.tamanio_archivo_kb is 'Campo "tamanio_archivo_kb" del geojson de origen -- referencia, no se recalcula.';

create index capa_geom_tipo_idx on core.capa (geom_tipo);

create table core.capa_feature (
  id          bigint generated always as identity primary key,
  capa_id     text    not null references core.capa(id) on delete cascade,
  geom        geometry(Geometry, 4326) not null,
  atributos   jsonb   not null default '{}'::jsonb,
  creado_en   timestamptz not null default now()
);

comment on table core.capa_feature is
  'Una fila por feature geografica real de un .geojson (no una sola geometria por archivo) -- preserva atributos propios por elemento (ej. nombre/tramo de cada estacion) que el catalogo core.capa no puede cargar porque son de la feature, no del archivo. SRID 4326 (WGS84 / CRS84), confirmado en los .geojson reales.';
comment on column core.capa_feature.geom is 'Geometria real de la feature. Tipo generico (Geometry) porque el tipo concreto (point/line/polygon) ya lo fija core.capa.geom_tipo por archivo.';
comment on column core.capa_feature.atributos is 'Propiedades propias de esta feature, mas alla del bloque de metadata comun que ya vive en core.capa (ej. name/tramo de una estacion, nombre_orig/estrategia de un punto de estrategia).';

create index capa_feature_capa_idx on core.capa_feature (capa_id);
create index capa_feature_geom_gist on core.capa_feature using gist (geom);

create table core.capa_grupo (
  capa_id    text     not null references core.capa(id) on delete cascade,
  grupo_id   smallint not null references core.grupo(id) on delete cascade,
  primary key (capa_id, grupo_id)
);

comment on table core.capa_grupo is
  'Tabla puente capa x grupo -- reemplaza el diseno original capa_eje (sin evidencia real, ver seccion 6.3). Una capa puede vivir en 1 o mas de los 7 grupos (Mapa Base, Diagnostico, Eje 1..Eje 5) sin duplicar su fila en core.capa. Confirmado con los 5 casos reales de traslape encontrados en los manifest.json.';
