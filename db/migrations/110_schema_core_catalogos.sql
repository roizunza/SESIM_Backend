-- Ciclo 3 -- Catalogos base: eje estrategico, municipio, dependencia.
--
-- Primera migracion real de Ciclo 3 (continua la numeracion de Ciclo 1,
-- 100-109 -- nunca se reinicia el esquema). 
--
-- Solo el schema (tablas) en este archivo -- siguiendo el patron de casa
-- de Ciclo 1 (schema -> RLS -> api en archivos separados): la RLS de
-- estos catalogos va en 111_rls_catalogos.sql y la vista api.* en
-- 112_api_catalogos.sql, ambos todavia pendientes.
--
-- core.eje_estrategico: los 5 Ejes Estrategicos EEMSV. El eje es un
--   catalogo relacionado, nunca un esquema/tabla repetida por eje (ver
--   seccion 3.1 de la especificacion: "el eje no parte la tabla, la
--   etiqueta"). Nombre y orden confirmados directo del informe tecnico
--   (Reporte_Capas_SESIM_2026, seccion 1, arbol de capas).
--
-- core.municipio: los 13 municipios de Campeche (Marco Geoestadistico
--   INEGI 2024). cve_mun es el codigo de 3 digitos SIN el prefijo de
--   entidad (ej. '001', no '04001') -- asi vive el atributo `cve_mun`
--   en los propios .geojson del front (ver
--   public/Datos/MapaBase/c04_municiipios_inegi_2024.geojson), y como
--   el manejo es solo estatal (una sola entidad, Campeche = 04), el
--   codigo de 3 digitos ya es unico dentro del sistema -- no hace falta
--   cargar cve_ent como parte de la llave.
--
-- core.dependencia: semilla MINIMA a proposito (ver seeds/903).
--   La columna `dependencia` de core.perfil sigue en
--   NULL desde Ciclo 1. Se crea la tabla ya para que
--   core.indicador.dependencia_id tenga donde apuntar, pero se deja
--   para llenarse despues; nombre es unique para que la semilla no
--   truene si se repite un valor.

create table core.eje_estrategico (
  id      integer generated always as identity primary key,
  nombre  text not null unique,
  orden   integer not null unique
);
comment on table core.eje_estrategico is
  'Los 5 Ejes Estrategicos EEMSV. Catalogo relacionado -- una capa/indicador/observacion se vincula a un eje via FK, nunca se duplica el esquema por eje.';

create table core.municipio (
  cve_mun text primary key,
  nombre  text not null
);
comment on table core.municipio is
  'Los 13 municipios de Campeche (Marco Geoestadistico INEGI 2024). cve_mun de 3 digitos, sin prefijo de entidad -- el manejo del sistema es solo estatal.';

create table core.dependencia (
  id      integer generated always as identity primary key,
  nombre  text not null unique
);
comment on table core.dependencia is
  'Catalogo de dependencias/areas responsables de indicadores. Semilla MINIMA a proposito -- ver seeds/903_semilla_dependencias.sql -- pendiente de un catalogo real.';
