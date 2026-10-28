-- Ciclo 3 (ajuste) -- Lectura PUBLICA para el dashboard sin cuenta (decision de Ismael, 27-oct-2026).
-- El ciudadano sin cuenta ve el dashboard publico; la seccion operativa vive en otro portal con login.
--
-- Principio: anon lee SOLO lo ya decidido como publico y NUNCA datos de personas ni del proceso.
--   Publico:  territorio, ejes, sectores, fuentes, periodos; instrumentos publicados (D-16) y su matriz;
--             indicadores aprobados y activos con sus ejes, instrumentos y umbrales; capas
--             vigente_publico con sus elementos; mediciones en estado vigente_publico.
--   Privado:  perfil, bitacora, invitacion, evidencia, dictamen, hallazgo, versiones de capa,
--             diccionario, borradores, mediciones no publicadas, y TODA columna de usuario.
-- Como medicion y umbral traen columnas de usuario, anon no las lee por api.medicion_indicador ni
-- api.umbral_semaforo: usa api.medicion_publica y api.umbral_publico (solo columnas seguras) y los
-- GRANT de columna sobre core impiden pedirlas por otro camino.

grant usage on schema core to anon;

-- ---- catalogo base: todas las filas (no hay datos de personas)
do $$
declare t text;
begin
  foreach t in array array['unidad_territorial','unidad_territorial_geom','eje_tematico','sector',
                           'fuente_informacion','periodo']
  loop
    execute format('grant select on core.%I to anon', t);
    execute format('create policy %I on core.%I for select to anon using (true)', t || '_select_publico', t);
    execute format('grant select on api.%I to anon', t);
  end loop;
end $$;

-- ---- instrumentos publicados (D-16) y su matriz
grant select on core.instrumento_origen to anon;
create policy instrumento_select_publico on core.instrumento_origen for select to anon
  using (publicado and activo);
grant select on core.matriz_instrumento to anon;
create policy matriz_select_publico on core.matriz_instrumento for select to anon
  using (exists (select 1 from core.instrumento_origen i where i.id = id_instrumento));
grant select on api.instrumento_origen, api.matriz_instrumento to anon;

-- ---- indicadores aprobados y activos (la compuerta de aprobacion decide que es publico)
grant select on core.indicador to anon;
create policy indicador_select_publico on core.indicador for select to anon
  using (estatus_aprobado and activo);
grant select on core.indicador_eje, core.indicador_instrumento to anon;
create policy indicador_eje_select_publico on core.indicador_eje for select to anon
  using (exists (select 1 from core.indicador i where i.id = id_indicador));
create policy indicador_instr_select_publico on core.indicador_instrumento for select to anon
  using (exists (select 1 from core.indicador i where i.id = id_indicador)
         and exists (select 1 from core.instrumento_origen o where o.id = id_instrumento));
grant select on api.indicador, api.indicador_eje, api.indicador_instrumento to anon;

-- ---- umbrales: sin la columna id_usuario
grant select (id, id_indicador, verde_desde, amarillo_desde, vigente_desde, vigente_hasta)
  on core.umbral_semaforo to anon;
create policy umbral_select_publico on core.umbral_semaforo for select to anon
  using (id_indicador is null or exists (select 1 from core.indicador i where i.id = id_indicador));
create or replace view api.umbral_publico with (security_invoker = true) as
  select id, id_indicador, verde_desde, amarillo_desde, vigente_desde, vigente_hasta from core.umbral_semaforo;
comment on view api.umbral_publico is 'Umbrales del semaforo para lectura publica (sin datos de usuario).';
revoke all on api.umbral_publico from public, anon, authenticated;
grant select on api.umbral_publico to anon, authenticated;

-- ---- mediciones: solo vigente_publico y sin firmantes
grant select (id, id_indicador, id_unidad, id_periodo, valor, valor_texto, desagregaciones, estado, fecha_validacion)
  on core.medicion_indicador to anon;
create policy medicion_select_publico on core.medicion_indicador for select to anon
  using (estado = 'vigente_publico');
create or replace view api.medicion_publica with (security_invoker = true) as
  select id, id_indicador, id_unidad, id_periodo, valor, valor_texto, desagregaciones, estado, fecha_validacion
  from core.medicion_indicador;
comment on view api.medicion_publica is 'Mediciones publicadas (vigente_publico) para el dashboard publico; sin capturista ni validador.';
revoke all on api.medicion_publica from public, anon, authenticated;
grant select on api.medicion_publica to anon, authenticated;

-- ---- capas publicas y sus elementos
grant select on core.capa, core.capa_indicador, core.capa_vector to anon;
create policy capa_select_publico on core.capa for select to anon
  using (estatus = 'vigente_publico' and activo);
create policy capa_indicador_select_publico on core.capa_indicador for select to anon
  using (exists (select 1 from core.capa c where c.id = id_capa)
         and exists (select 1 from core.indicador i where i.id = id_indicador));
create policy capa_vector_select_publico on core.capa_vector for select to anon
  using (exists (select 1 from core.capa c where c.id = id_capa));
grant select on api.capa, api.capa_indicador, api.capa_vector to anon;
