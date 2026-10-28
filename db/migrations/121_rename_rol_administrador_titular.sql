-- Migración idempotente para actualizar bases preexistentes (provenientes de SESIM)
-- donde el rol se llamaba 'administrador_vip' hacia 'administrador_titular' (SEOTDU).
-- En despliegues desde cero (100-120 ya actualizados) actúa como no-op seguro.

begin;

alter table core.perfil disable trigger trg_bitacora_perfil;

alter table core.perfil drop constraint if exists perfil_rol_valido;

update core.perfil
set rol = 'administrador_titular'
where rol = 'administrador_vip';

alter table core.perfil
  add constraint perfil_rol_valido
  check (rol in ('capturista', 'administrador', 'administrador_titular', 'auditor'));

alter table core.perfil enable trigger trg_bitacora_perfil;

update core.bitacora
set actor_rol = 'administrador_titular'
where actor_rol = 'administrador_vip';

update core.bitacora
set objetivo_rol = 'administrador_titular'
where objetivo_rol = 'administrador_vip';

drop policy if exists perfil_select_todo_administracion on core.perfil;
create policy perfil_select_todo_administracion on core.perfil
  for select
  to authenticated
  using (core.rol_actual() in ('auditor', 'administrador', 'administrador_titular'));

drop policy if exists perfil_update_administracion on core.perfil;
drop policy if exists perfil_update_solo_vip on core.perfil;
drop policy if exists perfil_update_solo_titular on core.perfil;
drop policy if exists rls_perfil_update_titular on core.perfil;
create policy rls_perfil_update_titular on core.perfil
  for update
  to authenticated
  using (core.rol_actual() = 'administrador_titular')
  with check (core.rol_actual() = 'administrador_titular');

drop policy if exists bitacora_select_auditor on core.bitacora;
create policy bitacora_select_auditor on core.bitacora
  for select
  to authenticated
  using (
    core.rol_actual() = 'auditor'
    and objetivo_rol in ('capturista', 'administrador', 'administrador_titular')
  );

drop policy if exists bitacora_select_administrador_vip on core.bitacora;
drop policy if exists bitacora_select_administrador_titular on core.bitacora;
create policy bitacora_select_administrador_titular on core.bitacora
  for select
  to authenticated
  using (core.rol_actual() = 'administrador_titular');

-- Una cuenta dada de baja pierde de inmediato todo permiso de negocio.
create or replace function core.rol_actual()
returns text
language sql
stable
security definer
set search_path = core, auth, public
as $$
  select rol from core.perfil where id_usuario = auth.uid() and activo;
$$;

commit;
