-- Revierte la 247: deja las vistas como estaban en la 245 (orden físico de clases y cobertura por id_unidad tal cual).
-- Los tipos de columna no cambian, así que basta con reemplazar las vistas. No está en db/migrations: se corre a mano.
create or replace view api.v_capa_por_municipio with (security_invoker = true) as
select v.id_capa, v.id_unidad, count(*)::integer as n_elementos from core.capa_vector v group by v.id_capa, v.id_unidad;
create or replace view api.capa_clases with (security_invoker = true) as
select t.id_capa, (array_agg(t.clasif order by t.primera))[1:13] as clases, count(*)::integer as n_clases
  from (select v.id_capa, v.clasif, min(v.ctid) as primera from core.capa_vector v where v.clasif is not null group by v.id_capa, v.clasif) t
 group by t.id_capa;
notify pgrst, 'reload schema';
