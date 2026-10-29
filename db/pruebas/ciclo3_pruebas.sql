-- Ciclo 3 -- Pruebas del modelo de datos v2.2 contra la base REAL (no contra papel).
-- Cada caso intenta algo desde la identidad de un perfil y verifica que la base responda como
-- debe: aceptar lo valido y RECHAZAR lo que viola una regla. Todo corre dentro de una
-- transaccion que termina en ROLLBACK: no deja huella en la base.
--
-- Uso:  psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f db/pruebas/ciclo3_pruebas.sql
\set ON_ERROR_STOP on
\pset format aligned
\pset border 2
begin;

create temp table resultados (n serial, caso text, ok boolean, detalle text);

-- identidad: actua como la cuenta u (rol de base `authenticated`, claim sub = u)
create function pg_temp.yo(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(u::text, ''), true);
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
create function pg_temp.anonimo() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);   -- el auth.uid() real de Supabase tambien lee este claim
  execute 'set local role anon';
end $$;
-- ejecuta sql y devuelve 'OK' o el mensaje de error (subtransaccion: el error no aborta la prueba)
create function pg_temp.intenta(q text) returns text language plpgsql as $$
begin execute q; return 'OK'; exception when others then return sqlstate || ': ' || sqlerrm; end $$;
create function pg_temp.cuenta(q text) returns bigint language plpgsql as $$
declare n bigint; begin
  begin execute 'select count(*) from (' || q || ') x' into n; exception when others then return -1; end; return n; end $$;
create function pg_temp.reg(c text, ok boolean, d text) returns void language plpgsql as $$
begin
  execute 'reset role';
  -- volver a ser el dueno = sin identidad: el auth.uid() real de Supabase lee claim.sub Y claims->>sub
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  insert into resultados(caso, ok, detalle) values (c, ok, d);
end $$;
-- cuenta filas como anon y vuelve a ser dueno (reg() tambien reinicia el rol)
create function pg_temp.cuenta_anon(q text) returns bigint language plpgsql as $$
declare n bigint; begin
  perform pg_temp.anonimo(); n := pg_temp.cuenta(q); execute 'reset role'; return n; end $$;
grant all on pg_temp.resultados to public;

-- ---------------------------------------------------------------- cuentas de prueba (como dueno)
insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-00000000c0a1', 'cap.a@prueba.mx'),
 ('00000000-0000-0000-0000-00000000c0b2', 'cap.b@prueba.mx'),
 ('00000000-0000-0000-0000-0000000000ad', 'adm@prueba.mx'),
 ('00000000-0000-0000-0000-0000000000a7', 'tit@prueba.mx'),
 ('00000000-0000-0000-0000-0000000000a0', 'aud@prueba.mx');
insert into core.perfil (id_usuario, nombre, rol) values
 ('00000000-0000-0000-0000-00000000c0a1', 'Capturista A', 'capturista'),
 ('00000000-0000-0000-0000-00000000c0b2', 'Capturista B', 'capturista'),
 ('00000000-0000-0000-0000-0000000000ad', 'Administrador',  'administrador'),
 ('00000000-0000-0000-0000-0000000000a7', 'Titular',        'administrador_titular'),
 ('00000000-0000-0000-0000-0000000000a0', 'Auditor',        'auditor');
insert into core.periodo (anio, etiqueta, tipo_periodo) values (2026, 'PRUEBA-2026', 'anual');

do $$
declare
  ca uuid := '00000000-0000-0000-0000-00000000c0a1'; cb uuid := '00000000-0000-0000-0000-00000000c0b2';
  ad uuid := '00000000-0000-0000-0000-0000000000ad'; ti uuid := '00000000-0000-0000-0000-0000000000a7';
  au uuid := '00000000-0000-0000-0000-0000000000a0';
  per int; m1 uuid; m2 uuid; m3 uuid; r text; n bigint; t text; t2 text; v_ok boolean;
begin
  select id into per from core.periodo where etiqueta = 'PRUEBA-2026';

  ------------------------------------------------------------------ CARGA OFICIAL
  perform pg_temp.reg('C01 Carga oficial: 113 indicadores, 5 ejes, 31 sectores, 17 fuentes, 6 instrumentos',
    (select count(*) from core.indicador) = 113 and (select count(*) from core.eje_tematico) = 5
    and (select count(*) from core.sector) = 31 and (select count(*) from core.fuente_informacion) = 17
    and (select count(*) from core.instrumento_origen) = 6,
    (select count(*) from core.indicador) || ' indicadores');
  perform pg_temp.reg('C02 Territorio: 2,785 unidades (13 municipios + 2,772 localidades)',
    (select count(*) from core.unidad_territorial) = 2785 and (select count(*) from core.unidad_territorial where nivel='municipio') = 13, '');
  perform pg_temp.reg('C03 Matriz PIMUS 135, vinculos indicador-instrumento 205, indicador-eje 127, capa 87, capa-indicador 1030',
    (select count(*) from core.matriz_instrumento) = 135 and (select count(*) from core.indicador_instrumento) = 205
    and (select count(*) from core.indicador_eje) = 127 and (select count(*) from core.capa) = 87
    and (select count(*) from core.capa_indicador) = 1030, '');

  ------------------------------------------------------------------ COMPUERTAS (reglas en la base)
  update core.indicador set estatus_aprobado = false where id = 'Ee07';
  r := pg_temp.intenta($q$update core.indicador set estatus_aprobado = true where id = 'Ee07'$q$);
  perform pg_temp.reg('C04 Compuerta: un indicador sin tendencia ni meta con cifra NO se puede aprobar',
    r like '23514%' and r like '%compuerta%', r);
  r := pg_temp.intenta($q$update core.indicador set tendencia = 'Ascendente', estatus_aprobado = true where id = 'Ee07'$q$);
  perform pg_temp.reg('C05 Compuerta: con tendencia si se aprueba', r = 'OK', r);

  r := pg_temp.intenta($q$insert into core.medicion_indicador (id_indicador,id_unidad,id_periodo,usuario_captura,valor)
        values ('Ee09','04002',$q$ || per || $q$,'00000000-0000-0000-0000-00000000c0a1',5)$q$);
  perform pg_temp.reg('C06 No se captura sobre un indicador no aprobado', r like '23514%' and r like '%no admite mediciones%', r);

  insert into core.medicion_indicador (id, id_indicador,id_unidad,id_periodo,usuario_captura,valor,estado)
    values (gen_random_uuid(), 'Im29','04002',per,ca,10,'borrador') returning id into m1;
  insert into core.medicion_indicador (id_indicador,id_unidad,id_periodo,usuario_captura,valor,estado)
    values ('Im29','04003',per,cb,20,'revision') returning id into m2;
  perform pg_temp.reg('C07 Se captura sobre indicador aprobado (Im29)', m1 is not null and m2 is not null, '');

  r := pg_temp.intenta(format($q$update core.medicion_indicador set estado='vigente_admin', usuario_validacion=%L, fecha_validacion=now() where id=%L$q$, ca, m1));
  perform pg_temp.reg('C08 Cuatro ojos: quien captura no puede validar su propia medicion', r like '23514%' and r like '%cuatro_ojos%', r);
  r := pg_temp.intenta(format($q$update core.medicion_indicador set estado='vigente_admin' where id=%L$q$, m1));
  perform pg_temp.reg('C09 Sin firma ni fecha de validacion no hay estado vigente', r like '23514%' and r like '%firma_validacion%', r);

  insert into core.medicion_indicador (id_indicador,id_unidad,id_periodo,usuario_captura,usuario_validacion,fecha_validacion,valor,estado)
    values ('Im30','04003',per,cb,ad,now(),30,'vigente_publico') returning id into m3;
  insert into core.evidencia_medicion (id_medicion,id_usuario,url_archivo,tipo_documento,hash_archivo)
    values (m3, cb, 'oficio-001.pdf', 'Oficio', repeat('a',64));
  insert into core.evidencia_medicion (id_medicion,id_usuario,url_archivo,tipo_documento,hash_archivo)
    values (m2, cb, 'oficio-002.pdf', 'Oficio', repeat('b',64));

  r := pg_temp.intenta($q$insert into core.evidencia_medicion (id_medicion,id_usuario,url_archivo,tipo_documento,hash_archivo)
        select id, usuario_captura, 'x.pdf','Oficio','no-es-sha256' from core.medicion_indicador limit 1$q$);
  perform pg_temp.reg('C10 Evidencia: la huella debe ser SHA-256 de 64 hex', r like '23514%', r);
  r := pg_temp.intenta($q$insert into core.evidencia_medicion (id_medicion,id_usuario,url_archivo,tipo_documento,hash_archivo)
        select id, usuario_captura, 'copia.pdf','Oficio',repeat('a',64) from core.medicion_indicador limit 1$q$);
  perform pg_temp.reg('C11 Evidencia: no se acepta el mismo archivo dos veces (hash unico)', r like '23505%', r);

  r := pg_temp.intenta(format($q$insert into core.dictamen (objeto_tipo,objeto_id,decision,id_usuario) values ('medicion',%L,'rechazar',%L)$q$, m2, ad));
  perform pg_temp.reg('C12 Rechazar sin comentario no se puede', r like '23514%' and r like '%rechazo_con_comentario%', r);
  r := pg_temp.intenta(format($q$insert into core.dictamen (objeto_tipo,objeto_id,decision,comentario,id_usuario) values ('medicion',%L,'rechazar','Falta soporte',%L)$q$, m2, ad));
  perform pg_temp.reg('C13 Rechazar con comentario si', r = 'OK', r);

  select id into t from core.capa where estatus = 'vigente_publico' limit 1;
  r := pg_temp.intenta(format($q$update core.capa set metadatos_extra = metadatos_extra - 'linaje' where id = %L$q$, t));
  perform pg_temp.reg('C14 Una capa publica no puede quedarse sin linaje', r like '23514%' and r like '%compuerta_publicacion%', r);

  r := pg_temp.intenta($q$insert into core.unidad_territorial (id,id_padre,nivel,cve_mun,nom_mun,cve_loc,nom_loc,pob_tot,cvegeo)
        values ('040019999','04001','localidad','001','Calkini','0001','Mal','1','040019999')$q$);
  perform pg_temp.reg('C15 Territorio: la CVEGEO de una localidad debe terminar en su cve_loc', r like '23514%', r);

  ------------------------------------------------------------------ VISIBILIDAD POR PERFIL (RLS)
  perform pg_temp.yo(ca); n := pg_temp.cuenta('select 1 from api.medicion_indicador');
  perform pg_temp.reg('C16 Capturista A ve sus mediciones + lo publico (2: su borrador y la publica de B)', n = 2, n::text);
  perform pg_temp.yo(cb); n := pg_temp.cuenta('select 1 from api.medicion_indicador');
  perform pg_temp.reg('C17 Capturista B ve las suyas (2: revision y publica); NO el borrador de A', n = 2, n::text);
  perform pg_temp.yo(ad); n := pg_temp.cuenta('select 1 from api.medicion_indicador');
  perform pg_temp.reg('C18 Administrador ve todo menos borradores ajenos (2)', n = 2, n::text);
  perform pg_temp.yo(au); n := pg_temp.cuenta('select 1 from api.medicion_indicador');
  perform pg_temp.reg('C19 Auditor ve todo (3)', n = 3, n::text);
  perform pg_temp.yo(ca); n := pg_temp.cuenta(format('select 1 from api.evidencia_medicion where id_medicion = %L', m2));
  perform pg_temp.reg('C20 Capturista A NO ve la evidencia de una medicion ajena en revision', n = 0, n::text);
  perform pg_temp.yo(ca); n := pg_temp.cuenta(format('select 1 from api.evidencia_medicion where id_medicion = %L', m3));
  perform pg_temp.reg('C21 Capturista A si ve la evidencia de una medicion ya publica', n = 1, n::text);

  perform pg_temp.anonimo();
  perform pg_temp.reg('C22 Sin sesion (anon) NO lee lo privado: perfil, bitacora, invitacion, evidencia, dictamen, hallazgo, versiones de capa, diccionario',
    (select bool_and(pg_temp.cuenta('select 1 from ' || x) = -1) from unnest(array[
      'api.perfil','api.bitacora_cambio','core.invitacion','api.evidencia_medicion','api.dictamen',
      'api.hallazgo_auditoria','api.capa_version','api.diccionario','api.medicion_indicador','api.umbral_semaforo','core.perfil']) x),
    'todas rechazadas');
  perform pg_temp.yo(ca); n := pg_temp.cuenta('select 1 from api.indicador');
  perform pg_temp.reg('C23 Una cuenta activa lee el catalogo (113 indicadores)', n = 113, n::text);
  perform pg_temp.yo(ca); n := pg_temp.cuenta('select 1 from legado.indicador');
  perform pg_temp.reg('C24 El modelo anterior (legado) es inaccesible desde la API', n = -1, 'consulta rechazada');

  ------------------------------------------------------------------ NADIE ESCRIBE DIRECTO
  v_ok := true; t := '';
  foreach r in array array['indicador','medicion_indicador','capa','unidad_territorial','evidencia_medicion','dictamen',
                           'bitacora_cambio','eje_tematico','instrumento_origen','umbral_semaforo','hallazgo_auditoria'] loop
    perform pg_temp.yo(ti);   -- incluso el Administrador Titular
    if pg_temp.intenta(format('delete from core.%I', r)) not like '42501%' then v_ok := false; t := t || r || ' '; end if;
    select attname into t2 from pg_attribute where attrelid = ('core.' || r)::regclass and attnum > 0
       and not attisdropped and attidentity = '' and attgenerated = '' order by attnum limit 1;
    if pg_temp.intenta(format('update core.%I set %I = %I', r, t2, t2)) not like '42501%' then
      v_ok := false; t := t || r || '(upd) ';
    end if;
  end loop;
  perform pg_temp.reg('C25 Ningun perfil (ni el Titular) escribe directo en el nucleo: 11 tablas, DELETE y UPDATE negados', v_ok, coalesce(nullif(t,''), 'todas negadas'));

  ------------------------------------------------------------------ BITACORA SOLO INSERCION
  insert into core.bitacora_cambio (id_usuario, tabla_afectada, id_registro, accion, datos_nuevos)
    values (ad, 'indicador', 'Im29', 'INSERT', '{"x":1}');
  r := pg_temp.intenta($q$update core.bitacora_cambio set tabla_afectada = 'otra'$q$);
  perform pg_temp.reg('C26 La bitacora no admite UPDATE (ni siquiera del dueno)', r like '42501%' and r like '%solo insercion%', r);
  r := pg_temp.intenta($q$delete from core.bitacora_cambio$q$);
  perform pg_temp.reg('C27 La bitacora no admite DELETE', r like '42501%' and r like '%solo insercion%', r);
  r := pg_temp.intenta($q$truncate core.bitacora_cambio$q$);
  perform pg_temp.reg('C28 La bitacora no admite TRUNCATE', r like '42501%' and r like '%solo insercion%', r);
  r := pg_temp.intenta($q$insert into core.bitacora_cambio (tabla_afectada,id_registro,accion,datos_nuevos,datos_previos) values ('t','1','INSERT','{}','{}')$q$);
  perform pg_temp.reg('C29 Una bitacora INSERT no puede traer fotografia previa (coherencia)', r like '23514%', r);
  perform pg_temp.yo(cb); n := pg_temp.cuenta('select 1 from api.bitacora_cambio');
  perform pg_temp.reg('C30 Un Capturista no lee la bitacora general', n = 0, n::text);
  perform pg_temp.yo(au); n := pg_temp.cuenta('select 1 from api.bitacora_cambio');
  perform pg_temp.reg('C31 El Auditor si la lee', n >= 1, n::text);

  ------------------------------------------------------------------ INVITACION LATENTE
  insert into core.invitacion (token_hash, rol, correo_destino, id_usuario_emisor, expira_en)
    values (repeat('c',64), 'capturista', 'nuevo@prueba.mx', ti, now() + interval '2 days');
  perform pg_temp.yo(ti); n := pg_temp.cuenta('select 1 from core.invitacion');
  perform pg_temp.yo(ad); t := pg_temp.cuenta('select 1 from core.invitacion')::text;
  perform pg_temp.reg('C32 Invitaciones: solo el Titular las ve (Titular 1, Administrador 0) y la API no las expone', n = 1 and t = '0'
     and to_regclass('api.invitacion') is null, n || '/' || t);

  ------------------------------------------------------------------ BAJA LOGICA CORTA EL ACCESO
  update core.perfil set activo = false where id_usuario = cb;
  perform pg_temp.yo(cb); n := pg_temp.cuenta('select 1 from api.indicador');
  perform pg_temp.reg('C34 Una cuenta dada de baja deja de leer el catalogo (0 filas)', n = 0, n::text);

  ------------------------------------------------------------------ DOCUMENTACION VIVA
  perform pg_temp.yo(au); n := pg_temp.cuenta('select 1 from api.diccionario');
  perform pg_temp.reg('C35 api.diccionario se lee con sesion y describe todos los campos', n > 200 and
    (select count(*) from api.diccionario where descripcion is null) = 0, n || ' campos');
  perform pg_temp.reg('C36 api.relaciones lista las llaves foraneas del modelo', (select count(*) from api.relaciones) >= 30,
    (select count(*) from api.relaciones)::text);
  perform pg_temp.reg('C37 core.verificar_integridad(): todos los chequeos en verde',
    not exists (select 1 from core.verificar_integridad() v where not v.ok), '');
  perform pg_temp.reg('C38 24 tablas del modelo + control de migraciones = 25 en core', (select count(*) from pg_class c join pg_namespace s on s.oid=c.relnamespace
        where s.nspname='core' and c.relkind='r') = 25, (select count(*) from pg_class c join pg_namespace s on s.oid=c.relnamespace
        where s.nspname='core' and c.relkind='r')::text);
  ------------------------------------------------------------------ LECTURA PUBLICA (anon) Y D-16
  execute 'reset role';
  insert into core.medicion_indicador (id_indicador, id_unidad, id_periodo, usuario_captura, valor, estado) values
    ('Im30', '04011', per, ca, 1, 'borrador'), ('Im30', '04012', per, ca, 2, 'revision');
  insert into core.medicion_indicador (id_indicador, id_unidad, id_periodo, usuario_captura, usuario_validacion, fecha_validacion, valor, estado)
    values ('Im30', '04013', per, ca, ad, now(), 3, 'vigente_publico');

  perform pg_temp.reg('C39 anon lee territorio y catalogos base (2,785 unidades, 5 ejes, 31 sectores, 17 fuentes)',
    pg_temp.cuenta_anon('select 1 from api.unidad_territorial') = 2785 and pg_temp.cuenta_anon('select 1 from api.eje_tematico') = 5
    and pg_temp.cuenta_anon('select 1 from api.sector') = 31 and pg_temp.cuenta_anon('select 1 from api.fuente_informacion') = 17, '');
  n := pg_temp.cuenta_anon('select 1 from api.indicador');
  perform pg_temp.reg('C40 anon ve el catalogo completo de indicadores activos (113); la aprobacion es un dato, no un filtro (E-6)',
    n = (select count(*) from core.indicador where activo) and n = 113, n || ' de 113');
  perform pg_temp.reg('C41 anon ve solo capas vigente_publico (66) y ninguna en borrador',
    pg_temp.cuenta_anon('select 1 from api.capa') = 66 and pg_temp.cuenta_anon('select 1 from api.capa where estatus <> ''vigente_publico''') = 0,
    pg_temp.cuenta_anon('select 1 from api.capa')::text);
  n := pg_temp.cuenta_anon('select 1 from api.capa_indicador');
  perform pg_temp.reg('C42 anon ve capa-indicador solo de capas publicas (con indicadores activos)',
    n = (select count(*) from core.capa_indicador ci join core.capa c on c.id = ci.id_capa and c.estatus = 'vigente_publico'
         join core.indicador i on i.id = ci.id_indicador and i.activo) and n > 0, n::text);
  perform pg_temp.reg('C43 anon ve la medicion publicada y NO el borrador ni la que esta en revision',
    pg_temp.cuenta_anon('select 1 from api.medicion_publica where id_unidad = ''04013''') = 1
    and pg_temp.cuenta_anon('select 1 from api.medicion_publica where id_unidad in (''04011'',''04012'')') = 0
    and pg_temp.cuenta_anon('select 1 from api.medicion_publica where estado <> ''vigente_publico''') = 0, '');
  perform pg_temp.reg('C44 anon NO puede leer quien capturo ni quien valido (columnas de usuario)',
    pg_temp.cuenta_anon('select usuario_captura from core.medicion_indicador') = -1
    and pg_temp.cuenta_anon('select usuario_validacion from core.medicion_indicador') = -1
    and pg_temp.cuenta_anon('select 1 from api.medicion_indicador') = -1
    and pg_temp.cuenta_anon('select id_usuario from core.umbral_semaforo') = -1, 'columnas rechazadas');
  perform pg_temp.reg('C45 api.medicion_publica y api.umbral_publico no exponen columnas de usuario',
    not exists (select 1 from information_schema.columns where table_schema = 'api'
                and table_name in ('medicion_publica','umbral_publico') and column_name like '%usuario%'), '');
  perform pg_temp.anonimo();
  t := pg_temp.intenta('insert into core.medicion_indicador (id_indicador,id_unidad,id_periodo,usuario_captura,valor) values (''Im29'',''04004'',1,''00000000-0000-0000-0000-00000000c0a1'',1)');
  t2 := pg_temp.intenta('update core.indicador set nombre = nombre');
  r := pg_temp.intenta('delete from core.capa');
  perform pg_temp.reg('C46 anon no escribe: INSERT, UPDATE y DELETE rechazados', t <> 'OK' and t2 <> 'OK' and r <> 'OK', left(t, 60));
  n := pg_temp.cuenta_anon('select 1 from api.instrumento_origen');
  update core.instrumento_origen set publicado = false where id = (select min(id) from core.instrumento_origen);
  perform pg_temp.reg('C47 anon ve los instrumentos publicados (6) y deja de ver el que se despublica (5)',
    n = 6 and pg_temp.cuenta_anon('select 1 from api.instrumento_origen') = 5, n || ' -> ' || pg_temp.cuenta_anon('select 1 from api.instrumento_origen'));
  perform pg_temp.reg('C48 anon lee la matriz solo de instrumentos publicados',
    pg_temp.cuenta_anon('select 1 from api.matriz_instrumento') = (select count(*) from core.matriz_instrumento m join core.instrumento_origen i on i.id = m.id_instrumento and i.publicado), '');

  -- D-16: se concede a `authenticated` escritura TEMPORAL (esta transaccion termina en ROLLBACK) con una
  -- politica abierta para demostrar que el TRIGGER del modelo es el que frena a los demas perfiles.
  execute 'reset role';
  grant insert, update, delete on core.umbral_semaforo to authenticated;
  grant update on core.instrumento_origen to authenticated;
  create policy tmp_d16_umbral on core.umbral_semaforo for all to authenticated using (true) with check (true);
  create policy tmp_d16_instr on core.instrumento_origen for update to authenticated using (true) with check (true);

  perform pg_temp.yo(ad);
  t := pg_temp.intenta('insert into core.umbral_semaforo (id_indicador, verde_desde, amarillo_desde) values (''Im30'', 95, 80)');
  perform pg_temp.reg('C49 D-16: el Administrador NO crea umbrales', t like '42501:%Titular%', t);
  perform pg_temp.yo(au);
  t := pg_temp.intenta('insert into core.umbral_semaforo (id_indicador, verde_desde, amarillo_desde) values (''Im30'', 95, 80)');
  perform pg_temp.yo(ca);
  t2 := pg_temp.intenta('insert into core.umbral_semaforo (id_indicador, verde_desde, amarillo_desde) values (''Im30'', 95, 80)');
  perform pg_temp.reg('C50 D-16: ni el Auditor ni el Capturista crean umbrales', t like '42501:%Titular%' and t2 like '42501:%Titular%', left(t, 40));
  perform pg_temp.yo(ti);
  t := pg_temp.intenta('insert into core.umbral_semaforo (id_indicador, verde_desde, amarillo_desde) values (''Im30'', 95, 80)');
  perform pg_temp.reg('C51 D-16: el Administrador Titular SI crea umbrales', t = 'OK', t);
  perform pg_temp.yo(ad);
  t := pg_temp.intenta('update core.umbral_semaforo set verde_desde = 99 where id_indicador = ''Im30''');
  t2 := pg_temp.intenta('delete from core.umbral_semaforo where id_indicador = ''Im30''');
  perform pg_temp.reg('C52 D-16: el Administrador NO edita ni borra umbrales', t like '42501:%Titular%' and t2 like '42501:%Titular%', left(t, 40));
  perform pg_temp.yo(ad);
  t := pg_temp.intenta('update core.instrumento_origen set publicado = true, publicado_en = now() where publicado = false');
  perform pg_temp.reg('C53 D-16: el Administrador NO publica instrumentos', t like '42501:%Titular%', t);
  perform pg_temp.yo(ti);
  t := pg_temp.intenta('update core.instrumento_origen set publicado = true, publicado_en = now() where publicado = false');
  perform pg_temp.reg('C54 D-16: el Administrador Titular SI publica instrumentos', t = 'OK', t);
  perform pg_temp.yo(ad);
  t := pg_temp.intenta('update core.instrumento_origen set competencia = competencia');
  perform pg_temp.reg('C55 D-16: otros cambios al instrumento no exigen Titular (solo "publicado")', t = 'OK', t);
  perform pg_temp.reg('C56 api.instrumento_origen expone la columna publicado',
    exists (select 1 from information_schema.columns where table_schema = 'api' and table_name = 'instrumento_origen' and column_name = 'publicado'), '');
  ------------------------------------------------------------------ D-17: ESTATUS DE CAPAS
  execute 'reset role';
  perform pg_temp.reg('C57 Capas: 66 vigente_publico, 9 vigente_admin (internas) y 12 borrador (sin linaje)',
    (select count(*) from core.capa where estatus = 'vigente_publico') = 66
    and (select count(*) from core.capa where estatus = 'vigente_admin') = 9
    and (select count(*) from core.capa where estatus = 'borrador') = 12, '');
  perform pg_temp.reg('C58 Ninguna capa publica es interna y toda capa vigente tiene su metadato minimo',
    not exists (select 1 from core.capa where estatus = 'vigente_publico' and metadatos_extra->>'restriccion_uso' <> 'pública')
    and not exists (select 1 from core.capa where estatus in ('vigente_admin','vigente_publico') and btrim(coalesce(metadatos_extra->>'linaje','')) = ''), '');
  perform pg_temp.reg('C59 anon ve 66 capas: ninguna vigente_admin ni borrador',
    pg_temp.cuenta_anon('select 1 from api.capa') = 66 and pg_temp.cuenta_anon('select 1 from api.capa where estatus <> ''vigente_publico''') = 0, '');
  perform pg_temp.yo(ca); n := pg_temp.cuenta('select 1 from api.capa');
  perform pg_temp.reg('C60 Capturista ve 75 capas (66 publicas + 9 de uso interno) y ningun borrador',
    n = 75 and pg_temp.cuenta('select 1 from api.capa where estatus = ''borrador''') = 0, n::text);
  perform pg_temp.yo(ad); n := pg_temp.cuenta('select 1 from api.capa');
  perform pg_temp.yo(au);
  perform pg_temp.reg('C61 Administrador y Auditor ven las 87 capas', n = 87 and pg_temp.cuenta('select 1 from api.capa') = 87, n::text);
  perform pg_temp.yo(ca);
  perform pg_temp.reg('C62 Capturista no lee versiones de capa; capa-indicador solo de las capas que ve',
    pg_temp.cuenta('select 1 from api.capa_version') = 0
    and pg_temp.cuenta('select 1 from api.capa_indicador') = (select count(*) from core.capa_indicador ci join core.capa c on c.id = ci.id_capa and c.estatus <> 'borrador'), '');
  execute 'reset role';
  r := pg_temp.intenta('update core.capa set estatus = ''vigente_publico'' where id = ''DIt01''');
  perform pg_temp.reg('C63 Una capa de restriccion interna NO se puede publicar', r like '23514%compuerta_publicacion%', r);
  r := pg_temp.intenta('update core.capa set estatus = ''vigente_admin'' where id = ''Inf01''');
  perform pg_temp.reg('C64 Una capa sin metadato minimo NO pasa a vigente_admin', r like '23514%compuerta_validacion%', r);
  perform pg_temp.reg('C65 Las 9 capas internas dejaron su version 2 en capa_version (D-17)',
    (select count(*) from core.capa_version where version = 2 and estatus = 'vigente_admin') = 9, '');
end $$;

select n, case when ok then 'PASA' else 'FALLA' end as resultado, caso, left(detalle, 90) as detalle from resultados order by n;
select count(*) filter (where ok) as pasan, count(*) filter (where not ok) as fallan from resultados;
rollback;
