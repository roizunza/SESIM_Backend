-- Ciclo 9 · PostgREST v14 ya no entrega «application/octet-stream» para una función que devuelve bytea
-- (PGRST107 «None of these media types are available»). Se declara el tipo de contenido como dominio
-- (media type handler) y api.tesela_capa lo devuelve: el cliente pide Accept: application/vnd.mapbox-vector-tile.
-- Mismo cuerpo que la migración 231 (SECURITY DEFINER temporal: teselas públicas); solo cambia el tipo de retorno.

do $$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                  where n.nspname = 'api' and t.typname = 'application/vnd.mapbox-vector-tile') then
    execute 'create domain api."application/vnd.mapbox-vector-tile" as bytea';
  end if;
end $$;
grant usage on domain api."application/vnd.mapbox-vector-tile" to anon, authenticated;

drop function if exists api.tesela_capa(text, integer, integer, integer);

create function api.tesela_capa(p_capa text, p_z integer, p_x integer, p_y integer)
returns api."application/vnd.mapbox-vector-tile" language plpgsql stable security definer
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

grant execute on function api.tesela_capa(text, integer, integer, integer) to anon, authenticated;
comment on function api.tesela_capa(text, integer, integer, integer) is
  'Ciclo 9. Tesela vectorial (MVT) de una capa. Pedir con Accept: application/vnd.mapbox-vector-tile.';
notify pgrst, 'reload schema';
