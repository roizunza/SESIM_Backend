-- Vista api.bitacora: lo que el front consulta para "Bitacora de cuentas".
-- security_invoker=true de nuevo, para que la RLS de core.bitacora (y la de
-- core.perfil en los joins de nombre) se evalue con el rol de quien
-- consulta, no con el dueno de la vista.
--
-- Los joins a core.perfil para traer el nombre de "quien hizo el cambio" y
-- "sobre quien fue" son seguros aunque la vista sea security_invoker: todo
-- rol que puede ver una fila de bitacora que no es la suya (administrador,
-- administrador_vip, auditor) tambien puede ver TODAS las filas de
-- core.perfil (policy perfil_select_todo_administracion), asi que el join
-- nunca se queda sin nombre por RLS.

create or replace view api.bitacora
  with (security_invoker = true)
as
select
  b.id,
  b.creado_en,
  b.accion,
  b.detalle,
  b.objetivo_id_usuario,
  b.objetivo_rol,
  po.nombre as objetivo_nombre,
  b.actor_id_usuario,
  b.actor_rol,
  pa.nombre as actor_nombre
from core.bitacora b
left join core.perfil po on po.id_usuario = b.objetivo_id_usuario
left join core.perfil pa on pa.id_usuario = b.actor_id_usuario
order by b.creado_en desc;

comment on view api.bitacora is 'Bitacora de cuentas (Ciclo 1, paso 6) visible segun el rol de quien consulta (RLS de core.bitacora via auth.uid()/core.rol_actual()). No es la bitacora de solicitudes de cartografia (Ciclo 5).';

grant select on api.bitacora to authenticated;
-- Sin grant de insert/update/delete: la bitacora solo se escribe via el
-- trigger de core.perfil (104_schema_core_bitacora.sql).
