-- Prueba de la migración 252 en una base LOCAL (copia de pruebas, NUNCA la VM). Se corre DESPUÉS de aplicar la 252.
-- Cada comprobación imprime "OK" o "FALLA". Todo va dentro de una transacción que termina en ROLLBACK.
-- Los polígonos de municipio de la prueba son cuadros sintéticos creados dentro de la transacción (la base local no trae los reales).
\set ON_ERROR_STOP on
\pset tuples_only on
begin;

do $prueba$
declare
  cap1 uuid := gen_random_uuid(); cap2 uuid := gen_random_uuid(); adm uuid := gen_random_uuid(); tit uuid := gen_random_uuid();
  v jsonb; n bigint; n2 bigint; txt text; ok boolean; r record;
  ficha jsonb := '{"custodio":"Prueba","fuente_origen":"Prueba 2026","linaje":"Linaje de prueba","sistema_coordenadas":"EPSG:4326","restriccion_uso":"pública"}';
  p_a text; p_b text; p_cerca text; p_lejos text; l_linea text; vacio text;
  cap_punto text; id_nuevo text;
  lote jsonb;
begin
  insert into auth.users (id, email) values (cap1,'c1@prueba.local'),(cap2,'c2@prueba.local'),(adm,'a@prueba.local'),(tit,'t@prueba.local');
  insert into core.perfil (id_usuario, nombre, rol) values (cap1,'Capturista 1','capturista'),(cap2,'Capturista 2','capturista'),
    (adm,'Admin','administrador'),(tit,'Titular','administrador_titular');

  -- municipios sinteticos (A = 04001, B = 04002), cuadros de 0.2 grados contiguos
  insert into core.unidad_territorial_geom (id_unidad, geom) values
    ('04001', ST_Multi(ST_MakeEnvelope(-90.6, 19.8, -90.4, 20.0, 4326))),
    ('04002', ST_Multi(ST_MakeEnvelope(-90.4, 19.8, -90.2, 20.0, 4326)));
  p_a     := encode(ST_AsBinary(ST_SetSRID(ST_Point(-90.5, 19.9), 4326)), 'hex');
  p_b     := encode(ST_AsBinary(ST_SetSRID(ST_Point(-90.3, 19.9), 4326)), 'hex');
  p_cerca := encode(ST_AsBinary(ST_SetSRID(ST_Point(-90.5, 20.003), 4326)), 'hex');   -- ~330 m al norte de A
  p_lejos := encode(ST_AsBinary(ST_SetSRID(ST_Point(-95.0, 10.0), 4326)), 'hex');
  l_linea := encode(ST_AsBinary(ST_SetSRID(ST_MakeLine(ST_Point(-90.55,19.9), ST_Point(-90.45,19.9)), 4326)), 'hex');
  vacio   := encode(ST_AsBinary(ST_SetSRID(ST_GeomFromText('POINT EMPTY'), 4326)), 'hex');

  -- ======================= R1 propiedad: INSERT sigue valiendo; reclamo se suma =======================
  perform set_config('request.jwt.claim.sub', cap1::text, false);
  v := api.fn_guardar_capa(jsonb_build_object('id','ZRecl01','titulo','Capa de cap1 con id explicito','proposito','Prueba de compatibilidad con id explicito.',
        'tipo_geometria','Punto','srid_origen',4326,'n_elementos',0,'archivo','a.gpkg','metadatos_extra',ficha));
  raise notice '% R1a id explicito sigue funcionando (compatibilidad)', case when v ->> 'id' = 'ZRecl01' then 'OK' else 'FALLA' end;
  raise notice '% R1b creo_objeto true para quien dio de alta', case when core.creo_objeto('capa','ZRecl01') then 'OK' else 'FALLA' end;
  perform set_config('request.jwt.claim.sub', cap2::text, false);
  raise notice '% R1c creo_objeto false para otro capturista', case when not core.creo_objeto('capa','ZRecl01') then 'OK' else 'FALLA' end;

  -- ======================= R2 id asignado por el servidor =======================
  perform set_config('request.jwt.claim.sub', cap1::text, false);
  v := api.fn_guardar_capa(jsonb_build_object('prefijo_id','Inf','titulo','Capa nueva Inf','proposito','Prueba de asignacion de id por prefijo.',
        'tipo_geometria','Línea','srid_origen',4326,'n_elementos',0,'archivo','b.gpkg'));
  raise notice '% R2a prefijo Inf recibe el siguiente numero (Inf17; recibio %)', case when v ->> 'id' = 'Inf17' then 'OK' else 'FALLA' end, v ->> 'id';
  v := api.fn_guardar_capa(jsonb_build_object('prefijo_id','Inf','titulo','Otra capa Inf','proposito','Segunda asignacion de id por prefijo.',
        'tipo_geometria','Línea','srid_origen',4326,'n_elementos',0,'archivo','c.gpkg'));
  raise notice '% R2b la siguiente recibe Inf18 (recibio %)', case when v ->> 'id' = 'Inf18' then 'OK' else 'FALLA' end, v ->> 'id';
  v := api.fn_guardar_capa(jsonb_build_object('prefijo_id','ZNuevoG','titulo','Grupo nuevo','proposito','Prefijo sin capas previas empieza en 01.',
        'tipo_geometria','Punto','srid_origen',4326,'n_elementos',0,'archivo','d.gpkg'));
  raise notice '% R2c prefijo nuevo empieza en 01 (recibio %)', case when v ->> 'id' = 'ZNuevoG01' then 'OK' else 'FALLA' end, v ->> 'id';
  begin perform api.fn_guardar_capa(jsonb_build_object('id','Inf01','prefijo_id','Inf','titulo','x','tipo_geometria','Punto'));
        raise notice 'FALLA R2d id y prefijo juntos aceptados';
  exception when sqlstate '22023' then raise notice 'OK R2d rechaza id y prefijo juntos'; end;
  begin perform api.fn_guardar_capa(jsonb_build_object('prefijo_id','1mal; drop','titulo','x','tipo_geometria','Punto'));
        raise notice 'FALLA R2e prefijo invalido aceptado';
  exception when sqlstate '22023' then raise notice 'OK R2e rechaza prefijo invalido'; end;
  begin perform api.fn_guardar_capa(jsonb_build_object('titulo','x','tipo_geometria','Punto'));
        raise notice 'FALLA R2f sin id ni prefijo aceptado';
  exception when sqlstate '22023' then raise notice 'OK R2f exige id o prefijo'; end;
  -- una clave dada de baja no se reutiliza: se da de baja Inf18 (desde admin) y la siguiente es Inf19
  perform set_config('request.jwt.claim.sub', adm::text, false);
  perform api.fn_baja_capa('Inf18', false);
  perform set_config('request.jwt.claim.sub', cap1::text, false);
  v := api.fn_guardar_capa(jsonb_build_object('prefijo_id','Inf','titulo','Tras baja','proposito','No reutiliza la clave dada de baja.',
        'tipo_geometria','Línea','srid_origen',4326,'n_elementos',0,'archivo','e.gpkg'));
  raise notice '% R2g no reutiliza una clave dada de baja (recibio %, esperado Inf19)', case when v ->> 'id' = 'Inf19' then 'OK' else 'FALLA' end, v ->> 'id';
  select count(*) into n from core.capa where id ~ '^Inf[0-9]{2}$';
  select count(distinct id) into n2 from core.capa where id ~ '^Inf[0-9]{2}$';
  raise notice '% R2h sin claves repetidas en el prefijo Inf (% filas, % distintas)', case when n = n2 then 'OK' else 'FALLA' end, n, n2;

  -- ======================= R3 reclamar capa =======================
  -- borrador huerfano: se inserta como sistema (sin usuario), igual que las capas sembradas
  perform set_config('request.jwt.claim.sub', '', false);
  insert into core.capa (id, titulo, proposito, tipo_geometria, srid_origen, estatus, n_elementos, archivo, metadatos_extra)
    values ('ZHuerf01','Huerfana de prueba','Borrador sin creador.','Punto',4326,'borrador',0,'h.gpkg', ficha);
  raise notice '% R3a capa sembrada queda sin creador', case when core.capa_sin_creador('ZHuerf01') then 'OK' else 'FALLA' end;
  raise notice '% R3b una capa de cap1 NO es sin creador', case when not core.capa_sin_creador('ZRecl01') then 'OK' else 'FALLA' end;

  perform set_config('request.jwt.claim.sub', cap2::text, false);
  select count(*) into n from api.fn_capas_reclamables() where id = 'ZHuerf01';
  raise notice '% R3c la lista de reclamables trae la huerfana', case when n = 1 then 'OK' else 'FALLA' end;
  select count(*) into n from api.fn_capas_reclamables() where id = 'ZRecl01';
  raise notice '% R3d la lista no trae capas que ya tienen Capturista', case when n = 0 then 'OK' else 'FALLA' end;
  select count(*) into n from core.capa where id = 'ZHuerf01';   -- RLS directa: el capturista no ve el borrador ajeno
  set local role authenticated;
  select count(*) into n2 from core.capa where id = 'ZHuerf01';
  reset role;
  raise notice '% R3e antes de reclamar, RLS no deja ver la huerfana al capturista (veia %)', case when n2 = 0 then 'OK' else 'FALLA' end, n2;

  v := api.fn_reclamar_capa('ZHuerf01');
  raise notice '% R3f cap2 reclama la huerfana', case when v ->> 'id' = 'ZHuerf01' then 'OK' else 'FALLA' end;
  raise notice '% R3g creo_objeto true para cap2 tras reclamar', case when core.creo_objeto('capa','ZHuerf01') then 'OK' else 'FALLA' end;
  raise notice '% R3h ya no es sin creador', case when not core.capa_sin_creador('ZHuerf01') then 'OK' else 'FALLA' end;
  select count(*) into n from api.fn_capas_reclamables() where id = 'ZHuerf01';
  raise notice '% R3i sale de la lista de reclamables', case when n = 0 then 'OK' else 'FALLA' end;
  set local role authenticated;
  select count(*) into n2 from core.capa where id = 'ZHuerf01';
  reset role;
  raise notice '% R3j tras reclamar, RLS se la deja ver a cap2 (veia %)', case when n2 = 1 then 'OK' else 'FALLA' end, n2;
  begin perform api.fn_reclamar_capa('ZHuerf01'); raise notice 'FALLA R3k reclamar dos veces la misma';
  exception when sqlstate '55000' then raise notice 'OK R3k cap2 no puede reclamar otra vez su propia capa'; end;

  perform set_config('request.jwt.claim.sub', cap1::text, false);
  begin perform api.fn_reclamar_capa('ZHuerf01'); raise notice 'FALLA R3l la segunda solicitud gano';
  exception when sqlstate '55000' then raise notice 'OK R3l la segunda solicitud (cap1) recibe error: gano la primera'; end;
  raise notice '% R3m cap1 sigue sin ser dueno de ZHuerf01', case when not core.creo_objeto('capa','ZHuerf01') then 'OK' else 'FALLA' end;
  begin perform api.fn_guardar_capa(jsonb_build_object('id','ZHuerf01','titulo','intento de cap1')); raise notice 'FALLA R3n cap1 edito capa ajena';
  exception when sqlstate '42501' then raise notice 'OK R3n cap1 no edita la capa reclamada por cap2'; end;
  perform set_config('request.jwt.claim.sub', cap2::text, false);
  v := api.fn_guardar_capa(jsonb_build_object('id','ZHuerf01','titulo','Huerfana ya reclamada'));
  raise notice '% R3o cap2 si la edita', case when v ->> 'titulo' = 'Huerfana ya reclamada' then 'OK' else 'FALLA' end;
  begin perform api.fn_reclamar_capa('ZRecl01'); raise notice 'FALLA R3p reclamo una capa con Capturista';
  exception when sqlstate '55000' then raise notice 'OK R3p no se reclama una capa que ya tiene Capturista'; end;
  begin perform api.fn_reclamar_capa('DIt05'); raise notice 'FALLA R3q reclamo una capa vigente';
  exception when sqlstate '55000' then raise notice 'OK R3q no se reclama una capa vigente'; end;
  begin perform api.fn_reclamar_capa('NoExiste99'); raise notice 'FALLA R3r reclamo capa inexistente';
  exception when sqlstate 'P0002' then raise notice 'OK R3r capa inexistente da error claro'; end;
  perform set_config('request.jwt.claim.sub', adm::text, false);
  begin perform api.fn_reclamar_capa('ZHuerf01'); raise notice 'FALLA R3s un administrador reclamo';
  exception when sqlstate '42501' then raise notice 'OK R3s solo el Capturista reclama'; end;
  select count(*) into n from core.bitacora_cambio where tabla_afectada='capa' and id_registro='ZHuerf01' and datos_nuevos ->> 'evento' = 'reclamo_capa';
  raise notice '% R3t exactamente 1 evento de reclamo en la bitacora (hay %)', case when n = 1 then 'OK' else 'FALLA' end, n;
  -- la marca no se puede forjar desde el navegador
  perform set_config('request.jwt.claim.sub', cap1::text, false);
  begin
    set local role authenticated;
    insert into core.bitacora_cambio (id_usuario, tabla_afectada, id_registro, accion, datos_previos, datos_nuevos)
      values (cap1, 'capa', 'ZHuerf01', 'UPDATE', '{}', '{"evento":"reclamo_capa"}');
    reset role; raise notice 'FALLA R3u un usuario autenticado escribio en la bitacora';
  exception when insufficient_privilege then reset role; raise notice 'OK R3u authenticated no puede escribir la marca de reclamo'; end;

  -- ======================= R4 compuerta de geometria =======================
  perform set_config('request.jwt.claim.sub', cap1::text, false);
  perform api.fn_guardar_capa(jsonb_build_object('id','ZSinGeo01','titulo','Capa sin geometria','proposito','Para probar la compuerta de geometria.',
        'tipo_geometria','Punto','srid_origen',4326,'n_elementos',5,'archivo','s.gpkg','metadatos_extra',ficha));
  perform api.fn_enviar_capa_revision('ZSinGeo01');
  perform set_config('request.jwt.claim.sub', adm::text, false);
  begin perform api.fn_dictaminar_capa('ZSinGeo01','validar'); raise notice 'FALLA R4a valido una capa sin geometria';
  exception when sqlstate '23514' then raise notice 'OK R4a no se valida una capa sin geometria'; end;

  -- ======================= R5 ingesta =======================
  perform set_config('request.jwt.claim.sub', cap1::text, false);
  begin
    set local role authenticated;
    perform core.ingestar_capa_lote('ZRecl01','borrador','[{"id_origen":"1","wkb":"00"}]'::jsonb, true);
    reset role; raise notice 'FALLA R5a authenticated ejecuto la ingesta';
  exception when insufficient_privilege then reset role; raise notice 'OK R5a authenticated no puede ejecutar la ingesta'; end;

  lote := jsonb_build_array(jsonb_build_object('id_origen','1','wkb',p_a,'srid',4326,'nombre','Punto A','propiedades','{"k":1}'::jsonb),
                            jsonb_build_object('id_origen','2','wkb',p_b,'srid',4326,'propiedades','{}'::jsonb));
  v := core.ingestar_capa_lote('ZRecl01','borrador', lote, true);
  raise notice '% R5b primer lote inserta 2 (inserto %)', case when (v ->> 'insertados')::int = 2 then 'OK' else 'FALLA' end, v ->> 'insertados';
  select count(*) into n from core.capa_vector where id_capa='ZRecl01' and id_origen='1' and cve_mun='001' and id_unidad='04001' and cve_ent='04' and metodo_cve_mun='interseccion';
  select count(*) into n2 from core.capa_vector where id_capa='ZRecl01' and id_origen='2' and cve_mun='002' and id_unidad='04002' and metodo_cve_mun='interseccion';
  raise notice '% R5c derivacion por interseccion: punto A -> 04001 y punto B -> 04002 (% y %)', case when n = 1 and n2 = 1 then 'OK' else 'FALLA' end, n, n2;
  v := core.ingestar_capa_lote('ZRecl01','borrador', jsonb_build_array(jsonb_build_object('id_origen','3','wkb',p_cerca,'srid',4326)), false);
  select metodo_cve_mun, cve_mun into r from core.capa_vector where id_capa='ZRecl01' and id_origen='3';
  raise notice '% R5d punto a ~330 m fuera -> proximidad<=1000m en 001 (%, %)', case when r.metodo_cve_mun = 'proximidad<=1000m' and r.cve_mun = '001' then 'OK' else 'FALLA' end, r.metodo_cve_mun, r.cve_mun;
  v := core.cerrar_ingesta_capa('ZRecl01','borrador','a.gpkg');
  select n_elementos into n from core.capa where id='ZRecl01';
  raise notice '% R5e cerrar deja n_elementos real = 3 (quedo %)', case when n = 3 and (v ->> 'n_elementos')::int = 3 then 'OK' else 'FALLA' end, n;
  select count(*) into n from core.bitacora_cambio where tabla_afectada='capa_vector' and id_registro='ZRecl01' and datos_nuevos ->> 'evento'='ingesta_geometrias';
  raise notice '% R5f queda 1 evento de ingesta en la bitacora (hay %)', case when n = 1 then 'OK' else 'FALLA' end, n;

  -- reemplazo, no duplicado
  v := core.ingestar_capa_lote('ZRecl01','borrador', jsonb_build_array(jsonb_build_object('id_origen','1','wkb',p_a,'srid',4326),
                                                                       jsonb_build_object('id_origen','2','wkb',p_b,'srid',4326)), true);
  select count(*) into n from core.capa_vector where id_capa='ZRecl01';
  raise notice '% R5g re-subir REEMPLAZA: quedan 2 (no 5) y se borraron 3 previos (hay %, borrados %)', case when n = 2 and (v ->> 'borrados_previos')::int = 3 then 'OK' else 'FALLA' end, n, v ->> 'borrados_previos';
  perform core.cerrar_ingesta_capa('ZRecl01','borrador');
  select n_elementos into n from core.capa where id='ZRecl01';
  raise notice '% R5h n_elementos sigue el conteo real tras reemplazar (%)', case when n = 2 then 'OK' else 'FALLA' end, n;

  -- errores: todo o nada
  begin perform core.ingestar_capa_lote('ZRecl01','borrador', jsonb_build_array(jsonb_build_object('id_origen','9','wkb',p_a,'srid',4326),
        jsonb_build_object('id_origen','9','wkb',p_b,'srid',4326)), true); raise notice 'FALLA R5i id_origen repetido aceptado';
  exception when sqlstate '23505' then raise notice 'OK R5i rechaza id_origen repetidos'; end;
  select count(*) into n from core.capa_vector where id_capa='ZRecl01';
  raise notice '% R5j tras el error las 2 geometrias previas siguen (todo o nada; hay %)', case when n = 2 then 'OK' else 'FALLA' end, n;
  begin perform core.ingestar_capa_lote('ZRecl01','borrador', jsonb_build_array(jsonb_build_object('id_origen','9','wkb',l_linea,'srid',4326)), true);
        raise notice 'FALLA R5k linea aceptada en capa de puntos';
  exception when sqlstate '23514' then raise notice 'OK R5k rechaza geometria de otro tipo que la capa'; end;
  begin perform core.ingestar_capa_lote('ZRecl01','borrador', jsonb_build_array(jsonb_build_object('id_origen','9','wkb',p_lejos,'srid',4326)), true);
        raise notice 'FALLA R5l elemento fuera de Campeche aceptado';
  exception when sqlstate '23514' then raise notice 'OK R5l rechaza (y reporta) elementos fuera de Campeche'; end;
  begin perform core.ingestar_capa_lote('ZRecl01','borrador', jsonb_build_array(jsonb_build_object('id_origen','9','wkb',vacio,'srid',4326)), true);
        raise notice 'FALLA R5m geometria vacia aceptada';
  exception when sqlstate '23514' then raise notice 'OK R5m rechaza geometria vacia'; end;
  begin perform core.ingestar_capa_lote('ZRecl01','borrador', '[]'::jsonb, true); raise notice 'FALLA R5n lote vacio aceptado';
  exception when sqlstate '22023' then raise notice 'OK R5n rechaza lote vacio'; end;
  select count(*) into n from core.capa_vector where id_capa='ZRecl01';
  raise notice '% R5o tras todos los errores siguen las 2 geometrias (hay %)', case when n = 2 then 'OK' else 'FALLA' end, n;

  -- quien puede
  perform set_config('request.jwt.claim.sub', cap2::text, false);
  begin perform core.ingestar_capa_lote('ZRecl01','borrador', lote, true); raise notice 'FALLA R5p otro capturista ingirio';
  exception when sqlstate '42501' then raise notice 'OK R5p otro capturista no ingiere en capa ajena'; end;
  perform set_config('request.jwt.claim.sub', adm::text, false);
  begin perform core.ingestar_capa_lote('ZRecl01','borrador', lote, true); raise notice 'FALLA R5q administrador ingirio en modo borrador';
  exception when sqlstate '42501' then raise notice 'OK R5q administrador no ingiere en modo borrador'; end;

  -- compuerta: con geometria ya se envia, se valida y se publica
  perform set_config('request.jwt.claim.sub', cap1::text, false);
  perform api.fn_enviar_capa_revision('ZRecl01');
  perform set_config('request.jwt.claim.sub', adm::text, false);
  begin perform api.fn_dictaminar_capa('ZSinGeo01','publicar'); raise notice 'FALLA R4a2 publico una capa sin geometria';
  exception when sqlstate '55000' then raise notice 'OK R4a2 una capa en revision no se publica (estatus), y sin geometria tampoco se valida'; end;
  perform api.fn_dictaminar_capa('ZRecl01','validar');
  raise notice '% R4b con geometria cargada se valida', case when (select estatus from core.capa where id='ZRecl01') = 'vigente_admin' then 'OK' else 'FALLA' end;
  perform set_config('request.jwt.claim.sub', tit::text, false);
  perform api.fn_dictaminar_capa('ZRecl01','publicar');
  raise notice '% R4c con geometria cargada se publica', case when (select estatus from core.capa where id='ZRecl01') = 'vigente_publico' then 'OK' else 'FALLA' end;
  perform set_config('request.jwt.claim.sub', cap1::text, false);
  begin perform core.ingestar_capa_lote('ZRecl01','borrador', lote, true); raise notice 'FALLA R5r ingesta en capa publicada';
  exception when sqlstate '55000' then raise notice 'OK R5r no se ingiere en una capa que ya no es borrador'; end;

  -- ======================= R6 actualizacion de capa vigente =======================
  select id into cap_punto from core.capa where tipo_geometria='Punto' and estatus='vigente_publico' and id='DIt05';
  perform set_config('request.jwt.claim.sub', adm::text, false);
  begin perform core.ingestar_capa_lote('DIt05','actualizacion', lote, true); raise notice 'FALLA R6a ingesta sin actualizacion pendiente';
  exception when sqlstate '55000' then raise notice 'OK R6a sin propuesta pendiente no se ingiere'; end;
  perform set_config('request.jwt.claim.sub', cap1::text, false);
  perform api.fn_proponer_actualizacion_capa('DIt05', jsonb_build_object('archivo','nuevo.gpkg','n_elementos',2,'fecha_corte',to_char(core.hoy_mx(),'YYYY-MM-DD'),
     'motivo','Actualizacion de corte','justificacion','Actualizacion de prueba con justificacion suficiente para pasar el minimo.'));
  perform set_config('request.jwt.claim.sub', cap1::text, false);
  begin perform core.ingestar_capa_lote('DIt05','actualizacion', lote, true); raise notice 'FALLA R6b capturista ingirio en modo actualizacion';
  exception when sqlstate '42501' then raise notice 'OK R6b el capturista no ingiere en modo actualizacion'; end;
  perform set_config('request.jwt.claim.sub', adm::text, false);
  v := core.ingestar_capa_lote('DIt05','actualizacion', lote, true);
  perform api.fn_resolver_actualizacion_capa('DIt05','aprobar','Aprobada en prueba');
  select (metadatos_extra ->> 'geometria_pendiente_ingesta')::boolean into ok from core.capa where id='DIt05';
  raise notice '% R6c tras aprobar queda la bandera geometria_pendiente_ingesta', case when ok then 'OK' else 'FALLA' end;
  v := core.cerrar_ingesta_capa('DIt05','actualizacion','nuevo.gpkg');
  select n_elementos, (metadatos_extra ? 'geometria_pendiente_ingesta') into n, ok from core.capa where id='DIt05';
  select count(*) into n2 from core.capa_vector where id_capa='DIt05';
  raise notice '% R6d cerrar apaga la bandera y deja n_elementos real (n_elementos %, geometrias %)', case when n = 2 and n2 = 2 and not ok then 'OK' else 'FALLA' end, n, n2;
  -- si la aprobacion falla (cuatro ojos), la ingesta del mismo bloque se revierte: se prueba con subtransaccion
  perform set_config('request.jwt.claim.sub', cap1::text, false);
  perform api.fn_proponer_actualizacion_capa('DIt05', jsonb_build_object('archivo','otro.gpkg','n_elementos',1,'fecha_corte',to_char(core.hoy_mx(),'YYYY-MM-DD'),
     'motivo','Segunda actualizacion','justificacion','Segunda actualizacion de prueba con justificacion suficiente.'));
  perform set_config('request.jwt.claim.sub', adm::text, false);
  begin
    perform core.ingestar_capa_lote('DIt05','actualizacion', jsonb_build_array(jsonb_build_object('id_origen','solo','wkb',p_a,'srid',4326)), true);
    perform set_config('request.jwt.claim.sub', cap1::text, false);   -- ahora "aprueba" quien propuso: debe fallar por cuatro ojos
    perform api.fn_resolver_actualizacion_capa('DIt05','aprobar','x');
    raise notice 'FALLA R6e aprobo quien propuso';
  exception when sqlstate '42501' then null; end;
  select count(*) into n from core.capa_vector where id_capa='DIt05';
  raise notice '% R6e si la aprobacion falla, la ingesta del mismo bloque se revierte (siguen % geometrias, esperado 2)', case when n = 2 then 'OK' else 'FALLA' end, n;

  -- ======================= R7 la ficha y las demas reglas siguen igual =======================
  perform set_config('request.jwt.claim.sub', cap1::text, false);
  begin perform api.fn_guardar_capa(jsonb_build_object('id','ZRecl01','otra_cosa',1)); raise notice 'FALLA R7a clave desconocida aceptada';
  exception when sqlstate '22023' then raise notice 'OK R7a fn_guardar_capa sigue rechazando claves desconocidas'; end;
  perform set_config('request.jwt.claim.sub', adm::text, false);
  begin perform api.fn_guardar_capa(jsonb_build_object('prefijo_id','Inf','titulo','x','tipo_geometria','Punto')); raise notice 'FALLA R7b administrador guardo capa';
  exception when sqlstate '42501' then raise notice 'OK R7b solo el Capturista guarda capas'; end;
end
$prueba$;

rollback;
