-- Ciclo 9 · Descarga de capas de más de 25,000 elementos (las que se ven por teselas).
-- api.geojson_capa responde «PorTeselas» para ellas, así que la descarga (GeoPackage) las pide por páginas:
-- api.geojson_capa_pagina(p_capa, p_desde, p_limite) devuelve un FeatureCollection con a lo sumo p_limite elementos
-- (orden estable por id). Misma visibilidad (SECURITY INVOKER, RLS) y mismos atributos públicos que geojson_capa.
create or replace function api.geojson_capa_pagina(p_capa text, p_desde integer default 0, p_limite integer default 5000)
returns json language plpgsql stable security invoker
set search_path = core, public, extensions
as $$
declare
  v_c   core.capa;
  v_n   integer;
  v_res text;
begin
  select * into v_c from core.capa where id = p_capa;
  if not found then
    raise exception 'La capa % no existe o no es visible para este perfil', p_capa using errcode = 'P0002';
  end if;
  p_limite := least(greatest(coalesce(p_limite, 5000), 1), 10000);
  p_desde  := greatest(coalesce(p_desde, 0), 0);
  select count(*) into v_n from core.capa_vector where id_capa = p_capa;
  select '{"type":"FeatureCollection","id_capa":' || to_json(v_c.id)::text
         || ',"n_elementos":' || v_n || ',"desde":' || p_desde
         || ',"features":[' || coalesce(string_agg(
              '{"type":"Feature","geometry":'
              || case when v_c.tipo_geometria = 'Línea' and geometrytype(v.geom) = 'POINT' then 'null'
                      else st_asgeojson(case when geometrytype(v.geom) like '%POINT' then v.geom
                                             else st_simplifypreservetopology(v.geom, 0.0001) end, 5) end
              || ',"properties":' || json_build_object(
                   'id', v.id, 'nombre', v.nombre, 'clasif', v.clasif, 'cve_mun', v.cve_mun,
                   'id_unidad', case when v.cve_mun = '000' then null else '04' || v.cve_mun end)::text
              || '}', ','), '') || ']}'
    into v_res
    from (select * from core.capa_vector where id_capa = p_capa order by id offset p_desde limit p_limite) v;
  return v_res::json;
end
$$;
grant execute on function api.geojson_capa_pagina(text, integer, integer) to anon, authenticated;
notify pgrst, 'reload schema';
