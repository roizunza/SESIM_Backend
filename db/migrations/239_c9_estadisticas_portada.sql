-- Ciclo 9 · Portada pública: cifras del territorio de Campeche, calculadas en la base.
-- api.estadisticas_portada() devuelve un solo objeto jsonb:
--   extension_km2  superficie del estado (suma de los polígonos de la capa Lim03, límite estatal; si no hubiera, de Lim04, municipios)
--   habitantes     suma de pob_tot de los municipios (core.unidad_territorial, nivel = 'municipio')
--   municipios     número de municipios
--   red_vial_km    longitud de la red vial de la capa DIt06 (core.capa_vector), en kilómetros
--   generado       fecha de cálculo (UTC)
-- Solo agregados: no expone elementos ni datos de personas. SECURITY INVOKER, igual que api.tablero_territorio():
-- la RLS decide qué capas ve cada perfil (sin sesión, solo las publicadas). Si una cifra no se puede calcular
-- (capa no visible o no cargada) se devuelve null y el front muestra «—»; nunca una cifra inventada.
create or replace function api.estadisticas_portada()
returns jsonb language sql stable security invoker
set search_path = core, public, extensions
as $$
  select jsonb_build_object(
    'generado', to_char(now() at time zone 'utc', 'YYYY-MM-DD'),
    'extension_km2', coalesce(
        (select round((sum(st_area(v.geom::geography)) / 1000000.0)::numeric, 0) from core.capa_vector v where v.id_capa = 'Lim03'),
        (select round((sum(st_area(v.geom::geography)) / 1000000.0)::numeric, 0) from core.capa_vector v where v.id_capa = 'Lim04')),
    'habitantes', (select sum(u.pob_tot)::bigint from core.unidad_territorial u where u.nivel = 'municipio' and u.activo),
    'municipios', (select count(*)::int from core.unidad_territorial u where u.nivel = 'municipio' and u.activo),
    'red_vial_km', (select round((sum(st_length(v.geom::geography)) / 1000.0)::numeric, 0)
                      from core.capa_vector v
                     where v.id_capa = 'DIt06' and geometrytype(v.geom) like '%LINESTRING'),
    'fuentes', jsonb_build_object(
        'extension', 'Capa Lim03 (límite estatal), cálculo geodésico en la base',
        'habitantes', 'Suma de la población de los 13 municipios (core.unidad_territorial)',
        'red_vial', 'Capa DIt06 (red vial), longitud geodésica en la base'))
$$;
comment on function api.estadisticas_portada() is 'Cifras agregadas del territorio para la portada pública (extensión, habitantes, municipios, red vial). Solo agregados; null si no se pueden calcular.';
grant execute on function api.estadisticas_portada() to anon, authenticated;
notify pgrst, 'reload schema';
