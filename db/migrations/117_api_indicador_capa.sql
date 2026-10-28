-- Ciclo 3 -- Vistas api.* de los catalogos de Capa 2: indicador,
-- indicador_eje, grupo, capa, capa_feature, capa_grupo.
--
-- NO incluye core.observacion -- ver 116_rls_indicador_capa.sql. Mismo
-- patron que 112_api_catalogos.sql: security_invoker = true, comment on
-- view, grant select puntual (grant usage on schema api ya se hizo en
-- Ciclo 1).
--
-- core.capa_feature.geom se expone como GeoJSON via ST_AsGeoJSON --
-- nunca el tipo geometry crudo (PostgREST no lo serializa de forma util
-- para el front, y el front ya consume GeoJSON hoy).

create view api.indicador
  with (security_invoker = true) as
  select
    codigo, nombre, sector_original, sector_definitivo, fuente,
    competencia, variable, meta, nivel_mir,
    smart_medible, smart_alcanzable, smart_temporal, aprobado
  from core.indicador;
comment on view api.indicador is
  'Catalogo de indicadores EEMSV, de solo lectura. Fuente real: core.indicador (ver seccion 6.1 de la especificacion; sin datos migrados todavia -- eso es un paso aparte, ver seccion 1).';
grant select on api.indicador to anon, authenticated;

create view api.indicador_eje
  with (security_invoker = true) as
  select indicador_codigo, eje_estrategico_id
  from core.indicador_eje;
comment on view api.indicador_eje is
  'Vinculo indicador x eje estrategico, de solo lectura.';
grant select on api.indicador_eje to anon, authenticated;

create view api.grupo
  with (security_invoker = true) as
  select id, nombre, eje_estrategico_id, orden
  from core.grupo;
comment on view api.grupo is
  'Catalogo de los 7 grupos (Mapa Base, Diagnostico, Eje 1..Eje 5), de solo lectura. Fuente real: core.grupo (sembrado en 904_semilla_grupos.sql).';
grant select on api.grupo to anon, authenticated;

create view api.capa
  with (security_invoker = true) as
  select
    id, label, archivo, geom_tipo, tema, nomenclatura, tiene_simbologia,
    nombre, proposito, descripcion, fuente, categoria, modulo,
    tema_subgrupo, cobertura, fecha, instrumento, horizonte_planeacion,
    eje_evaluacion, periodicidad, responsable, restricciones, proyeccion,
    estatus, tipo_dato, geometria, dominio_valores, tamanio_archivo_kb,
    extension_norte, extension_sur, extension_este, extension_oeste
  from core.capa;
comment on view api.capa is
  'Catalogo de capas geoespaciales, de solo lectura. Fuente real: core.capa (ver seccion 6.2 de la especificacion; sin datos migrados todavia -- eso es un paso aparte, ver seccion 1). Las geometrias reales viven en api.capa_feature.';
grant select on api.capa to anon, authenticated;

create view api.capa_feature
  with (security_invoker = true) as
  select
    id, capa_id, atributos,
    ST_AsGeoJSON(geom)::json as geom
  from core.capa_feature;
comment on view api.capa_feature is
  'Features geograficas reales de cada capa, de solo lectura. geom expuesto como GeoJSON (ST_AsGeoJSON), no como el tipo geometry crudo -- el front ya consume GeoJSON hoy.';
grant select on api.capa_feature to anon, authenticated;

create view api.capa_grupo
  with (security_invoker = true) as
  select capa_id, grupo_id
  from core.capa_grupo;
comment on view api.capa_grupo is
  'Vinculo capa x grupo, de solo lectura. Reemplaza el capa_eje original -- ver seccion 6.3 de la especificacion.';
grant select on api.capa_grupo to anon, authenticated;
