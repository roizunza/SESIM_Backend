-- Ciclo 3 (ajuste) -- Decision D-17: estatus de las capas.
-- Dos ejes: ESTATUS (etapa: borrador -> revision -> vigente_admin -> vigente_publico) y RESTRICCION DE USO
-- (metadatos_extra.restriccion_uso: publica | interna | reservada). La visibilidad sale de combinarlos:
--   anon (ciudadano)  : vigente_publico y restriccion publica
--   Capturista        : vigente_admin + vigente_publico
--   Administrador/Titular/Auditor: todas
-- Mapeo de la carga oficial: metadato completo + publica -> vigente_publico (66, sin cambio);
-- metadato completo + interna -> vigente_admin (9, antes borrador); sin metadato minimo -> borrador (12, sin cambio).

-- 1. Las capas internas con metadato completo pasan a vigente_admin y dejan su version.
with movidas as (
  update core.capa c set estatus = 'vigente_admin', updated_at = now()
  where c.estatus = 'borrador'
    and c.metadatos_extra->>'restriccion_uso' in ('interna', 'reservada')
    and btrim(coalesce(c.metadatos_extra->>'custodio', ''))            <> ''
    and btrim(coalesce(c.metadatos_extra->>'fuente_origen', ''))       <> ''
    and btrim(coalesce(c.metadatos_extra->>'linaje', ''))              <> ''
    and btrim(coalesce(c.metadatos_extra->>'sistema_coordenadas', '')) <> ''
  returning c.id, c.metadatos_extra
)
insert into core.capa_version (id_capa, version, estatus, metadatos, nota)
select m.id, coalesce((select max(v.version) from core.capa_version v where v.id_capa = m.id), 0) + 1,
       'vigente_admin', m.metadatos_extra,
       'D-17: capa con restriccion de uso interna; pasa de borrador a vigente_admin (solo uso interno).'
from movidas m;

-- 2. Compuertas. Publicar exige ademas restriccion de uso publica; validar para uso interno exige el metadato minimo.
alter table core.capa drop constraint capa_compuerta_publicacion;
alter table core.capa add constraint capa_compuerta_publicacion check (
  estatus <> 'vigente_publico'
  or (   btrim(coalesce(metadatos_extra->>'custodio', ''))             <> ''
     and btrim(coalesce(metadatos_extra->>'fuente_origen', ''))        <> ''
     and btrim(coalesce(metadatos_extra->>'linaje', ''))               <> ''
     and btrim(coalesce(metadatos_extra->>'sistema_coordenadas', ''))  <> ''
     and metadatos_extra->>'restriccion_uso' = 'pública'));
alter table core.capa add constraint capa_compuerta_validacion check (
  estatus not in ('vigente_admin', 'vigente_publico')
  or (   btrim(coalesce(metadatos_extra->>'custodio', ''))             <> ''
     and btrim(coalesce(metadatos_extra->>'fuente_origen', ''))        <> ''
     and btrim(coalesce(metadatos_extra->>'linaje', ''))               <> ''
     and btrim(coalesce(metadatos_extra->>'sistema_coordenadas', ''))  <> ''));

comment on column core.capa.estatus is
  'Etapa de la capa: borrador | revision | vigente_admin (validada, solo uso interno) | vigente_publico (visible al ciudadano; exige restriccion de uso publica y metadato completo). La visibilidad final combina estatus y restriccion de uso (D-17).';

-- 3. Visibilidad por perfil (antes cualquier cuenta activa veia todas, borradores incluidos).
drop policy capa_select_activos on core.capa;
create policy capa_select_por_rol on core.capa for select to authenticated using (
  core.rol_actual() in ('administrador', 'administrador_titular', 'auditor')
  or (core.rol_actual() = 'capturista' and estatus in ('vigente_admin', 'vigente_publico')));

drop policy capa_indicador_select_activos on core.capa_indicador;
create policy capa_indicador_select_por_capa on core.capa_indicador for select to authenticated
  using (exists (select 1 from core.capa c where c.id = id_capa));

drop policy capa_vector_select_activos on core.capa_vector;
create policy capa_vector_select_por_capa on core.capa_vector for select to authenticated
  using (exists (select 1 from core.capa c where c.id = id_capa));

drop policy capa_version_select_activos on core.capa_version;
create policy capa_version_select_supervision on core.capa_version for select to authenticated
  using (core.rol_actual() in ('administrador', 'administrador_titular', 'auditor'));
