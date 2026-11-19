-- Ciclo 11 · Se cierra la apertura temporal de las teselas (migraciones 231/233).
-- api.tesela_capa deja de ser SECURITY DEFINER y pasa a SECURITY INVOKER: la tesela sale con los permisos del rol
-- que la pide y la RLS de core.capa / core.capa_vector (D-17) decide qué capas ve cada quien:
--   anon        -> solo capas vigente_publico y activas
--   capturista  -> vigente_admin, vigente_publico y las que él creó
--   administrador / administrador_titular / auditor -> todas
-- El cuerpo es el mismo de la 233; cambian el atributo de seguridad y el encabezado de caché. Como el contenido
-- depende del rol, la respuesta se declara «Vary: Authorization» para que el navegador no reutilice una tesela
-- pedida con otra sesión (por ejemplo, al iniciar o cerrar sesión).
-- El front debe mandar el token de la sesión en cada tesela (teselas.js, cabecerasTeselas).
-- Reversión escrita (NO se aplica): db/reversiones/244_revertir_tesela_capa_definer.sql

create or replace function api.tesela_capa(p_capa text, p_z integer, p_x integer, p_y integer)
returns api."application/vnd.mapbox-vector-tile" language plpgsql stable security invoker
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
  perform set_config('response.headers', '[{"Cache-Control": "private, max-age=300"}, {"Vary": "Authorization"}]', true);
  return coalesce(v_res, ''::bytea);
end
$$;

grant execute on function api.tesela_capa(text, integer, integer, integer) to anon, authenticated;
comment on function api.tesela_capa(text, integer, integer, integer) is
  'Ciclo 9/11. Tesela vectorial (MVT) de una capa, con los permisos de quien la pide (RLS D-17). Pedir con Accept: application/vnd.mapbox-vector-tile.';
notify pgrst, 'reload schema';
