-- Ciclo 3 -- RLS de core.observacion ("el corazon de la plataforma").
--
-- Matriz de permisos confirmada citando
-- textualmente el documento de Ciclo 1 (ciclo1.pdf) donde ya estaba
-- anotada esta regla de negocio:
--
--   1. Visibilidad (uso estatal): todo usuario con credenciales
--      (capturista, administrador, administrador_vip, auditor) ve las
--      observaciones de TODOS los municipios. No hay filtro por
--      cve_mun a nivel de RLS -- la busqueda/filtro por municipio es
--      una funcionalidad del front (query param sobre cve_mun, que ya
--      tiene su indice: observacion_cve_mun_idx), no una restriccion de
--      seguridad.
--   2. Privacidad: el publico (anon) NO tiene acceso a esta tabla en
--      absoluto -- ni siquiera filtrado. El publico si ve el geovisor
--      (core.capa/core.capa_feature, ya publico desde 116/117) pero NO
--      ve el valor de ninguna observacion.
--   3. Insercion: capturista, administrador y administrador_vip pueden
--      registrar observaciones nuevas. 
--   4. Edicion capturista: solo puede actualizar una fila si el
--      solicitante ES el autor original (capturado_por = auth.uid())
--      Y el estatus de la fila (al momento de editar) esta en
--      'borrador' o 'rechazado'.
--   5. Edicion administracion: administrador y administrador_vip
--      pueden editar SIEMPRE (cualquier fila, cualquier estatus), para
--      avanzar el flujo de dictamen -- ese flujo en si (que transicion
--      de estatus es valida) es Ciclo 8, esta RLS solo controla QUIEN
--      puede tocar la fila, no A QUE estatus puede moverla.

--
-- GRANT primero, policy despues, nunca mezclados (mismo patron que el
-- resto de RLS de este proyecto).

alter table core.observacion enable row level security;

-- Nota privacidad: a proposito NO hay "grant ... to anon" aqui -- anon
-- no tiene ningun acceso a core.observacion (regla 2).
grant select, insert, update on core.observacion to authenticated;

create policy observacion_select_credencial on core.observacion
  for select
  to authenticated
  using (core.rol_actual() is not null);

create policy observacion_insert_captura on core.observacion
  for insert
  to authenticated
  with check (
    core.rol_actual() in ('capturista', 'administrador', 'administrador_vip')
    and capturado_por = auth.uid()
  );

create policy observacion_update_capturista on core.observacion
  for update
  to authenticated
  using (
    core.rol_actual() = 'capturista'
    and capturado_por = auth.uid()
    and estatus in ('borrador', 'rechazado')
  )
  with check (
    core.rol_actual() = 'capturista'
    and capturado_por = auth.uid()
  );

create policy observacion_update_administracion on core.observacion
  for update
  to authenticated
  using (core.rol_actual() in ('administrador', 'administrador_vip'))
  with check (core.rol_actual() in ('administrador', 'administrador_vip'));
