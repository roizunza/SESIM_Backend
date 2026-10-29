-- Ciclo 4 -- Pruebas del CRUD de catalogos, capas, instrumentos, usuarios e invitaciones contra la base REAL.
-- Cada caso actua con la identidad de un perfil (claims JWT reales; auth.uid() de Supabase) y verifica que la
-- bitacora registre lo que debe, que cada perfil vea solo lo suyo y que las compuertas D-16/D-17 sigan firmes.
-- Todo corre dentro de una transaccion que termina en ROLLBACK.
--
-- Uso:  psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f db/pruebas/ciclo4_pruebas.sql
\set ON_ERROR_STOP on
\pset format aligned
\pset border 2
begin;

create temp table resultados (n serial, caso text, ok boolean, detalle text);

-- Quien actua: fija la identidad (claims) SIN cambiar de rol. Es lo que ocurre dentro de una funcion
-- api.* SECURITY DEFINER del Ciclo 4/8: corre como dueno pero auth.uid() sigue siendo la persona.
create function pg_temp.actua(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(u::text, ''), true);
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
end $$;
-- Quien consulta: ademas cambia al rol de base `authenticated` (lectura por la API, con RLS).
create function pg_temp.yo(u uuid) returns void language plpgsql as $$
begin
  perform pg_temp.actua(u);
  execute 'set local role authenticated';
end $$;
create function pg_temp.anonimo() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  execute 'set local role anon';
end $$;
create function pg_temp.sin_identidad() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.headers', '', true);
end $$;
create function pg_temp.intenta(q text) returns text language plpgsql as $$
begin execute q; return 'OK'; exception when others then return sqlstate || ': ' || sqlerrm; end $$;
create function pg_temp.cuenta(q text) returns bigint language plpgsql as $$
declare n bigint; begin
  begin execute 'select count(*) from (' || q || ') x' into n; exception when others then return -1; end; return n; end $$;
create function pg_temp.reg(c text, ok boolean, d text) returns void language plpgsql as $$
begin
  perform pg_temp.sin_identidad();
  insert into resultados(caso, ok, detalle) values (c, ok, d);
end $$;
grant all on pg_temp.resultados to public;

insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-00000000c0a1', 'cap.a@prueba.mx'),
 ('00000000-0000-0000-0000-00000000c0b2', 'cap.b@prueba.mx'),
 ('00000000-0000-0000-0000-0000000000ad', 'adm@prueba.mx'),
 ('00000000-0000-0000-0000-0000000000ae', 'adm2@prueba.mx'),
 ('00000000-0000-0000-0000-0000000000a7', 'tit@prueba.mx'),
 ('00000000-0000-0000-0000-0000000000a8', 'tit2@prueba.mx'),
 ('00000000-0000-0000-0000-0000000000a0', 'aud@prueba.mx');
insert into core.perfil (id_usuario, nombre, rol, creado_en) values
 ('00000000-0000-0000-0000-00000000c0a1', 'Capturista A', 'capturista', '2030-01-01 10:00+00'),
 ('00000000-0000-0000-0000-00000000c0b2', 'Capturista B', 'capturista', '2030-01-01 11:00+00'),
 ('00000000-0000-0000-0000-0000000000ad', 'Administrador',  'administrador', '2030-01-01 12:00+00'),
 ('00000000-0000-0000-0000-0000000000ae', 'Administrador 2','administrador', '2030-01-01 12:30+00'),
 ('00000000-0000-0000-0000-0000000000a7', 'Titular',        'administrador_titular', '2030-01-01 13:00+00'),
 ('00000000-0000-0000-0000-0000000000a8', 'Titular 2',      'administrador_titular', '2030-01-01 13:30+00'),
 ('00000000-0000-0000-0000-0000000000a0', 'Auditor',        'auditor', '2030-01-01 14:00+00');

do $$
declare
  ca uuid := '00000000-0000-0000-0000-00000000c0a1'; cb uuid := '00000000-0000-0000-0000-00000000c0b2';
  ad uuid := '00000000-0000-0000-0000-0000000000ad'; a2 uuid := '00000000-0000-0000-0000-0000000000ae';
  ti uuid := '00000000-0000-0000-0000-0000000000a7'; t2 uuid := '00000000-0000-0000-0000-0000000000a8';
  au uuid := '00000000-0000-0000-0000-0000000000a0';
  ficha jsonb := '{"custodio":"SEDUMOP","fuente_origen":"Prueba","linaje":"Levantamiento de prueba","sistema_coordenadas":"EPSG:6372","restriccion_uso":"pública"}';
  r text; j jsonb; tok text; n bigint; v_inst text; v_dic uuid; v_dic2 uuid;
begin
  ---------------------------------------------------------------- CATALOGOS
  perform pg_temp.yo(ad);
  r := pg_temp.intenta($q$select api.fn_guardar_eje('{"id":5,"nombre":"Eje de prueba"}')$q$);
  perform pg_temp.reg('G01 El Administrador edita el nombre de un eje', r = 'OK' and (select nombre from core.eje_tematico where id = 5) = 'Eje de prueba', r);
  perform pg_temp.yo(ad);
  r := pg_temp.intenta($q$select api.fn_guardar_eje('{"id":5,"nombre":"Eje de prueba 2"}')$q$);
  perform pg_temp.reg('G02 Editar con campos parciales actualiza el eje, no lo duplica', r = 'OK' and (select count(*) from core.eje_tematico where id = 5) = 1
    and (select nombre from core.eje_tematico where id = 5) = 'Eje de prueba 2', r);
  perform pg_temp.reg('G03 Las dos ediciones del eje quedan en la bitacora con el id del Administrador',
    (select count(*) from core.bitacora_cambio where tabla_afectada='eje_tematico' and id_registro='5' and id_usuario = ad
       and accion = 'UPDATE') = 2, '');
  perform pg_temp.yo(ad);
  r := pg_temp.intenta($q$select api.fn_guardar_sector('{"id":"SD-98","nombre":"Sector de prueba","tipo":"definitivo"}')$q$);
  perform pg_temp.reg('G03b El Administrador crea un sector y queda auditado como INSERT',
    r = 'OK' and (select count(*) from core.bitacora_cambio where tabla_afectada='sector' and id_registro='SD-98' and accion='INSERT' and id_usuario = ad) = 1, r);
  perform pg_temp.yo(ca);
  r := pg_temp.intenta($q$select api.fn_guardar_eje('{"id":91,"numero_eje":91,"nombre":"No debe"}')$q$);
  perform pg_temp.reg('G04 El Capturista no puede crear ejes (42501)', r like '42501%', r);
  perform pg_temp.yo(au);
  r := pg_temp.intenta($q$select api.fn_guardar_sector('{"id":"SD-99","nombre":"No debe","tipo":"Sector"}')$q$);
  perform pg_temp.reg('G05 El Auditor no escribe catalogos (42501)', r like '42501%', r);
  perform pg_temp.anonimo();
  r := pg_temp.intenta($q$select api.fn_guardar_eje('{"id":92,"numero_eje":92,"nombre":"Anon"}')$q$);
  perform pg_temp.reg('G06 Un ciudadano sin cuenta no puede ejecutar funciones de escritura', r like '42501%', r);
  perform pg_temp.yo(ad);
  r := pg_temp.intenta($q$select api.fn_guardar_eje('{"id":93,"numero_eje":93,"nombre":"X","campo_inventado":1}')$q$);
  perform pg_temp.reg('G07 Una clave que no existe en el modelo se rechaza (22023)', r like '22023%', r);
  perform pg_temp.yo(ad);
  r := pg_temp.intenta($q$select api.fn_guardar_indicador('{"id":"ZZ01","id_eje":5,"id_sector":"SD-01","id_fuente":1,"nombre":"Indicador de prueba","nivel_mir":"Propósito","estatus_aprobado":true}')$q$);
  perform pg_temp.reg('G08 No se aprueba un indicador sin tendencia ni cifra de meta (23514)', r like '23514%', r);
  perform pg_temp.yo(ad);
  r := pg_temp.intenta($q$select api.fn_guardar_indicador('{"id":"ZZ01","id_eje":5,"id_sector":"SD-01","id_fuente":1,"nombre":"Indicador de prueba","nivel_mir":"Propósito","tendencia":"Ascendente","valor_meta":10,"estatus_aprobado":true}')$q$);
  perform pg_temp.reg('G09 Con tendencia y meta el indicador se crea aprobado y con su eje principal',
    r = 'OK' and (select count(*) from core.indicador_eje where id_indicador='ZZ01' and id_eje=5 and principal) = 1, r);
  perform pg_temp.yo(ad);
  r := pg_temp.intenta($q$select api.fn_asignar_indicador_eje('ZZ01', 1)$q$);
  perform pg_temp.reg('G10 Se asigna un eje adicional al indicador y queda auditado',
    r = 'OK' and (select count(*) from core.indicador_eje where id_indicador='ZZ01') = 2
    and (select count(*) from core.bitacora_cambio where tabla_afectada='indicador_eje' and id_usuario = ad) >= 1, r);
  perform pg_temp.yo(ad);
  r := pg_temp.intenta($q$select api.fn_quitar_indicador_eje('ZZ01', 5)$q$);
  perform pg_temp.reg('G11 No se quita el eje principal del indicador (23514)', r like '23514%', r);
  perform pg_temp.yo(ad);
  r := pg_temp.intenta($q$select api.fn_guardar_eje('{"id":5,"activo":false}')$q$);
  perform pg_temp.reg('G12 No se da de baja un eje con indicadores activos (23514)', r like '23514%', r);
  perform pg_temp.yo(ad);
  r := pg_temp.intenta($q$select api.fn_vincular_indicador_instrumento('ZZ01', (select id_instrumento from core.matriz_instrumento order by id limit 1), 'directa', (select id from core.matriz_instrumento order by id limit 1))$q$);
  perform pg_temp.reg('G13 El Administrador vincula un indicador con un instrumento', r = 'OK', r);
  perform pg_temp.yo(ad);
  r := pg_temp.intenta($q$select api.fn_guardar_umbral('ZZ01', 80, 50)$q$);
  perform pg_temp.reg('G14 El Administrador no gestiona umbrales (D-16: solo el Titular)', r like '42501%', r);
  perform pg_temp.yo(ti);
  r := pg_temp.intenta($q$select api.fn_guardar_umbral('ZZ01', 80, 50)$q$);
  perform pg_temp.reg('G15 El Titular fija el umbral y queda auditado',
    r = 'OK' and (select count(*) from core.bitacora_cambio where tabla_afectada='umbral_semaforo' and id_usuario = ti) >= 1, r);
  perform pg_temp.yo(ti);
  r := pg_temp.intenta($q$select api.fn_guardar_umbral('ZZ01', 90, 60)$q$);
  perform pg_temp.reg('G16 Un umbral nuevo cierra el vigente: solo queda uno abierto por indicador',
    r = 'OK' and (select count(*) from core.umbral_semaforo where id_indicador='ZZ01' and vigente_hasta is null) = 1, r);

  ---------------------------------------------------------------- CAPAS
  perform pg_temp.yo(ca);
  r := pg_temp.intenta(format($q$select api.fn_guardar_capa(%L)$q$,
        jsonb_build_object('id','TC4-01','titulo','Capa de prueba','tipo_geometria','Punto','srid_origen',6372,'estatus','vigente_publico')));
  perform pg_temp.reg('C00 Pedir un estatus al guardar la capa se rechaza: solo cambia por las funciones de flujo (22023)', r like '22023%', r);
  perform pg_temp.yo(ca);
  r := pg_temp.intenta(format($q$select api.fn_guardar_capa(%L)$q$,
        jsonb_build_object('id','TC4-01','titulo','Capa de prueba','tipo_geometria','Punto','srid_origen',6372)));
  perform pg_temp.reg('C01 El Capturista da de alta una capa y nace en borrador',
    r = 'OK' and (select estatus from core.capa where id='TC4-01') = 'borrador', r);
  perform pg_temp.reg('C02 El alta deja la version 1 y un INSERT auditado a nombre del Capturista',
    (select count(*) from core.capa_version where id_capa='TC4-01' and version=1) = 1
    and (select count(*) from core.bitacora_cambio where tabla_afectada='capa' and id_registro='TC4-01' and accion='INSERT' and id_usuario=ca) = 1, '');
  perform pg_temp.yo(ca);
  r := pg_temp.intenta($q$select api.fn_enviar_capa_revision('TC4-01')$q$);
  perform pg_temp.reg('C03 Con la ficha incompleta no se envia a revision (23514, nombra lo que falta)', r like '23514%custodio%', r);
  perform pg_temp.yo(cb);
  r := pg_temp.intenta(format($q$select api.fn_guardar_capa(%L)$q$, jsonb_build_object('id','TC4-01','metadatos_extra',ficha)));
  perform pg_temp.reg('C04 El Capturista B no edita la capa del Capturista A (42501)', r like '42501%', r);
  perform pg_temp.yo(cb);
  perform pg_temp.reg('C05 El Capturista B ni siquiera ve el borrador del Capturista A',
    pg_temp.cuenta($q$select 1 from api.capa where id='TC4-01'$q$) = 0, '');
  perform pg_temp.yo(ca);
  r := pg_temp.intenta(format($q$select api.fn_guardar_capa(%L)$q$, jsonb_build_object('id','TC4-01','metadatos_extra',ficha)));
  perform pg_temp.reg('C06 El Capturista A completa la ficha (se mezcla con lo que ya habia)',
    r = 'OK' and (select metadatos_extra->>'linaje' from core.capa where id='TC4-01') = 'Levantamiento de prueba', r);
  perform pg_temp.yo(ca);
  r := pg_temp.intenta($q$select api.fn_vincular_capa_indicador('TC4-01','ZZ01')$q$);
  perform pg_temp.reg('C07 El Capturista vincula su capa en borrador con un indicador',
    r = 'OK' and (select count(*) from core.capa_indicador where id_capa='TC4-01') = 1, r);
  perform pg_temp.yo(ca);
  r := pg_temp.intenta($q$select api.fn_enviar_capa_revision('TC4-01')$q$);
  perform pg_temp.sin_identidad();
  perform pg_temp.reg('C08 Con la ficha completa pasa a revision; queda version 2 y CAMBIO_ESTADO auditado',
    r = 'OK' and (select estatus from core.capa where id='TC4-01') = 'revision'
    and (select count(*) from core.capa_version where id_capa='TC4-01') = 2
    and (select count(*) from core.bitacora_cambio where tabla_afectada='capa' and id_registro='TC4-01' and accion='CAMBIO_ESTADO' and id_usuario=ca) = 1, r);
  perform pg_temp.yo(ca);
  r := pg_temp.intenta(format($q$select api.fn_guardar_capa(%L)$q$, jsonb_build_object('id','TC4-01','titulo','Cambio a escondidas')));
  perform pg_temp.reg('C09 Una capa en revision no se edita (55000)', r like '55000%', r);
  perform pg_temp.yo(ca);
  r := pg_temp.intenta($q$select api.fn_dictaminar_capa('TC4-01','validar')$q$);
  perform pg_temp.reg('C10 El Capturista no dictamina (42501)', r like '42501%', r);
  perform pg_temp.yo(au);
  r := pg_temp.intenta($q$select api.fn_dictaminar_capa('TC4-01','validar')$q$);
  perform pg_temp.reg('C11 El Auditor no dictamina (42501)', r like '42501%', r);
  perform pg_temp.yo(au);
  perform pg_temp.reg('C12 El Auditor si ve la capa en revision (lectura total)',
    pg_temp.cuenta($q$select 1 from api.capa where id='TC4-01'$q$) = 1, '');
  perform pg_temp.yo(ad);
  r := pg_temp.intenta($q$select api.fn_dictaminar_capa('TC4-01','rechazar')$q$);
  perform pg_temp.reg('C13 Rechazar sin comentario no pasa (23514)', r like '23514%', r);
  perform pg_temp.yo(ad);
  r := pg_temp.intenta($q$select api.fn_dictaminar_capa('TC4-01','rechazar','Falta precisar el linaje')$q$);
  perform pg_temp.reg('C14 El Administrador rechaza con motivo: la capa vuelve a borrador y queda el dictamen',
    r = 'OK' and (select estatus from core.capa where id='TC4-01') = 'borrador'
    and (select count(*) from core.dictamen where objeto_tipo='capa' and objeto_id='TC4-01' and decision='rechazar' and id_usuario=ad) = 1, r);
  perform pg_temp.yo(ca);
  perform pg_temp.reg('C15 El Capturista ve el rechazo y su motivo en la bitacora operativa',
    pg_temp.cuenta($q$select 1 from api.bitacora_operativa where comentario_admin like '%linaje%'$q$) >= 1, '');
  perform pg_temp.yo(ca);
  perform pg_temp.intenta($q$select api.fn_enviar_capa_revision('TC4-01')$q$);
  perform pg_temp.yo(ca);
  r := pg_temp.intenta($q$select api.fn_dictaminar_capa('TC4-01','publicar')$q$);
  perform pg_temp.reg('C16 El Capturista no publica (42501)', r like '42501%', r);
  perform pg_temp.yo(ad);
  r := pg_temp.intenta($q$select api.fn_dictaminar_capa('TC4-01','publicar')$q$);
  perform pg_temp.reg('C17 Publicar desde revision, saltandose la validacion, no pasa (55000)', r like '55000%', r);
  perform pg_temp.yo(ad);
  r := pg_temp.intenta($q$select api.fn_dictaminar_capa('TC4-01','validar')$q$);
  perform pg_temp.reg('C18 El Administrador valida: vigente_admin con dictamen',
    r = 'OK' and (select estatus from core.capa where id='TC4-01') = 'vigente_admin'
    and (select count(*) from core.dictamen where objeto_id='TC4-01' and decision='validar') = 1, r);
  perform pg_temp.yo(ad);
  r := pg_temp.intenta($q$select api.fn_dictaminar_capa('TC4-01','publicar')$q$);
  perform pg_temp.reg('C19 El Administrador publica la capa validada (vigente_publico)',
    r = 'OK' and (select estatus from core.capa where id='TC4-01') = 'vigente_publico', r);
  perform pg_temp.anonimo();
  perform pg_temp.reg('C20 El ciudadano ya ve la capa publicada', pg_temp.cuenta($q$select 1 from api.capa where id='TC4-01'$q$) = 1, '');
  perform pg_temp.yo(ad);
  r := pg_temp.intenta($q$select api.fn_baja_capa('TC4-01')$q$);
  perform pg_temp.reg('C21 No se da de baja una capa publicada (55000)', r like '55000%', r);
  perform pg_temp.yo(ad);
  r := pg_temp.intenta($q$select api.fn_dictaminar_capa('TC4-01','rechazar','Se retira del publico por correccion')$q$);
  perform pg_temp.reg('C22 Rechazar una capa publicada la retira del publico (vuelve a borrador)',
    r = 'OK' and (select estatus from core.capa where id='TC4-01') = 'borrador', r);
  perform pg_temp.yo(au);
  perform pg_temp.reg('C23 El retiro del publico queda como CAMBIO_ESTADO vigente_publico -> borrador',
    (select count(*) from core.bitacora_cambio where tabla_afectada='capa' and id_registro='TC4-01' and accion='CAMBIO_ESTADO'
        and datos_previos->>'estatus'='vigente_publico' and datos_nuevos->>'estatus'='borrador') = 1, '');

  -- cuatro ojos: A2 envia, A2 no valida; AD si
  perform pg_temp.yo(a2);
  perform pg_temp.intenta(format($q$select api.fn_guardar_capa(%L)$q$,
        jsonb_build_object('id','TC4-02','titulo','Capa 2','tipo_geometria','Línea','metadatos_extra',ficha)));
  perform pg_temp.yo(a2);
  r := pg_temp.intenta($q$select api.fn_enviar_capa_revision('TC4-02')$q$);
  perform pg_temp.reg('C24 Un Administrador tambien da de alta y envia capas', r = 'OK', r);
  perform pg_temp.yo(a2);
  r := pg_temp.intenta($q$select api.fn_dictaminar_capa('TC4-02','validar')$q$);
  perform pg_temp.reg('C25 Cuatro ojos: quien envio la capa no la valida (42501)', r like '42501%', r);
  perform pg_temp.yo(ad);
  r := pg_temp.intenta($q$select api.fn_dictaminar_capa('TC4-02','validar')$q$);
  perform pg_temp.reg('C26 Otro administrador si la valida', r = 'OK', r);
  perform pg_temp.yo(a2);
  perform pg_temp.intenta(format($q$select api.fn_guardar_capa(%L)$q$,
        jsonb_build_object('id','TC4-03','titulo','Capa 3','tipo_geometria','Polígono','metadatos_extra', ficha || '{"restriccion_uso":"interna"}'::jsonb)));
  perform pg_temp.yo(a2);
  perform pg_temp.intenta($q$select api.fn_enviar_capa_revision('TC4-03')$q$);
  perform pg_temp.yo(ad);
  perform pg_temp.intenta($q$select api.fn_dictaminar_capa('TC4-03','validar')$q$);
  perform pg_temp.yo(ti);
  r := pg_temp.intenta($q$select api.fn_dictaminar_capa('TC4-03','publicar')$q$);
  perform pg_temp.reg('C27 D-17: una capa de restriccion interna se valida pero no se publica (23514)', r like '23514%', r);
  perform pg_temp.yo(ad);
  r := pg_temp.intenta($q$select api.fn_baja_capa('TC4-02')$q$);
  perform pg_temp.reg('C28 La baja de una capa es logica (activo = false) y no borra nada',
    r = 'OK' and (select not activo from core.capa where id='TC4-02') and (select count(*) from core.capa_version where id_capa='TC4-02') >= 3, r);
  perform pg_temp.sin_identidad();
  perform pg_temp.reg('C29 Nadie puede borrar capas por la API directa (sin DELETE)',
    pg_temp.intenta($q$set local role authenticated; delete from core.capa where id = 'TC4-02'$q$) not like 'OK%', '');
  perform pg_temp.sin_identidad();
  perform pg_temp.reg('C30 Ninguna funcion api.fn_* queda abierta a anon',
    (select count(*) from pg_proc p where p.pronamespace = 'api'::regnamespace and p.proname like 'fn\_%'
       and has_function_privilege('anon', p.oid, 'execute')) = 0, '');

  ---------------------------------------------------------------- INSTRUMENTOS
  perform pg_temp.yo(ca);
  r := pg_temp.intenta($q$select api.fn_guardar_instrumento('{"clave":"PRUEBA-1","nombre":"Instrumento de prueba","ambito":"Estatal"}')$q$);
  perform pg_temp.reg('I01 El Capturista no sube instrumentos (42501)', r like '42501%', r);
  perform pg_temp.yo(ad);
  j := api.fn_guardar_instrumento('{"clave":"PRUEBA-1","nombre":"Instrumento de prueba","ambito":"Estatal"}');
  v_inst := j ->> 'id';
  perform pg_temp.reg('I02 El Administrador sube un instrumento: nace en borrador, sin publicar, con id asignado',
    j ->> 'estatus' = 'borrador' and (j ->> 'publicado') = 'false' and v_inst is not null, j::text);
  perform pg_temp.yo(ad);
  r := pg_temp.intenta(format($q$select api.fn_enviar_instrumento_revision(%L)$q$, v_inst));
  perform pg_temp.reg('I03 Sin PDF no se envia a revision (23514)', r like '23514%', r);
  perform pg_temp.yo(ad);
  perform pg_temp.intenta(format($q$select api.fn_guardar_instrumento(%L)$q$, jsonb_build_object('id', v_inst, 'ruta_pdf', 'instrumentos/prueba-1.pdf')));
  perform pg_temp.yo(ad);
  r := pg_temp.intenta(format($q$select api.fn_enviar_instrumento_revision(%L)$q$, v_inst));
  perform pg_temp.reg('I04 Con PDF pasa a revision', r = 'OK' and (select estatus from core.instrumento_origen where id = v_inst) = 'revision', r);
  perform pg_temp.yo(ad);
  r := pg_temp.intenta(format($q$select api.fn_dictaminar_instrumento(%L,'validar')$q$, v_inst));
  perform pg_temp.reg('I05 D-16: el Administrador no dictamina instrumentos (42501)', r like '42501%', r);
  perform pg_temp.yo(ti);
  r := pg_temp.intenta(format($q$select api.fn_dictaminar_instrumento(%L,'publicar')$q$, v_inst));
  perform pg_temp.reg('I06 No se publica desde revision sin validar (55000)', r like '55000%', r);
  perform pg_temp.yo(ti);
  r := pg_temp.intenta(format($q$select api.fn_dictaminar_instrumento(%L,'validar')$q$, v_inst));
  perform pg_temp.reg('I07 El Titular valida el instrumento (vigente_admin)', r = 'OK' and (select estatus from core.instrumento_origen where id = v_inst) = 'vigente_admin', r);
  perform pg_temp.yo(ca);
  perform pg_temp.reg('I08 El Capturista ve el instrumento ya validado', pg_temp.cuenta(format($q$select 1 from api.instrumento_origen where id=%L$q$, v_inst)) = 1, '');
  perform pg_temp.anonimo();
  perform pg_temp.reg('I09 El ciudadano aun no lo ve', pg_temp.cuenta(format($q$select 1 from api.instrumento_origen where id=%L$q$, v_inst)) = 0, '');
  perform pg_temp.yo(ti);
  r := pg_temp.intenta(format($q$select api.fn_dictaminar_instrumento(%L,'publicar')$q$, v_inst));
  perform pg_temp.reg('I10 El Titular publica: estatus vigente_publico y publicado = true (sincronia ER-1)',
    r = 'OK' and (select publicado and estatus = 'vigente_publico' and publicado_en is not null from core.instrumento_origen where id = v_inst), r);
  perform pg_temp.anonimo();
  perform pg_temp.reg('I11 El ciudadano ve el instrumento publicado', pg_temp.cuenta(format($q$select 1 from api.instrumento_origen where id=%L$q$, v_inst)) = 1, '');
  perform pg_temp.reg('I12 Cada paso dejo dictamen (validar y publicar) con objeto_tipo instrumento',
    (select count(*) from core.dictamen where objeto_tipo='instrumento' and objeto_id = v_inst and id_usuario = ti) = 2, '');
  perform pg_temp.reg('I13 El historial del instrumento esta en la bitacora (INSERT y CAMBIO_ESTADO a nombre de quien lo hizo)',
    (select count(*) from core.bitacora_cambio where tabla_afectada='instrumento_origen' and id_registro = v_inst and accion='CAMBIO_ESTADO') = 3
    and (select count(*) from core.bitacora_cambio where tabla_afectada='instrumento_origen' and id_registro = v_inst and accion='INSERT' and id_usuario=ad) = 1, '');
  perform pg_temp.yo(ad);
  r := pg_temp.intenta(format($q$select api.fn_guardar_instrumento(%L)$q$, jsonb_build_object('id', v_inst, 'nombre','Cambio')));
  perform pg_temp.reg('I14 Un instrumento publicado no se edita (55000)', r like '55000%', r);
  perform pg_temp.yo(ad);
  r := pg_temp.intenta(format($q$select api.fn_baja_instrumento(%L)$q$, v_inst));
  perform pg_temp.reg('I15 No se da de baja un instrumento publicado (55000)', r like '55000%', r);
  perform pg_temp.yo(ti);
  r := pg_temp.intenta(format($q$select api.fn_dictaminar_instrumento(%L,'rechazar','Vigencia mal capturada')$q$, v_inst));
  perform pg_temp.reg('I16 El Titular retira el instrumento del publico: vuelve a borrador y publicado = false',
    r = 'OK' and (select not publicado and estatus = 'borrador' from core.instrumento_origen where id = v_inst), r);
  -- cuatro ojos en instrumentos: el Titular 2 sube y envia, otro Titular dictamina
  perform pg_temp.yo(t2);
  j := api.fn_guardar_instrumento('{"clave":"PRUEBA-2","nombre":"Instrumento 2","ambito":"Estatal","ruta_pdf":"instrumentos/p2.pdf"}');
  v_inst := j ->> 'id';
  perform pg_temp.yo(t2);
  perform pg_temp.intenta(format($q$select api.fn_enviar_instrumento_revision(%L)$q$, v_inst));
  perform pg_temp.yo(t2);
  r := pg_temp.intenta(format($q$select api.fn_dictaminar_instrumento(%L,'validar')$q$, v_inst));
  perform pg_temp.reg('I17 Cuatro ojos: el Titular que envio el instrumento no lo valida (42501)', r like '42501%', r);
  perform pg_temp.yo(ti);
  r := pg_temp.intenta(format($q$select api.fn_dictaminar_instrumento(%L,'validar')$q$, v_inst));
  perform pg_temp.reg('I18 Otro Titular si lo valida', r = 'OK', r);
  perform pg_temp.sin_identidad();
  perform pg_temp.reg('I19 Invariante ER-1: publicado = (estatus = vigente_publico) en todas las filas',
    (select count(*) from core.instrumento_origen where publicado <> (estatus = 'vigente_publico')) = 0, '');
  perform pg_temp.reg('I20 Los instrumentos de la carga oficial siguen publicados (backfill de ER-1)',
    (select count(*) from core.instrumento_origen where estatus = 'vigente_publico' and publicado) >= 5, '');

  ---------------------------------------------------------------- USUARIOS E INVITACIONES
  perform pg_temp.yo(ad);
  r := pg_temp.intenta($q$select api.fn_emitir_invitacion('nuevo@prueba.mx','capturista')$q$);
  perform pg_temp.reg('U01 El Administrador no emite invitaciones (42501)', r like '42501%', r);
  perform pg_temp.yo(ti);
  j := api.fn_emitir_invitacion('Nuevo@Prueba.mx','capturista');
  tok := j ->> 'token';
  perform pg_temp.reg('U02 El Titular emite una invitacion: token de 48 hex, vigencia de 7 dias',
    length(tok) = 48 and (j ->> 'expira_en')::timestamptz between now() + interval '6 days 23 hours' and now() + interval '7 days 1 hour', j::text);
  perform pg_temp.reg('U03 La base guarda solo la huella SHA-256, nunca el token',
    (select count(*) from core.invitacion where token_hash = encode(digest(tok, 'sha256'), 'hex')) = 1
    and (select count(*) from core.invitacion where token_hash = tok) = 0, '');
  perform pg_temp.yo(ti);
  perform pg_temp.reg('U04 api.fn_invitaciones no trae la huella y calcula el estado; la API no expone la tabla',
    (select count(*) from pg_proc p, unnest(p.proargnames) a where p.proname='fn_invitaciones' and a = 'token_hash') = 0
    and (select estado from api.fn_invitaciones() where correo_destino = 'nuevo@prueba.mx') = 'vigente'
    and not exists (select 1 from pg_class c where c.relnamespace = 'api'::regnamespace and c.relname = 'invitacion'), '');
  perform pg_temp.yo(ad);
  perform pg_temp.reg('U05 El Administrador no consulta invitaciones (42501)', pg_temp.intenta($q$select * from api.fn_invitaciones()$q$) like '42501%', '');
  perform pg_temp.reg('U06 La bitacora del cambio de la invitacion no guarda la huella',
    (select count(*) from core.bitacora_cambio where tabla_afectada='invitacion'
        and (datos_nuevos::text like '%' || encode(digest(tok, 'sha256'), 'hex') || '%')) = 0
    and (select count(*) from core.bitacora_cambio where tabla_afectada='invitacion' and id_usuario = ti) = 1, '');
  perform pg_temp.yo(ti);
  r := pg_temp.intenta($q$select api.fn_emitir_invitacion('nuevo@prueba.mx','auditor')$q$);
  perform pg_temp.reg('U07 No se emite una segunda invitacion vigente al mismo correo (23505)', r like '23505%', r);
  perform pg_temp.yo(ti);
  r := pg_temp.intenta($q$select api.fn_emitir_invitacion('cap.a@prueba.mx','auditor')$q$);
  perform pg_temp.reg('U08 No se invita a un correo que ya tiene cuenta (23505)', r like '23505%', r);
  perform pg_temp.yo(ti);
  r := pg_temp.intenta($q$select api.fn_emitir_invitacion('correo-malo','auditor')$q$);
  perform pg_temp.reg('U09 Correo mal formado (22023)', r like '22023%', r);
  perform pg_temp.yo(ti);
  r := pg_temp.intenta($q$select api.fn_emitir_invitacion('otro@prueba.mx','dios')$q$);
  perform pg_temp.reg('U10 Rol inexistente (22023)', r like '22023%', r);
  perform pg_temp.sin_identidad();
  perform pg_temp.reg('U11 El servicio encuentra la invitacion vigente por su token', (select count(*) from core.fn_invitacion_vigente(tok)) = 1
    and (select count(*) from core.fn_invitacion_vigente('token-falso')) = 0, '');
  perform pg_temp.sin_identidad();
  insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000f1', 'nuevo@prueba.mx');
  j := core.fn_consumir_invitacion(tok, '00000000-0000-0000-0000-0000000000f1', 'Persona Nueva');
  perform pg_temp.reg('U12 El canje crea el perfil con el rol de la invitacion y la marca usada',
    (select rol from core.perfil where id_usuario = '00000000-0000-0000-0000-0000000000f1') = 'capturista'
    and (select usada_en is not null and id_usuario_creado = '00000000-0000-0000-0000-0000000000f1' from core.invitacion where correo_destino='nuevo@prueba.mx'), j::text);
  perform pg_temp.reg('U13 El alta del perfil queda en core.bitacora a nombre de quien invito',
    (select count(*) from core.bitacora where objetivo_id_usuario = '00000000-0000-0000-0000-0000000000f1' and accion='alta' and actor_id_usuario = ti) = 1, '');
  perform pg_temp.sin_identidad();
  r := pg_temp.intenta(format($q$select core.fn_consumir_invitacion(%L, gen_random_uuid(), 'Otra')$q$, tok));
  perform pg_temp.reg('U14 Un token ya usado no se canjea otra vez (22023)', r like '22023%', r);
  perform pg_temp.yo(ti);
  j := api.fn_emitir_invitacion('revocada@prueba.mx','auditor');
  perform pg_temp.yo(ti);
  perform api.fn_revocar_invitacion((j ->> 'id')::uuid);
  perform pg_temp.sin_identidad();
  r := pg_temp.intenta(format($q$select core.fn_consumir_invitacion(%L, gen_random_uuid(), 'X')$q$, j ->> 'token'));
  perform pg_temp.reg('U15 Una invitacion revocada no se canjea (22023)', r like '22023%', r);
  perform pg_temp.yo(ti);
  r := pg_temp.intenta(format($q$select api.fn_revocar_invitacion(%L)$q$, (select id from core.invitacion where usada_en is not null limit 1)));
  perform pg_temp.reg('U16 Una invitacion usada no se revoca (55000)', r like '55000%', r);
  perform pg_temp.yo(ti);
  perform pg_temp.reg('U17 La invitacion revocada se muestra como revocada',
    (select estado from api.fn_invitaciones() where correo_destino = 'revocada@prueba.mx') = 'revocada', '');
  perform pg_temp.yo(ca);
  r := pg_temp.intenta($q$select core.fn_consumir_invitacion('x', gen_random_uuid(), 'x')$q$);
  perform pg_temp.reg('U18 Las funciones de canje no se pueden llamar desde la API (42501)', r like '42501%', r);
  perform pg_temp.yo(ad);
  r := pg_temp.intenta($q$select api.fn_usuarios()$q$);
  perform pg_temp.reg('U19 El Administrador no lista usuarios (42501)', r like '42501%', r);
  perform pg_temp.yo(ti);
  perform pg_temp.reg('U20 El Titular lista usuarios con correo y estado', (select count(*) from api.fn_usuarios() where correo is not null) >= 7, '');
  perform pg_temp.yo(ti);
  r := pg_temp.intenta($q$select api.fn_dar_de_baja_usuario('00000000-0000-0000-0000-0000000000a7')$q$);
  perform pg_temp.reg('U21 Nadie se da de baja a si mismo (42501)', r like '42501%', r);
  perform pg_temp.yo(ti);
  r := pg_temp.intenta($q$select api.fn_dar_de_baja_usuario('00000000-0000-0000-0000-00000000c0b2')$q$);
  perform pg_temp.reg('U22 El Titular da de baja a un capturista: perfil inactivo y evento en core.bitacora',
    r = 'OK' and (select not activo from core.perfil where id_usuario = cb)
    and (select count(*) from core.bitacora where objetivo_id_usuario = cb and accion = 'baja' and actor_id_usuario = ti) = 1, r);
  perform pg_temp.yo(cb);
  perform pg_temp.reg('U23 Una cuenta dada de baja ya no lee nada', pg_temp.cuenta($q$select 1 from api.capa$q$) = 0, '');
  perform pg_temp.yo(ti);
  r := pg_temp.intenta($q$select api.fn_reactivar_usuario('00000000-0000-0000-0000-00000000c0b2')$q$);
  perform pg_temp.reg('U24 Se reactiva la cuenta y queda en la bitacora',
    r = 'OK' and (select activo from core.perfil where id_usuario = cb)
    and (select count(*) from core.bitacora where objetivo_id_usuario = cb and accion = 'reactivacion') = 1, r);
  perform pg_temp.yo(ti);
  r := pg_temp.intenta($q$select api.fn_reactivar_usuario('00000000-0000-0000-0000-00000000c0b2')$q$);
  perform pg_temp.reg('U25 Reactivar a quien ya esta activo se avisa (55000)', r like '55000%', r);
  perform pg_temp.yo(ad);
  r := pg_temp.intenta($q$select api.fn_dar_de_baja_usuario('00000000-0000-0000-0000-00000000c0a1')$q$);
  perform pg_temp.reg('U26 Solo el Titular da de baja (42501)', r like '42501%', r);
  perform pg_temp.sin_identidad();
  update core.perfil set activo = false where rol = 'administrador_titular' and id_usuario <> '00000000-0000-0000-0000-0000000000a7';
  perform pg_temp.yo(ti);
  r := pg_temp.intenta($q$select api.fn_dar_de_baja_usuario('00000000-0000-0000-0000-0000000000a7')$q$);
  perform pg_temp.reg('U27 No se da de baja al ultimo Titular activo (42501 por ser el mismo, o 55000)', r <> 'OK', r);

  ---------------------------------------------------------------- ER-4: PLAZO Y DECISION SOBRE RECHAZOS
  perform pg_temp.sin_identidad();
  perform pg_temp.reg('R01 Dias habiles: 1 dia habil despues de un viernes es el lunes',
    core.sumar_dias_habiles('2026-10-30', 1) = date '2026-11-02', core.sumar_dias_habiles('2026-10-30', 1)::text);
  perform pg_temp.reg('R02 Dias habiles: 10 dias habiles desde un viernes caen en el viernes de dos semanas despues',
    core.sumar_dias_habiles('2026-10-30', 10) = date '2026-11-13', core.sumar_dias_habiles('2026-10-30', 10)::text);
  insert into core.dia_inhabil(fecha, descripcion) values ('2026-11-16', 'Revolucion (prueba)');
  perform pg_temp.reg('R03 Un dia inhabil del calendario no cuenta en el plazo',
    core.sumar_dias_habiles('2026-11-13', 1) = date '2026-11-17', core.sumar_dias_habiles('2026-11-13', 1)::text);
  perform pg_temp.reg('R04 El plazo es de 10 dias habiles', core.plazo_rechazo_dias() = 10, '');

  perform pg_temp.yo(ca);
  perform pg_temp.intenta(format($q$select api.fn_guardar_capa(%L)$q$,
     jsonb_build_object('id','TC4-R1','titulo','Capa rechazos 1','tipo_geometria','Punto','srid_origen',6372,'metadatos_extra',ficha)));
  perform pg_temp.yo(ca); perform pg_temp.intenta($q$select api.fn_enviar_capa_revision('TC4-R1')$q$);
  perform pg_temp.yo(ad); r := pg_temp.intenta($q$select api.fn_dictaminar_capa('TC4-R1','rechazar','Corrige la fuente')$q$);
  perform pg_temp.sin_identidad();
  perform pg_temp.reg('R05 Al rechazar se crea el seguimiento: destinatario = quien envio, estado pendiente, plazo de 10 dias habiles',
    r = 'OK' and (select count(*) from core.rechazo_seguimiento s where s.objeto_id='TC4-R1' and s.id_destinatario=ca and s.estado='pendiente'
                    and s.fecha_limite = core.sumar_dias_habiles(core.hoy_mx(), 10)) = 1, r);
  select id_dictamen into v_dic from core.rechazo_seguimiento where objeto_id='TC4-R1';

  perform pg_temp.yo(ca);
  perform pg_temp.reg('R06 El Capturista ve el rechazo en su lista con motivo y dias habiles restantes',
    pg_temp.cuenta($q$select 1 from api.fn_pendientes_rechazo() where objeto_id='TC4-R1' and motivo='Corrige la fuente' and dias_habiles_restantes = 10$q$) = 1, '');
  perform pg_temp.yo(cb);
  perform pg_temp.reg('R07 El Capturista B no ve los rechazos del A', pg_temp.cuenta($q$select 1 from api.fn_pendientes_rechazo() where objeto_id='TC4-R1'$q$) = 0, '');
  perform pg_temp.yo(ad);
  perform pg_temp.reg('R08 El Administrador y el Auditor ven todos los rechazos',
    pg_temp.cuenta($q$select 1 from api.fn_pendientes_rechazo() where objeto_id='TC4-R1'$q$) = 1, '');
  perform pg_temp.yo(au);
  perform pg_temp.reg('R08b El Auditor ve todos los rechazos', pg_temp.cuenta($q$select 1 from api.fn_pendientes_rechazo() where objeto_id='TC4-R1'$q$) = 1, '');

  perform pg_temp.yo(cb); r := pg_temp.intenta(format($q$select api.fn_decidir_rechazo(%L,'retomar')$q$, v_dic));
  perform pg_temp.reg('R09 Otro Capturista no decide sobre un rechazo ajeno (42501)', r like '42501%', r);
  perform pg_temp.yo(ad); r := pg_temp.intenta(format($q$select api.fn_decidir_rechazo(%L,'descartar')$q$, v_dic));
  perform pg_temp.reg('R10 Ni siquiera el Administrador decide por el Capturista (42501)', r like '42501%', r);
  perform pg_temp.yo(au); r := pg_temp.intenta(format($q$select api.fn_decidir_rechazo(%L,'descartar')$q$, v_dic));
  perform pg_temp.reg('R11 El Auditor no decide (42501)', r like '42501%', r);
  perform pg_temp.yo(ca); r := pg_temp.intenta(format($q$select api.fn_decidir_rechazo(%L,'quizas')$q$, v_dic));
  perform pg_temp.reg('R12 Una decision que no es retomar ni descartar se rechaza (22023)', r like '22023%', r);
  perform pg_temp.yo(ca); r := pg_temp.intenta(format($q$select api.fn_decidir_rechazo(%L,'retomar')$q$, v_dic));
  perform pg_temp.sin_identidad();
  perform pg_temp.reg('R13 El Capturista retoma el rechazo: queda retomada, con auditoria',
    r = 'OK' and (select estado from core.rechazo_seguimiento where id_dictamen=v_dic) = 'retomada'
    and (select count(*) from core.bitacora_cambio where tabla_afectada='rechazo_seguimiento' and id_registro=v_dic::text and id_usuario=ca) >= 1, r);
  perform pg_temp.yo(ca);
  perform pg_temp.reg('R14 Una retomada sigue en su lista de pendientes',
    pg_temp.cuenta($q$select 1 from api.fn_pendientes_rechazo() where objeto_id='TC4-R1' and estado='retomada'$q$) = 1, '');
  perform pg_temp.yo(ca); r := pg_temp.intenta(format($q$select api.fn_decidir_rechazo(%L,'retomar')$q$, v_dic));
  perform pg_temp.reg('R15 Retomar dos veces no pasa (55000)', r like '55000%', r);
  perform pg_temp.yo(ca); perform pg_temp.intenta($q$select api.fn_enviar_capa_revision('TC4-R1')$q$);
  perform pg_temp.sin_identidad();
  perform pg_temp.reg('R16 Al reenviar a revision el seguimiento queda atendida y sale de la lista',
    (select estado from core.rechazo_seguimiento where id_dictamen=v_dic) = 'atendida'
    and (select estatus from core.capa where id='TC4-R1') = 'revision', '');
  perform pg_temp.yo(ca);
  perform pg_temp.reg('R17 Una atendida ya no aparece entre los pendientes',
    pg_temp.cuenta($q$select 1 from api.fn_pendientes_rechazo() where objeto_id='TC4-R1'$q$) = 0
    and pg_temp.cuenta($q$select 1 from api.fn_pendientes_rechazo(true) where objeto_id='TC4-R1'$q$) = 1, '');

  -- Descartar
  perform pg_temp.yo(ca);
  perform pg_temp.intenta(format($q$select api.fn_guardar_capa(%L)$q$,
     jsonb_build_object('id','TC4-R2','titulo','Capa rechazos 2','tipo_geometria','Punto','srid_origen',6372,'metadatos_extra',ficha)));
  perform pg_temp.yo(ca); perform pg_temp.intenta($q$select api.fn_enviar_capa_revision('TC4-R2')$q$);
  perform pg_temp.yo(a2); perform pg_temp.intenta($q$select api.fn_dictaminar_capa('TC4-R2','rechazar','No cumple')$q$);
  perform pg_temp.sin_identidad();
  select id_dictamen into v_dic2 from core.rechazo_seguimiento where objeto_id='TC4-R2';
  perform pg_temp.yo(ca); r := pg_temp.intenta(format($q$select api.fn_decidir_rechazo(%L,'descartar')$q$, v_dic2));
  perform pg_temp.sin_identidad();
  perform pg_temp.reg('R18 El Capturista quita el rechazo de su lista (descartada); la capa sigue en borrador y nada se borra',
    r = 'OK' and (select estado from core.rechazo_seguimiento where id_dictamen=v_dic2) = 'descartada'
    and (select estatus from core.capa where id='TC4-R2') = 'borrador'
    and (select count(*) from core.dictamen where id = v_dic2) = 1, r);
  perform pg_temp.yo(ca);
  perform pg_temp.reg('R19 Una descartada sale de la lista, pero se ve con el historial',
    pg_temp.cuenta($q$select 1 from api.fn_pendientes_rechazo() where objeto_id='TC4-R2'$q$) = 0
    and pg_temp.cuenta($q$select 1 from api.fn_pendientes_rechazo(true) where objeto_id='TC4-R2' and estado='descartada'$q$) = 1, '');
  perform pg_temp.yo(ca); r := pg_temp.intenta($q$select api.fn_enviar_capa_revision('TC4-R2')$q$);
  perform pg_temp.reg('R20 El Capturista no reenvia una capa que descarto (55000)', r like '55000%', r);
  perform pg_temp.yo(ca); r := pg_temp.intenta(format($q$select api.fn_reabrir_rechazo(%L)$q$, v_dic2));
  perform pg_temp.reg('R21 El Capturista no reabre rechazos (42501)', r like '42501%', r);
  perform pg_temp.yo(ad); r := pg_temp.intenta(format($q$select api.fn_reabrir_rechazo(%L)$q$, v_dic2));
  perform pg_temp.sin_identidad();
  perform pg_temp.reg('R22 El Administrador reabre la descartada: pendiente con plazo nuevo',
    r = 'OK' and (select estado from core.rechazo_seguimiento where id_dictamen=v_dic2) = 'pendiente'
    and (select fecha_limite from core.rechazo_seguimiento where id_dictamen=v_dic2) = core.sumar_dias_habiles(core.hoy_mx(), 10), r);
  perform pg_temp.yo(ad); r := pg_temp.intenta(format($q$select api.fn_reabrir_rechazo(%L)$q$, v_dic2));
  perform pg_temp.reg('R23 No se reabre lo que esta pendiente (55000)', r like '55000%', r);

  -- Vencimiento
  perform pg_temp.sin_identidad();
  update core.rechazo_seguimiento set fecha_limite = core.hoy_mx() - 1 where id_dictamen = v_dic2;
  perform pg_temp.yo(ca);
  perform pg_temp.reg('R24 Pasado el plazo el rechazo sale solo de la lista (vencida) y conserva el historial',
    pg_temp.cuenta($q$select 1 from api.fn_pendientes_rechazo() where objeto_id='TC4-R2'$q$) = 0
    and pg_temp.cuenta($q$select 1 from api.fn_pendientes_rechazo(true) where objeto_id='TC4-R2' and estado='vencida'$q$) = 1, '');
  perform pg_temp.yo(ca); r := pg_temp.intenta(format($q$select api.fn_decidir_rechazo(%L,'retomar')$q$, v_dic2));
  perform pg_temp.reg('R25 No se decide sobre un rechazo vencido (55000)', r like '55000%', r);
  perform pg_temp.yo(ca); r := pg_temp.intenta($q$select api.fn_enviar_capa_revision('TC4-R2')$q$);
  perform pg_temp.reg('R26 El Capturista no reenvia una capa con rechazo vencido (55000)', r like '55000%', r);
  perform pg_temp.yo(ad); r := pg_temp.intenta(format($q$select api.fn_reabrir_rechazo(%L)$q$, v_dic2));
  perform pg_temp.sin_identidad();
  perform pg_temp.reg('R27 El Administrador reabre un vencido con plazo nuevo', r = 'OK' and (select estado from core.rechazo_seguimiento where id_dictamen=v_dic2)='pendiente', r);
  perform pg_temp.yo(ca); r := pg_temp.intenta($q$select api.fn_enviar_capa_revision('TC4-R2')$q$);
  perform pg_temp.sin_identidad();
  perform pg_temp.reg('R28 Reabierto, el Capturista reenvia y queda atendida', r = 'OK' and (select estado from core.rechazo_seguimiento where id_dictamen=v_dic2)='atendida', r);

  -- Un Administrador puede reenviar aunque haya vencido (no esta sujeto al plazo del Capturista)
  perform pg_temp.yo(ad);
  perform pg_temp.intenta(format($q$select api.fn_guardar_capa(%L)$q$,
     jsonb_build_object('id','TC4-R3','titulo','Capa rechazos 3','tipo_geometria','Punto','srid_origen',6372,'metadatos_extra',ficha)));
  perform pg_temp.yo(ad); perform pg_temp.intenta($q$select api.fn_enviar_capa_revision('TC4-R3')$q$);
  perform pg_temp.yo(a2); perform pg_temp.intenta($q$select api.fn_dictaminar_capa('TC4-R3','rechazar','Falta')$q$);
  perform pg_temp.sin_identidad();
  perform pg_temp.reg('R29 El destinatario de un rechazo puede ser un Administrador (si el envio fue suyo)',
    (select count(*) from core.rechazo_seguimiento where objeto_id='TC4-R3' and id_destinatario=ad) = 1, '');

  -- Instrumentos
  perform pg_temp.yo(ad);
  j := api.fn_guardar_instrumento('{"clave":"PRUEBA-R","nombre":"Instrumento de prueba R","ambito":"Estatal","ruta_pdf":"pruebas/r.pdf"}'::jsonb);
  v_inst := j ->> 'id';
  perform pg_temp.yo(ad); perform pg_temp.intenta(format($q$select api.fn_enviar_instrumento_revision(%L)$q$, v_inst));
  perform pg_temp.yo(ti); r := pg_temp.intenta(format($q$select api.fn_dictaminar_instrumento(%L,'rechazar','Sin vigencia')$q$, v_inst));
  perform pg_temp.sin_identidad();
  perform pg_temp.reg('R30 Rechazar un instrumento tambien crea seguimiento para quien lo envio',
    r = 'OK' and (select count(*) from core.rechazo_seguimiento where objeto_tipo='instrumento' and objeto_id=v_inst and id_destinatario=ad and estado='pendiente') = 1, r);
  perform pg_temp.yo(ad); 
  perform pg_temp.reg('R31 El rechazo del instrumento aparece en la lista de su destinatario',
    pg_temp.cuenta(format($q$select 1 from api.fn_pendientes_rechazo() where objeto_tipo='instrumento' and objeto_id=%L$q$, v_inst)) = 1, '');

  -- Calendario
  perform pg_temp.yo(ad); r := pg_temp.intenta($q$select api.fn_guardar_dia_inhabil('2026-12-25','Navidad')$q$);
  perform pg_temp.reg('R32 El Administrador no edita el calendario de inhabiles (42501)', r like '42501%', r);
  perform pg_temp.yo(ti); r := pg_temp.intenta($q$select api.fn_guardar_dia_inhabil('2026-12-25','Navidad')$q$);
  perform pg_temp.sin_identidad();
  perform pg_temp.reg('R33 El Titular agrega un dia inhabil, con auditoria',
    r = 'OK' and (select count(*) from core.dia_inhabil where fecha='2026-12-25') = 1
    and (select count(*) from core.bitacora_cambio where tabla_afectada='dia_inhabil' and id_registro='2026-12-25' and id_usuario=ti) = 1, r);
  perform pg_temp.yo(ca);
  perform pg_temp.reg('R34 Todos los perfiles leen el calendario', pg_temp.cuenta($q$select 1 from api.dia_inhabil where fecha='2026-12-25'$q$) = 1, '');
  perform pg_temp.yo(ti); r := pg_temp.intenta($q$select api.fn_quitar_dia_inhabil('2026-12-25')$q$);
  perform pg_temp.reg('R35 El Titular quita el dia inhabil', r = 'OK' and pg_temp.cuenta($q$select 1 from core.dia_inhabil where fecha='2026-12-25'$q$) = 0, r);
  perform pg_temp.anonimo();
  perform pg_temp.reg('R36 El anonimo no ejecuta las funciones de rechazos',
    pg_temp.intenta($q$select api.fn_pendientes_rechazo()$q$) like '42501%'
    and pg_temp.intenta($q$select api.fn_decidir_rechazo(gen_random_uuid(),'retomar')$q$) like '42501%', '');
  perform pg_temp.yo(ca);
  perform pg_temp.reg('R37 Nadie lee la tabla de seguimiento directamente: solo por la funcion',
    pg_temp.intenta($q$select 1 from core.rechazo_seguimiento$q$) like '42501%', '');

  ---------------------------------------------------------------- AUDITORIA Y LECTURA
  perform pg_temp.yo(au);
  perform pg_temp.reg('A01 El Auditor lee toda la bitacora de cambios, incluidas invitaciones',
    pg_temp.cuenta($q$select 1 from core.bitacora_cambio where tabla_afectada='invitacion'$q$) >= 1, '');
  perform pg_temp.yo(ad);
  perform pg_temp.reg('A02 El Administrador lee la bitacora pero no la de invitaciones',
    pg_temp.cuenta($q$select 1 from core.bitacora_cambio where tabla_afectada='invitacion'$q$) = 0
    and pg_temp.cuenta($q$select 1 from core.bitacora_cambio where tabla_afectada='capa'$q$) > 0, '');
  perform pg_temp.sin_identidad();
  perform pg_temp.reg('A03 Todas las tablas del CRUD del Ciclo 4 tienen su disparador de auditoria',
    (select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid
      where t.tgname = 'trg_auditoria' and not t.tgisinternal
        and c.relname in ('instrumento_origen','eje_tematico','sector','fuente_informacion','matriz_instrumento','indicador_instrumento',
                          'indicador_eje','capa_indicador','invitacion','capa','indicador','umbral_semaforo','dia_inhabil','rechazo_seguimiento')) = 14, '');
  perform pg_temp.reg('A04 Ningun rol de la API tiene INSERT/UPDATE/DELETE directo sobre el nucleo',
    (select count(*) from information_schema.role_table_grants where grantee in ('anon','authenticated')
       and table_schema = 'core' and privilege_type in ('INSERT','UPDATE','DELETE')) = 0, '');
  perform pg_temp.reg('A05 Nada publicado con restriccion de uso distinta de publica',
    (select count(*) from core.capa where estatus = 'vigente_publico' and metadatos_extra ->> 'restriccion_uso' is distinct from 'pública') = 0, '');
end $$;

select n, case when ok then 'PASA' else 'FALLA' end as resultado, caso, detalle from resultados order by n;
select count(*) filter (where ok) as pasan, count(*) filter (where not ok) as fallan from resultados;
do $$ begin
  if exists (select 1 from resultados where not ok) then raise exception 'Hay pruebas del Ciclo 4 que fallan'; end if;
end $$;
rollback;
