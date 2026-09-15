-- Ciclo 3 -- RLS de los catalogos de Capa 2: indicador, indicador_eje,
-- grupo, capa, capa_feature, capa_grupo.
--
-- NO incluye core.observacion a proposito -- ver cabecera de
-- 115_schema_core_observacion.sql: falta confirmar con la matriz
-- real de permisos por rol sobre esa tabla. Se agrega en un archivo
-- aparte (118_rls_observacion.sql, todavia sin escribir) en cuanto se
-- confirme.
--
-- Mismo patron que 111_rls_catalogos.sql: GRANT primero, policy despues,
-- nunca mezclados. Estos catalogos hoy ya se sirven completos y sin
-- autenticacion como archivos estaticos (Indicadores.csv via PapaParse,
-- .geojson directo -- ver seccion 1 de la especificacion) -- asi que
-- abrir su lectura a anon aqui no es una politica nueva, es preservar el
-- mismo acceso publico que ya existe hoy, ahora sobre tablas reales en
-- vez de archivos sueltos. Ninguna escritura via API todavia -- se
-- llenan por migracion/seed o por servicio-procesos en ciclos futuros,
-- igual que los catalogos de 111.

alter table core.indicador      enable row level security;
alter table core.indicador_eje  enable row level security;
alter table core.grupo          enable row level security;
alter table core.capa           enable row level security;
alter table core.capa_feature   enable row level security;
alter table core.capa_grupo     enable row level security;

grant select on
  core.indicador, core.indicador_eje, core.grupo,
  core.capa, core.capa_feature, core.capa_grupo
  to anon, authenticated;

create policy indicador_select_todos on core.indicador
  for select
  to anon, authenticated
  using (true);

create policy indicador_eje_select_todos on core.indicador_eje
  for select
  to anon, authenticated
  using (true);

create policy grupo_select_todos on core.grupo
  for select
  to anon, authenticated
  using (true);

create policy capa_select_todos on core.capa
  for select
  to anon, authenticated
  using (true);

create policy capa_feature_select_todos on core.capa_feature
  for select
  to anon, authenticated
  using (true);

create policy capa_grupo_select_todos on core.capa_grupo
  for select
  to anon, authenticated
  using (true);
