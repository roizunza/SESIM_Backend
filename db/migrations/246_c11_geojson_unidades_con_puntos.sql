-- Ciclo 11 · Corrección de la 245: api.geojson_unidades('localidades') debe entregar las 2,772 localidades, no solo las que tienen
-- polígono. core.unidad_territorial_geom es MultiPolygon: guarda 13 municipios y 511 localidades con polígono (524). Las otras 2,261
-- localidades se conocen solo por su punto, que está en Loc02 (un punto por localidad: Loc02.id_unidad = unidad_territorial.id,
-- sin repetidos). El archivo estático que se retiró traía exactamente eso: 511 polígonos + 2,261 puntos.
-- Regla: geometría = polígono de unidad_territorial_geom si existe; si no, el punto de Loc02 de esa localidad.
-- Sigue siendo SECURITY INVOKER: si Loc02 no es visible para el rol, esas localidades no salen (la RLS manda).

create or replace function api.geojson_unidades(p_nivel text)
returns jsonb language plpgsql stable security invoker
set search_path = core, public, extensions
as $$
declare
  v_nivel text;
  v_res   jsonb;
begin
  v_nivel := case p_nivel when 'municipios' then 'municipio' when 'localidades' then 'localidad' end;
  if v_nivel is null then
    raise exception 'Nivel no válido: use municipios o localidades.' using errcode = '22023';
  end if;
  select jsonb_build_object(
           'type', 'FeatureCollection',
           'id_capa', 'unidad_territorial_' || p_nivel,
           'n_elementos', count(*),
           'features', coalesce(jsonb_agg(
             jsonb_build_object(
               'type', 'Feature',
               'properties', jsonb_build_object(
                 'id', u.id,
                 'nombre', case when u.nivel = 'municipio' then u.nom_mun else u.nom_loc end,
                 'clasif', u.nivel,
                 'cve_mun', u.cve_mun,
                 'id_unidad', coalesce(u.id_padre, u.id)),
               'geometry', st_asgeojson(coalesce(g.geom, p.geom), 5)::jsonb)
             order by u.id), '[]'::jsonb))
    into v_res
    from core.unidad_territorial u
    left join core.unidad_territorial_geom g on g.id_unidad = u.id
    left join (select distinct on (v.id_unidad) v.id_unidad, v.geom
                 from core.capa_vector v
                where v.id_capa = 'Loc02' and v.geom is not null and v.id_unidad is not null
                order by v.id_unidad, v.id) p
           on v_nivel = 'localidad' and p.id_unidad = u.id and g.id_unidad is null
   where u.activo and u.nivel = v_nivel and coalesce(g.geom, p.geom) is not null;
  return v_res;
end
$$;

grant execute on function api.geojson_unidades(text) to anon, authenticated;
comment on function api.geojson_unidades(text) is 'Ciclo 11. FeatureCollection de municipios (p_nivel = municipios) o localidades (localidades). Geometría: polígono de unidad_territorial_geom o, si no hay, el punto de la localidad en Loc02. Propiedades: id, nombre, clasif, cve_mun, id_unidad.';
notify pgrst, 'reload schema';
