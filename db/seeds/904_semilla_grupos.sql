-- Ciclo 3 -- Semilla de core.grupo: los 7 grupos reales (Mapa Base,
-- Diagnostico, Eje 1..Eje 5), confirmados por la estructura real de
-- carpetas/manifest.json en public/Datos/ (MapaBase/, Diagnostico/,
-- EjesEstrategicos/Eje_1..Eje_5).
--
-- Requiere que 114_schema_core_capa.sql y 901_semilla_ejes_estrategicos.sql
-- ya esten aplicados (las 5 filas de Eje enlazan a core.eje_estrategico
-- por orden).

insert into core.grupo (nombre, eje_estrategico_id, orden) values
  ('Mapa Base',   null, 1),
  ('Diagnostico', null, 2)
on conflict (nombre) do nothing;

insert into core.grupo (nombre, eje_estrategico_id, orden)
select 'Eje ' || e.orden, e.id, 2 + e.orden
from core.eje_estrategico e
on conflict (nombre) do nothing;
