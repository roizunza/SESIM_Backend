-- Ciclo 3 -- Semilla: los 5 Ejes Estrategicos EEMSV.
--
-- Nombre y orden confirmados del informe tecnico 
-- (Reporte_Capas_SESIM_2026, arbol de capas, grupo "02 ESTRATEGIAS",
-- Eje Estrategico 1..5), 15 sept 2026.
--
-- Requiere que 110_schema_core_catalogos.sql ya este aplicado.

insert into core.eje_estrategico (nombre, orden) values
  ('Desarrollo económico-territorial', 1),
  ('Transporte público de personas',   2),
  ('Movilidad activa',                 3),
  ('Seguridad vial',                   4),
  ('Género e inclusión',               5)
on conflict (orden) do nothing;
