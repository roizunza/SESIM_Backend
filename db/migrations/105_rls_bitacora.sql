-- RLS sobre core.bitacora. Jerarquia de visibilidad pedida por Ismael:
--
--   capturista        -> solo la suya (eventos sobre su propia cuenta)
--   administrador     -> la de capturista + la suya
--   auditor           -> la de capturista + administrador + administrador_vip + la suya
--   administrador_vip -> todas (incluida la de auditor)
--
-- Las policies para el mismo comando (select) se combinan con OR, asi que
-- cada rol termina viendo "su policy propia" UNION "lo que le tocaria ver
-- de mas" sin tener que repetir la condicion de "propio" en cada una.

alter table core.bitacora enable row level security;
alter table core.bitacora force row level security;

grant select on core.bitacora to authenticated;
-- Sin grant de insert/update/delete a proposito: la unica forma de escribir
-- aqui es el trigger de 104_schema_core_bitacora.sql (security definer).
-- Nadie -- ni administrador_vip -- edita la bitacora a mano.

-- Cualquier persona ve las entradas SOBRE su propia cuenta (ej. un
-- capturista ve cuando se le cambio de ambito o se le dio de alta/baja a
-- el mismo).
create policy bitacora_select_propio on core.bitacora
  for select
  to authenticated
  using (objetivo_id_usuario = auth.uid());

-- administrador (no vip) ve ademas la bitacora de cuentas capturista.
create policy bitacora_select_administrador on core.bitacora
  for select
  to authenticated
  using (
    core.rol_actual() = 'administrador'
    and objetivo_rol = 'capturista'
  );

-- auditor ve la bitacora de capturista, administrador y administrador_vip
-- (todo el lado "operativo"), ademas de la propia (via la policy de arriba).
create policy bitacora_select_auditor on core.bitacora
  for select
  to authenticated
  using (
    core.rol_actual() = 'auditor'
    and objetivo_rol in ('capturista', 'administrador', 'administrador_vip')
  );

-- administrador_vip ve todo, sin excepcion (incluida la bitacora de auditor).
create policy bitacora_select_administrador_vip on core.bitacora
  for select
  to authenticated
  using (core.rol_actual() = 'administrador_vip');
