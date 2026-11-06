-- Ciclo 6 -- prepara UNA medicion de prueba en borrador para front/scripts/prueba-ciclo6-real.mjs.
-- Uso:  psql -U postgres -d postgres -v correo_capturista="'capturista@tu.dominio'" -f db/pruebas/ciclo6_semilla_medicion.sql
-- Imprime el id de la medicion. Es una medicion de prueba (periodo 'PRUEBA-C6-REAL'); no se borra: se ignora o se da de baja con el resto.
with per as (
  insert into core.periodo (anio, etiqueta, tipo_periodo) values (2041, 'PRUEBA-C6-REAL', 'anual')
  on conflict do nothing returning id
), p as (select coalesce((select id from per), (select id from core.periodo where etiqueta = 'PRUEBA-C6-REAL' limit 1)) as id)
insert into core.medicion_indicador (id_indicador, id_unidad, id_periodo, usuario_captura, valor)
select (select id from core.indicador where estatus_aprobado and activo order by id limit 1),
       (select id from core.unidad_territorial where nivel = 'municipio' order by id limit 1),
       p.id, (select pf.id_usuario from core.perfil pf join auth.users u on u.id = pf.id_usuario where u.email = :correo_capturista and pf.rol = 'capturista'), 1
from p
returning id as id_medicion_de_prueba;
