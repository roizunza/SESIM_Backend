-- Ciclo 10 -- Pruebas de ER-7: fuentes oficiales de informacion (Consulta oficial): tablas, flujo D-20, D-16, cuatro ojos, vista publica y enlaces.
-- Uso:  psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f db/pruebas/ciclo10_er7_pruebas.sql
\set ON_ERROR_STOP on
\pset format aligned
\pset border 2
begin;

-- Precondicion: base recien migrada (242 y 243). Las cifras cuentan fuentes, enlaces y bitacora desde cero.
do $$ begin
  if exists (select 1 from core.bitacora_cambio where tabla_afectada in ('fuente_documental','enlace_fuente')) then
    raise exception 'Esta prueba espera la base recien migrada (ya hay bitacora de ER-7). Corrala en una base de prueba.';
  end if;
end $$;

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
create function pg_temp.reg(c text, ok boolean, d text) returns void language plpgsql security definer as $$
begin
  -- a diferencia de otras pruebas, NO limpia la identidad: las secuencias de cada caso la conservan hasta cambiarla
  insert into resultados(caso, ok, detalle) values (c, ok, d);
end $$;
grant all on pg_temp.resultados to public;


insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-00000000c0a1', 'cap.a@prueba.mx'),
 ('00000000-0000-0000-0000-0000000000ad', 'adm@prueba.mx'),
 ('00000000-0000-0000-0000-0000000000ae', 'adm2@prueba.mx'),
 ('00000000-0000-0000-0000-0000000000a7', 'tit@prueba.mx'),
 ('00000000-0000-0000-0000-0000000000a8', 'tit2@prueba.mx'),
 ('00000000-0000-0000-0000-0000000000a0', 'aud@prueba.mx');
insert into core.perfil (id_usuario, nombre, rol, creado_en) values
 ('00000000-0000-0000-0000-00000000c0a1', 'Capturista A', 'capturista', '2030-01-01 10:00+00'),
 ('00000000-0000-0000-0000-0000000000ad', 'Administrador',  'administrador', '2030-01-01 12:00+00'),
 ('00000000-0000-0000-0000-0000000000ae', 'Administrador 2','administrador', '2030-01-01 12:30+00'),
 ('00000000-0000-0000-0000-0000000000a7', 'Titular',        'administrador_titular', '2030-01-01 13:00+00'),
 ('00000000-0000-0000-0000-0000000000a8', 'Titular 2',      'administrador_titular', '2030-01-01 13:30+00'),
 ('00000000-0000-0000-0000-0000000000a0', 'Auditor',        'auditor', '2030-01-01 14:00+00');


do $$
declare
  ca uuid := '00000000-0000-0000-0000-00000000c0a1'; ad uuid := '00000000-0000-0000-0000-0000000000ad';
  ad2 uuid := '00000000-0000-0000-0000-0000000000ae'; ti uuid := '00000000-0000-0000-0000-0000000000a7';
  ti2 uuid := '00000000-0000-0000-0000-0000000000a8'; au uuid := '00000000-0000-0000-0000-0000000000a0';
  r text; j jsonb; e1 uuid; e2 uuid; e3 uuid; n bigint;
begin
  perform pg_temp.sin_identidad();

  ---------------------------------------------------------------- SIEMBRA y vista publica de hoy
  perform pg_temp.reg('S01 La siembra trae 10 fuentes, todas publicadas (decision de Ismael)',
    (select count(*) from core.fuente_documental) = 10
    and (select count(*) from core.fuente_documental where estatus = 'vigente_publico' and publicado and activo) = 10, '');
  perform pg_temp.reg('S02 Cinco estadisticas (DAT-F) y cinco geoespaciales (DAT-G); la letra sigue al tipo',
    (select count(*) from core.fuente_documental where tipo_informacion = 'estadistica' and id like 'DAT-F%') = 5
    and (select count(*) from core.fuente_documental where tipo_informacion = 'geoespacial' and id like 'DAT-G%') = 5, '');
  perform pg_temp.reg('S03 Once enlaces: VMRC (DAT-F003) tiene dos, las demas uno; todos http(s) y sin verificar',
    (select count(*) from core.enlace_fuente) = 11
    and (select count(*) from core.enlace_fuente where id_fuente = 'DAT-F003') = 2
    and not exists (select 1 from core.enlace_fuente where estatus_enlace <> 'sin_verificar' or verificado_en is not null), '');
  perform pg_temp.reg('S04 La institucion no se inventa: queda vacia para que la capture administracion',
    not exists (select 1 from core.fuente_documental where institucion is not null), '');
  perform pg_temp.reg('S05 La siembra no deja bitacora (es carga, no cambio de una persona)',
    (select count(*) from core.bitacora_cambio where tabla_afectada in ('fuente_documental','enlace_fuente')) = 0, '');
  perform pg_temp.reg('S06 Integridad del modelo sin fallas (comentarios, RLS)',
    not exists (select 1 from core.verificar_integridad() where not ok), '');

  perform pg_temp.anonimo();
  perform pg_temp.reg('P01 El ciudadano (anon) ve las 10 fuentes publicadas',
    pg_temp.cuenta('select id from api.fuente_documental') = 10, '');
  perform pg_temp.reg('P02 Anon: clave = id y la lista de enlaces trae titulo y url (VMRC con dos, en orden)',
    pg_temp.cuenta($q$select 1 from api.fuente_documental where clave = id and jsonb_array_length(enlaces) >= 1$q$) = 10
    and (select jsonb_array_length(enlaces) from api.fuente_documental where id = 'DAT-F003') = 2
    and (select enlaces -> 0 ->> 'titulo' from api.fuente_documental where id = 'DAT-F003') = 'Metadatos VMRC 2025'
    and (select url_oficial from api.fuente_documental where id = 'DAT-F001') like 'https://www.inegi.org.mx/%', '');
  r := pg_temp.intenta('select id_usuario_verifico from core.enlace_fuente');
  perform pg_temp.reg('P03 Anon no puede pedir quien verifico un enlace (42501)', r like '42501%', r);
  r := pg_temp.intenta('select * from api.enlace_fuente');
  perform pg_temp.reg('P04 Anon no usa la vista de enlaces con autor (42501)', r like '42501%', r);
  r := pg_temp.intenta($q$insert into core.fuente_documental (id,nombre,tipo_informacion) values ('DAT-F099','x','estadistica')$q$);
  perform pg_temp.reg('P05 Anon no escribe (42501)', r like '42501%', r);
  r := pg_temp.intenta($q$update core.enlace_fuente set url = 'https://malo.example' where true$q$);
  perform pg_temp.reg('P06 Anon no cambia enlaces (42501)', r like '42501%', r);
  r := pg_temp.intenta('select * from core.bitacora_cambio');
  perform pg_temp.reg('P07 Anon no ve la bitacora (42501)', r like '42501%', r);
  r := pg_temp.intenta($q$select api.fn_guardar_fuente_documental('{"nombre":"x"}'::jsonb)$q$);
  perform pg_temp.reg('P08 Anon no ejecuta las funciones de escritura (42501)', r like '42501%', r);
  perform pg_temp.reg('P09 Las 7 funciones de escritura: ni anon, si authenticated',
    (select count(*) from pg_proc p where p.pronamespace = 'api'::regnamespace and p.proname in ('fn_guardar_fuente_documental','fn_guardar_enlace_fuente',
       'fn_marcar_enlace_fuente','fn_baja_enlace_fuente','fn_enviar_fuente_documental_revision','fn_dictaminar_fuente_documental','fn_baja_fuente_documental')
       and not has_function_privilege('anon', p.oid, 'execute') and has_function_privilege('authenticated', p.oid, 'execute')) = 7, '');
  perform pg_temp.sin_identidad();

  ---------------------------------------------------------------- Roles: alta
  perform pg_temp.actua(ca);
  r := pg_temp.intenta($q$select api.fn_guardar_fuente_documental('{"nombre":"Prueba","tipo_informacion":"estadistica"}'::jsonb)$q$);
  perform pg_temp.reg('R01 El Capturista no da de alta fuentes (42501)', r like '42501%', r);
  r := pg_temp.intenta($q$select api.fn_guardar_enlace_fuente('{"id_fuente":"DAT-F001","titulo":"x","url":"https://x.mx"}'::jsonb)$q$);
  perform pg_temp.reg('R02 El Capturista no agrega enlaces (42501)', r like '42501%', r);
  perform pg_temp.actua(au);
  r := pg_temp.intenta($q$select api.fn_guardar_fuente_documental('{"nombre":"Prueba","tipo_informacion":"estadistica"}'::jsonb)$q$);
  perform pg_temp.reg('R03 El Auditor no da de alta fuentes (42501)', r like '42501%', r);
  r := pg_temp.intenta($q$select api.fn_marcar_enlace_fuente(gen_random_uuid(), 'responde')$q$);
  perform pg_temp.reg('R04 El Auditor no marca enlaces (42501)', r like '42501%', r);

  perform pg_temp.actua(ad);
  j := api.fn_guardar_fuente_documental('{"nombre":"Fuente estadistica de prueba","tipo_informacion":"estadistica","institucion":"INEGI"}'::jsonb);
  perform pg_temp.reg('A01 Alta estadistica: clave DAT-F006 (siguiente de la letra F), borrador, no publicada',
    j ->> 'id' = 'DAT-F006' and j ->> 'estatus' = 'borrador' and (j ->> 'publicado')::boolean = false, j::text);
  j := api.fn_guardar_fuente_documental('{"nombre":"Fuente geoespacial de prueba","tipo_informacion":"geoespacial"}'::jsonb);
  perform pg_temp.reg('A02 Alta geoespacial: clave DAT-G006', j ->> 'id' = 'DAT-G006', j::text);
  r := pg_temp.intenta($q$select api.fn_guardar_fuente_documental('{"nombre":"x","tipo_informacion":"estadistica","estatus":"vigente_publico"}'::jsonb)$q$);
  perform pg_temp.reg('A03 No se puede mandar el estatus por la API (22023)', r like '22023%', r);
  r := pg_temp.intenta($q$select api.fn_guardar_fuente_documental('{"id":"DAT-G555","nombre":"x","tipo_informacion":"estadistica"}'::jsonb)$q$);
  perform pg_temp.reg('A04 Clave con letra que contradice el tipo se rechaza (23514)', r like '23514%', r);
  r := pg_temp.intenta($q$select api.fn_guardar_fuente_documental('{"nombre":"x"}'::jsonb)$q$);
  perform pg_temp.reg('A05 Sin tipo de informacion no se puede asignar clave (22023)', r like '22023%', r);
  j := api.fn_guardar_fuente_documental('{"id":"DAT-F006","nombre":"Fuente de prueba (editada)","cobertura_temporal":"2020-2025"}'::jsonb);
  perform pg_temp.reg('A06 Edicion en borrador conserva clave, cambia nombre y conserva la institucion',
    j ->> 'id' = 'DAT-F006' and j ->> 'nombre' like '%editada%' and j ->> 'institucion' = 'INEGI', j::text);
  r := pg_temp.intenta($q$select api.fn_guardar_fuente_documental('{"id":"DAT-F001","limitaciones":"cambio directo a una publicada"}'::jsonb)$q$);
  perform pg_temp.reg('A07 Una fuente publicada no se edita sin devolverla a borrador (55000)', r like '55000%', r);

  ---------------------------------------------------------------- Enlaces
  r := pg_temp.intenta($q$select api.fn_guardar_enlace_fuente('{"id_fuente":"DAT-F006","titulo":"Sin protocolo","url":"www.inegi.org.mx"}'::jsonb)$q$);
  perform pg_temp.reg('E01 Una URL sin http:// o https:// se rechaza (23514)', r like '23514%', r);
  r := pg_temp.intenta($q$select api.fn_guardar_enlace_fuente('{"id_fuente":"DAT-F777","titulo":"x","url":"https://x.mx"}'::jsonb)$q$);
  perform pg_temp.reg('E02 Enlace a una fuente que no existe (P0002)', r like 'P0002%', r);
  r := pg_temp.intenta($q$select api.fn_guardar_enlace_fuente('{"id_fuente":"DAT-F006","titulo":"x"}'::jsonb)$q$);
  perform pg_temp.reg('E03 Un enlace nuevo exige nombre y URL (23514)', r like '23514%', r);
  r := pg_temp.intenta($q$select api.fn_guardar_enlace_fuente('{"id_fuente":"DAT-F006","titulo":"x","url":"https://x.mx","estatus_enlace":"responde"}'::jsonb)$q$);
  perform pg_temp.reg('E04 No se puede mandar el estatus del enlace al guardar (22023)', r like '22023%', r);
  r := pg_temp.intenta($q$select api.fn_enviar_fuente_documental_revision('DAT-F006')$q$);
  perform pg_temp.reg('E05 Enviar a revision sin enlaces se rechaza (23514)', r like '23514%', r);
  j := api.fn_guardar_enlace_fuente('{"id_fuente":"DAT-F006","titulo":"Portal oficial","url":"https://www.inegi.org.mx/prueba"}'::jsonb);
  e1 := (j ->> 'id')::uuid;
  perform pg_temp.reg('E06 Alta de enlace: orden 1, sin verificar, activo', (j ->> 'orden')::int = 1 and j ->> 'estatus_enlace' = 'sin_verificar' and (j ->> 'activo')::boolean, j::text);
  r := pg_temp.intenta($q$select api.fn_guardar_enlace_fuente('{"id_fuente":"DAT-F006","titulo":"Otro nombre","url":"https://www.inegi.org.mx/prueba"}'::jsonb)$q$);
  perform pg_temp.reg('E07 La misma URL dos veces en una fuente se rechaza (23505)', r like '23505%', r);
  j := api.fn_guardar_enlace_fuente('{"id_fuente":"DAT-F006","titulo":"Programa","url":"https://www.inegi.org.mx/programas/prueba/","orden":2}'::jsonb);
  e2 := (j ->> 'id')::uuid;
  perform pg_temp.reg('E08 Una fuente puede tener varios enlaces, cada uno con su nombre', (select count(*) from core.enlace_fuente where id_fuente = 'DAT-F006') = 2, j::text);
  j := api.fn_marcar_enlace_fuente(e1, 'responde');
  perform pg_temp.reg('E09 Marcar "responde" guarda fecha y quien lo comprobo',
    j ->> 'estatus_enlace' = 'responde' and j ->> 'verificado_en' is not null and (j ->> 'id_usuario_verifico')::uuid = ad, j::text);
  r := pg_temp.intenta(format($q$select api.fn_marcar_enlace_fuente(%L, 'quizas')$q$, e1));
  perform pg_temp.reg('E10 Estatus de enlace invalido (22023)', r like '22023%', r);
  j := api.fn_guardar_enlace_fuente(jsonb_build_object('id', e1, 'titulo', 'Portal oficial (INEGI)'));
  perform pg_temp.reg('E11 Corregir solo el nombre conserva la marca de verificacion', j ->> 'estatus_enlace' = 'responde' and j ->> 'verificado_en' is not null, j::text);
  j := api.fn_guardar_enlace_fuente(jsonb_build_object('id', e1, 'url', 'https://www.inegi.org.mx/nueva-direccion'));
  perform pg_temp.reg('E12 Cambiar la URL borra la marca: el enlace nuevo aun no se ha comprobado',
    j ->> 'estatus_enlace' = 'sin_verificar' and j ->> 'verificado_en' is null and j ->> 'id_usuario_verifico' is null, j::text);
  r := pg_temp.intenta(format($q$select api.fn_guardar_enlace_fuente(jsonb_build_object('id', %L, 'id_fuente', 'DAT-F001', 'titulo', 'x'))$q$, e1));
  perform pg_temp.reg('E13 Un enlace no cambia de fuente (22023)', r like '22023%', r);

  ---------------------------------------------------------------- Flujo D-20 / D-16 / cuatro ojos
  j := api.fn_enviar_fuente_documental_revision('DAT-F006');
  perform pg_temp.reg('F01 Con enlace, el Administrador envia a revision', j ->> 'estatus' = 'revision', j::text);
  r := pg_temp.intenta($q$select api.fn_guardar_fuente_documental('{"id":"DAT-F006","nombre":"cambio en revision"}'::jsonb)$q$);
  perform pg_temp.reg('F02 En revision la ficha no se edita (55000)', r like '55000%', r);
  j := api.fn_guardar_enlace_fuente('{"id_fuente":"DAT-F006","titulo":"Tercero","url":"https://www.inegi.org.mx/tercero","orden":3}'::jsonb);
  e3 := (j ->> 'id')::uuid;
  perform pg_temp.reg('F03 Los enlaces SI se corrigen aunque la ficha este en revision', j ->> 'id' is not null, j::text);
  r := pg_temp.intenta($q$select api.fn_dictaminar_fuente_documental('DAT-F006','validar')$q$);
  perform pg_temp.reg('F04 El Administrador no valida (D-16, 42501)', r like '42501%', r);
  r := pg_temp.intenta($q$select api.fn_dictaminar_fuente_documental('DAT-F006','publicar')$q$);
  perform pg_temp.reg('F05 El Administrador no publica (D-16, 42501)', r like '42501%', r);
  r := pg_temp.intenta($q$select api.fn_baja_fuente_documental('DAT-F006')$q$);
  perform pg_temp.reg('F06 El Administrador no da de baja la ficha (solo Titular, 42501)', r like '42501%', r);
  r := pg_temp.intenta($q$update core.fuente_documental set publicado = true where id = 'DAT-F006'$q$);
  perform pg_temp.reg('F07 Disparador D-16: nadie que no sea Titular publica ni por UPDATE directo (42501)', r like '42501%', r);

  perform pg_temp.actua(ti);
  r := pg_temp.intenta($q$select api.fn_dictaminar_fuente_documental('DAT-F006','publicar')$q$);
  perform pg_temp.reg('F08 No se publica sin validar antes (55000)', r like '55000%', r);
  r := pg_temp.intenta($q$select api.fn_dictaminar_fuente_documental('DAT-F006','aprobar')$q$);
  perform pg_temp.reg('F09 Decision invalida (22023)', r like '22023%', r);
  j := api.fn_dictaminar_fuente_documental('DAT-F006', 'validar');
  perform pg_temp.reg('F10 El Titular (no quien envio) valida: vigente_admin, aun no publicada',
    j ->> 'estatus' = 'vigente_admin' and (j ->> 'publicado')::boolean = false, j::text);
  perform pg_temp.anonimo();
  perform pg_temp.reg('F11 Anon aun no ve la fuente validada pero no publicada', pg_temp.cuenta($q$select 1 from api.fuente_documental where id = 'DAT-F006'$q$) = 0, '');
  perform pg_temp.sin_identidad();
  perform pg_temp.actua(ti);
  j := api.fn_dictaminar_fuente_documental('DAT-F006', 'publicar');
  perform pg_temp.reg('F12 El Titular publica: vigente_publico y publicado', j ->> 'estatus' = 'vigente_publico' and (j ->> 'publicado')::boolean, j::text);
  perform pg_temp.anonimo();
  perform pg_temp.reg('F13 Anon ya ve DAT-F006 con sus 3 enlaces en orden',
    (select jsonb_array_length(enlaces) from api.fuente_documental where id = 'DAT-F006') = 3
    and (select enlaces -> 2 ->> 'titulo' from api.fuente_documental where id = 'DAT-F006') = 'Tercero', '');
  perform pg_temp.sin_identidad();

  -- Un enlace roto en una fuente PUBLICADA se corrige sin sacarla del publico
  perform pg_temp.actua(ad);
  j := api.fn_marcar_enlace_fuente(e3, 'no_responde');
  perform pg_temp.reg('G01 Se marca como "no responde" un enlace de una fuente publicada', j ->> 'estatus_enlace' = 'no_responde', j::text);
  j := api.fn_guardar_enlace_fuente(jsonb_build_object('id', e3, 'url', 'https://www.inegi.org.mx/tercero-corregido'));
  perform pg_temp.reg('G02 Se corrige la URL del enlace roto sin retirar la fuente del publico',
    j ->> 'estatus_enlace' = 'sin_verificar' and (select publicado from core.fuente_documental where id = 'DAT-F006'), j::text);
  j := api.fn_baja_enlace_fuente(e3);
  perform pg_temp.reg('G03 Se da de baja un enlace si quedan otros activos', (j ->> 'activo')::boolean = false, j::text);
  perform pg_temp.anonimo();
  perform pg_temp.reg('G04 Anon ya no ve el enlace dado de baja', (select jsonb_array_length(enlaces) from api.fuente_documental where id = 'DAT-F006') = 2, '');
  perform pg_temp.sin_identidad();
  perform pg_temp.actua(ad);
  j := api.fn_baja_enlace_fuente(e2);
  r := pg_temp.intenta(format($q$select api.fn_baja_enlace_fuente(%L)$q$, e1));
  perform pg_temp.reg('G05 No se da de baja el ULTIMO enlace activo de una fuente publicada (55000)', r like '55000%', r);
  j := api.fn_baja_enlace_fuente(e2, true);
  perform pg_temp.reg('G06 Un enlace dado de baja se puede reactivar', (j ->> 'activo')::boolean, j::text);

  ---------------------------------------------------------------- Cuatro ojos y rechazo
  j := api.fn_guardar_fuente_documental('{"nombre":"Fuente para cuatro ojos","tipo_informacion":"geoespacial"}'::jsonb);
  j := api.fn_guardar_enlace_fuente(jsonb_build_object('id_fuente', j ->> 'id', 'titulo', 'Portal', 'url', 'https://www.sict.gob.mx/prueba'));
  perform pg_temp.actua(ti);
  j := api.fn_enviar_fuente_documental_revision('DAT-G007');
  perform pg_temp.reg('Q01 El Titular tambien puede enviar a revision', j ->> 'estatus' = 'revision', j::text);
  r := pg_temp.intenta($q$select api.fn_dictaminar_fuente_documental('DAT-G007','validar')$q$);
  perform pg_temp.reg('Q02 Cuatro ojos: quien envio no valida (42501)', r like '42501%', r);
  perform pg_temp.actua(ti2);
  j := api.fn_dictaminar_fuente_documental('DAT-G007', 'validar');
  perform pg_temp.reg('Q03 Otro Titular si valida', j ->> 'estatus' = 'vigente_admin', j::text);
  perform pg_temp.actua(ti);
  r := pg_temp.intenta($q$select api.fn_dictaminar_fuente_documental('DAT-G007','publicar')$q$);
  perform pg_temp.reg('Q04 Cuatro ojos tambien en publicar (42501)', r like '42501%', r);
  r := pg_temp.intenta($q$select api.fn_dictaminar_fuente_documental('DAT-G007','rechazar')$q$);
  perform pg_temp.reg('Q05 Rechazar exige comentario (23514)', r like '23514%', r);
  j := api.fn_dictaminar_fuente_documental('DAT-G007', 'rechazar', 'Falta la institucion');
  perform pg_temp.reg('Q06 Rechazar con comentario regresa a borrador', j ->> 'estatus' = 'borrador', j::text);
  perform pg_temp.actua(ti2);
  j := api.fn_dictaminar_fuente_documental('DAT-F006', 'rechazar', 'Se retira para corregir la cobertura');
  perform pg_temp.reg('Q07 Rechazar una fuente PUBLICADA la retira del publico', j ->> 'estatus' = 'borrador' and (j ->> 'publicado')::boolean = false, j::text);
  perform pg_temp.anonimo();
  perform pg_temp.reg('Q08 Anon ya no ve la fuente retirada ni sus enlaces',
    pg_temp.cuenta($q$select 1 from api.fuente_documental where id = 'DAT-F006'$q$) = 0
    and pg_temp.cuenta($q$select 1 from core.enlace_fuente where id_fuente = 'DAT-F006'$q$) = 0, '');
  perform pg_temp.sin_identidad();

  ---------------------------------------------------------------- Baja logica
  perform pg_temp.actua(ti);
  r := pg_temp.intenta($q$select api.fn_baja_fuente_documental('DAT-F001')$q$);
  perform pg_temp.reg('L01 No se da de baja una fuente publicada (55000)', r like '55000%', r);
  j := api.fn_baja_fuente_documental('DAT-F006');
  perform pg_temp.reg('L02 El Titular da de baja una fuente en borrador', (j ->> 'activo')::boolean = false, j::text);
  perform pg_temp.actua(ad);
  r := pg_temp.intenta($q$select api.fn_guardar_enlace_fuente('{"id_fuente":"DAT-F006","titulo":"x","url":"https://x.mx"}'::jsonb)$q$);
  perform pg_temp.reg('L03 No se agregan enlaces a una fuente dada de baja (55000)', r like '55000%', r);
  perform pg_temp.actua(ti);
  j := api.fn_baja_fuente_documental('DAT-F006', true);
  perform pg_temp.reg('L04 La baja se puede revertir', (j ->> 'activo')::boolean, j::text);
  perform pg_temp.sin_identidad();
  perform pg_temp.reg('L05 Nada se borra: no hay privilegio DELETE sobre las tablas',
    not has_table_privilege('authenticated', 'core.fuente_documental', 'delete') and not has_table_privilege('authenticated', 'core.enlace_fuente', 'delete')
    and not has_table_privilege('anon', 'core.fuente_documental', 'delete'), '');

  ---------------------------------------------------------------- Lectura por perfil
  perform pg_temp.yo(ca);
  perform pg_temp.reg('V01 El Capturista ve solo lo publicado (10 fuentes), ninguna en borrador',
    pg_temp.cuenta('select 1 from api.fuente_documental') = 10, '');
  perform pg_temp.yo(ad);
  perform pg_temp.reg('V02 El Administrador ve todo, borradores incluidos', pg_temp.cuenta('select 1 from api.fuente_documental') = 13, '');
  perform pg_temp.reg('V03 El Administrador ve los enlaces de baja y quien verifico', pg_temp.cuenta($q$select 1 from api.enlace_fuente where activo = false$q$) >= 1
    and pg_temp.cuenta($q$select 1 from api.enlace_fuente where id_usuario_verifico is not null$q$) >= 0, '');
  perform pg_temp.yo(au);
  perform pg_temp.reg('V04 El Auditor ve todo', pg_temp.cuenta('select 1 from api.fuente_documental') = 13, '');
  perform pg_temp.sin_identidad();

  ---------------------------------------------------------------- Auditoria y bitacora
  perform pg_temp.reg('B01 Las dos tablas tienen disparador de auditoria',
    (select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid where t.tgname = 'trg_auditoria' and c.relname in ('fuente_documental','enlace_fuente')) = 2, '');
  perform pg_temp.reg('B02 La bitacora guarda alta, envio, validacion, publicacion y rechazo de DAT-F006',
    (select count(*) from core.bitacora_cambio where tabla_afectada = 'fuente_documental' and id_registro = 'DAT-F006' and accion = 'INSERT') = 1
    and (select count(*) from core.bitacora_cambio where tabla_afectada = 'fuente_documental' and id_registro = 'DAT-F006' and accion = 'CAMBIO_ESTADO') >= 4, '');
  perform pg_temp.reg('B03 Cada cambio de enlace deja bitacora con quien lo hizo',
    (select count(*) from core.bitacora_cambio where tabla_afectada = 'enlace_fuente' and id_usuario = ad) >= 8, '');
  perform pg_temp.reg('B04 Los dictamenes de fuentes se guardan en core.dictamen',
    (select count(*) from core.dictamen where objeto_tipo = 'fuente_documental') >= 5, '');
  perform pg_temp.yo(ad);
  perform pg_temp.reg('B05 El Administrador ve esos eventos en api.bitacora_catalogos',
    pg_temp.cuenta($q$select 1 from api.bitacora_catalogos where tabla = 'fuente_documental'$q$) >= 5
    and pg_temp.cuenta($q$select 1 from api.bitacora_catalogos where tabla = 'enlace_fuente'$q$) >= 5, '');
  perform pg_temp.yo(ca);
  perform pg_temp.reg('B06 El Capturista no ve esa bitacora', pg_temp.cuenta($q$select 1 from api.bitacora_catalogos where tabla in ('fuente_documental','enlace_fuente')$q$) = 0, '');
  perform pg_temp.sin_identidad();
  perform pg_temp.reg('B07 Lo anterior no cambio los instrumentos normativos: siguen 35 publicados',
    (select count(*) from core.instrumento_normativo where publicado) = 35, '');
end $$;

select n, case when ok then 'PASA' else 'FALLA' end as resultado, caso, detalle from resultados order by n;
select count(*) filter (where ok) as pasan, count(*) filter (where not ok) as fallan from resultados;
do $$ begin
  if exists (select 1 from resultados where not ok) then raise exception 'Hay pruebas del Ciclo 10 (ER-7) que fallan'; end if;
end $$;
rollback;
