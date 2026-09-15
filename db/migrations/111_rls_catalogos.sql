-- Ciclo 3 -- RLS de los catalogos base (eje_estrategico, municipio,
-- dependencia).
--
-- Cierra "Capa 1" junto con 110 (schema, ya aplicado) y 112 (vista api.*,
-- este mismo archivo la habilita para leer). Sigue el patron de casa de
-- Ciclo 1: GRANT primero (quien puede intentar la operacion), policy
-- despues (sobre que filas) -- nunca mezclados (ver 102_rls_perfil.sql /
-- 105_rls_bitacora.sql para el mismo comentario).
--
-- Decision: estos 3 catalogos son de solo lectura para TODOS, incluido
-- `anon` -- no son datos de negocio como core.perfil/core.bitacora, son
-- referencia publica (nombres de eje, municipios, dependencias).
-- No se otorga INSERT/UPDATE/DELETE a nadie
-- via API todavia -- se mantienen y editan solo
-- via migraciones/seeds, igual que se sembraron en 901/902/903. Si en
-- algun ciclo futuro se necesita editarlos desde el front, esto se abre
-- ahi con su propia policy explicita -- no antes.

alter table core.eje_estrategico enable row level security;
alter table core.municipio        enable row level security;
alter table core.dependencia      enable row level security;

grant select on core.eje_estrategico, core.municipio, core.dependencia
  to anon, authenticated;

create policy eje_estrategico_select_todos on core.eje_estrategico
  for select
  to anon, authenticated
  using (true);

create policy municipio_select_todos on core.municipio
  for select
  to anon, authenticated
  using (true);

create policy dependencia_select_todos on core.dependencia
  for select
  to anon, authenticated
  using (true);
