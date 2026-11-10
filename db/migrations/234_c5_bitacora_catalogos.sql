-- 234_c5_bitacora_catalogos.sql
-- Bitacora completa para la administracion: el resto de lo que se audita (catalogos, vinculos, umbrales, invitaciones...)
-- ademas de capas e instrumentos, que ya salen por api.bitacora_operativa. Sin cambio de ER: es una vista sobre
-- core.bitacora_cambio con la misma RLS (security_invoker): el Titular y el Auditor ven todo, el Administrador todo
-- menos las invitaciones, y el Capturista solo lo suyo.
begin;

create or replace view api.bitacora_catalogos with (security_invoker = true) as
select
  b.id,
  b.fecha                                         as creado_en,
  b.id_usuario                                    as actor_id_usuario,
  a.info ->> 'rol'                                as rol,
  a.info ->> 'nombre'                             as actor_nombre,
  a.info ->> 'codigo'                             as codigo_usuario,
  b.tabla_afectada                                as tabla,
  b.id_registro                                   as recurso_id,
  b.accion,
  coalesce(b.datos_nuevos ->> 'nombre',  b.datos_previos ->> 'nombre',
           b.datos_nuevos ->> 'titulo',  b.datos_previos ->> 'titulo',
           b.datos_nuevos ->> 'clave',   b.datos_previos ->> 'clave',
           b.datos_nuevos ->> 'correo_destino', b.datos_previos ->> 'correo_destino',
           b.id_registro)                         as titulo,
  b.datos_previos,
  b.datos_nuevos
from core.bitacora_cambio b
left join lateral (select core.actor_resumen(b.id_usuario) as info) a on true
where b.tabla_afectada not in ('capa', 'instrumento_origen');

comment on view api.bitacora_catalogos is
  'Bitacora de cambios de catalogos, vinculos, umbrales e invitaciones (todo lo auditado salvo capas e instrumentos, que salen por api.bitacora_operativa). La RLS de core.bitacora_cambio decide que ve cada perfil.';
grant select on api.bitacora_catalogos to authenticated;

notify pgrst, 'reload schema';
commit;
