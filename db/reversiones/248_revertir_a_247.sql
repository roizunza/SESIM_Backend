-- Revierte la 248: la cobertura vuelve a contar por los 5 primeros caracteres de id_unidad (como en la 247). Se corre a mano.
create or replace view api.v_capa_por_municipio with (security_invoker = true) as
select v.id_capa, left(v.id_unidad, 5)::varchar(9) as id_unidad, count(*)::integer as n_elementos
  from core.capa_vector v group by v.id_capa, left(v.id_unidad, 5);
notify pgrst, 'reload schema';
