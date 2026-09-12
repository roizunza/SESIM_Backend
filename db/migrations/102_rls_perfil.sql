-- RLS sobre core.perfil. Esto es lo que de verdad decide el permiso.
--
-- Cambio de fondo respecto a la version anterior (pre-Supabase): ya NO hay
-- un rol de Postgres por perfil de negocio (capturista/administrador/
-- administrador_vip/auditor con SET ROLE). Con Supabase, toda sesion valida
-- entra como el rol de Postgres "authenticated" (uno solo para todos); la
-- diferencia entre capturista/administrador/administrador_vip/auditor se
-- resuelve ADENTRO de cada policy, llamando a core.rol_actual().

alter table core.perfil enable row level security;
alter table core.perfil force row level security;

-- RLS solo restringe FILAS; sigue haciendo falta el GRANT de SQL de base
-- (sin esto, aunque haya una policy, el motor deniega antes de llegar a
-- evaluarla). Se otorga aqui a "authenticated" en general -- el filtro real
-- de que fila ve o edita cada quien lo hacen las policies de abajo, no este
-- GRANT (asi es como se recomienda usar RLS: el GRANT decide "puede intentar
-- la operacion", la policy decide "sobre cuales filas").
grant usage on schema core to authenticated;
grant select on core.perfil to authenticated;
grant update (rol, ambito, cve_mun, dependencia, activo) on core.perfil to authenticated;

-- Cualquier persona autenticada ve su propia fila (esto cubre a capturista,
-- pero tambien de paso a administrador/administrador_vip/auditor sobre su
-- propio perfil).
create policy perfil_select_propio on core.perfil
  for select
  to authenticated
  using (id_usuario = auth.uid());

-- auditor, administrador y administrador_vip ven TODAS las filas (para
-- auditor esto es de solo lectura: no tiene la policy de UPDATE de abajo).
create policy perfil_select_todo_administracion on core.perfil
  for select
  to authenticated
  using (core.rol_actual() in ('auditor', 'administrador', 'administrador_vip'));

-- Solo administrador y administrador_vip EDITAN perfiles (dar de baja,
-- cambiar dependencia, etc.). Esto no cambio con la definicion de
-- administrador_vip que dio Ismael: la unica diferencia de administrador_vip
-- es el ALTA de credenciales nuevas (ver mas abajo), no la edicion de
-- perfiles existentes -- ahi administrador y administrador_vip siguen igual.
create policy perfil_update_administracion on core.perfil
  for update
  to authenticated
  using (core.rol_actual() in ('administrador', 'administrador_vip'))
  with check (core.rol_actual() in ('administrador', 'administrador_vip'));

-- Nota sobre el alta de usuarios (INSERT): no hay policy de INSERT para
-- "authenticated" a proposito. El alta de credenciales+perfil ahora la hace
-- servicio-procesos (ver servicio-procesos/main.py, POST /admin/alta-usuario)
-- usando la Admin API de Supabase (para crear la fila en auth.users, algo
-- que ningun rol de Postgres deberia hacer por su cuenta) y despues una
-- conexion con privilegios de servicio para insertar en core.perfil -- esa
-- conexion se salta RLS por diseno (no es "authenticated"), asi que el
-- candado real de "solo administrador_vip puede llamar a este endpoint" vive
-- en servicio-procesos, no aqui. Tampoco hay policy de DELETE: nadie borra
-- un perfil, solo se desactiva (activo = false) via UPDATE.
