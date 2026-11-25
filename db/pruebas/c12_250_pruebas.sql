-- Prueba de la migración 250 en una base LOCAL (copia de pruebas, NUNCA la VM). Se corre DESPUÉS de aplicar la 250.
-- Cada comprobación imprime "OK" o "FALLA". Todo se hace dentro de una transacción que termina en ROLLBACK.
\set ON_ERROR_STOP on
\pset tuples_only on
begin;

do $prueba$
declare
  cap uuid := gen_random_uuid(); adm uuid := gen_random_uuid(); tit uuid := gen_random_uuid();
  rojo jsonb := '{"tipo":"singleSymbol","campo":null,"simbolo_unico":{"tipo_geometria":"2","opacidad":1.0,"capas_simbolo":[{"clase":"QgsSimpleFillSymbolLayer","enabled":true,"props":{"color":"159,34,65,255,rgb:0.62,0.13,0.25,1","style":"solid","outline_color":"95,20,39,255,rgb:0.37,0.08,0.15,1","outline_style":"solid","outline_width":"0.3","outline_width_unit":"MM"}}]}}';
  azul jsonb := '{"tipo":"singleSymbol","campo":null,"simbolo_unico":{"tipo_geometria":"2","opacidad":1.0,"capas_simbolo":[{"clase":"QgsSimpleFillSymbolLayer","enabled":true,"props":{"color":"31,119,180,255,rgb:0.12,0.47,0.71,1","style":"solid","outline_color":"18,71,108,255,rgb:0.07,0.28,0.42,1","outline_style":"solid","outline_width":"0.3","outline_width_unit":"MM"}}]}}';
  v jsonb; s jsonb; n int; txt text;
  base_prop jsonb;
  procedure_ok boolean;
begin
  -- usuarios de prueba
  insert into auth.users (id, email) values (cap, 'cap@prueba.local'), (adm, 'adm@prueba.local'), (tit, 'tit@prueba.local');
  insert into core.perfil (id_usuario, nombre, rol) values (cap, 'Capturista de prueba', 'capturista'), (adm, 'Admin de prueba', 'administrador'), (tit, 'Titular de prueba', 'administrador_titular');
  base_prop := jsonb_build_object('archivo','prueba.gpkg','n_elementos',100,'fecha_corte',to_char(core.hoy_mx(),'YYYY-MM-DD'),'motivo','Actualización de corte',
    'justificacion','Actualización de prueba con justificación suficiente para pasar el mínimo.','columna_id_origen','id','variacion_elementos',0.01,
    'indicadores_agregar','[]'::jsonb,'campos','[]'::jsonb);

  -- P1 columna, restricción y vista
  perform 1 from information_schema.columns where table_schema='core' and table_name='capa' and column_name='simbologia';
  raise notice '% P1a columna core.capa.simbologia existe', case when found then 'OK' else 'FALLA' end;
  perform 1 from information_schema.columns where table_schema='api' and table_name='capa' and column_name='simbologia';
  raise notice '% P1b api.capa expone simbologia', case when found then 'OK' else 'FALLA' end;
  select count(*) into n from core.capa where simbologia <> '{}'::jsonb;
  raise notice '% P1c las capas existentes quedan con {} (hay % con estilo, esperado 0)', case when n = 0 then 'OK' else 'FALLA' end, n;

  -- P2 alta de capa nueva con simbología (Capturista)
  perform set_config('request.jwt.claim.sub', cap::text, false);
  v := api.fn_guardar_capa(jsonb_build_object('id','ZPrueba01','titulo','Capa de prueba de simbologia','proposito','Prueba de la migracion 250 con simbologia.',
        'tipo_geometria','Polígono','srid_origen',4326,'n_elementos',10,'archivo','z.gpkg','simbologia',rojo));
  select simbologia into s from core.capa where id='ZPrueba01';
  raise notice '% P2 alta guarda la simbologia enviada', case when s = rojo then 'OK' else 'FALLA' end;
  raise notice '% P2b la fila devuelta por la funcion trae simbologia', case when v -> 'simbologia' = rojo then 'OK' else 'FALLA' end;

  -- P3 editar en borrador con {} conserva; sin la clave conserva; con otra la reemplaza
  perform api.fn_guardar_capa(jsonb_build_object('id','ZPrueba01','simbologia','{}'::jsonb));
  select simbologia into s from core.capa where id='ZPrueba01';
  raise notice '% P3a simbologia {} conserva la existente', case when s = rojo then 'OK' else 'FALLA' end;
  perform api.fn_guardar_capa(jsonb_build_object('id','ZPrueba01','titulo','Capa de prueba de simbologia (editada)'));
  select simbologia into s from core.capa where id='ZPrueba01';
  raise notice '% P3b sin la clave conserva la existente', case when s = rojo then 'OK' else 'FALLA' end;
  perform api.fn_guardar_capa(jsonb_build_object('id','ZPrueba01','simbologia',azul));
  select simbologia into s from core.capa where id='ZPrueba01';
  raise notice '% P3c una simbologia nueva reemplaza', case when s = azul then 'OK' else 'FALLA' end;

  -- P4 alta sin simbologia queda {}
  perform api.fn_guardar_capa(jsonb_build_object('id','ZPrueba02','titulo','Capa de prueba sin simbologia','proposito','Prueba sin simbologia en la migracion 250.',
        'tipo_geometria','Línea','srid_origen',4326,'n_elementos',5,'archivo','y.gpkg'));
  select simbologia into s from core.capa where id='ZPrueba02';
  raise notice '% P4 alta sin simbologia queda {}', case when s = '{}'::jsonb then 'OK' else 'FALLA' end;

  -- P5 validaciones
  begin perform api.fn_guardar_capa(jsonb_build_object('id','ZPrueba01','simbologia','[1,2]'::jsonb)); raise notice 'FALLA P5a arreglo aceptado';
  exception when sqlstate '22023' then raise notice 'OK P5a rechaza simbologia que no es objeto'; end;
  begin perform api.fn_guardar_capa(jsonb_build_object('id','ZPrueba01','simbologia','{"x":1}'::jsonb)); raise notice 'FALLA P5b sin tipo aceptado';
  exception when sqlstate '22023' then raise notice 'OK P5b rechaza simbologia sin "tipo"'; end;
  begin perform api.fn_guardar_capa(jsonb_build_object('id','ZPrueba01','simbologia', jsonb_build_object('tipo','singleSymbol','relleno', repeat('x',100001))));
        raise notice 'FALLA P5c exceso de tamano aceptado';
  exception when sqlstate '22023' then raise notice 'OK P5c rechaza simbologia de mas de 100,000 bytes'; end;
  begin perform api.fn_guardar_capa(jsonb_build_object('id','ZPrueba01','otra_cosa',1)); raise notice 'FALLA P5d clave desconocida aceptada';
  exception when sqlstate '22023' then raise notice 'OK P5d sigue rechazando claves desconocidas'; end;
  begin update core.capa set simbologia = '[1]'::jsonb where id = 'ZPrueba02'; raise notice 'FALLA P5e la restriccion permite un arreglo';
  exception when check_violation then raise notice 'OK P5e la restriccion de la tabla rechaza un arreglo'; end;

  -- P6 solo el Capturista guarda (regla vigente intacta)
  perform set_config('request.jwt.claim.sub', adm::text, false);
  begin perform api.fn_guardar_capa(jsonb_build_object('id','ZPrueba01','simbologia',rojo)); raise notice 'FALLA P6 el Administrador pudo guardar';
  exception when sqlstate '42501' then raise notice 'OK P6 el Administrador sigue sin poder guardar capas'; end;

  -- P7 actualización de una capa vigente: propuesta con simbologia, aprobada por otro
  perform set_config('request.jwt.claim.sub', cap::text, false);
  select simbologia into s from core.capa where id='DIt05';
  perform api.fn_proponer_actualizacion_capa('DIt05', base_prop || jsonb_build_object('simbologia', azul));
  select simbologia, metadatos_extra -> 'actualizacion_pendiente' -> 'simbologia' into s, v from core.capa where id='DIt05';
  raise notice '% P7a la propuesta lleva la simbologia y la columna sigue igual ({})', case when v = azul and s = '{}'::jsonb then 'OK' else 'FALLA' end;
  perform set_config('request.jwt.claim.sub', cap::text, false);
  begin perform api.fn_resolver_actualizacion_capa('DIt05','aprobar'); raise notice 'FALLA P7b el Capturista aprobo';
  exception when sqlstate '42501' then raise notice 'OK P7b el Capturista no puede aprobar'; end;
  perform set_config('request.jwt.claim.sub', adm::text, false);
  perform api.fn_resolver_actualizacion_capa('DIt05','aprobar','Aprobada en prueba');
  select simbologia, metadatos_extra into s, v from core.capa where id='DIt05';
  raise notice '% P7c al aprobar la columna toma la simbologia propuesta', case when s = azul then 'OK' else 'FALLA' end;
  raise notice '% P7d la ficha no duplica el estilo y marca simbologia_actualizada=true', case when not (v -> 'ultima_actualizacion' ? 'simbologia') and (v -> 'ultima_actualizacion' ->> 'simbologia_actualizada') = 'true' and not (v ? 'actualizacion_pendiente') then 'OK' else 'FALLA' end;

  -- P8 propuesta SIN simbologia: se conserva la vigente
  perform set_config('request.jwt.claim.sub', cap::text, false);
  perform api.fn_proponer_actualizacion_capa('DIt05', base_prop);
  perform set_config('request.jwt.claim.sub', adm::text, false);
  perform api.fn_resolver_actualizacion_capa('DIt05','aprobar','Aprobada en prueba 2');
  select simbologia, metadatos_extra into s, v from core.capa where id='DIt05';
  raise notice '% P8 una actualizacion sin simbologia conserva la vigente', case when s = azul and (v -> 'ultima_actualizacion' ->> 'simbologia_actualizada') = 'false' then 'OK' else 'FALLA' end;

  -- P9 propuesta con simbologia y RECHAZO: no cambia nada
  perform set_config('request.jwt.claim.sub', cap::text, false);
  perform api.fn_proponer_actualizacion_capa('DIt05', base_prop || jsonb_build_object('simbologia', rojo));
  perform set_config('request.jwt.claim.sub', tit::text, false);
  perform api.fn_resolver_actualizacion_capa('DIt05','rechazar','Rechazada en prueba');
  select simbologia, metadatos_extra into s, v from core.capa where id='DIt05';
  raise notice '% P9 rechazar no cambia la simbologia vigente ni deja el estilo en la ficha', case when s = azul and not (v -> 'ultima_actualizacion_rechazada' ? 'simbologia') and not (v ? 'actualizacion_pendiente') then 'OK' else 'FALLA' end;

  -- P10 simbologia invalida en la propuesta
  perform set_config('request.jwt.claim.sub', cap::text, false);
  begin perform api.fn_proponer_actualizacion_capa('DIt06', base_prop || jsonb_build_object('simbologia','"texto"'::jsonb)); raise notice 'FALLA P10 propuesta con simbologia invalida aceptada';
  exception when sqlstate '22023' then raise notice 'OK P10 la propuesta rechaza simbologia invalida'; end;

  -- P11 lo que ve el publico: la simbologia sale por api.capa solo para capas publicadas
  perform set_config('request.jwt.claim.sub', '', false);
  set local role anon;
  select count(*) into n from api.capa where id = 'DIt05';
  select count(*) into txt from api.capa where id = 'ZPrueba01';
  raise notice '% P11a el publico ve DIt05 (vigente_publico) con simbologia: % fila(s)', case when n = 1 then 'OK' else 'FALLA' end, n;
  raise notice '% P11b el publico NO ve la capa en borrador ZPrueba01: % fila(s)', case when txt::int = 0 then 'OK' else 'FALLA' end, txt;
  select simbologia into s from api.capa where id = 'DIt05';
  raise notice '% P11c la simbologia llega por la API al publico', case when s = azul then 'OK' else 'FALLA' end;
  reset role;

  -- P12 bitacora: el cambio de simbologia queda auditado
  select count(*) into n from core.bitacora_cambio where tabla_afectada = 'capa' and id_registro = 'DIt05' and datos_nuevos ? 'simbologia';
  raise notice '% P12 la bitacora registra la fila con simbologia (% registros para DIt05)', case when n >= 1 then 'OK' else 'FALLA' end, n;
end
$prueba$;

rollback;
