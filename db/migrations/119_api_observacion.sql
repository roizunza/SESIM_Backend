-- Ciclo 3 -- Vista api.observacion.
--
-- A proposito SIN grant a anon (ver 118_rls_observacion.sql, regla 2:
-- el publico ve el geovisor pero no las observaciones). Mismo patron de
-- security_invoker = true que el resto de vistas api.* -- la RLS real
-- la sigue poniendo la tabla base, esta vista solo decide que columnas
-- se exponen.

create view api.observacion
  with (security_invoker = true) as
  select
    id, indicador_codigo, cve_mun, periodo, valor, estatus, version,
    capturado_por, creado_en
  from core.observacion;

comment on view api.observacion is
  'Valores capturados de indicadores -- solo credencial (capturista/administrador/administrador_vip/auditor), NUNCA anon. Ver 118_rls_observacion.sql para la matriz completa de permisos.';

grant select, insert, update on api.observacion to authenticated;
