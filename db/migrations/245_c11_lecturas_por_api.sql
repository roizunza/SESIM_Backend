-- Ciclo 11 · Bloque 2: lo que el front leía de archivos estáticos (public/sesim/catalogo y public/sesim/capas/unidad_territorial)
-- pasa a salir de la base, bajo la RLS de quien lo pide. Solo lecturas; no cambia tablas ni políticas.
--
--   api.v_capa_por_municipio  elementos de cada capa por municipio (antes catalogo/v_capa_por_municipio.json)
--   api.capa_clases           valores de `clasif` de cada capa en orden de aparición, hasta 13 (antes `clases` de catalogo/capa.json)
--   api.geojson_unidades(p_nivel)  polígonos oficiales de municipios o localidades (antes capas/unidad_territorial/*.geojson)
--
-- Las dos vistas son SECURITY INVOKER: cada rol agrega solo las capas que la RLS de core.capa_vector (D-17) le deja ver.
-- api.unidad_territorial ya existía y es de lectura pública (migración 215); la función de polígonos corre con los permisos del
-- que la pide (unidad_territorial_geom tiene políticas para anon y authenticated).
-- Medición en copia local con 540 mil elementos: cada vista tarda alrededor de 0.3 s; si en la VM tardara más, el índice
-- (id_capa, id_unidad) / (id_capa, clasif) se evalúa con EXPLAIN ANALYZE antes de crearlo.

create or replace view api.v_capa_por_municipio with (security_invoker = true) as
select v.id_capa, v.id_unidad, count(*)::integer as n_elementos
  from core.capa_vector v
 group by v.id_capa, v.id_unidad;

-- «Orden de aparición» = posición física de la primera fila de cada clase (min(ctid)): conserva el orden en que se cargó la capa.
create or replace view api.capa_clases with (security_invoker = true) as
select t.id_capa,
       (array_agg(t.clasif order by t.primera))[1:13] as clases,
       count(*)::integer as n_clases
  from (select v.id_capa, v.clasif, min(v.ctid) as primera
          from core.capa_vector v
         where v.clasif is not null
         group by v.id_capa, v.clasif) t
 group by t.id_capa;

grant select on api.v_capa_por_municipio, api.capa_clases to anon, authenticated;

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
               'geometry', st_asgeojson(g.geom, 5)::jsonb)
             order by u.id), '[]'::jsonb))
    into v_res
    from core.unidad_territorial u
    join core.unidad_territorial_geom g on g.id_unidad = u.id
   where u.activo and u.nivel = v_nivel;
  return v_res;
end
$$;

grant execute on function api.geojson_unidades(text) to anon, authenticated;

comment on view api.v_capa_por_municipio is 'Ciclo 11. Elementos de cada capa por municipio (id_unidad nulo = fuera de Campeche). SECURITY INVOKER: cuenta lo que la RLS deja ver.';
comment on view api.capa_clases is 'Ciclo 11. Valores de clasif de cada capa en orden de aparición (máximo 13) y su número total de clases. SECURITY INVOKER.';
comment on function api.geojson_unidades(text) is 'Ciclo 11. FeatureCollection de municipios (p_nivel = municipios) o localidades (localidades) con id, nombre, clasif, cve_mun e id_unidad.';
notify pgrst, 'reload schema';
