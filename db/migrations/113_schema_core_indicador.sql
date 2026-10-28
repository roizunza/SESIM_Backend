-- Ciclo 3 -- Capa 2 catalogo de
-- indicadores y su vinculo con los Ejes Estrategicos.
--
-- Estructura basada en la auditoria real de public/Datos/Tablas/Indicadores.csv
-- (113 filas, 14 columnas) -- ver seccion 6.1 de
-- claude/ciclo-3-especificacion-base-datos.md para el detalle completo de
-- cada decision. Resumen de lo que se aparta del diseno original
-- (secciones 3.2/3.3 del mismo documento, ya superadas por la seccion 6):
--
-- - codigo es PK de tipo TEXT, no un id serial inventado: la columna
--   Codigo del CSV (GA01, ACCGIR01, OC01...) es unica y no nula en las
--   113 filas reales -- usarla de PK deja cada fila rastreable a su
--   renglon exacto del CSV, sin tabla de mapeo aparte que se desalinee.
-- - meta es TEXT, no numeric: la mayoria de los 113 valores reales son
--   texto cualitativo ("Aumento del presupuesto actual", "Por definir a
--   nivel estatal"), no numeros. La semaforizacion contra estas metas
--   cualitativas queda pendiente de Ciclo 8 -- Ciclo 3 no inventa un
--   numero donde el CSV no lo da.
-- - smart_medible / smart_alcanzable / smart_temporal son TEXT: cada
--   "no" real trae una razon embebida (ej. "No (Falta temporalidad)"),
--   convertir a boolean perderia esa razon.
-- - competencia es TEXT propio, SIN fk a core.dependencia: Competencia
--   (instituciones externas: SEDATU, Gobierno Estatal, Municipal...) no
--   es el mismo catalogo que core.dependencia (semilla minima interna de
--   SESIM, ver 903_semilla_dependencias.sql) -- mezclarlos juntaria dos
--   cosas distintas.
-- - sector_original y sector_definitivo se conservan como TEXT de
--   referencia (prosa real del CSV), sin normalizar a FK -- sector
--   original tiene 34% de filas "POR DEFINIR" y sector_definitivo es en
--   la practica prosa que ya describe la misma relacion que
--   indicador_eje.
-- - aprobado se normaliza a boolean (upper(trim(x)) = 'SI' al migrar los
--   datos reales) -- limpieza de formato, no invencion: el CSV solo trae
--   '', 'Si', 'SI', nunca 'No' explicito.
--
-- core.indicador_eje: tabla puente confirmada 1:1 con la columna real
-- "Eje(s) vinculado(s)" del CSV (10 combinaciones unicas, digitos 1-5
-- separados por coma) -- mismo principio "el eje no parte la tabla, la
-- etiqueta" (seccion 3.1 de la especificacion) que usa core.capa_grupo
-- (114_schema_core_capa.sql).
--
-- Sin datos migrados en este archivo: aqui solo va el esquema. Migrar
-- las 113 filas reales del CSV es un paso aparte (ver seccion 1 de la
-- especificacion, paso 3), con su propio conteo de verificacion.

create table core.indicador (
  codigo              text primary key,
  nombre              text not null,
  sector_original     text,
  sector_definitivo   text,
  fuente              text,
  competencia         text,
  variable            text,
  meta                text,
  nivel_mir           text,
  smart_medible       text,
  smart_alcanzable    text,
  smart_temporal      text,
  aprobado            boolean not null default false,
  creado_en           timestamptz not null default now()
);

comment on table core.indicador is
  'Catalogo de indicadores EEMSV. PK = codigo real del CSV (Indicadores.csv), no un id inventado. Ver seccion 6.1 de claude/ciclo-3-especificacion-base-datos.md para el detalle de cada columna.';
comment on column core.indicador.codigo is 'Codigo real del CSV (ej. GA01, ACCGIR01, OC01) -- unico y no nulo en las 113 filas reales, se usa como PK.';
comment on column core.indicador.nombre is 'Columna "Indicador" del CSV: nombre/descripcion del indicador.';
comment on column core.indicador.sector_original is 'Columna "Sector original" del CSV -- 21 valores, 34% "POR DEFINIR". Texto de referencia, no normalizado a FK (catalogo todavia en construccion).';
comment on column core.indicador.sector_definitivo is 'Columna "Sector Definitivo" del CSV -- en la practica prosa que ya describe la misma relacion que indicador_eje. Se conserva como texto de referencia; a confirmar si se descarta mas adelante.';
comment on column core.indicador.fuente is 'Columna "Fuente" del CSV: de donde sale el dato del indicador.';
comment on column core.indicador.competencia is 'Columna "Competencia" del CSV: institucion EXTERNA responsable (SEDATU, Gobierno Estatal, Municipal...). NO es core.dependencia -- ver cabecera de este archivo.';
comment on column core.indicador.variable is 'Columna "Variable" del CSV.';
comment on column core.indicador.meta is 'Columna "Meta" del CSV -- TEXT a proposito: mayoritariamente cualitativa, no numerica. No usar para semaforizacion numerica directa (eso es Ciclo 8).';
comment on column core.indicador.nivel_mir is 'Columna "Nivel MIR" del CSV (Matriz de Indicadores para Resultados).';
comment on column core.indicador.smart_medible is 'Columna "SMART: Medible (Unidad)" del CSV -- TEXT: cada "no" trae razon embebida (ej. "Revisar (Falta metrica)").';
comment on column core.indicador.smart_alcanzable is 'Columna "SMART: Alcanzable (Meta)" del CSV -- TEXT, mismo motivo que smart_medible.';
comment on column core.indicador.smart_temporal is 'Columna "SMART: Temporal" del CSV -- TEXT, mismo motivo que smart_medible (100 de 113 filas reales dicen "No (Falta temporalidad)").';
comment on column core.indicador.aprobado is 'Columna "Aprobado" del CSV, normalizada a boolean (upper(trim(x)) = ''SI'' al migrar) -- hoy 104 de 113 filas reales no tienen aprobacion registrada.';

create index indicador_aprobado_idx on core.indicador (aprobado);

create table core.indicador_eje (
  indicador_codigo    text    not null references core.indicador(codigo) on delete cascade,
  eje_estrategico_id  integer not null references core.eje_estrategico(id) on delete cascade,
  primary key (indicador_codigo, eje_estrategico_id)
);

comment on table core.indicador_eje is
  'Tabla puente indicador x eje estrategico -- confirmada con datos reales (columna "Eje(s) vinculado(s)" del CSV, 10 combinaciones unicas). Un indicador puede pertenecer a mas de un eje sin duplicar su fila en core.indicador.';
