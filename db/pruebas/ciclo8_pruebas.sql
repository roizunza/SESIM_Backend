-- Ciclo 8 -- Pruebas del flujo de MEDICIONES (captura, envio, dictamen y devolucion) contra la base REAL.
-- Regla vigente: una medicion rechazada pasa a `rechazado` (no vuelve a borrador) para que el Capturista vea la alerta y el comentario.
-- Cada caso actua con la identidad de un perfil; todo corre dentro de una transaccion que termina en ROLLBACK.
-- Los archivos de evidencia se representan con filas de storage.objects (en Supabase real, el archivo subido a Storage).
--
-- Uso:  psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f db/pruebas/ciclo8_pruebas.sql
\set ON_ERROR_STOP on
\pset format aligned
\pset border 2
begin;

create temp table resultados (n serial, caso text, ok boolean, detalle text);

create function pg_temp.actua(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(u::text, ''), true);
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
end $$;
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
  insert into resultados(caso, ok, detalle) values (c, coalesce(ok, false), d);
end $$;
grant all on pg_temp.resultados to public;

insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-00000000c8a1', 'cap.a@prueba8.mx'),
 ('00000000-0000-0000-0000-00000000c8b2', 'cap.b@prueba8.mx'),
 ('00000000-0000-0000-0000-0000000008ad', 'adm@prueba8.mx'),
 ('00000000-0000-0000-0000-0000000008ae', 'adm2@prueba8.mx'),
 ('00000000-0000-0000-0000-0000000008a7', 'tit@prueba8.mx'),
 ('00000000-0000-0000-0000-0000000008a0', 'aud@prueba8.mx');
insert into core.perfil (id_usuario, nombre, rol, creado_en) values
 ('00000000-0000-0000-0000-00000000c8a1', 'Capturista A', 'capturista', '2030-01-01 10:00+00'),
 ('00000000-0000-0000-0000-00000000c8b2', 'Capturista B', 'capturista', '2030-01-01 11:00+00'),
 ('00000000-0000-0000-0000-0000000008ad', 'Administrador',  'administrador', '2030-01-01 12:00+00'),
 ('00000000-0000-0000-0000-0000000008ae', 'Administrador 2','administrador', '2030-01-01 12:30+00'),
 ('00000000-0000-0000-0000-0000000008a7', 'Titular',        'administrador_titular', '2030-01-01 13:00+00'),
 ('00000000-0000-0000-0000-0000000008a0', 'Auditor',        'auditor', '2030-01-01 14:00+00');

do $$
declare
  ca uuid := '00000000-0000-0000-0000-00000000c8a1'; cb uuid := '00000000-0000-0000-0000-00000000c8b2';
  ad uuid := '00000000-0000-0000-0000-0000000008ad'; ae uuid := '00000000-0000-0000-0000-0000000008ae';
  ti uuid := '00000000-0000-0000-0000-0000000008a7'; au uuid := '00000000-0000-0000-0000-0000000008a0';
  ind text; ind2 text; unis text[]; r text; j jsonb; m1 uuid; m2 uuid; m3 uuid; m4 uuid; m5 uuid; per int;
  h1 text := repeat('a8', 32); h2 text := repeat('b8', 32); h3 text := repeat('c8', 32); h4 text := repeat('d8', 32);
  d record;
begin
  perform pg_temp.sin_identidad();
  select id into ind  from core.indicador where estatus_aprobado and activo order by id limit 1;
  select id into ind2 from core.indicador where estatus_aprobado and activo order by id desc limit 1;
  select array_agg(id order by id) into unis from (select id from core.unidad_territorial where nivel = 'municipio' order by id limit 5) y;
  update core.indicador set linea_base = null, anio_linea_base = null where id = ind;
  update core.indicador set estatus_aprobado = false where id = ind2;

  ---------------------------------------------------------------- CAPTURA
  perform pg_temp.yo(ca);
  j := api.fn_guardar_medicion(jsonb_build_object('id_indicador', ind, 'id_unidad', unis[1], 'tipo_periodo', 'trimestral', 'anio', 2041, 'sub', 1,
         'valor', 10, 'desagregaciones', jsonb_build_object('mujeres', 4)));
  m1 := (j ->> 'id')::uuid;
  perform pg_temp.sin_identidad();
  perform pg_temp.reg('G01 El Capturista da de alta una medicion: queda en borrador y a su nombre',
    (select estado = 'borrador' and usuario_captura = ca and valor = 10 and desagregaciones ->> 'mujeres' = '4' from core.medicion_indicador where id = m1), '');
  perform pg_temp.reg('G02 El periodo trimestral se crea solo, con etiqueta y fechas',
    (select etiqueta = '2041-T1' and tipo_periodo = 'trimestral' and fecha_inicio = '2041-01-01' and fecha_fin = '2041-03-31'
       from core.periodo p join core.medicion_indicador m on m.id_periodo = p.id where m.id = m1), '');
  perform pg_temp.yo(ca);
  j := api.fn_guardar_medicion(jsonb_build_object('id_indicador', ind, 'id_unidad', unis[1], 'tipo_periodo', 'mensual', 'anio', 2040, 'sub', 2, 'valor_texto', 'Cumplida'));
  m3 := (j ->> 'id')::uuid;
  perform pg_temp.sin_identidad();
  perform pg_temp.reg('G03 Un mes bisiesto cierra el 29 de febrero y un valor cualitativo basta',
    (select etiqueta = '2040-M02' and fecha_fin = '2040-02-29' and valor is null and valor_texto = 'Cumplida'
       from core.periodo p join core.medicion_indicador m on m.id_periodo = p.id where m.id = m3), '');
  perform pg_temp.yo(ca);
  r := pg_temp.intenta(format($q$select api.fn_guardar_medicion(jsonb_build_object('id_indicador',%L,'id_unidad',%L,'tipo_periodo','trimestral','anio',2041,'sub',1,'valor',99))$q$, ind, unis[1]));
  perform pg_temp.reg('G04 Otra medicion del mismo indicador, unidad y periodo no pasa (23505)', r like '23505%', r);
  perform pg_temp.yo(ca);
  r := pg_temp.intenta(format($q$select api.fn_guardar_medicion(jsonb_build_object('id_indicador',%L,'id_unidad',%L,'tipo_periodo','anual','anio',2041))$q$, ind, unis[2]));
  perform pg_temp.reg('G05 Sin valor numerico ni cualitativo no pasa (23514)', r like '23514%', r);
  perform pg_temp.yo(ca);
  r := pg_temp.intenta(format($q$select api.fn_guardar_medicion(jsonb_build_object('id_indicador','NoExiste99','id_unidad',%L,'tipo_periodo','anual','anio',2041,'valor',1))$q$, unis[2]));
  perform pg_temp.reg('G06 Un indicador que no existe no pasa (P0002)', r like 'P0002%', r);
  perform pg_temp.yo(ca);
  r := pg_temp.intenta(format($q$select api.fn_guardar_medicion(jsonb_build_object('id_indicador',%L,'id_unidad',%L,'tipo_periodo','anual','anio',2041,'valor',1))$q$, ind2, unis[2]));
  perform pg_temp.reg('G07 Un indicador no aprobado no admite mediciones (23514)', r like '23514%', r);
  perform pg_temp.yo(ca);
  r := pg_temp.intenta(format($q$select api.fn_guardar_medicion(jsonb_build_object('id_indicador',%L,'id_unidad',%L,'tipo_periodo','anual','anio',2041,'valor',1,'estado','vigente_publico'))$q$, ind, unis[2]));
  perform pg_temp.reg('G08 Mandar un campo que no existe (estado) se rechaza en lugar de ignorarse (22023)', r like '22023%', r);
  perform pg_temp.yo(ca);
  r := pg_temp.intenta(format($q$select api.fn_guardar_medicion(jsonb_build_object('id_indicador',%L,'id_unidad',%L,'tipo_periodo','decenal','anio',2041,'valor',1))$q$, ind, unis[2]));
  perform pg_temp.reg('G09 Un tipo de periodo desconocido se rechaza (22023)', r like '22023%', r);
  perform pg_temp.yo(ca);
  r := pg_temp.intenta(format($q$select api.fn_guardar_medicion(jsonb_build_object('id_indicador',%L,'id_unidad',%L,'tipo_periodo','semestral','anio',2041,'sub',3,'valor',1))$q$, ind, unis[2]));
  perform pg_temp.reg('G10 El semestre 3 no existe (22023)', r like '22023%', r);
  perform pg_temp.yo(ca);
  r := pg_temp.intenta(format($q$select api.fn_guardar_medicion(jsonb_build_object('id_indicador',%L,'id_unidad','99999','tipo_periodo','anual','anio',2041,'valor',1))$q$, ind));
  perform pg_temp.reg('G11 Una unidad territorial que no existe no pasa (P0002)', r like 'P0002%', r);
  perform pg_temp.yo(ca);
  r := pg_temp.intenta(format($q$select api.fn_guardar_medicion(jsonb_build_object('id_indicador',%L,'id_unidad',%L,'tipo_periodo','anual','anio',2041,'valor','abc'))$q$, ind, unis[2]));
  perform pg_temp.reg('G12 Un valor que no es numero se rechaza (22023)', r like '22023%', r);
  perform pg_temp.yo(ad);
  r := pg_temp.intenta(format($q$select api.fn_guardar_medicion(jsonb_build_object('id_indicador',%L,'id_unidad',%L,'tipo_periodo','anual','anio',2041,'valor',1))$q$, ind, unis[2]));
  perform pg_temp.reg('G13 El Administrador no captura mediciones (42501)', r like '42501%', r);
  perform pg_temp.yo(au);
  r := pg_temp.intenta(format($q$select api.fn_guardar_medicion(jsonb_build_object('id_indicador',%L,'id_unidad',%L,'tipo_periodo','anual','anio',2041,'valor',1))$q$, ind, unis[2]));
  perform pg_temp.reg('G14 El Auditor no captura (42501)', r like '42501%', r);
  perform pg_temp.anonimo();
  r := pg_temp.intenta(format($q$select api.fn_guardar_medicion(jsonb_build_object('id_indicador',%L,'id_unidad',%L,'tipo_periodo','anual','anio',2041,'valor',1))$q$, ind, unis[2]));
  perform pg_temp.reg('G15 El ciudadano (anon) no ejecuta la funcion (42501)', r like '42501%', r);
  perform pg_temp.yo(cb);
  r := pg_temp.intenta(format($q$select api.fn_guardar_medicion(jsonb_build_object('id',%L,'id_indicador',%L,'id_unidad',%L,'tipo_periodo','trimestral','anio',2041,'sub',1,'valor',77))$q$, m1, ind, unis[1]));
  perform pg_temp.reg('G16 Otro Capturista no edita la medicion ajena (42501)', r like '42501%', r);
  perform pg_temp.yo(ca);
  j := api.fn_guardar_medicion(jsonb_build_object('id', m1, 'id_indicador', ind, 'id_unidad', unis[1], 'tipo_periodo', 'trimestral', 'anio', 2041, 'sub', 1, 'valor', 12));
  perform pg_temp.sin_identidad();
  perform pg_temp.reg('G17 El autor edita su borrador: cambia el valor y sigue en borrador',
    (select valor = 12 and estado = 'borrador' from core.medicion_indicador where id = m1), '');

  ---------------------------------------------------------------- ENVIO A REVISION
  perform pg_temp.yo(ca);
  r := pg_temp.intenta(format($q$select api.fn_enviar_medicion_revision(%L)$q$, m1));
  perform pg_temp.reg('E01 Sin evidencia vigente no se envia (23514)', r like '23514%', r);
  perform pg_temp.sin_identidad();
  insert into storage.objects (bucket_id, name, metadata) values ('evidencias', m1 || '/' || h1 || '.pdf', '{"size": 1000}');
  perform pg_temp.yo(ca);
  perform api.fn_registrar_evidencia(m1, 'Oficio', h1, 'application/pdf', 1000);
  perform pg_temp.yo(cb);
  r := pg_temp.intenta(format($q$select api.fn_enviar_medicion_revision(%L)$q$, m1));
  perform pg_temp.reg('E02 Otro Capturista no envia la medicion ajena (42501)', r like '42501%', r);
  perform pg_temp.yo(ad);
  r := pg_temp.intenta(format($q$select api.fn_enviar_medicion_revision(%L)$q$, m1));
  perform pg_temp.reg('E03 El Administrador no envia mediciones (42501)', r like '42501%', r);
  perform pg_temp.yo(ca);
  j := api.fn_enviar_medicion_revision(m1);
  perform pg_temp.sin_identidad();
  perform pg_temp.reg('E04 Con evidencia vigente, el autor envia: queda en revision y sin firma de validacion',
    (select estado = 'revision' and usuario_validacion is null and fecha_validacion is null from core.medicion_indicador where id = m1), '');
  perform pg_temp.reg('E05 El envio queda en la bitacora a nombre del autor (CAMBIO_ESTADO borrador -> revision)',
    (select count(*) from core.bitacora_cambio where tabla_afectada = 'medicion_indicador' and id_registro = m1::text and accion = 'CAMBIO_ESTADO'
        and id_usuario = ca and datos_previos ->> 'estado' = 'borrador' and datos_nuevos ->> 'estado' = 'revision') = 1, '');
  perform pg_temp.yo(ca);
  r := pg_temp.intenta(format($q$select api.fn_enviar_medicion_revision(%L)$q$, m1));
  perform pg_temp.reg('E06 Una medicion en revision no se reenvia (55000)', r like '55000%', r);
  perform pg_temp.yo(ca);
  r := pg_temp.intenta(format($q$select api.fn_guardar_medicion(jsonb_build_object('id',%L,'id_indicador',%L,'id_unidad',%L,'tipo_periodo','trimestral','anio',2041,'sub',1,'valor',13))$q$, m1, ind, unis[1]));
  perform pg_temp.reg('E07 Una medicion en revision ya no se edita (55000)', r like '55000%', r);

  ---------------------------------------------------------------- DICTAMEN
  perform pg_temp.yo(ca);
  r := pg_temp.intenta(format($q$select api.fn_dictaminar_medicion(%L,'validar')$q$, m1));
  perform pg_temp.reg('D01 El Capturista no dictamina (42501)', r like '42501%', r);
  perform pg_temp.yo(au);
  r := pg_temp.intenta(format($q$select api.fn_dictaminar_medicion(%L,'validar')$q$, m1));
  perform pg_temp.reg('D02 El Auditor no dictamina (42501)', r like '42501%', r);
  perform pg_temp.anonimo();
  r := pg_temp.intenta(format($q$select api.fn_dictaminar_medicion(%L,'validar')$q$, m1));
  perform pg_temp.reg('D03 El ciudadano no dictamina (42501)', r like '42501%', r);
  perform pg_temp.yo(ad);
  r := pg_temp.intenta(format($q$select api.fn_dictaminar_medicion(%L,'aprobar')$q$, m1));
  perform pg_temp.reg('D04 Una decision que no existe se rechaza (22023)', r like '22023%', r);
  perform pg_temp.yo(ad);
  r := pg_temp.intenta(format($q$select api.fn_dictaminar_medicion(%L,'publicar')$q$, m1));
  perform pg_temp.reg('D05 No se publica desde revision: primero se valida (55000)', r like '55000%', r);
  perform pg_temp.yo(ad);
  r := pg_temp.intenta(format($q$select api.fn_dictaminar_medicion(%L,'rechazar','   ')$q$, m1));
  perform pg_temp.reg('D06 Rechazar sin motivo no pasa (23514)', r like '23514%', r);
  perform pg_temp.yo(ad);
  r := pg_temp.intenta(format($q$select api.fn_dictaminar_medicion(%L,'validar')$q$, gen_random_uuid()));
  perform pg_temp.reg('D07 Dictaminar una medicion que no existe (P0002)', r like 'P0002%', r);
  perform pg_temp.yo(ad);
  j := api.fn_dictaminar_medicion(m1, 'validar', 'Cumple con la evidencia.');
  perform pg_temp.sin_identidad();
  perform pg_temp.reg('D08 El Administrador valida: vigente_admin, firmada por quien valida y con fecha',
    (select estado = 'vigente_admin' and usuario_validacion = ad and fecha_validacion is not null from core.medicion_indicador where id = m1), '');
  perform pg_temp.reg('D09 La validacion deja su dictamen (quien, de que estado a cual, comentario)',
    (select count(*) from core.dictamen where objeto_tipo = 'medicion' and objeto_id = m1::text and decision = 'validar'
        and estado_previo = 'revision' and estado_nuevo = 'vigente_admin' and id_usuario = ad and comentario = 'Cumple con la evidencia.') = 1, '');
  perform pg_temp.reg('D10 La validacion queda en la bitacora de cambios a nombre del Administrador',
    (select count(*) from core.bitacora_cambio where tabla_afectada = 'medicion_indicador' and id_registro = m1::text and accion = 'CAMBIO_ESTADO'
        and id_usuario = ad and datos_nuevos ->> 'estado' = 'vigente_admin') = 1, '');
  perform pg_temp.yo(ae);
  r := pg_temp.intenta(format($q$select api.fn_dictaminar_medicion(%L,'validar')$q$, m1));
  perform pg_temp.reg('D11 Ya validada no se valida otra vez (55000)', r like '55000%', r);

  -- cuatro ojos: una medicion cuya autora es una cuenta administradora no la dictamina esa misma cuenta
  perform pg_temp.sin_identidad();
  select id into per from core.periodo where etiqueta = '2041-T1';
  insert into core.medicion_indicador (id_indicador, id_unidad, id_periodo, usuario_captura, valor, estado)
    values (ind, unis[4], per, ad, 5, 'revision') returning id into m5;
  insert into storage.objects (bucket_id, name, metadata) values ('evidencias', m5 || '/' || h4 || '.pdf', '{"size": 1000}');
  insert into core.evidencia_medicion (id_medicion, id_usuario, url_archivo, tipo_documento, hash_archivo) values (m5, ad, 'evidencias/' || m5 || '/' || h4 || '.pdf', 'Oficio', h4);
  perform pg_temp.yo(ad);
  r := pg_temp.intenta(format($q$select api.fn_dictaminar_medicion(%L,'validar')$q$, m5));
  perform pg_temp.reg('D12 Cuatro ojos: quien capturo la medicion no la dictamina (42501)', r like '42501%', r);

  -- sin evidencia vigente no se valida (R12)
  perform pg_temp.sin_identidad();
  insert into core.medicion_indicador (id_indicador, id_unidad, id_periodo, usuario_captura, valor, estado)
    values (ind, unis[5], per, ca, 6, 'revision') returning id into m4;
  perform pg_temp.yo(ad);
  r := pg_temp.intenta(format($q$select api.fn_dictaminar_medicion(%L,'validar')$q$, m4));
  perform pg_temp.reg('D13 R12: sin evidencia vigente no se valida (23514)', r like '23514%', r);

  ---------------------------------------------------------------- RECHAZO (queda en `rechazado`, no en borrador)
  perform pg_temp.yo(ca);
  j := api.fn_guardar_medicion(jsonb_build_object('id_indicador', ind, 'id_unidad', unis[2], 'tipo_periodo', 'trimestral', 'anio', 2041, 'sub', 1, 'valor', 20));
  m2 := (j ->> 'id')::uuid;
  perform pg_temp.sin_identidad();
  insert into storage.objects (bucket_id, name, metadata) values ('evidencias', m2 || '/' || h2 || '.pdf', '{"size": 1000}');
  perform pg_temp.yo(ca);
  perform api.fn_registrar_evidencia(m2, 'Reporte', h2, 'application/pdf', 1000);
  perform api.fn_enviar_medicion_revision(m2);
  perform pg_temp.yo(ae);
  j := api.fn_dictaminar_medicion(m2, 'rechazar', 'El valor no coincide con el oficio adjunto; corrige y reenvia.');
  perform pg_temp.sin_identidad();
  perform pg_temp.reg('X01 Rechazar deja la medicion en `rechazado` (no en borrador), firmada por quien rechazo',
    (select estado = 'rechazado' and usuario_validacion = ae and fecha_validacion is not null from core.medicion_indicador where id = m2), '');
  perform pg_temp.reg('X02 El rechazo deja su dictamen con el motivo',
    (select count(*) from core.dictamen where objeto_tipo = 'medicion' and objeto_id = m2::text and decision = 'rechazar'
        and estado_previo = 'revision' and estado_nuevo = 'rechazado' and id_usuario = ae and comentario like 'El valor no coincide%') = 1, '');
  perform pg_temp.reg('X03 Rechazar una medicion no crea seguimiento de plazo (eso es de capas e instrumentos)',
    (select count(*) from core.rechazo_seguimiento where objeto_id = m2::text) = 0, '');
  perform pg_temp.yo(ca);
  perform pg_temp.reg('X04 El Capturista ve la alerta: su medicion rechazada con el motivo y quien la rechazo',
    (select count(*) from api.fn_mediciones_devueltas() v where v.id_medicion = m2 and v.motivo like 'El valor no coincide%' and v.devuelta_por = 'Administrador 2' and v.periodo = '2041-T1') = 1, '');
  perform pg_temp.reg('X05 El Capturista lee el motivo tambien en api.dictamen (RLS: es su medicion)',
    pg_temp.cuenta(format($q$select 1 from api.dictamen where objeto_tipo = 'medicion' and objeto_id = %L and decision = 'rechazar'$q$, m2::text)) = 1, '');
  perform pg_temp.yo(cb);
  perform pg_temp.reg('X06 Otro Capturista no ve la alerta de una medicion ajena',
    (select count(*) from api.fn_mediciones_devueltas() v where v.id_medicion = m2) = 0, '');
  perform pg_temp.yo(ad);
  perform pg_temp.reg('X07 La administracion ve todas las devueltas',
    (select count(*) from api.fn_mediciones_devueltas() v where v.id_medicion = m2) = 1, '');
  perform pg_temp.yo(au);
  perform pg_temp.reg('X08 El Auditor tambien las ve',
    (select count(*) from api.fn_mediciones_devueltas() v where v.id_medicion = m2) = 1, '');
  perform pg_temp.anonimo();
  r := pg_temp.intenta($q$select * from api.fn_mediciones_devueltas()$q$);
  perform pg_temp.reg('X09 El ciudadano no consulta devoluciones (42501)', r like '42501%', r);
  perform pg_temp.yo(ca);
  j := api.fn_guardar_medicion(jsonb_build_object('id', m2, 'id_indicador', ind, 'id_unidad', unis[2], 'tipo_periodo', 'trimestral', 'anio', 2041, 'sub', 1, 'valor', 21));
  perform pg_temp.sin_identidad();
  perform pg_temp.reg('X10 Corregir el valor NO quita la alerta: sigue `rechazado` hasta reenviarla',
    (select estado = 'rechazado' and valor = 21 from core.medicion_indicador where id = m2), '');
  perform pg_temp.yo(cb);
  r := pg_temp.intenta(format($q$select api.fn_enviar_medicion_revision(%L)$q$, m2));
  perform pg_temp.reg('X11 Otro Capturista no reenvia la medicion rechazada ajena (42501)', r like '42501%', r);
  -- reemplazo de evidencia (Ciclo 6) y reenvio
  perform pg_temp.sin_identidad();
  insert into storage.objects (bucket_id, name, metadata) values ('evidencias', m2 || '/' || h3 || '.png', '{"size": 2048}');
  perform pg_temp.yo(ca);
  perform api.fn_registrar_evidencia(m2, 'Fotografia', h3, 'image/png', 2048);
  j := api.fn_enviar_medicion_revision(m2);
  perform pg_temp.sin_identidad();
  perform pg_temp.reg('X12 El autor reenvia la corregida: vuelve a revision y se limpia la firma del rechazo',
    (select estado = 'revision' and usuario_validacion is null and fecha_validacion is null from core.medicion_indicador where id = m2), '');
  perform pg_temp.reg('X13 La alerta desaparece al reenviar',
    (select count(*) from core.medicion_indicador where id = m2 and estado = 'rechazado') = 0, '');
  perform pg_temp.reg('X14 El motivo del rechazo anterior se conserva en el dictamen (nada se borra)',
    (select count(*) from core.dictamen where objeto_tipo = 'medicion' and objeto_id = m2::text and decision = 'rechazar') = 1, '');
  perform pg_temp.reg('X15 La bitacora cuenta la historia completa: envio, rechazo y reenvio',
    (select count(*) from core.bitacora_cambio where tabla_afectada = 'medicion_indicador' and id_registro = m2::text and accion = 'CAMBIO_ESTADO') = 3, '');
  -- rechazar desde validada
  perform pg_temp.yo(ae);
  j := api.fn_dictaminar_medicion(m2, 'validar');
  j := api.fn_dictaminar_medicion(m2, 'rechazar', 'Falta la firma del oficio.');
  perform pg_temp.sin_identidad();
  perform pg_temp.reg('X16 Tambien se rechaza una medicion ya validada (vigente_admin -> rechazado)',
    (select estado = 'rechazado' from core.medicion_indicador where id = m2), '');

  ---------------------------------------------------------------- PUBLICACION
  perform pg_temp.yo(ae);
  j := api.fn_dictaminar_medicion(m1, 'publicar');
  perform pg_temp.sin_identidad();
  perform pg_temp.reg('P01 El Administrador publica la validada: vigente_publico',
    (select estado = 'vigente_publico' and usuario_validacion = ad from core.medicion_indicador where id = m1), '');
  perform pg_temp.reg('P02 La primera medicion publicada con valor fija la linea base del indicador',
    (select linea_base = 12 and anio_linea_base = 2041 from core.indicador where id = ind), '');
  perform pg_temp.reg('P03 La publicacion deja su dictamen',
    (select count(*) from core.dictamen where objeto_tipo = 'medicion' and objeto_id = m1::text and decision = 'publicar'
        and estado_previo = 'vigente_admin' and estado_nuevo = 'vigente_publico' and id_usuario = ae) = 1, '');
  perform pg_temp.anonimo();
  perform pg_temp.reg('P04 El ciudadano ve la medicion publicada en api.medicion_publica',
    pg_temp.cuenta(format($q$select 1 from api.medicion_publica where id = %L$q$, m1)) = 1, '');
  perform pg_temp.anonimo();
  perform pg_temp.reg('P05 ...y no ve la que no esta publicada',
    pg_temp.cuenta(format($q$select 1 from api.medicion_publica where id = %L$q$, m2)) = 0, '');
  perform pg_temp.yo(ad);
  r := pg_temp.intenta(format($q$select api.fn_dictaminar_medicion(%L,'rechazar','Ya publicada.')$q$, m1));
  perform pg_temp.reg('P06 Una medicion publicada ya no se rechaza (55000)', r like '55000%', r);
  perform pg_temp.yo(ca);
  r := pg_temp.intenta(format($q$select api.fn_guardar_medicion(jsonb_build_object('id',%L,'id_indicador',%L,'id_unidad',%L,'tipo_periodo','trimestral','anio',2041,'sub',1,'valor',1))$q$, m1, ind, unis[1]));
  perform pg_temp.reg('P07 Una medicion publicada ya no se edita (55000)', r like '55000%', r);
  -- publicar otra del mismo indicador no cambia la linea base
  perform pg_temp.sin_identidad();
  update core.medicion_indicador set estado = 'vigente_admin', usuario_validacion = ad, fecha_validacion = now() where id = m3;
  insert into core.evidencia_medicion (id_medicion, id_usuario, url_archivo, tipo_documento, hash_archivo) values (m3, ca, 'evidencias/x', 'Oficio', repeat('e8', 32));
  perform pg_temp.yo(ae);
  j := api.fn_dictaminar_medicion(m3, 'publicar');
  perform pg_temp.sin_identidad();
  perform pg_temp.reg('P08 La linea base no se pisa con publicaciones posteriores',
    (select linea_base = 12 and anio_linea_base = 2041 from core.indicador where id = ind), '');

  ---------------------------------------------------------------- PERMISOS DE BASE
  perform pg_temp.yo(ca);
  r := pg_temp.intenta(format($q$update core.medicion_indicador set estado = 'vigente_publico' where id = %L$q$, m4));
  perform pg_temp.reg('S01 Nadie escribe directo en la tabla: solo por las funciones (42501)', r like '42501%', r);
  perform pg_temp.reg('S02 Las cuatro funciones del Ciclo 8 no se conceden a anon',
    not has_function_privilege('anon', 'api.fn_guardar_medicion(jsonb)', 'execute')
    and not has_function_privilege('anon', 'api.fn_enviar_medicion_revision(uuid)', 'execute')
    and not has_function_privilege('anon', 'api.fn_dictaminar_medicion(uuid,text,text)', 'execute')
    and not has_function_privilege('anon', 'api.fn_mediciones_devueltas()', 'execute'), '');
  perform pg_temp.reg('S03 Las ayudas internas no se conceden a authenticated',
    not has_function_privilege('authenticated', 'core.obtener_o_crear_periodo(text,integer,integer)', 'execute')
    and not has_function_privilege('authenticated', 'core.tiene_evidencia_vigente(uuid)', 'execute'), '');
  perform pg_temp.reg('S04 Las funciones nuevas traen comentario',
    (select count(*) from pg_proc p where p.pronamespace = 'api'::regnamespace
        and p.proname in ('fn_guardar_medicion','fn_enviar_medicion_revision','fn_dictaminar_medicion','fn_mediciones_devueltas')
        and obj_description(p.oid, 'pg_proc') is not null) = 4, '');
  perform pg_temp.sin_identidad();
  perform pg_temp.reg('S05 Sin cambios al ER: el Ciclo 8 no agrega tablas a core (siguen 27)',
    (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'core' and c.relkind = 'r') = 27, '');
end $$;

select n, case when ok then 'PASA' else 'FALLA' end as resultado, caso, detalle from resultados order by n;
select count(*) filter (where ok) as pasan, count(*) filter (where not ok) as fallan from resultados;
do $$ begin
  if exists (select 1 from resultados where not ok) then raise exception 'Hay pruebas del Ciclo 8 que fallan'; end if;
end $$;
rollback;
