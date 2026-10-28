-- Ciclo 3 -- Paso 4: politicas de acceso (RLS) del modelo v2.2.
-- Regla general: toda tabla nueva de core nace con RLS activo y SIN permisos de escritura para
-- los roles de la API. Las escrituras llegan en el Ciclo 4 (catalogos) y el Ciclo 8 (flujo de
-- mediciones) a traves de funciones api.* con SECURITY DEFINER; ninguna aplicacion hace
-- INSERT/UPDATE directo sobre el nucleo.
--
-- Lectura:
--  * catalogos, territorio, capas, umbrales: cualquier cuenta activa (core.rol_actual() no nulo).
--  * medicion_indicador: Auditor todo; Administrador/Titular todo menos borradores ajenos;
--    Capturista las suyas; cualquier cuenta activa lo vigente_publico.
--  * evidencia_medicion / dictamen / hallazgo: quien puede ver la medicion (el Auditor y la
--    administracion ven todo).
--  * bitacora_cambio: Auditor, Administrador y Titular.
--  * invitacion: solo el Administrador Titular (y no se expone por la API).

do $$
declare t text;
begin
  foreach t in array array[
    'unidad_territorial','unidad_territorial_geom','eje_tematico','sector','fuente_informacion',
    'instrumento_origen','matriz_instrumento','indicador','indicador_eje','indicador_instrumento',
    'umbral_semaforo','periodo','capa','capa_indicador','capa_vector','capa_version']
  loop
    execute format('alter table core.%I enable row level security', t);
    execute format('revoke all on core.%I from public, anon, authenticated', t);
    execute format('grant select on core.%I to authenticated', t);
    execute format('create policy %I on core.%I for select to authenticated using (core.rol_actual() is not null)',
                   t || '_select_activos', t);
  end loop;
end $$;

-- medicion_indicador
alter table core.medicion_indicador enable row level security;
revoke all on core.medicion_indicador from public, anon, authenticated;
grant select on core.medicion_indicador to authenticated;
create policy medicion_select on core.medicion_indicador for select to authenticated
using (
  core.rol_actual() = 'auditor'
  or (core.rol_actual() in ('administrador','administrador_titular') and estado <> 'borrador')
  or (core.rol_actual() = 'capturista' and usuario_captura = auth.uid())
  or (core.rol_actual() is not null and estado = 'vigente_publico')
);

-- evidencia_medicion: se ve si se ve la medicion (el subselect aplica la RLS de medicion_indicador)
alter table core.evidencia_medicion enable row level security;
revoke all on core.evidencia_medicion from public, anon, authenticated;
grant select on core.evidencia_medicion to authenticated;
create policy evidencia_select on core.evidencia_medicion for select to authenticated
using (exists (select 1 from core.medicion_indicador m where m.id = id_medicion));

-- dictamen
alter table core.dictamen enable row level security;
revoke all on core.dictamen from public, anon, authenticated;
grant select on core.dictamen to authenticated;
create policy dictamen_select on core.dictamen for select to authenticated
using (
  core.rol_actual() in ('administrador','administrador_titular','auditor')
  or (objeto_tipo = 'medicion' and exists (select 1 from core.medicion_indicador m where m.id::text = objeto_id))
);

-- hallazgo_auditoria
alter table core.hallazgo_auditoria enable row level security;
revoke all on core.hallazgo_auditoria from public, anon, authenticated;
grant select on core.hallazgo_auditoria to authenticated;
create policy hallazgo_select on core.hallazgo_auditoria for select to authenticated
using (
  core.rol_actual() in ('administrador','administrador_titular','auditor')
  or exists (select 1 from core.medicion_indicador m where m.id = id_medicion)
);

-- bitacora_cambio (solo lectura de supervision)
alter table core.bitacora_cambio enable row level security;
revoke all on core.bitacora_cambio from public, anon, authenticated;
grant select on core.bitacora_cambio to authenticated;
create policy bitacora_cambio_select on core.bitacora_cambio for select to authenticated
using (core.rol_actual() in ('administrador','administrador_titular','auditor'));

-- invitacion (latente)
alter table core.invitacion enable row level security;
revoke all on core.invitacion from public, anon, authenticated;
create policy invitacion_titular on core.invitacion for select to authenticated
using (core.rol_actual() = 'administrador_titular');
grant select on core.invitacion to authenticated;
