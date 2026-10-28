
-- "el de usuario admin puede hacer gestión
-- cuando se supone que solo debería admin a nivel titular" — es decir, la
-- pantalla y la capacidad completa de gestión de usuarios (ver/editar rol,
-- ámbito, dependencia, dar de baja/reactivar) son EXCLUSIVAS de
-- administrador_titular. administrador (no titular) deja de poder editar
-- core.perfil por completo, incluso el suyo propio vía esta vía (sigue
-- pudiendo verse a sí mismo por `perfil_select_propio`, y ver a todos por
-- `perfil_select_todo_administracion` — de solo lectura).
--
-- Esto reemplaza la policy perfil_update_administracion de 102_rls_perfil.sql.
-- No se toca el GRANT de columnas (grant update (...) on core.perfil to
-- authenticated) porque el GRANT solo habilita "puede intentar el UPDATE";
-- quién puede realmente hacerlo sobre qué filas lo decide esta policy.

drop policy if exists perfil_update_administracion on core.perfil;

create policy rls_perfil_update_titular on core.perfil
  for update
  to authenticated
  using (core.rol_actual() = 'administrador_titular')
  with check (core.rol_actual() = 'administrador_titular');

-- Nota: aplica esta migración igual que 104-108 (psql manual
-- dentro del contenedor, o pegada en el editor SQL de Supabase Studio) —
-- ver claude/front-consolidacion-react-d-sim-front.md, sección "Importante
-- — cómo aplicarlas". Después de aplicarla, un administrador normal ya no
-- podrá editar perfiles ni siquiera llamando directo a la API de Supabase
-- (Authorization: Bearer con su propio token), aunque el front ya tampoco
-- le muestra el botón.
