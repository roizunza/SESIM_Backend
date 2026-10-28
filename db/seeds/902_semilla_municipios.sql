-- Ciclo 3 -- Semilla: los 13 municipios de Campeche.
--
-- Extraido directo de
-- public/Datos/MapaBase/c04_municiipios_inegi_2024.geojson
-- (Marco Geoestadistico INEGI 2024, atributos cve_mun/nomgeo de cada
-- feature), 15 sept 2026. cve_mun es el codigo de 3 digitos tal cual
-- vive en el atributo `cve_mun` del propio dataset (sin el prefijo de
-- entidad '04').
--
-- Requiere que 110_schema_core_catalogos.sql ya este aplicado.

insert into core.municipio (cve_mun, nombre) values
  ('001', 'Calkiní'),
  ('002', 'Campeche'),
  ('003', 'Carmen'),
  ('004', 'Champotón'),
  ('005', 'Hecelchakán'),
  ('006', 'Hopelchén'),
  ('007', 'Palizada'),
  ('008', 'Tenabo'),
  ('009', 'Escárcega'),
  ('010', 'Calakmul'),
  ('011', 'Candelaria'),
  ('012', 'Seybaplaya'),
  ('013', 'Dzitbalché')
on conflict (cve_mun) do nothing;
