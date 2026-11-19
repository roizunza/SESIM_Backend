-- Ciclo 11 · Corrección de las dos vistas de la migración 245 para igualar lo que entregaban los archivos estáticos retirados.
--
--   api.capa_clases           las clases de cada capa van ordenadas por número de elementos (de mayor a menor) y, a igual
--                             número, por primera aparición; se listan las 13 primeras. Antes (245) se tomaban las 13
--                             primeras por posición física, y una capa con más de 13 clases perdía las más frecuentes
--                             (p. ej. DIt05 e Inf08 dejaban fuera Lugar de Culto, Cementerio y Escuela de Educación Media).
--   api.v_capa_por_municipio  cuenta por municipio (los 5 primeros caracteres de id_unidad). Antes (245) agrupaba por
--                             id_unidad tal cual, y las capas cuyos elementos están ligados a localidades (DTts02, Loc01-04)
--                             salían por localidad en vez de por municipio. id_unidad nulo = fuera de Campeche.
-- Solo reemplaza dos vistas SECURITY INVOKER con las mismas columnas y tipos; no toca tablas ni políticas.

create or replace view api.v_capa_por_municipio with (security_invoker = true) as
select v.id_capa, left(v.id_unidad, 5)::varchar(9) as id_unidad, count(*)::integer as n_elementos
  from core.capa_vector v
 group by v.id_capa, left(v.id_unidad, 5);

create or replace view api.capa_clases with (security_invoker = true) as
select t.id_capa,
       (array_agg(t.clasif order by t.n desc, t.primera))[1:13] as clases,
       count(*)::integer as n_clases
  from (select v.id_capa, v.clasif, count(*) as n, min(v.ctid) as primera
          from core.capa_vector v
         where v.clasif is not null
         group by v.id_capa, v.clasif) t
 group by t.id_capa;

comment on view api.v_capa_por_municipio is 'Ciclo 11. Elementos de cada capa por municipio (id_unidad nulo = fuera de Campeche). SECURITY INVOKER: cuenta lo que la RLS deja ver.';
comment on view api.capa_clases is 'Ciclo 11. Valores de clasif de cada capa, de más a menos elementos (máximo 13), y su número total de clases. SECURITY INVOKER.';
notify pgrst, 'reload schema';
