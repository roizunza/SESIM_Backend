-- Ciclo 3 (TDR 6.2.2 b) -- Paso 1: el modelo de datos anterior (migraciones 110-119,
-- diseno de septiembre: indicador con llave de texto, capa/capa_feature/capa_grupo,
-- observacion, eje_estrategico, municipio, dependencia) se retira del camino del
-- sistema y se conserva en el esquema `legado` para consulta. NO se borra aqui:
-- la baja definitiva es una decision aparte (migracion 299 o posterior).
--
-- Las migraciones 110-119 NO se editan (el runner compara su sha256); esta las
-- supera. Una base nueva las aplica y esta migracion las aparta enseguida.
--
-- `legado` no se expone por la API: ningun rol de la plataforma tiene USAGE.

create schema if not exists legado;
comment on schema legado is 'Modelo de datos anterior a la arquitectura v2.2 (migraciones 110-119). Solo consulta historica; sin acceso desde la API. Su retiro definitivo se decide aparte.';

-- Vistas de la API del modelo anterior (dependen de las tablas que se mueven).
drop view if exists api.observacion;
drop view if exists api.capa_feature;
drop view if exists api.capa_grupo;
drop view if exists api.capa;
drop view if exists api.grupo;
drop view if exists api.indicador_eje;
drop view if exists api.indicador;
drop view if exists api.eje_estrategico;
drop view if exists api.municipio;
drop view if exists api.dependencia;

do $$
declare t text;
begin
  foreach t in array array['observacion','capa_feature','capa_grupo','capa','grupo',
                           'indicador_eje','indicador','eje_estrategico','municipio','dependencia']
  loop
    if to_regclass('core.' || t) is not null and to_regclass('legado.' || t) is null then
      execute format('alter table core.%I set schema legado', t);
    end if;
  end loop;
end $$;

revoke all on schema legado from public, anon, authenticated;
