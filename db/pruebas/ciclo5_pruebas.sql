-- Ciclo 5 -- Pruebas de trazabilidad y control de cambios contra la base REAL.
-- Cada caso actua con la identidad de un perfil (claims JWT reales; auth.uid() de Supabase) y verifica que la
-- bitacora registre lo que debe, que cada perfil vea solo lo suyo y que las compuertas D-16/D-17 sigan firmes.
-- Todo corre dentro de una transaccion que termina en ROLLBACK.
--
-- Uso:  psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f db/pruebas/ciclo5_pruebas.sql
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
 ('00000000-0000-0000-0000-0000000000a7', 'tit@prueba.mx'),
 ('00000000-0000-0000-0000-0000000000a0', 'aud@prueba.mx');
insert into core.perfil (id_usuario, nombre, rol, creado_en) values
 ('00000000-0000-0000-0000-00000000c0a1', 'Capturista A', 'capturista', '2030-01-01 10:00+00'),
 ('00000000-0000-0000-0000-00000000c0b2', 'Capturista B', 'capturista', '2030-01-01 11:00+00'),
 ('00000000-0000-0000-0000-0000000000ad', 'Administrador',  'administrador', '2030-01-01 12:00+00'),
 ('00000000-0000-0000-0000-0000000000a7', 'Titular',        'administrador_titular', '2030-01-01 13:00+00'),
 ('00000000-0000-0000-0000-0000000000a0', 'Auditor',        'auditor', '2030-01-01 14:00+00');

do $$
declare
  ca uuid := '00000000-0000-0000-0000-00000000c0a1'; cb uuid := '00000000-0000-0000-0000-00000000c0b2';
  ad uuid := '00000000-0000-0000-0000-0000000000ad'; ti uuid := '00000000-0000-0000-0000-0000000000a7';
  au uuid := '00000000-0000-0000-0000-0000000000a0';
  capa_x text := 'DTp01';          -- capa vigente_admin con metadato completo (carga oficial)
  n bigint; r text; t timestamptz; 
begin

  ---------------------------------------------------------------- AUDITORIA GENERICA
  perform pg_temp.reg('E01 Las 8 tablas de control tienen su disparador de auditoria',
    (select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid
      where t.tgname = 'trg_auditoria' and not t.tgisinternal
        and c.relname in ('capa','instrumento_origen','indicador','medicion_indicador','evidencia_medicion','umbral_semaforo','hallazgo_auditoria','periodo')) = 8, '');
  -- (Ciclo 4 agrego mas tablas auditadas; sus disparadores se prueban en pruebas-ciclo4.)

  -- A) Capturista A envia la capa a revision (acta como duena de la funcion, con identidad de A)
  perform pg_temp.actua(ca);
  update core.capa set estatus = 'revision' where id = capa_x;
  perform pg_temp.reg('E02 CAMBIO_ESTADO de una capa deja 1 evento con el id del capturista',
    (select count(*) from core.bitacora_cambio where tabla_afectada='capa' and id_registro=capa_x
       and accion='CAMBIO_ESTADO' and id_usuario=ca
       and datos_previos->>'estatus'='vigente_admin' and datos_nuevos->>'estatus'='revision') = 1, '');

  -- B) Un UPDATE que no cambia nada (solo updated_at) no deja huella
  perform pg_temp.actua(ca);
  select count(*) into n from core.bitacora_cambio;
  update core.capa set updated_at = now() + interval '1 second' where id = capa_x;
  perform pg_temp.reg('E03 Un UPDATE sin cambios reales (solo updated_at) no registra nada',
    (select count(*) from core.bitacora_cambio) = n, '');

  -- C) Un cambio de metadatos sin cambiar estatus = UPDATE
  perform pg_temp.actua(ca);
  update core.capa set proposito = coalesce(proposito,'') || ' (ajuste)' where id = capa_x;
  perform pg_temp.reg('E04 Cambiar un dato (no el estatus) registra UPDATE con foto previa y nueva',
    (select count(*) from core.bitacora_cambio where tabla_afectada='capa' and id_registro=capa_x and accion='UPDATE'
       and datos_previos is not null and datos_nuevos is not null and datos_previos<>datos_nuevos) = 1, '');

  -- D) Administrador rechaza: dictamen + vuelta a borrador en la misma transaccion
  perform pg_temp.actua(ad);
  insert into core.dictamen (objeto_tipo, objeto_id, decision, estado_previo, estado_nuevo, comentario, id_usuario)
    values ('capa', capa_x, 'rechazar', 'revision', 'borrador', 'Falta la columna cve_ent en la tabla de atributos.', ad);
  update core.capa set estatus = 'borrador' where id = capa_x;

  -- E) Capturista corrige y reenvia; el Administrador valida
  perform pg_temp.actua(ca);  update core.capa set estatus = 'revision' where id = capa_x;
  perform pg_temp.actua(ad);
  insert into core.dictamen (objeto_tipo, objeto_id, decision, estado_previo, estado_nuevo, comentario, id_usuario)
    values ('capa', capa_x, 'validar', 'revision', 'vigente_admin', 'Cumple el diccionario de datos.', ad);
  update core.capa set estatus = 'vigente_admin' where id = capa_x;

  perform pg_temp.reg('E05 Ciclo completo de la capa deja 5 eventos (envio, UPDATE, rechazo, envio, aprobacion)',
    (select count(*) from core.bitacora_cambio where tabla_afectada='capa' and id_registro=capa_x and fecha = now()) = 5,
    (select count(*) from core.bitacora_cambio where tabla_afectada='capa' and id_registro=capa_x)::text);

  ---------------------------------------------------------------- LA BITACORA ES INMUTABLE
  perform pg_temp.reg('E06 La bitacora sigue siendo solo-insercion (UPDATE bloqueado)',
    pg_temp.intenta($q$update core.bitacora_cambio set accion='UPDATE'$q$) like '42501%', '');
  perform pg_temp.reg('E07 La bitacora sigue siendo solo-insercion (DELETE bloqueado)',
    pg_temp.intenta($q$delete from core.bitacora_cambio$q$) like '42501%', '');

  ---------------------------------------------------------------- VISTA api.bitacora_operativa
  perform pg_temp.yo(ad);
  perform pg_temp.reg('E08 Conteo por operacion exacto',
    (select count(*) from api.bitacora_operativa where recurso_id=capa_x and operacion='envio' and creado_en = now()) = 2
    and (select count(*) from api.bitacora_operativa where recurso_id=capa_x and operacion='rechazo' and creado_en = now()) = 1
    and (select count(*) from api.bitacora_operativa where recurso_id=capa_x and operacion='aprobacion' and creado_en = now()) = 1
    and (select count(*) from api.bitacora_operativa where recurso_id=capa_x and operacion='actualizacion' and creado_en = now()) = 1, '');
  perform pg_temp.reg('E09 El rechazo trae el motivo del dictamen; la aprobacion, su comentario',
    (select comentario_admin from api.bitacora_operativa where recurso_id=capa_x and operacion='rechazo' and creado_en = now()) like 'Falta la columna cve_ent%'
    and (select comentario_admin from api.bitacora_operativa where recurso_id=capa_x and operacion='aprobacion' and creado_en = now()) like 'Cumple%', '');
  perform pg_temp.yo(ad);
  perform pg_temp.reg('E10 Cada evento dice quien (nombre, rol, codigo) y la ficha tecnica sale de los metadatos ISO',
    (select count(*) from api.bitacora_operativa where recurso_id=capa_x and creado_en = now() and actor_nombre is not null and rol is not null
        and codigo_usuario is not null and ficha_tecnica ? 'fuente' and (ficha_tecnica->>'fuente') <> 'No especificada') = 5, '');
  perform pg_temp.yo(ad);
  perform pg_temp.reg('E11 Cada cuenta tiene un codigo estable (CAP-nnn, ADM-nnn)',
    (select codigo_usuario from api.bitacora_operativa where actor_id_usuario=ca limit 1) ~ '^CAP-[0-9]{3}$'
    and (select codigo_usuario from api.bitacora_operativa where actor_id_usuario=ad limit 1) ~ '^ADM-[0-9]{3}$'
    and (select codigo_usuario from api.bitacora_operativa where actor_id_usuario=ca limit 1)
        = (select codigo_usuario from api.bitacora_operativa where actor_id_usuario=ca order by creado_en desc limit 1), '');

  ---------------------------------------------------------------- QUIEN VE QUE (RLS)
  perform pg_temp.yo(ca);
  perform pg_temp.reg('E12 Capturista A ve los 5 eventos de la capa que toco, con el rechazo y su motivo',
    pg_temp.cuenta($q$select 1 from api.bitacora_operativa where recurso_id='DTp01' and creado_en = now()$q$) = 5
    and (select comentario_admin from api.bitacora_operativa where recurso_id='DTp01' and operacion='rechazo' and creado_en = now()) like 'Falta la columna%'
    and pg_temp.cuenta($q$select 1 from api.bitacora_operativa where recurso_id <> 'DTp01' and actor_id_usuario <> '00000000-0000-0000-0000-00000000c0a1'$q$) = 0, '');
  perform pg_temp.yo(ca);
  perform pg_temp.reg('E13 Capturista A ve los dictamenes (rechazar y validar) sobre lo suyo',
    pg_temp.cuenta($q$select 1 from api.dictamen where objeto_id='DTp01' and fecha = now()$q$) = 2, '');
  perform pg_temp.yo(cb);
  perform pg_temp.reg('E14 Capturista B (no toco la capa) no ve eventos ni dictamenes de otras personas',
    pg_temp.cuenta($q$select 1 from api.bitacora_operativa$q$) = 0 and pg_temp.cuenta($q$select 1 from api.dictamen$q$) = 0, '');
  perform pg_temp.yo(au);
  perform pg_temp.reg('E15 Auditor ve todo (5 eventos de la capa)',
    pg_temp.cuenta($q$select 1 from api.bitacora_operativa where recurso_id='DTp01' and creado_en = now()$q$) = 5, '');
  perform pg_temp.yo(ti);
  perform pg_temp.reg('E16 Titular ve todo (5 eventos de la capa)',
    pg_temp.cuenta($q$select 1 from api.bitacora_operativa where recurso_id='DTp01' and creado_en = now()$q$) = 5, '');
  perform pg_temp.anonimo();
  perform pg_temp.reg('E17 El ciudadano (anon) no ve la bitacora: la vista le niega el acceso',
    pg_temp.cuenta($q$select 1 from api.bitacora_operativa$q$) = -1 and pg_temp.cuenta($q$select 1 from api.bitacora_cambio$q$) = -1, '');
  perform pg_temp.yo(ca);
  perform pg_temp.reg('E18 Nadie escribe la bitacora por la API (INSERT directo bloqueado)',
    pg_temp.intenta($q$insert into core.bitacora_cambio (tabla_afectada,id_registro,accion,datos_nuevos) values ('capa','x','INSERT','{}')$q$) like '42501%', '');

  ---------------------------------------------------------------- COMPUERTAS D-16 / D-17 SIGUEN FIRMES
  -- Un administrador (no titular) no publica instrumentos: el trigger exigir_titular manda y no queda evento
  perform pg_temp.sin_identidad();
  update core.instrumento_origen set publicado = false, publicado_en = null where id = 'Eemsv01';   -- sin sesion: pasa (sistema)
  perform pg_temp.actua(ad);
  select count(*) into n from core.bitacora_cambio where tabla_afectada='instrumento_origen' and accion='CAMBIO_ESTADO' and id_usuario=ad;
  r := pg_temp.intenta($q$update core.instrumento_origen set publicado = true, publicado_en = now() where id = 'Eemsv01'$q$);
  perform pg_temp.reg('E19 Un administrador (no titular) no puede publicar un instrumento aunque la funcion sea del dueno (D-16)',
    r like '42501%', r);
  perform pg_temp.actua(ti);
  update core.instrumento_origen set publicado = true, publicado_en = now() where id = 'Eemsv01';
  perform pg_temp.reg('E20 El Titular publica el instrumento y queda registrado como publicacion con su nombre',
    (select count(*) from core.bitacora_cambio where tabla_afectada='instrumento_origen' and id_registro='Eemsv01'
        and accion='CAMBIO_ESTADO' and id_usuario=ti and datos_nuevos->>'publicado'='true') = 1, '');
  perform pg_temp.yo(ti);
  perform pg_temp.reg('E21 La vista lo muestra como instrumento / publicacion / vigente_publico',
    (select count(*) from api.bitacora_operativa where recurso_id='Eemsv01' and tipo='instrumento'
        and operacion='publicacion' and estatus='vigente_publico' and rol='administrador_titular' and creado_en = now()) = 1, '');

  -- D-17: una capa sin metadato completo no pasa a vigente_admin, y el intento no deja evento
  perform pg_temp.actua(ad);
  select count(*) into n from core.bitacora_cambio;
  r := pg_temp.intenta($q$update core.capa set estatus='vigente_admin' where id = (select id from core.capa where estatus='borrador' limit 1)$q$);
  perform pg_temp.reg('E22 La compuerta D-17 sigue rechazando (23514) y el intento fallido no deja evento',
    r like '23514%' and (select count(*) from core.bitacora_cambio) = n, r);

  ---------------------------------------------------------------- OTRAS TABLAS DE CONTROL
  perform pg_temp.actua(ti);
  insert into core.periodo (anio, etiqueta, tipo_periodo) values (2031, 'PRUEBA-C5', 'anual');
  update core.indicador set estatus_aprobado = estatus_aprobado where id = (select id from core.indicador where estatus_aprobado limit 1);
  perform pg_temp.reg('E23 Alta de periodo auditada (INSERT con identidad); UPDATE sin cambios no deja huella',
    (select count(*) from core.bitacora_cambio where tabla_afectada='periodo' and accion='INSERT' and id_usuario=ti) = 1
    and (select count(*) from core.bitacora_cambio where tabla_afectada='indicador' and fecha = now()) = 0, '');
  perform pg_temp.actua(ti);
  update core.indicador set estatus_aprobado = false where id = (select id from core.indicador where estatus_aprobado limit 1);
  perform pg_temp.reg('E24 Quitar la aprobacion de un indicador es CAMBIO_ESTADO',
    (select count(*) from core.bitacora_cambio where tabla_afectada='indicador' and accion='CAMBIO_ESTADO' and fecha = now()
        and datos_previos->>'estatus_aprobado'='true' and datos_nuevos->>'estatus_aprobado'='false') = 1, '');

  ---------------------------------------------------------------- IP DE ORIGEN Y SISTEMA
  perform pg_temp.actua(ad);
  perform set_config('request.headers', '{"x-forwarded-for":"201.131.4.7, 10.0.0.1"}', true);
  update core.capa set proposito = coalesce(proposito,'') || ' (ip)' where id = capa_x;
  perform pg_temp.reg('E25 La IP de origen sale del encabezado x-forwarded-for (primer salto)',
    coalesce((select host(ip_origen) from core.bitacora_cambio where tabla_afectada='capa' and id_registro=capa_x
               and datos_nuevos->>'proposito' like '%(ip)' limit 1) = '201.131.4.7', false), '');
  perform pg_temp.sin_identidad();
  update core.capa set proposito = coalesce(proposito,'') || ' (sistema)' where id = capa_x;
  perform pg_temp.reg('E26 Un cambio sin sesion (migracion, carga) queda como sistema: id_usuario nulo',
    coalesce((select id_usuario is null from core.bitacora_cambio where tabla_afectada='capa' and id_registro=capa_x
               and datos_nuevos->>'proposito' like '%(sistema)' limit 1), false), '');
  perform set_config('app.actor_id', ca::text, true);
  update core.capa set proposito = coalesce(proposito,'') || ' (servicio)' where id = capa_x;
  perform pg_temp.reg('E27 El servicio de procesos se identifica con app.actor_id (convencion del Ciclo 1)',
    coalesce((select id_usuario = ca from core.bitacora_cambio where tabla_afectada='capa' and id_registro=capa_x
               and datos_nuevos->>'proposito' like '%(servicio)' limit 1), false), '');
  perform set_config('app.actor_id', '', true);
end $$;

select n, case when ok then 'PASA' else 'FALLA' end as resultado, caso, detalle from resultados order by n;
select count(*) filter (where ok) as pasan, count(*) filter (where not ok) as fallan from resultados;
do $$ begin
  if exists (select 1 from resultados where not ok) then raise exception 'Hay pruebas del Ciclo 5 que fallan'; end if;
end $$;
rollback;
