-- Ciclo 11 · api.v_capa_por_municipio cuenta por el municipio del elemento (cve_ent || cve_mun), no por id_unidad.
--
-- Es la misma regla que ya usan api.geojson_capa y las teselas desde el Ciclo 9: id_unidad de un elemento = '04' + cve_mun,
-- y NULL cuando cve_mun = '000' (fuera de Campeche). La 247 tomaba los 5 primeros caracteres de id_unidad, y en 28 elementos
-- de Loc02 el municipio de su localidad ligada (id_unidad) no coincide con su cve_mun (26 de 04013 contados en 04001, etc.).
-- Esos 28 elementos se dejan como están en la tabla; la vista solo adopta la regla de siempre.
-- Reemplaza una vista SECURITY INVOKER con las mismas columnas y tipos; no toca tablas ni políticas.

create or replace view api.v_capa_por_municipio with (security_invoker = true) as
select v.id_capa,
       (case when v.cve_mun = '000' then null else v.cve_ent || v.cve_mun end)::varchar(9) as id_unidad,
       count(*)::integer as n_elementos
  from core.capa_vector v
 group by v.id_capa, (case when v.cve_mun = '000' then null else v.cve_ent || v.cve_mun end);

comment on view api.v_capa_por_municipio is 'Ciclo 11. Elementos de cada capa por municipio (cve_ent||cve_mun; id_unidad nulo = fuera de Campeche, cve_mun 000). SECURITY INVOKER: cuenta lo que la RLS deja ver.';
notify pgrst, 'reload schema';
