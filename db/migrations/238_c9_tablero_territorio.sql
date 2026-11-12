-- Ciclo 9 · Tablero público: estadística territorial por municipio, calculada en la base.
-- api.tablero_territorio() devuelve {generado, filas:[{capa, mun, clasif, n, km}]} a partir de core.capa_vector
-- (solo las capas que usa el tablero). n = elementos; km = longitud en kilómetros (solo líneas; 0 para puntos y polígonos).
-- cve_mun = '000' son elementos fuera del estado. SECURITY INVOKER: la RLS decide qué capas ve cada perfil.
create or replace function api.tablero_territorio()
returns jsonb language sql stable security invoker
set search_path = core, public, extensions
as $$
  select jsonb_build_object(
    'generado', to_char(now() at time zone 'utc', 'YYYY-MM-DD'),
    'origen', 'base de datos (core.capa_vector)',
    'filas', coalesce(jsonb_agg(jsonb_build_object(
        'capa', t.id_capa, 'mun', t.cve_mun, 'clasif', t.clasif, 'n', t.n, 'km', t.km)
        order by t.id_capa, t.cve_mun, t.clasif), '[]'::jsonb))
  from (
    select v.id_capa, v.cve_mun, coalesce(v.clasif, '') as clasif, count(*)::int as n,
           round((coalesce(sum(case when geometrytype(v.geom) like '%LINESTRING'
                                    then st_length(v.geom::geography) end), 0) / 1000.0)::numeric, 2) as km
      from core.capa_vector v
     where v.id_capa in ('DIt06','DIt04','DTp01','DIt02','DTc05',
                         'E4SegVial01','E4SegVial02','E4SegVial07','E4SegVial08',
                         'E5Gen01','E5Gen02','E5Gen04')
     group by v.id_capa, v.cve_mun, coalesce(v.clasif, '')
  ) t
$$;
grant execute on function api.tablero_territorio() to anon, authenticated;
notify pgrst, 'reload schema';
