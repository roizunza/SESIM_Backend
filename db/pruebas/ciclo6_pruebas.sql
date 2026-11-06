-- Ciclo 6 -- Pruebas de evidencias (ER-5), bucket privado y verificacion de huellas contra la base REAL.
-- Cada caso actua con la identidad de un perfil; todo corre dentro de una transaccion que termina en ROLLBACK.
-- Los archivos se representan con filas de storage.objects (en Supabase real, el archivo subido a Storage).
--
-- Uso:  psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f db/pruebas/ciclo6_pruebas.sql
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
  ad uuid := '00000000-0000-0000-0000-0000000000ad'; ti uuid := '00000000-0000-0000-0000-0000000000a7';
  au uuid := '00000000-0000-0000-0000-0000000000a0';
  ind text[]; unis text[]; m1 uuid; m2 uuid; m3 uuid; m4 uuid; per int; uni text;
  h1 text := repeat('a1', 32); h2 text := repeat('b2', 32); h3 text := repeat('c3', 32); h4 text := repeat('d4', 32); h5 text := repeat('e5', 32);
  r text; j jsonb; e1 uuid; e2 uuid; n bigint;
begin
  perform pg_temp.sin_identidad();
  select array_agg(id order by id) into ind from (select id from core.indicador where estatus_aprobado and activo order by id limit 1) x;
  select array_agg(id order by id) into unis from (select id from core.unidad_territorial where nivel = 'municipio' order by id limit 4) y;
  select id into uni from core.unidad_territorial where nivel = 'municipio' order by id limit 1;
  insert into core.periodo (anio, etiqueta, tipo_periodo) values (2041, 'PRUEBA-C6', 'anual') returning id into per;
  insert into core.medicion_indicador (id_indicador, id_unidad, id_periodo, usuario_captura, valor) values (ind[1], unis[1], per, ca, 1) returning id into m1;
  insert into core.medicion_indicador (id_indicador, id_unidad, id_periodo, usuario_captura, valor) values (ind[1], unis[2], per, cb, 2) returning id into m2;
  insert into core.medicion_indicador (id_indicador, id_unidad, id_periodo, usuario_captura, valor, estado) values (ind[1], unis[3], per, ca, 3, 'revision') returning id into m3;

  ---------------------------------------------------------------- ER-5 Y BUCKET
  perform pg_temp.reg('V01 evidencia_medicion tiene la columna vigente (ER-5), por omision true',
    (select column_default from information_schema.columns where table_schema='core' and table_name='evidencia_medicion' and column_name='vigente') = 'true', '');
  perform pg_temp.reg('V02 api.evidencia_medicion expone vigente',
    exists (select 1 from information_schema.columns where table_schema='api' and table_name='evidencia_medicion' and column_name='vigente'), '');
  perform pg_temp.reg('V03 El bucket evidencias es privado, de 10 MB y solo PDF, JPG y PNG',
    (select count(*) from storage.buckets where id='evidencias' and not public and file_size_limit = 10485760
        and allowed_mime_types @> array['application/pdf','image/jpeg','image/png'] and cardinality(allowed_mime_types) = 3) = 1, '');
  perform pg_temp.reg('V04 El bucket no tiene politicas de UPDATE ni DELETE (nadie sobrescribe ni borra desde la API)',
    (select count(*) from pg_policy where polrelid='storage.objects'::regclass and polcmd in ('w','d') ) = 0, '');
  perform pg_temp.reg('V05 La base no admite dos evidencias vigentes de la misma medicion (indice unico parcial)',
    pg_temp.intenta(format($q$insert into core.evidencia_medicion (id_medicion,id_usuario,url_archivo,tipo_documento,hash_archivo) values (%L,%L,'x','t',%L),(%L,%L,'y','t',%L)$q$, m1,ca,repeat('f1',32), m1,ca,repeat('f2',32))) like '23505%', '');

  ---------------------------------------------------------------- SUBIDA AL BUCKET (politicas)
  perform pg_temp.yo(ca);
  r := pg_temp.intenta(format($q$insert into storage.objects (bucket_id, name, metadata) values ('evidencias', %L, '{"size": 1000, "mimetype": "application/pdf"}')$q$, m1 || '/' || h1 || '.pdf'));
  perform pg_temp.reg('S01 El autor sube el archivo a su medicion en borrador (nombre <medicion>/<sha256>.pdf)', r = 'OK', r);
  perform pg_temp.yo(cb);
  r := pg_temp.intenta(format($q$insert into storage.objects (bucket_id, name, metadata) values ('evidencias', %L, '{"size": 1000}')$q$, m1 || '/' || h2 || '.pdf'));
  perform pg_temp.reg('S02 Otro Capturista no sube a la medicion ajena (42501)', r like '42501%', r);
  perform pg_temp.yo(ca);
  r := pg_temp.intenta(format($q$insert into storage.objects (bucket_id, name, metadata) values ('evidencias', %L, '{"size": 1000}')$q$, m1 || '/oficio final.pdf'));
  perform pg_temp.reg('S03 Un nombre que no sea <medicion>/<sha256>.<ext> se rechaza (42501)', r like '42501%', r);
  perform pg_temp.yo(ca);
  r := pg_temp.intenta(format($q$insert into storage.objects (bucket_id, name, metadata) values ('evidencias', %L, '{"size": 1000}')$q$, m1 || '/' || h2 || '.exe'));
  perform pg_temp.reg('S04 Una extension no permitida se rechaza (42501)', r like '42501%', r);
  perform pg_temp.yo(ca);
  r := pg_temp.intenta(format($q$insert into storage.objects (bucket_id, name, metadata) values ('evidencias', %L, '{"size": 1000}')$q$, m3 || '/' || h2 || '.pdf'));
  perform pg_temp.reg('S05 No se sube a una medicion que ya esta en revision (42501)', r like '42501%', r);
  perform pg_temp.yo(ad);
  r := pg_temp.intenta(format($q$insert into storage.objects (bucket_id, name, metadata) values ('evidencias', %L, '{"size": 1000}')$q$, m1 || '/' || h2 || '.pdf'));
  perform pg_temp.reg('S06 El Administrador no sube a una medicion que no capturo (42501)', r like '42501%', r);
  perform pg_temp.anonimo();
  r := pg_temp.intenta(format($q$insert into storage.objects (bucket_id, name, metadata) values ('evidencias', %L, '{"size": 1000}')$q$, m1 || '/' || h2 || '.pdf'));
  perform pg_temp.reg('S07 El ciudadano (anon) no sube nada (42501)', r like '42501%', r);

  ---------------------------------------------------------------- REGISTRO DE LA EVIDENCIA
  perform pg_temp.yo(ca);
  r := pg_temp.intenta(format($q$select api.fn_registrar_evidencia(%L,'Oficio',%L,'application/pdf',1000)$q$, m1, h2));
  perform pg_temp.reg('F01 Registrar sin que el archivo este en el bucket no pasa (P0002)', r like 'P0002%', r);
  perform pg_temp.yo(ca);
  r := pg_temp.intenta(format($q$select api.fn_registrar_evidencia(%L,'Oficio',%L,'application/pdf',1000)$q$, m1, 'zz'));
  perform pg_temp.reg('F02 Una huella que no es SHA-256 hexadecimal se rechaza (22023)', r like '22023%', r);
  perform pg_temp.yo(ca);
  r := pg_temp.intenta(format($q$select api.fn_registrar_evidencia(%L,'Oficio',%L,'application/zip',1000)$q$, m1, h1));
  perform pg_temp.reg('F03 Un tipo de archivo no permitido se rechaza (22023)', r like '22023%', r);
  perform pg_temp.yo(ca);
  r := pg_temp.intenta(format($q$select api.fn_registrar_evidencia(%L,'Oficio',%L,'application/pdf',10485761)$q$, m1, h1));
  perform pg_temp.reg('F04 Mas de 10 MB se rechaza (22023)', r like '22023%', r);
  perform pg_temp.yo(ca);
  r := pg_temp.intenta(format($q$select api.fn_registrar_evidencia(%L,'  ',%L,'application/pdf',1000)$q$, m1, h1));
  perform pg_temp.reg('F05 Sin tipo de documento no pasa (23514)', r like '23514%', r);
  perform pg_temp.yo(ca);
  r := pg_temp.intenta(format($q$select api.fn_registrar_evidencia(%L,'Oficio',%L,'application/pdf',999)$q$, m1, h1));
  perform pg_temp.reg('F06 El tamano declarado debe coincidir con el del archivo subido (22023)', r like '22023%', r);
  perform pg_temp.yo(cb);
  r := pg_temp.intenta(format($q$select api.fn_registrar_evidencia(%L,'Oficio',%L,'application/pdf',1000)$q$, m1, h1));
  perform pg_temp.reg('F07 Otro Capturista no registra evidencia de una medicion ajena (42501)', r like '42501%', r);
  perform pg_temp.yo(ad);
  r := pg_temp.intenta(format($q$select api.fn_registrar_evidencia(%L,'Oficio',%L,'application/pdf',1000)$q$, m1, h1));
  perform pg_temp.reg('F08 Ni el Administrador la registra por el autor (42501)', r like '42501%', r);
  perform pg_temp.yo(au);
  r := pg_temp.intenta(format($q$select api.fn_registrar_evidencia(%L,'Oficio',%L,'application/pdf',1000)$q$, m1, h1));
  perform pg_temp.reg('F09 El Auditor no registra (42501)', r like '42501%', r);
  perform pg_temp.anonimo();
  r := pg_temp.intenta(format($q$select api.fn_registrar_evidencia(%L,'Oficio',%L,'application/pdf',1000)$q$, m1, h1));
  perform pg_temp.reg('F10 El ciudadano no ejecuta la funcion (42501)', r like '42501%', r);
  perform pg_temp.yo(ca);
  r := pg_temp.intenta(format($q$select api.fn_registrar_evidencia(%L,'Oficio',%L,'application/pdf',1000)$q$, m3, h1));
  perform pg_temp.reg('F11 Con la medicion en revision no se cambia la evidencia (55000)', r like '55000%', r);
  perform pg_temp.yo(ca);
  j := api.fn_registrar_evidencia(m1, 'Oficio', h1, 'application/pdf', 1000);
  e1 := (j ->> 'id')::uuid;
  perform pg_temp.sin_identidad();
  perform pg_temp.reg('F12 El autor registra su evidencia: queda vigente con ruta evidencias/<medicion>/<sha256>.pdf y su huella',
    (select vigente and url_archivo = 'evidencias/' || m1 || '/' || h1 || '.pdf' and hash_archivo = h1 and id_usuario = ca from core.evidencia_medicion where id = e1), '');
  perform pg_temp.reg('F13 El alta queda auditada a nombre del autor',
    (select count(*) from core.bitacora_cambio where tabla_afectada='evidencia_medicion' and id_registro = e1::text and accion='INSERT' and id_usuario = ca) = 1, '');
  perform pg_temp.yo(ca);
  r := pg_temp.intenta(format($q$select api.fn_registrar_evidencia(%L,'Oficio',%L,'application/pdf',1000)$q$, m1, h1));
  perform pg_temp.reg('F14 La misma huella no se registra dos veces (23505)', r like '23505%', r);

  ---------------------------------------------------------------- REEMPLAZO (medicion rechazada)
  perform pg_temp.sin_identidad();
  update core.medicion_indicador set estado = 'rechazado', usuario_validacion = ad, fecha_validacion = now() where id = m1;
  insert into storage.objects (bucket_id, name, metadata) values ('evidencias', m1 || '/' || h3 || '.png', '{"size": 2048}');
  perform pg_temp.yo(ca);
  j := api.fn_registrar_evidencia(m1, 'Fotografia', h3, 'image/png', 2048);
  e2 := (j ->> 'id')::uuid;
  perform pg_temp.sin_identidad();
  perform pg_temp.reg('R01 Al ser rechazada, el autor REEMPLAZA su evidencia: la nueva es la vigente y la anterior queda reemplazada',
    (select vigente from core.evidencia_medicion where id = e2) and not (select vigente from core.evidencia_medicion where id = e1)
    and (j ->> 'reemplazo_a')::uuid = e1, '');
  perform pg_temp.reg('R02 Nada se borra: las dos filas siguen y solo una es vigente',
    (select count(*) from core.evidencia_medicion where id_medicion = m1) = 2 and (select count(*) from core.evidencia_medicion where id_medicion = m1 and vigente) = 1, '');
  perform pg_temp.reg('R03 El reemplazo deja su huella en la bitacora (UPDATE de la anterior e INSERT de la nueva)',
    (select count(*) from core.bitacora_cambio where tabla_afectada='evidencia_medicion' and id_registro = e1::text and accion='UPDATE'
        and datos_previos ->> 'vigente' = 'true' and datos_nuevos ->> 'vigente' = 'false') = 1
    and (select count(*) from core.bitacora_cambio where tabla_afectada='evidencia_medicion' and id_registro = e2::text and accion='INSERT') = 1, '');
  perform pg_temp.yo(ca);
  r := pg_temp.intenta(format($q$delete from core.evidencia_medicion where id = %L$q$, e2));
  perform pg_temp.reg('R04 Nadie borra una evidencia por la API (sin permiso de DELETE)', r like '42501%', r);
  perform pg_temp.yo(ca);
  r := pg_temp.intenta(format($q$select api.fn_registrar_evidencia(%L,'Oficio',%L,'application/pdf',1000)$q$, m1, h1));
  perform pg_temp.reg('R05 Una huella reemplazada tampoco se reutiliza (23505)', r like '23505%', r);

  ---------------------------------------------------------------- LECTURA
  perform pg_temp.yo(ca);
  perform pg_temp.reg('L01 El autor ve sus dos evidencias (la vigente y la reemplazada) en la API', pg_temp.cuenta(format($q$select 1 from api.evidencia_medicion where id_medicion = %L$q$, m1)) = 2, '');
  perform pg_temp.yo(cb);
  perform pg_temp.reg('L02 Otro Capturista no ve evidencias ajenas', pg_temp.cuenta(format($q$select 1 from api.evidencia_medicion where id_medicion = %L$q$, m1)) = 0, '');
  perform pg_temp.yo(au);
  perform pg_temp.reg('L03 El Auditor ve la evidencia de una medicion rechazada (ya salio del borrador)', pg_temp.cuenta(format($q$select 1 from api.evidencia_medicion where id_medicion = %L$q$, m1)) = 2, '');
  perform pg_temp.yo(ad);
  perform pg_temp.reg('L04 El Administrador ve la de una medicion rechazada', pg_temp.cuenta(format($q$select 1 from api.evidencia_medicion where id_medicion = %L$q$, m1)) = 2, '');
  perform pg_temp.anonimo();
  perform pg_temp.reg('L05 El ciudadano no ve evidencias', pg_temp.intenta($q$select 1 from api.evidencia_medicion$q$) like '42501%' or pg_temp.cuenta($q$select 1 from api.evidencia_medicion$q$) = 0, '');
  perform pg_temp.yo(ca);
  perform pg_temp.reg('L06 El autor lee su archivo del bucket', pg_temp.cuenta(format($q$select 1 from storage.objects where bucket_id='evidencias' and name = %L$q$, m1 || '/' || h3 || '.png')) = 1, '');
  perform pg_temp.yo(cb);
  perform pg_temp.reg('L07 Otro Capturista no lee archivos ajenos del bucket', pg_temp.cuenta(format($q$select 1 from storage.objects where bucket_id='evidencias' and name = %L$q$, m1 || '/' || h3 || '.png')) = 0, '');
  perform pg_temp.yo(au);
  perform pg_temp.reg('L08 El Auditor lee el archivo de la medicion que ya salio del borrador', pg_temp.cuenta(format($q$select 1 from storage.objects where bucket_id='evidencias' and name = %L$q$, m1 || '/' || h3 || '.png')) = 1, '');
  perform pg_temp.anonimo();
  perform pg_temp.reg('L09 El ciudadano no lee nada del bucket', pg_temp.cuenta($q$select 1 from storage.objects where bucket_id='evidencias'$q$) <= 0, '');

  ---------------------------------------------------------------- VERIFICACION DE INTEGRIDAD (F11)
  perform pg_temp.yo(au);
  j := api.fn_verificar_evidencia(e2, h3);
  perform pg_temp.sin_identidad();
  perform pg_temp.reg('H01 Con la huella correcta, coincide y no se levanta hallazgo', (j ->> 'coincide')::boolean and j ->> 'id_hallazgo' is null
    and (select count(*) from core.hallazgo_auditoria where id_medicion = m1) = 0, '');
  perform pg_temp.yo(au);
  j := api.fn_verificar_evidencia(e2, h4);
  perform pg_temp.sin_identidad();
  perform pg_temp.reg('H02 Con una huella distinta NO coincide y el Auditor deja un hallazgo de severidad alta',
    not (j ->> 'coincide')::boolean and (select severidad = 'alta' and id_auditor = au and estado = 'abierto' from core.hallazgo_auditoria where id = (j ->> 'id_hallazgo')::uuid), '');
  perform pg_temp.yo(au);
  perform api.fn_verificar_evidencia(e2, h4);
  perform pg_temp.sin_identidad();
  perform pg_temp.reg('H03 Repetir la misma verificacion no duplica el hallazgo', (select count(*) from core.hallazgo_auditoria where id_medicion = m1) = 1, '');
  perform pg_temp.yo(ad);
  j := api.fn_verificar_evidencia(e2, h5);
  perform pg_temp.sin_identidad();
  perform pg_temp.reg('H04 El Administrador puede verificar pero no levanta hallazgos (solo el Auditor)', not (j ->> 'coincide')::boolean and j ->> 'id_hallazgo' is null
    and (select count(*) from core.hallazgo_auditoria where id_medicion = m1) = 1, '');
  perform pg_temp.yo(ca);
  r := pg_temp.intenta(format($q$select api.fn_verificar_evidencia(%L,%L)$q$, e2, h3));
  perform pg_temp.reg('H05 El Capturista no verifica (42501)', r like '42501%', r);
  perform pg_temp.yo(au);
  r := pg_temp.intenta(format($q$select api.fn_verificar_evidencia(%L,'xyz')$q$, e2));
  perform pg_temp.reg('H06 Una huella mal formada se rechaza (22023)', r like '22023%', r);
  perform pg_temp.anonimo();
  r := pg_temp.intenta(format($q$select api.fn_verificar_evidencia(%L,%L)$q$, e2, h3));
  perform pg_temp.reg('H07 El ciudadano no verifica (42501)', r like '42501%', r);

  ---------------------------------------------------------------- INTEGRIDAD R12 (solo cuenta la vigente)
  perform pg_temp.sin_identidad();
  insert into core.medicion_indicador (id_indicador, id_unidad, id_periodo, usuario_captura, valor, estado, usuario_validacion, fecha_validacion)
    values (ind[1], unis[4], per, ca, 4, 'vigente_admin', ad, now()) returning id into m4;
  insert into core.evidencia_medicion (id_medicion, id_usuario, url_archivo, tipo_documento, hash_archivo, vigente) values (m4, ca, 'evidencias/x', 'Oficio', repeat('99', 32), false);
  perform pg_temp.reg('I01 R12: una medicion vigente cuya unica evidencia fue reemplazada se detecta como sin evidencia vigente',
    exists (select 1 from core.verificar_integridad() where chequeo like '%evidencia vigente%' and not ok), '');
  perform pg_temp.reg('A01 Evidencias y hallazgos siguen teniendo disparador de auditoria',
    (select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid where t.tgname='trg_auditoria' and c.relname in ('evidencia_medicion','hallazgo_auditoria')) = 2, '');
  perform pg_temp.reg('A02 Ni anon ni authenticated pueden ejecutar fuera de lo previsto: las dos funciones nuevas no son de anon',
    not has_function_privilege('anon', 'api.fn_registrar_evidencia(uuid,text,text,text,bigint)', 'execute')
    and not has_function_privilege('anon', 'api.fn_verificar_evidencia(uuid,text)', 'execute'), '');
end $$;

select n, case when ok then 'PASA' else 'FALLA' end as resultado, caso, detalle from resultados order by n;
select count(*) filter (where ok) as pasan, count(*) filter (where not ok) as fallan from resultados;
do $$ begin
  if exists (select 1 from resultados where not ok) then raise exception 'Hay pruebas del Ciclo 6 que fallan'; end if;
end $$;
rollback;
