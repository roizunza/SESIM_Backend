-- Ciclo 9 · api.geojson_capa responde 200 con {"type":"PorTeselas"} para capas de más de 25,000 elementos,
-- en lugar de un error 500: el front cae al respaldo sin peticiones fallidas.
create or replace function api.geojson_capa(p_capa text)
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
  select count(*) into v_n from core.capa_vector where id_capa = p_capa;
  if v_n > 25000 then
    -- 200 con aviso (no error): el front sigue con el archivo estático y las teselas se piden aparte.
    return json_build_object('type', 'PorTeselas', 'id_capa', v_c.id, 'n_elementos', v_n);
  end if;
  select '{"type":"FeatureCollection","id_capa":' || to_json(v_c.id)::text
         || ',"uuid_legado":' || coalesce(to_json(v_c.uuid_legado)::text, 'null')
         || ',"titulo":' || coalesce(to_json(v_c.titulo)::text, 'null')
         || ',"n_elementos":' || v_n
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
    from core.capa_vector v
   where v.id_capa = p_capa;
  perform set_config('response.headers', '[{"Cache-Control": "private, max-age=300"}]', true);
  return v_res::json;
end
$$;
grant execute on function api.geojson_capa(text) to anon, authenticated;
notify pgrst, 'reload schema';
