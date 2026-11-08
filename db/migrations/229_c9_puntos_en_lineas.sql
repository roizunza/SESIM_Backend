-- Ciclo 9 · Paridad con el front: un POINT dentro de una capa de tipo Línea es una línea de longitud cero
-- (p. ej. Tren Maya FID:27 y FID:93). Hoy el front no la dibuja (su simplificador la deja con geometry null).
--  · api.geojson_capa: el elemento se conserva (cuenta, aparece en listas) pero con geometry null.
--  · api.tesela_capa: el elemento se omite.
create or replace function api.geojson_capa(p_capa text)
returns jsonb language plpgsql stable security invoker
set search_path = core, public, extensions
as $$
declare
  v_c   core.capa;
  v_n   integer;
  v_res jsonb;
begin
  select * into v_c from core.capa where id = p_capa;
  if not found then
    raise exception 'La capa % no existe o no es visible para este perfil', p_capa using errcode = 'P0002';
  end if;
  select count(*) into v_n from core.capa_vector where id_capa = p_capa;
  if v_n > 25000 then
    raise exception 'La capa % tiene % elementos: se sirve por teselas (api.tesela_capa)', p_capa, v_n using errcode = '54000';
  end if;
  select jsonb_build_object(
           'type', 'FeatureCollection',
           'id_capa', v_c.id,
           'uuid_legado', v_c.uuid_legado,
           'titulo', v_c.titulo,
           'n_elementos', v_n,
           'features', coalesce(jsonb_agg(jsonb_build_object(
             'type', 'Feature',
             'geometry', case when v_c.tipo_geometria = 'Línea' and geometrytype(v.geom) = 'POINT'
                              then null else st_asgeojson(v.geom, 6)::jsonb end,
             'properties', jsonb_build_object(
               'id', v.id,
               'nombre', v.nombre,
               'clasif', v.clasif,
               'cve_mun', v.cve_mun,
               'id_unidad', case when v.cve_mun = '000' then null else '04' || v.cve_mun end))), '[]'::jsonb))
    into v_res
    from core.capa_vector v
   where v.id_capa = p_capa;
  perform set_config('response.headers', '[{"Cache-Control": "private, max-age=300"}]', true);
  return v_res;
end
$$;

create or replace function api.tesela_capa(p_capa text, p_z integer, p_x integer, p_y integer)
returns bytea language plpgsql stable security invoker
set search_path = core, public, extensions
as $$
declare
  v_env3857 geometry;
  v_env4326 geometry;
  v_tol     double precision;
  v_linea   boolean;
  v_res     bytea;
begin
  if p_z < 0 or p_z > 22 or p_x < 0 or p_y < 0 or p_x >= (1 << p_z) or p_y >= (1 << p_z) then
    return ''::bytea;
  end if;
  select tipo_geometria = 'Línea' into v_linea from core.capa where id = p_capa;
  v_env3857 := st_tileenvelope(p_z, p_x, p_y);
  v_env4326 := st_transform(v_env3857, 4326);
  v_tol := (40075016.68557849 / (256.0 * power(2, p_z))) * 0.5;
  select st_asmvt(t, 'capa', 4096, 'geom')
    into v_res
    from (
      select v.id::text as id, v.nombre, v.clasif, v.cve_mun,
             case when v.cve_mun = '000' then null else '04' || v.cve_mun end as id_unidad,
             st_asmvtgeom(
               case when p_z < 15 then st_simplify(st_transform(v.geom, 3857), v_tol, true)
                    else st_transform(v.geom, 3857) end,
               v_env3857, 4096, 64, true) as geom
        from core.capa_vector v
       where v.id_capa = p_capa
         and v.geom && v_env4326
         and not (coalesce(v_linea, false) and geometrytype(v.geom) = 'POINT')
    ) t
   where t.geom is not null;
  perform set_config('response.headers', '[{"Cache-Control": "private, max-age=300"}]', true);
  return coalesce(v_res, ''::bytea);
end
$$;

grant execute on function api.geojson_capa(text) to anon, authenticated;
grant execute on function api.tesela_capa(text, integer, integer, integer) to anon, authenticated;
notify pgrst, 'reload schema';
