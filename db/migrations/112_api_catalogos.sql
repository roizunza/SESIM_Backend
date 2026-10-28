-- Ciclo 3 -- Vistas api.* de los catalogos base (eje_estrategico,
-- municipio, dependencia).
--
-- Cierra "Capa 1". Mismo patron que api.perfil/api.bitacora: vista con
-- security_invoker = true (para que la RLS de 111 se evalue con el rol de
-- quien consulta, no con el dueno de la vista), exponiendo solo columnas
-- necesarias, con comment on view. `grant usage on schema api to anon,
-- authenticated` ya se hizo una vez en Ciclo 1 (fix de GRANTs de
-- PostgREST, ver claude/front-consolidacion-react-d-sim-front.md) -- aqui
-- solo se agrega el select puntual de cada vista nueva.

create view api.eje_estrategico
  with (security_invoker = true) as
  select id, nombre, orden
  from core.eje_estrategico;
comment on view api.eje_estrategico is
  'Los 5 Ejes Estrategicos EEMSV, de solo lectura. Fuente real: core.eje_estrategico (sembrado en 901_semilla_ejes_estrategicos.sql).';
grant select on api.eje_estrategico to anon, authenticated;

create view api.municipio
  with (security_invoker = true) as
  select cve_mun, nombre
  from core.municipio;
comment on view api.municipio is
  'Los 13 municipios de Campeche, de solo lectura. Fuente real: core.municipio (sembrado en 902_semilla_municipios.sql).';
grant select on api.municipio to anon, authenticated;

create view api.dependencia
  with (security_invoker = true) as
  select id, nombre
  from core.dependencia;
comment on view api.dependencia is
  'Catalogo de dependencias, de solo lectura. Semilla MINIMA a proposito (903_semilla_dependencias.sql) -- pendiente de un catalogo real.';
grant select on api.dependencia to anon, authenticated;
