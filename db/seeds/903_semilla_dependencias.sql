-- Ciclo 3 -- Semilla MINIMA de dependencias.
--
-- 15. Sept Todavia no existe un catalogo real de
-- dependencias/areas responsables de indicadores -- se deja solo un
-- renglon placeholder para que la tabla no quede vacia y cualquier FK
-- de prueba (p.ej. al capturar un indicador) tenga a donde apuntar
-- mientras se define el catalogo real. La columna `dependencia` de
-- core.perfil tambien sigue en NULL por el mismo motivo, desde Ciclo 1.
--
-- Reemplazar/ampliar este INSERT en cuanto exista la lista real
--
-- Requiere que 110_schema_core_catalogos.sql ya este aplicado.

insert into core.dependencia (nombre) values
  ('Sin especificar')
on conflict (nombre) do nothing;
