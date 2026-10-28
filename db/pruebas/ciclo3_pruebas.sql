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
  insert into resultados(caso, ok, detalle) values (c, ok, d);
end $$;
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

  perform pg_temp.anonimo(); n := pg_temp.cuenta('select 1 from api.indicador');
  perform pg_temp.reg('C22 Sin sesion (anon) no lee nada de la API', n = -1, 'consulta rechazada');
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
end $$;

select n, case when ok then 'PASA' else 'FALLA' end as resultado, caso, left(detalle, 90) as detalle from resultados order by n;
select count(*) filter (where ok) as pasan, count(*) filter (where not ok) as fallan from resultados;
rollback;
