-- Ciclo 10 -- Pruebas de ER-6: catalogo de instrumentos normativos (tablas, flujo D-20, D-16, cuatro ojos, vista publica, PDF y clave).
-- Uso:  psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f db/pruebas/ciclo10_er6_pruebas.sql
\set ON_ERROR_STOP on
\pset format aligned
\pset border 2
begin;

-- Precondicion: base recien migrada (240 y 241), ANTES de cargar los PDF con scripts/instrumentos/. Las cifras de esta prueba
-- cuentan fichas, documentos y bitacora desde cero; con PDF o cambios reales ya hechos se desfasarian.
do $$ begin
  if exists (select 1 from core.documento_instrumento) or exists (select 1 from core.bitacora_cambio where tabla_afectada in ('instrumento_normativo','documento_instrumento','relacion_normativa')) then
    raise exception 'Esta prueba espera la base recien migrada, antes de cargar los PDF del catalogo (ya hay documentos o bitacora de ER-6). Corrala en una base de prueba.';
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

-- Sube un archivo al bucket como la persona indicada (con RLS de storage); devuelve OK o el error.
create function pg_temp.sube(u uuid, nombre text, bytes bigint) returns text language plpgsql as $$
declare r text;
begin
  perform pg_temp.yo(u);
  r := pg_temp.intenta(format($q$insert into storage.objects (bucket_id, name, metadata) values ('instrumentos', %L, jsonb_build_object('size', %s))$q$, nombre, bytes));
  perform pg_temp.sin_identidad();
  return r;
end $$;
create function pg_temp.hex(c char) returns text language sql as $$ select repeat(c::text, 64) $$;

do $$
declare
  ca uuid := '00000000-0000-0000-0000-00000000c0a1'; ad uuid := '00000000-0000-0000-0000-0000000000ad';
  ad2 uuid := '00000000-0000-0000-0000-0000000000ae'; ti uuid := '00000000-0000-0000-0000-0000000000a7';
  ti2 uuid := '00000000-0000-0000-0000-0000000000a8'; au uuid := '00000000-0000-0000-0000-0000000000a0';
  r text; j jsonb; n bigint; a text; b text; c text; d text; nom text;
  h1 text := repeat('a1', 32); h2 text := repeat('b2', 32); h3 text := repeat('c3', 32); h4 text := repeat('d4', 32);
  n0 bigint;
begin
  perform pg_temp.sin_identidad();

  ---------------------------------------------------------------- SIEMBRA y vista publica de hoy
  perform pg_temp.reg('S01 La siembra trae 36 fichas: 35 publicadas y DOC-E005 en borrador',
    (select count(*) from core.instrumento_normativo) = 36
    and (select count(*) from core.instrumento_normativo where estatus = 'vigente_publico' and publicado) = 35
    and (select estatus from core.instrumento_normativo where id = 'DOC-E005') = 'borrador', '');
  perform pg_temp.reg('S02 Escalas 9 E, 12 F (7 F + 5 N), 15 M; la letra de la clave sigue a tipo y escala',
    (select count(*) from core.instrumento_normativo where escala = 'E') = 9 and (select count(*) from core.instrumento_normativo where escala = 'F') = 12
    and (select count(*) from core.instrumento_normativo where escala = 'M') = 15
    and (select count(*) from core.instrumento_normativo where id like 'DOC-N%' and tipo = 'Norma Oficial Mexicana') = 5
    and not exists (select 1 from core.instrumento_normativo where id like 'DOC-N%' and tipo <> 'Norma Oficial Mexicana'), '');
  perform pg_temp.reg('S03 Seis fichas ligadas a instrumento_origen y quince a municipio; todas apuntan a filas que existen',
    (select count(*) from core.instrumento_normativo where id_instrumento_origen is not null) = 6
    and (select count(*) from core.instrumento_normativo where id_unidad is not null) = 15, '');
  perform pg_temp.reg('S04 Cuatro relaciones por_validar entre fichas que existen',
    (select count(*) from core.relacion_normativa where estatus = 'por_validar') = 4, '');
  perform pg_temp.reg('S05 La siembra no deja bitacora (es carga, no cambio de una persona)',
    (select count(*) from core.bitacora_cambio where tabla_afectada in ('instrumento_normativo','relacion_normativa','documento_instrumento')) = 0, '');
  perform pg_temp.reg('S06 Integridad del modelo sin fallas (comentarios, RLS)',
    not exists (select 1 from core.verificar_integridad() where not ok), '');

  perform pg_temp.anonimo();
  perform pg_temp.reg('P01 El ciudadano (anon) ve exactamente las 35 publicadas, no DOC-E005',
    pg_temp.cuenta('select id from api.instrumento_normativo') = 35 and pg_temp.cuenta($q$select 1 from api.instrumento_normativo where id = 'DOC-E005'$q$) = 0, '');
  perform pg_temp.reg('P02 Anon ve las 4 relaciones (entre fichas publicadas)', pg_temp.cuenta('select 1 from api.relacion_normativa') = 4, '');
  perform pg_temp.reg('P03 Anon: clave = id y ambito legible', pg_temp.cuenta($q$select 1 from api.instrumento_normativo where clave = id and ambito in ('Estatal','Federal','Municipal')$q$) = 35, '');
  r := pg_temp.intenta('select id_usuario from core.documento_instrumento');
  perform pg_temp.reg('P04 Anon no puede pedir la columna id_usuario de documentos (42501)', r like '42501%', r);
  r := pg_temp.intenta('select * from api.documento_instrumento');
  perform pg_temp.reg('P05 Anon no usa la vista con autor (42501)', r like '42501%', r);
  r := pg_temp.intenta($q$insert into core.instrumento_normativo (id,nombre,tipo,escala,nivel_piramide) values ('DOC-E099','x','Ley','E',1)$q$);
  perform pg_temp.reg('P06 Anon no escribe (42501)', r like '42501%', r);
  r := pg_temp.intenta('select * from core.bitacora_cambio');
  perform pg_temp.reg('P07 Anon no ve la bitacora (42501)', r like '42501%', r);
  r := pg_temp.intenta($q$select api.fn_guardar_instrumento_normativo('{"nombre":"x"}'::jsonb)$q$);
  perform pg_temp.reg('P08 Anon no ejecuta las funciones de escritura (42501)', r like '42501%', r);
  perform pg_temp.reg('P09 Las 8 funciones de escritura: ni anon, si authenticated',
    (select count(*) from pg_proc p where p.pronamespace = 'api'::regnamespace and p.proname in ('fn_guardar_instrumento_normativo','fn_registrar_documento_instrumento',
       'fn_enviar_instrumento_normativo_revision','fn_dictaminar_instrumento_normativo','fn_baja_instrumento_normativo','fn_guardar_relacion_normativa',
       'fn_validar_relacion_normativa','fn_baja_relacion_normativa')
       and not has_function_privilege('anon', p.oid, 'execute') and has_function_privilege('authenticated', p.oid, 'execute')) = 8, '');
  perform pg_temp.sin_identidad();

  ---------------------------------------------------------------- Roles: alta
  perform pg_temp.actua(ca);
  r := pg_temp.intenta($q$select api.fn_guardar_instrumento_normativo('{"nombre":"Prueba","tipo":"Ley","escala":"E","nivel_piramide":4}'::jsonb)$q$);
  perform pg_temp.reg('R01 El Capturista no da de alta fichas (42501)', r like '42501%', r);
  perform pg_temp.actua(au);
  r := pg_temp.intenta($q$select api.fn_guardar_instrumento_normativo('{"nombre":"Prueba","tipo":"Ley","escala":"E","nivel_piramide":4}'::jsonb)$q$);
  perform pg_temp.reg('R02 El Auditor no da de alta fichas (42501)', r like '42501%', r);

  perform pg_temp.actua(ad);
  j := api.fn_guardar_instrumento_normativo('{"nombre":"PMDU de prueba","tipo":"Programa Municipal de Desarrollo Urbano","escala":"M","nivel_piramide":6,"id_unidad":"04001"}'::jsonb);
  perform pg_temp.reg('A01 Alta municipal: clave DOC-M016 (siguiente de la letra M), borrador, no publicado',
    j ->> 'id' = 'DOC-M016' and j ->> 'estatus' = 'borrador' and (j ->> 'publicado')::boolean = false, j::text);
  j := api.fn_guardar_instrumento_normativo('{"nombre":"NOM de prueba","tipo":"Norma Oficial Mexicana","escala":"F","nivel_piramide":2}'::jsonb);
  perform pg_temp.reg('A02 Alta de NOM: clave DOC-N006 (la letra la da el tipo)', j ->> 'id' = 'DOC-N006', j::text);
  j := api.fn_guardar_instrumento_normativo('{"nombre":"Ley estatal de prueba","tipo":"Ley","escala":"E","nivel_piramide":4}'::jsonb);
  perform pg_temp.reg('A03 Alta estatal: clave DOC-E010', j ->> 'id' = 'DOC-E010', j::text);
  j := api.fn_guardar_instrumento_normativo('{"nombre":"Ley federal de prueba","tipo":"Ley","escala":"F","nivel_piramide":2}'::jsonb);
  perform pg_temp.reg('A04 Alta federal: clave DOC-F008 (las N no cuentan en F)', j ->> 'id' = 'DOC-F008', j::text);
  r := pg_temp.intenta($q$select api.fn_guardar_instrumento_normativo('{"nombre":"x","tipo":"Ley","escala":"E","nivel_piramide":4,"estatus":"vigente_publico"}'::jsonb)$q$);
  perform pg_temp.reg('A05 No se puede mandar el estatus por la API (22023)', r like '22023%', r);
  r := pg_temp.intenta($q$select api.fn_guardar_instrumento_normativo('{"id":"DOC-E555","nombre":"x","tipo":"Ley","escala":"M","nivel_piramide":4}'::jsonb)$q$);
  perform pg_temp.reg('A06 Clave con letra que contradice la escala se rechaza (23514)', r like '23514%', r);
  r := pg_temp.intenta($q$select api.fn_guardar_instrumento_normativo('{"nombre":"x","tipo":"Ley","nivel_piramide":4}'::jsonb)$q$);
  perform pg_temp.reg('A07 Sin escala no se puede asignar clave (22023)', r like '22023%', r);
  j := api.fn_guardar_instrumento_normativo('{"id":"DOC-M016","nombre":"PMDU de prueba (editado)"}'::jsonb);
  perform pg_temp.reg('A08 Edicion en borrador conserva clave y cambia el nombre', j ->> 'id' = 'DOC-M016' and j ->> 'nombre' like '%editado%', j::text);

  ---------------------------------------------------------------- PDF: nombre canonico y almacenamiento
  a := 'DOC-M016/DOC-M016_v01_' || substr(h1, 1, 16) || '.pdf';
  perform pg_temp.sin_identidad();
  r := pg_temp.sube(ca, a, 1000);
  perform pg_temp.reg('D01 El Capturista no sube PDF de instrumentos (RLS)', r like '42501%' or r like '%row-level%', r);
  r := pg_temp.sube(au, a, 1000);
  perform pg_temp.reg('D02 El Auditor no sube PDF (RLS)', r like '42501%' or r like '%row-level%', r);
  r := pg_temp.sube(ad, 'DOC-M016/otro_nombre.pdf', 1000);
  perform pg_temp.reg('D03 Un nombre que no es canonico se rechaza', r like '42501%' or r like '%row-level%', r);
  r := pg_temp.sube(ad, 'DOC-M017/DOC-M017_v01_' || substr(h1, 1, 16) || '.pdf', 1000);
  perform pg_temp.reg('D04 Una clave que no existe se rechaza', r like '42501%' or r like '%row-level%', r);
  r := pg_temp.sube(ad, 'DOC-M016/DOC-N006_v01_' || substr(h1, 1, 16) || '.pdf', 1000);
  perform pg_temp.reg('D05 La carpeta y el nombre deben repetir la MISMA clave', r like '42501%' or r like '%row-level%', r);
  r := pg_temp.sube(ad, 'DOC-M016/DOC-M016_v02_' || substr(h1, 1, 16) || '.pdf', 1000);
  perform pg_temp.reg('D06 La version debe ser la siguiente (v01 hoy; v02 se rechaza)', r like '42501%' or r like '%row-level%', r);
  r := pg_temp.sube(ad, 'DOC-M016/DOC-M016_v01_' || substr(h1, 1, 16) || '.jpg', 1000);
  perform pg_temp.reg('D07 Solo .pdf', r like '42501%' or r like '%row-level%', r);
  r := pg_temp.sube(ad, a, 1000);
  perform pg_temp.reg('D08 El Administrador sube con el nombre canonico', r = 'OK', r);

  perform pg_temp.actua(ad);
  r := pg_temp.intenta(format($q$select api.fn_enviar_instrumento_normativo_revision('DOC-M016')$q$));
  perform pg_temp.reg('D09 Enviar a revision sin PDF registrado se rechaza (23514)', r like '23514%', r);
  r := pg_temp.intenta(format($q$select api.fn_registrar_documento_instrumento('DOC-M016','principal',%L,2000)$q$, h1));
  perform pg_temp.reg('D10 El tamano declarado debe coincidir con el subido (22023)', r like '22023%', r);
  r := pg_temp.intenta($q$select api.fn_registrar_documento_instrumento('DOC-M016','principal','XYZ',1000)$q$);
  perform pg_temp.reg('D11 Huella mal formada (22023)', r like '22023%', r);
  r := pg_temp.intenta(format($q$select api.fn_registrar_documento_instrumento('DOC-M016','principal',%L,209715201)$q$, h1));
  perform pg_temp.reg('D12 Mas de 200 MB (22023)', r like '22023%', r);
  r := pg_temp.intenta(format($q$select api.fn_registrar_documento_instrumento('DOC-M016','principal',%L,1000)$q$, h2));
  perform pg_temp.reg('D13 Un archivo que no esta en el almacenamiento se rechaza (P0002)', r like 'P0002%', r);
  r := pg_temp.intenta(format($q$select api.fn_registrar_documento_instrumento('DOC-M016','otro',%L,1000)$q$, h1));
  perform pg_temp.reg('D14 Rol de documento invalido (22023)', r like '22023%', r);
  j := api.fn_registrar_documento_instrumento('DOC-M016', 'principal', h1, 1000, 30, true);
  perform pg_temp.reg('D15 Registro: version 1, vigente, ruta canonica ligada a la clave',
    (j ->> 'version')::int = 1 and (j ->> 'vigente')::boolean and j ->> 'ruta' = 'instrumentos/' || a, j::text);
  r := pg_temp.intenta(format($q$select api.fn_registrar_documento_instrumento('DOC-M016','principal',%L,1000)$q$, h1));
  perform pg_temp.reg('D16 La misma huella en la misma ficha se rechaza (23505)', r like '23505%', r);
  perform pg_temp.reg('D17 La vista de la API entrega la ruta del PDF de la ficha (la misma del registro)',
    (select pdf_ruta from api.instrumento_normativo where id = 'DOC-M016') = j ->> 'ruta', j ->> 'ruta');
  perform pg_temp.sin_identidad();
  b := 'DOC-M016/DOC-M016_c01_' || substr(h3, 1, 16) || '.pdf';
  perform pg_temp.reg('D18 Un complemento se sube como _c01_ y no cuenta como principal',
    pg_temp.sube(ad, b, 500) = 'OK', '');
  perform pg_temp.actua(ad);
  j := api.fn_registrar_documento_instrumento('DOC-M016', 'complemento', h3, 500);
  perform pg_temp.reg('D19 Complemento registrado: version 1 de su propio rol, el principal sigue vigente',
    (j ->> 'version')::int = 1 and (select count(*) from core.documento_instrumento where id_instrumento = 'DOC-M016' and vigente) = 2, j::text);

  ---------------------------------------------------------------- Flujo D-20 / D-16 / cuatro ojos
  j := api.fn_enviar_instrumento_normativo_revision('DOC-M016');
  perform pg_temp.reg('F01 Con PDF principal, el Administrador envia a revision', j ->> 'estatus' = 'revision', j::text);
  r := pg_temp.intenta($q$select api.fn_guardar_instrumento_normativo('{"id":"DOC-M016","nombre":"cambio en revision"}'::jsonb)$q$);
  perform pg_temp.reg('F02 En revision no se edita (55000)', r like '55000%', r);
  r := pg_temp.intenta($q$select api.fn_dictaminar_instrumento_normativo('DOC-M016','validar')$q$);
  perform pg_temp.reg('F03 El Administrador no valida (D-16, 42501)', r like '42501%', r);
  r := pg_temp.intenta($q$select api.fn_dictaminar_instrumento_normativo('DOC-M016','publicar')$q$);
  perform pg_temp.reg('F04 El Administrador no publica (D-16, 42501)', r like '42501%', r);
  r := pg_temp.intenta($q$select api.fn_baja_instrumento_normativo('DOC-M016')$q$);
  perform pg_temp.reg('F05 El Administrador no da de baja (solo Titular, 42501)', r like '42501%', r);
  -- D-16 tambien a nivel de tabla: un cambio directo de "publicado" sin ser Titular lo frena el disparador
  r := pg_temp.intenta($q$update core.instrumento_normativo set publicado = true where id = 'DOC-M016'$q$);
  perform pg_temp.reg('F06 Disparador D-16: nadie que no sea Titular publica ni por UPDATE directo (42501)', r like '42501%', r);

  perform pg_temp.actua(ti);
  r := pg_temp.intenta($q$select api.fn_dictaminar_instrumento_normativo('DOC-M016','publicar')$q$);
  perform pg_temp.reg('F07 No se publica sin validar antes (55000)', r like '55000%', r);
  r := pg_temp.intenta($q$select api.fn_dictaminar_instrumento_normativo('DOC-M016','aprobar')$q$);
  perform pg_temp.reg('F08 Decision invalida (22023)', r like '22023%', r);
  j := api.fn_dictaminar_instrumento_normativo('DOC-M016', 'validar');
  perform pg_temp.reg('F09 El Titular (no quien envio) valida: vigente_admin, aun no publicado',
    j ->> 'estatus' = 'vigente_admin' and (j ->> 'publicado')::boolean = false, j::text);
  perform pg_temp.anonimo();
  perform pg_temp.reg('F10 Validado no es publico: anon no ve la ficha ni su PDF',
    pg_temp.cuenta($q$select 1 from api.instrumento_normativo where id = 'DOC-M016'$q$) = 0
    and pg_temp.cuenta($q$select 1 from api.documento_instrumento_publico where id_instrumento = 'DOC-M016'$q$) = 0, '');
  perform pg_temp.sin_identidad();
  perform pg_temp.actua(ti2);
  j := api.fn_dictaminar_instrumento_normativo('DOC-M016', 'publicar');
  perform pg_temp.reg('F11 El Titular publica: vigente_publico, publicado, con fecha',
    j ->> 'estatus' = 'vigente_publico' and (j ->> 'publicado')::boolean and j ->> 'publicado_en' is not null, j::text);
  perform pg_temp.reg('F12 Dos dictamenes registrados (validar y publicar) con el estado previo y el nuevo',
    (select count(*) from core.dictamen where objeto_tipo = 'instrumento_normativo' and objeto_id = 'DOC-M016') = 2
    and exists (select 1 from core.dictamen where objeto_id = 'DOC-M016' and decision = 'publicar' and estado_previo = 'vigente_admin' and estado_nuevo = 'vigente_publico'), '');

  perform pg_temp.anonimo();
  perform pg_temp.reg('P10 Publicada: anon ve la ficha con su PDF principal (ruta, huella, bytes, paginas)',
    pg_temp.cuenta($q$select 1 from api.instrumento_normativo where id = 'DOC-M016' and pdf_ruta like 'instrumentos/DOC-M016/DOC-M016_v01_%' and pdf_bytes = 1000 and pdf_paginas = 30 and pdf_version = 1$q$) = 1, '');
  perform pg_temp.reg('P11 Anon ve los dos documentos vigentes (principal y complemento), nada mas',
    pg_temp.cuenta($q$select 1 from api.documento_instrumento_publico where id_instrumento = 'DOC-M016'$q$) = 2 and pg_temp.cuenta('select 1 from api.documento_instrumento_publico') = 2, '');
  perform pg_temp.reg('P12 Con una publicada mas anon ve 36 fichas (las otras en borrador no)',
    pg_temp.cuenta('select 1 from api.instrumento_normativo') = 36
    and pg_temp.cuenta($q$select 1 from api.instrumento_normativo where id in ('DOC-N006','DOC-E010','DOC-F008','DOC-E005')$q$) = 0, '');
  perform pg_temp.sin_identidad();

  -- La ficha y su PDF cuentan la misma historia (clave, ruta, huella)
  perform pg_temp.reg('K01 Concordancia clave-nombre: ruta = instrumentos/<clave>/<clave>_<v|c><NN>_<sha16>.pdf en todo documento registrado',
    not exists (select 1 from core.documento_instrumento d
                 where d.ruta <> core.nombre_documento_instrumento(d.id_instrumento, d.rol, d.version, d.hash_archivo) and d.ruta <> 'instrumentos/' || core.nombre_documento_instrumento(d.id_instrumento, d.rol, d.version, d.hash_archivo)), '');
  r := pg_temp.intenta(format($q$insert into core.documento_instrumento (id_instrumento, rol, version, ruta, hash_archivo, bytes) values ('DOC-M016','principal',9,'instrumentos/DOC-M016/DOC-M016_v09_0000000000000000.pdf',%L,10)$q$, h4));
  perform pg_temp.reg('K02 Un registro cuya ruta contradice la huella o la clave no entra a la base (23514)', r like '23514%', r);
  r := pg_temp.intenta(format($q$insert into core.documento_instrumento (id_instrumento, rol, version, ruta, hash_archivo, bytes) values ('DOC-M016','principal',9,'instrumentos/DOC-N006/DOC-M016_v09_%s.pdf',%L,10)$q$, substr(h4,1,16), h4));
  perform pg_temp.reg('K03 La carpeta de la ruta debe ser la clave de la ficha (23514)', r like '23514%', r);
  r := pg_temp.intenta($q$insert into core.instrumento_normativo (id,nombre,tipo,escala,nivel_piramide) values ('DOC-X001','x','Ley','E',1)$q$);
  perform pg_temp.reg('K04 Clave con formato ajeno a DOC-[E|F|M|N]### se rechaza (23514)', r like '23514%', r);

  ---------------------------------------------------------------- Rechazar, version 2, baja y reactivacion
  perform pg_temp.actua(ti);
  r := pg_temp.intenta($q$select api.fn_dictaminar_instrumento_normativo('DOC-M016','rechazar')$q$);
  perform pg_temp.reg('V01 Rechazar sin comentario se rechaza (23514)', r like '23514%', r);
  r := pg_temp.intenta($q$select api.fn_baja_instrumento_normativo('DOC-M016')$q$);
  perform pg_temp.reg('V02 No se da de baja una ficha publicada (55000)', r like '55000%', r);
  j := api.fn_dictaminar_instrumento_normativo('DOC-M016', 'rechazar', 'Falta confirmar la fecha del POE');
  perform pg_temp.reg('V03 Rechazar con comentario regresa a borrador y la RETIRA del publico',
    j ->> 'estatus' = 'borrador' and (j ->> 'publicado')::boolean = false, j::text);
  perform pg_temp.anonimo();
  perform pg_temp.reg('V04 Retirada: anon ya no ve la ficha ni sus documentos',
    pg_temp.cuenta($q$select 1 from api.instrumento_normativo where id = 'DOC-M016'$q$) = 0
    and pg_temp.cuenta($q$select 1 from api.documento_instrumento_publico where id_instrumento = 'DOC-M016'$q$) = 0, '');
  perform pg_temp.sin_identidad();
  perform pg_temp.actua(ad);
  r := pg_temp.sube(ad, 'DOC-M016/DOC-M016_v01_' || substr(h4, 1, 16) || '.pdf', 900);
  perform pg_temp.reg('V05 El nombre v01 ya no vale: la version nueva es v02', r like '42501%' or r like '%row-level%', r);
  perform pg_temp.reg('V06 Se sube la v02 con el nombre canonico', pg_temp.sube(ad, 'DOC-M016/DOC-M016_v02_' || substr(h4, 1, 16) || '.pdf', 900) = 'OK', '');
  perform pg_temp.actua(ad);
  j := api.fn_registrar_documento_instrumento('DOC-M016', 'principal', h4, 900, 31, true);
  perform pg_temp.reg('V07 La v02 queda vigente y la v01 se conserva (vigente = false); una sola vigente',
    (j ->> 'version')::int = 2 and (j ->> 'reemplazo_a') is not null
    and (select count(*) from core.documento_instrumento where id_instrumento = 'DOC-M016' and rol = 'principal') = 2
    and (select count(*) from core.documento_instrumento where id_instrumento = 'DOC-M016' and rol = 'principal' and vigente) = 1, j::text);
  perform pg_temp.reg('V08 El PDF v01 sigue en el almacenamiento y en la base (cero borrados)',
    exists (select 1 from storage.objects where name = a) and exists (select 1 from core.documento_instrumento where ruta = 'instrumentos/' || a and not vigente), '');
  -- Cuatro ojos sobre una ficha distinta (DOC-E010): una sola entrega a revision, para que el orden en la bitacora sea inequívoco
  perform pg_temp.sin_identidad();
  perform pg_temp.reg('V09a Se sube el PDF de DOC-E010 con su clave en el nombre', pg_temp.sube(ad, 'DOC-E010/DOC-E010_v01_' || substr(h2, 1, 16) || '.pdf', 700) = 'OK', '');
  perform pg_temp.actua(ad);
  j := api.fn_registrar_documento_instrumento('DOC-E010', 'principal', h2, 700, 12, false);
  perform pg_temp.actua(ti);
  j := api.fn_enviar_instrumento_normativo_revision('DOC-E010');
  perform pg_temp.reg('V09 El Titular tambien puede enviar a revision', j ->> 'estatus' = 'revision', j::text);
  r := pg_temp.intenta($q$select api.fn_dictaminar_instrumento_normativo('DOC-E010','validar')$q$);
  perform pg_temp.reg('V10 CUATRO OJOS: quien envio no valida su propio envio (42501)', r like '42501%', r);
  perform pg_temp.actua(ti2);
  j := api.fn_dictaminar_instrumento_normativo('DOC-E010', 'validar');
  perform pg_temp.reg('V11 Otro Titular valida', j ->> 'estatus' = 'vigente_admin', j::text);
  perform pg_temp.actua(ti);
  r := pg_temp.intenta($q$select api.fn_dictaminar_instrumento_normativo('DOC-E010','publicar')$q$);
  perform pg_temp.reg('V11b CUATRO OJOS tambien al publicar: quien envio no publica (42501)', r like '42501%', r);
  perform pg_temp.actua(ti2);
  j := api.fn_dictaminar_instrumento_normativo('DOC-E010', 'rechazar', 'Se devuelve para prueba');
  perform pg_temp.reg('V12 Rechazar desde vigente_admin tambien regresa a borrador', j ->> 'estatus' = 'borrador', j::text);
  j := api.fn_baja_instrumento_normativo('DOC-M016');
  perform pg_temp.reg('V13 El Titular da de baja una ficha en borrador: activo = false', (j ->> 'activo')::boolean = false, j::text);
  perform pg_temp.actua(ad);
  r := pg_temp.intenta($q$select api.fn_guardar_instrumento_normativo('{"id":"DOC-M016","nombre":"x"}'::jsonb)$q$);
  perform pg_temp.reg('V14 Una ficha dada de baja no se edita (55000)', r like '55000%', r);
  perform pg_temp.actua(ti2);
  j := api.fn_baja_instrumento_normativo('DOC-M016', true);
  perform pg_temp.reg('V15 El Titular la reactiva', (j ->> 'activo')::boolean, j::text);

  ---------------------------------------------------------------- Fichas sembradas (hoy publicas) entran al mismo flujo
  perform pg_temp.actua(ti2);
  j := api.fn_dictaminar_instrumento_normativo('DOC-E001', 'rechazar', 'Confirmar el decreto 249 antes de fijar la version');
  perform pg_temp.reg('W01 Una ficha sembrada y publica se retira con rechazar + comentario', j ->> 'estatus' = 'borrador' and not (j ->> 'publicado')::boolean, j::text);
  perform pg_temp.anonimo();
  perform pg_temp.reg('W02 Anon deja de ver DOC-E001: quedan 34 publicas', pg_temp.cuenta('select 1 from api.instrumento_normativo') = 34, '');
  perform pg_temp.sin_identidad();
  perform pg_temp.actua(ad);
  r := pg_temp.intenta($q$select api.fn_enviar_instrumento_normativo_revision('DOC-E001')$q$);
  perform pg_temp.reg('W03 La sembrada no vuelve a publico sin PDF: enviar exige el PDF (23514)', r like '23514%', r);
  perform pg_temp.actua(ti2);
  -- se queda en borrador (la prueba termina en rollback)


  ---------------------------------------------------------------- Carga inicial de PDF (servidor, sin sesion)
  perform pg_temp.sin_identidad();
  insert into storage.objects (bucket_id, name, metadata) values
    ('instrumentos', 'DOC-F001/DOC-F001_v01_' || substr(repeat('f1', 32), 1, 16) || '.pdf', '{"size": 5000}'),
    ('instrumentos', 'DOC-M011/DOC-M011_v01_' || substr(repeat('f2', 32), 1, 16) || '.pdf', '{"size": 6000}');
  perform pg_temp.yo(ad);
  r := pg_temp.intenta(format($q$select core.registrar_documento_carga_inicial('DOC-F001','principal',%L,5000)$q$, repeat('f1', 32)));
  perform pg_temp.reg('Z01 Una cuenta de la API no puede ejecutar la carga inicial (42501)', r like '42501%', r);
  perform pg_temp.anonimo();
  r := pg_temp.intenta(format($q$select core.registrar_documento_carga_inicial('DOC-F001','principal',%L,5000)$q$, repeat('f1', 32)));
  perform pg_temp.reg('Z02 Anon tampoco (42501)', r like '42501%', r);
  perform pg_temp.sin_identidad();
  perform pg_temp.actua(ad);
  r := pg_temp.intenta(format($q$select core.registrar_documento_carga_inicial('DOC-F001','principal',%L,5000)$q$, repeat('f1', 32)));
  perform pg_temp.reg('Z03 Con sesion de usuario se niega aunque se llame como dueno (42501)', r like '42501%', r);
  perform pg_temp.sin_identidad();
  r := pg_temp.intenta(format($q$select core.registrar_documento_carga_inicial('DOC-F001','principal',%L,5000)$q$, repeat('f3', 32)));
  perform pg_temp.reg('Z04 Sin el archivo en el bucket se rechaza (P0002)', r like 'P0002%', r);
  r := pg_temp.intenta(format($q$select core.registrar_documento_carga_inicial('DOC-F001','principal',%L,5001)$q$, repeat('f1', 32)));
  perform pg_temp.reg('Z05 Tamano que no coincide (22023)', r like '22023%', r);
  j := core.registrar_documento_carga_inicial('DOC-F001', 'principal', repeat('f1', 32), 5000, 120, true);
  perform pg_temp.reg('Z06 El servidor registra el PDF de una ficha YA publicada: v01, ruta con clave, sin autor',
    j ->> 'ruta' = 'instrumentos/DOC-F001/DOC-F001_v01_' || substr(repeat('f1', 32), 1, 16) || '.pdf' and j ->> 'id_usuario' is null
    and (select estatus from core.instrumento_normativo where id = 'DOC-F001') = 'vigente_publico', j::text);
  j := core.registrar_documento_carga_inicial('DOC-M011', 'principal', repeat('f2', 32), 6000, 300, true);
  perform pg_temp.anonimo();
  perform pg_temp.reg('Z07 Anon ve el PDF de la ficha publicada recien cargada y su ruta en la vista',
    pg_temp.cuenta($q$select 1 from api.instrumento_normativo where id = 'DOC-F001' and pdf_ruta like 'instrumentos/DOC-F001/DOC-F001_v01_%' and pdf_paginas = 120$q$) = 1
    and pg_temp.cuenta($q$select 1 from api.documento_instrumento_publico where id_instrumento = 'DOC-M011'$q$) = 1, '');
  perform pg_temp.sin_identidad();
  perform pg_temp.reg('Z08 La carga inicial tambien deja bitacora (sin autor) y no rompe la auditoria',
    exists (select 1 from core.bitacora_cambio where tabla_afectada = 'documento_instrumento' and id_usuario is null and accion = 'INSERT'), '');
  -- con el PDF ya cargado, una ficha publicada puede retirarse, corregirse y volver al ciclo normal sin perder el archivo
  perform pg_temp.actua(ti2);
  j := api.fn_dictaminar_instrumento_normativo('DOC-F001', 'rechazar', 'Prueba de actualizacion de version');
  perform pg_temp.actua(ad);
  perform pg_temp.reg('Z09 Despues de la carga, la ficha con PDF ya puede ir a revision', (api.fn_enviar_instrumento_normativo_revision('DOC-F001') ->> 'estatus') = 'revision', '');
  perform pg_temp.sin_identidad();

  ---------------------------------------------------------------- Lectura por perfil
  perform pg_temp.yo(ca);
  perform pg_temp.reg('L01 El Capturista ve solo lo publicado (no borradores ni lo que esta en revision)',
    pg_temp.cuenta($q$select 1 from api.instrumento_normativo where id in ('DOC-N006','DOC-E010','DOC-F008','DOC-E005','DOC-E001')$q$) = 0
    and pg_temp.cuenta('select 1 from api.instrumento_normativo') = 33, '');
  perform pg_temp.yo(ad);
  perform pg_temp.reg('L02 El Administrador ve todo, borradores incluidos, y el PDF en la vista',
    pg_temp.cuenta('select 1 from api.instrumento_normativo') = 40
    and pg_temp.cuenta($q$select 1 from api.instrumento_normativo where id = 'DOC-M016' and pdf_version = 2$q$) = 1, '');
  perform pg_temp.yo(au);
  perform pg_temp.reg('L03 El Auditor ve todo (incluye el historial de versiones con autor)',
    pg_temp.cuenta('select 1 from api.instrumento_normativo') = 40 and pg_temp.cuenta('select 1 from api.documento_instrumento') = 6, '');
  perform pg_temp.yo(ca);
  perform pg_temp.reg('L04 El Capturista ve solo el documento vigente de fichas publicadas (1 de 6 versiones)',
    pg_temp.cuenta('select 1 from api.documento_instrumento') = 1, '');
  perform pg_temp.sin_identidad();

  ---------------------------------------------------------------- Nadie escribe ni borra directo
  perform pg_temp.yo(ti);
  r := pg_temp.intenta($q$update core.instrumento_normativo set nombre = 'x' where id = 'DOC-E002'$q$);
  perform pg_temp.reg('N01 Ni el Titular actualiza directo la ficha (42501)', r like '42501%', r);
  r := pg_temp.intenta($q$delete from core.instrumento_normativo where id = 'DOC-E002'$q$);
  perform pg_temp.reg('N02 Ni el Titular borra una ficha (42501)', r like '42501%', r);
  r := pg_temp.intenta($q$delete from core.documento_instrumento$q$);
  perform pg_temp.reg('N03 Ni el Titular borra documentos (42501)', r like '42501%', r);
  r := pg_temp.intenta($q$update core.relacion_normativa set estatus = 'validada'$q$);
  perform pg_temp.reg('N04 Ni el Titular cambia relaciones directo (42501)', r like '42501%', r);
  select count(*) into n0 from storage.objects where bucket_id = 'instrumentos';
  perform pg_temp.intenta($q$delete from storage.objects where bucket_id = 'instrumentos'$q$);
  perform pg_temp.intenta($q$update storage.objects set name = name || 'x' where bucket_id = 'instrumentos'$q$);
  perform pg_temp.sin_identidad();
  perform pg_temp.reg('N05 Sin politicas de DELETE ni UPDATE en el bucket: todos los archivos siguen ahi',
    (select count(*) from storage.objects where bucket_id = 'instrumentos') = n0 and n0 = 6
    and (select count(*) from storage.objects where bucket_id = 'instrumentos' and name like '%x') = 0, 'objetos: ' || n0);

  ---------------------------------------------------------------- Relaciones
  perform pg_temp.actua(ad);
  j := api.fn_guardar_relacion_normativa('{"id_origen":"DOC-E002","id_destino":"DOC-F002","tipo_relacion":"fundamento","descripcion":"Prueba"}'::jsonb);
  perform pg_temp.reg('Q01 El Administrador propone una relacion: id origen>destino, por_validar',
    j ->> 'id' = 'DOC-E002>DOC-F002' and j ->> 'estatus' = 'por_validar', j::text);
  r := pg_temp.intenta($q$select api.fn_validar_relacion_normativa('DOC-E002>DOC-F002')$q$);
  perform pg_temp.reg('Q02 El Administrador no valida relaciones (42501)', r like '42501%', r);
  r := pg_temp.intenta($q$select api.fn_guardar_relacion_normativa('{"id_origen":"DOC-E002","id_destino":"DOC-E002"}'::jsonb)$q$);
  perform pg_temp.reg('Q03 Una relacion de una ficha consigo misma se rechaza (23514)', r like '23514%', r);
  r := pg_temp.intenta($q$select api.fn_guardar_relacion_normativa('{"id_origen":"DOC-E002","id_destino":"DOC-Z999"}'::jsonb)$q$);
  perform pg_temp.reg('Q04 Una relacion con una ficha que no existe se rechaza (23503)', r like '23503%', r);
  r := pg_temp.intenta($q$select api.fn_guardar_relacion_normativa('{"id_origen":"DOC-E002","id_destino":"DOC-F002","tipo_relacion":"inventada"}'::jsonb)$q$);
  perform pg_temp.reg('Q05 Tipo de relacion fuera de catalogo (23514)', r like '23514%', r);
  perform pg_temp.actua(ti);
  j := api.fn_validar_relacion_normativa('DOC-E002>DOC-F002');
  perform pg_temp.reg('Q06 El Titular valida la relacion', j ->> 'estatus' = 'validada', j::text);
  perform pg_temp.actua(ad);
  j := api.fn_guardar_relacion_normativa('{"id_origen":"DOC-E002","id_destino":"DOC-F002","descripcion":"Texto ajustado"}'::jsonb);
  perform pg_temp.reg('Q07 Editar una relacion validada la regresa a por_validar', j ->> 'estatus' = 'por_validar', j::text);
  perform pg_temp.anonimo();
  perform pg_temp.reg('Q08 Anon ve la relacion entre dos fichas publicas', pg_temp.cuenta($q$select 1 from api.relacion_normativa where id = 'DOC-E002>DOC-F002'$q$) = 1, '');
  perform pg_temp.sin_identidad();
  perform pg_temp.actua(ad);
  j := api.fn_guardar_relacion_normativa('{"id_origen":"DOC-E001","id_destino":"DOC-F002"}'::jsonb);
  perform pg_temp.anonimo();
  perform pg_temp.reg('Q09 Anon NO ve una relacion con una ficha retirada (DOC-E001 en borrador)',
    pg_temp.cuenta($q$select 1 from api.relacion_normativa where id = 'DOC-E001>DOC-F002'$q$) = 0, '');
  perform pg_temp.sin_identidad();
  perform pg_temp.actua(ad);
  j := api.fn_baja_relacion_normativa('DOC-E002>DOC-F002');
  perform pg_temp.anonimo();
  perform pg_temp.reg('Q10 Una relacion dada de baja deja de verse', pg_temp.cuenta($q$select 1 from api.relacion_normativa where id = 'DOC-E002>DOC-F002'$q$) = 0, '');
  perform pg_temp.sin_identidad();

  ---------------------------------------------------------------- Auditoria y bitacora
  perform pg_temp.reg('B01 Las tres tablas tienen disparador de auditoria',
    (select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid where t.tgname = 'trg_auditoria'
       and c.relname in ('instrumento_normativo','documento_instrumento','relacion_normativa')) = 3, '');
  perform pg_temp.reg('B02 La bitacora guarda el alta, el envio, la validacion, la publicacion y el rechazo de DOC-M016',
    (select count(*) from core.bitacora_cambio where tabla_afectada = 'instrumento_normativo' and id_registro = 'DOC-M016' and accion = 'INSERT') = 1
    and (select count(*) from core.bitacora_cambio where tabla_afectada = 'instrumento_normativo' and id_registro = 'DOC-M016' and accion = 'CAMBIO_ESTADO') >= 4, '');
  perform pg_temp.reg('B03 Cada registro de PDF deja bitacora con quien lo hizo',
    (select count(*) from core.bitacora_cambio where tabla_afectada = 'documento_instrumento' and id_usuario = ad) >= 3, '');
  perform pg_temp.yo(ad);
  perform pg_temp.reg('B04 El Administrador ve esos eventos en api.bitacora_catalogos',
    pg_temp.cuenta($q$select 1 from api.bitacora_catalogos where tabla = 'instrumento_normativo' and recurso_id = 'DOC-M016'$q$) >= 8, '');
  perform pg_temp.yo(ca);
  perform pg_temp.reg('B05 El Capturista no ve esa bitacora', pg_temp.cuenta($q$select 1 from api.bitacora_catalogos where tabla = 'instrumento_normativo'$q$) = 0, '');
  perform pg_temp.sin_identidad();
  perform pg_temp.reg('B06 Lo anterior no cambio nada de capas ni de instrumentos de origen: siguen 6 y todos publicos',
    (select count(*) from core.instrumento_origen where estatus = 'vigente_publico' and publicado) = 6, '');
  perform pg_temp.reg('B07 Bucket instrumentos: publico, solo PDF, 200 MB',
    exists (select 1 from storage.buckets where id = 'instrumentos' and public and file_size_limit = 209715200 and allowed_mime_types = array['application/pdf']), '');
  perform pg_temp.reg('B08 El bucket de evidencias sigue privado y de 10 MB',
    exists (select 1 from storage.buckets where id = 'evidencias' and not public and file_size_limit = 10485760), '');
end $$;

select n, case when ok then 'PASA' else 'FALLA' end as resultado, caso, detalle from resultados order by n;
select count(*) filter (where ok) as pasan, count(*) filter (where not ok) as fallan from resultados;
do $$ begin
  if exists (select 1 from resultados where not ok) then raise exception 'Hay pruebas del Ciclo 10 (ER-6) que fallan'; end if;
end $$;
rollback;
