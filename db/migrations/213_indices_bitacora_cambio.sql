-- Ciclo 3 -- indices de core.bitacora_cambio que piden los Alcances (modulo de trazabilidad):
--   (actor, fecha)  -> feed del capturista: "mis ultimos cambios"
--   (fecha)         -> tabla global de bitacora con filtro de fechas
-- La consulta de expediente (tabla, registro) ya la cubre bitacora_cambio_reg_idx (206).
create index if not exists bitacora_cambio_actor_idx on core.bitacora_cambio (id_usuario, fecha desc);
create index if not exists bitacora_cambio_fecha_idx on core.bitacora_cambio (fecha desc);
comment on index core.bitacora_cambio_actor_idx is 'Feed del capturista: cambios por actor ordenados por fecha.';
comment on index core.bitacora_cambio_fecha_idx is 'Tabla global de bitacora con filtro por rango de fechas.';
