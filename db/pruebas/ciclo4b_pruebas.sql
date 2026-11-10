-- Ciclo 4b -- Pruebas: actualizar capas vigentes (propuesta + dictamen, cuatro ojos, seguimiento del rechazo) y restriccion de uso a cargo de la administracion.
-- Todo corre dentro de una transaccion que termina en ROLLBACK.
--
-- Uso:  psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f db/pruebas/ciclo4b_pruebas.sql
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
 ('00000000-0000-0000-0000-00000000c0a1', 'cap.a@prueba.mx'), ('00000000-0000-0000-0000-00000000c0b2', 'cap.b@prueba.mx'),
 ('00000000-0000-0000-0000-0000000000ad', 'adm@prueba.mx'), ('00000000-0000-0000-0000-0000000000ae', 'adm2@prueba.mx');
insert into core.perfil (id_usuario, nombre, rol, creado_en) values
 ('00000000-0000-0000-0000-00000000c0a1', 'Capturista A', 'capturista', '2030-01-01 10:00+00'),
 ('00000000-0000-0000-0000-00000000c0b2', 'Capturista B', 'capturista', '2030-01-01 11:00+00'),
 ('00000000-0000-0000-0000-0000000000ad', 'Administrador', 'administrador', '2030-01-01 12:00+00'),
 ('00000000-0000-0000-0000-0000000000ae', 'Administrador 2', 'administrador', '2030-01-01 12:30+00');

create function pg_temp.intenta_como(u uuid, q text) returns text language plpgsql as $$
begin perform pg_temp.actua(u); return pg_temp.intenta(q); end $$;

do $$
declare
  ca uuid := '00000000-0000-0000-0000-00000000c0a1'; cb uuid := '00000000-0000-0000-0000-00000000c0b2';
  ad uuid := '00000000-0000-0000-0000-0000000000ad'; a2 uuid := '00000000-0000-0000-0000-0000000000ae';
  ficha jsonb := '{"custodio":"SEDUMOP","fuente_origen":"Prueba","linaje":"Levantamiento de prueba","sistema_coordenadas":"EPSG:4326"}';
  prop jsonb := '{"archivo":"nueva.gpkg","n_elementos":120,"fecha_corte":"2026-10-01","motivo":"Datos más recientes","justificacion":"Se incorporan las localidades nuevas del censo 2025 y se corrige la geometría.","columna_id_origen":"id","variacion_elementos":0.2,"campos":[{"nombre":"id","tipo":"INTEGER"},{"nombre":"nombre","tipo":"TEXT"}]}';
  r text; v_dic uuid; ind text; quien uuid;
begin
  select id into ind from core.indicador limit 1;
  -- Alta de una capa vigente: capturista la crea SIN restriccion de uso y la envia; la administracion la valida y la publica
  quien := ca;
  r := pg_temp.intenta_como(quien, format($q$select api.fn_guardar_capa(%L)$q$, jsonb_build_object('id','TC4B-01','titulo','Capa de prueba 4b','proposito','Prueba','tipo_geometria','Punto','srid_origen',4326,'responsable','SEDUMOP','n_elementos',100,'metadatos_extra',ficha)));
  perform pg_temp.reg('B01 El capturista guarda una capa sin restriccion de uso', r = 'OK', r);
  r := pg_temp.intenta_como(quien, $q$select api.fn_enviar_capa_revision('TC4B-01')$q$);
  perform pg_temp.reg('B02 Se envia a revision sin restriccion de uso', r = 'OK', r);
  quien := ad;
  r := pg_temp.intenta_como(quien, $q$select api.fn_dictaminar_capa('TC4B-01','validar')$q$);
  perform pg_temp.reg('B03 La administracion la valida', r = 'OK', r);
  quien := a2;
  r := pg_temp.intenta_como(quien, $q$select api.fn_dictaminar_capa('TC4B-01','publicar')$q$);
  perform pg_temp.reg('B04 Publicar sin restriccion de uso se rechaza (D-17)', r like '23514%', r);
  quien := ca;
  r := pg_temp.intenta_como(quien, $q$select api.fn_definir_restriccion_capa('TC4B-01','pública')$q$);
  perform pg_temp.reg('B05 El capturista NO define la restriccion de uso', r like '42501%' or r like '%rol%' or r <> 'OK', r);
  quien := a2;
  r := pg_temp.intenta_como(quien, $q$select api.fn_definir_restriccion_capa('TC4B-01','secreta')$q$);
  perform pg_temp.reg('B06 Restriccion invalida se rechaza', r like '22023%', r);
  r := pg_temp.intenta_como(quien, $q$select api.fn_definir_restriccion_capa('TC4B-01','pública')$q$);
  perform pg_temp.reg('B07 La administracion define la restriccion', r = 'OK', r);
  r := pg_temp.intenta_como(quien, $q$select api.fn_dictaminar_capa('TC4B-01','publicar')$q$);
  perform pg_temp.reg('B08 Ahora si se publica', r = 'OK', r);

  -- Actualizacion
  quien := cb;
  r := pg_temp.intenta_como(quien, format($q$select api.fn_proponer_actualizacion_capa('TC4B-01', %L)$q$, prop - 'justificacion' || '{"justificacion":"corta"}'));
  perform pg_temp.reg('B09 Justificacion corta se rechaza', r like '23514%', r);
  r := pg_temp.intenta_como(quien, format($q$select api.fn_proponer_actualizacion_capa('TC4B-01', %L)$q$, prop || '{"x":1}'));
  perform pg_temp.reg('B10 Campos desconocidos se rechazan', r like '22023%', r);
  r := pg_temp.intenta_como(quien, format($q$select api.fn_proponer_actualizacion_capa('TC4B-01', %L)$q$, prop || '{"fecha_corte":"2999-01-01"}'));
  perform pg_temp.reg('B11 Fecha de corte futura se rechaza', r like '23514%', r);
  r := pg_temp.intenta_como(quien, format($q$select api.fn_proponer_actualizacion_capa('TC4B-01', %L)$q$, prop || jsonb_build_object('indicadores_agregar', jsonb_build_array('NOEXISTE'))));
  perform pg_temp.reg('B12 Indicador inexistente se rechaza', r like 'P0002%', r);
  r := pg_temp.intenta_como(ca, format($q$select api.fn_proponer_actualizacion_capa('TC4B-01', %L)$q$, prop || '{"campos":"x"}'::jsonb));
  perform pg_temp.reg('B12b Campos que no son una lista se rechazan', r like '22023%', r);
  r := pg_temp.intenta_como(quien, format($q$select api.fn_proponer_actualizacion_capa('TC4B-01', %L)$q$, prop || jsonb_build_object('indicadores_agregar', jsonb_build_array(ind))));
  perform pg_temp.reg('B13 Un capturista propone la actualizacion de una capa vigente (aunque no sea suya)', r = 'OK', r);
  perform pg_temp.sin_identidad();
  perform pg_temp.sin_identidad();
  perform pg_temp.reg('B13b La propuesta guarda la lista de campos para el dictamen',
    (select jsonb_array_length(metadatos_extra -> 'actualizacion_pendiente' -> 'campos') = 2 from core.capa where id='TC4B-01'), '');
  perform pg_temp.reg('B14 La capa sigue vigente_publico mientras se dictamina',
    (select estatus from core.capa where id='TC4B-01') = 'vigente_publico' and (select n_elementos from core.capa where id='TC4B-01') = 100, '');
  quien := ca;
  r := pg_temp.intenta_como(quien, format($q$select api.fn_proponer_actualizacion_capa('TC4B-01', %L)$q$, prop));
  perform pg_temp.reg('B15 No se acepta una segunda propuesta pendiente', r like '55000%', r);
  r := pg_temp.intenta_como(quien, $q$select api.fn_resolver_actualizacion_capa('TC4B-01','aprobar')$q$);
  perform pg_temp.reg('B16 El capturista no resuelve actualizaciones', r <> 'OK', r);
  -- rechazo
  quien := ad;
  r := pg_temp.intenta_como(quien, $q$select api.fn_resolver_actualizacion_capa('TC4B-01','rechazar')$q$);
  perform pg_temp.reg('B17 Rechazar exige comentario', r like '23514%', r);
  r := pg_temp.intenta_como(quien, $q$select api.fn_resolver_actualizacion_capa('TC4B-01','rechazar','Falta la localidad de Carmen.')$q$);
  perform pg_temp.reg('B18 La administracion rechaza con motivo', r = 'OK', r);
  perform pg_temp.sin_identidad();
  perform pg_temp.reg('B19 El rechazo abre el seguimiento de 10 dias habiles para quien propuso',
    (select count(*) from core.rechazo_seguimiento where objeto_id='TC4B-01' and id_destinatario = cb and estado='pendiente') = 1, '');
  perform pg_temp.reg('B20 La capa sigue vigente y sin propuesta pendiente',
    (select estatus from core.capa where id='TC4B-01') = 'vigente_publico' and not (select metadatos_extra ? 'actualizacion_pendiente' from core.capa where id='TC4B-01'), '');
  -- nueva propuesta -> atiende el seguimiento
  quien := cb;
  r := pg_temp.intenta_como(quien, format($q$select api.fn_proponer_actualizacion_capa('TC4B-01', %L)$q$, prop || jsonb_build_object('indicadores_agregar', jsonb_build_array(ind))));
  perform pg_temp.reg('B21 Quien recibio el rechazo vuelve a proponer', r = 'OK', r);
  perform pg_temp.sin_identidad();
  perform pg_temp.reg('B22 El seguimiento queda atendida',
    (select count(*) from core.rechazo_seguimiento where objeto_id='TC4B-01' and estado='atendida') = 1, '');
  -- aprobacion, cuatro ojos
  quien := cb;
  perform pg_temp.reg('B23 Quien propone (capturista) no resuelve', pg_temp.intenta_como(quien, $q$select api.fn_resolver_actualizacion_capa('TC4B-01','aprobar')$q$) <> 'OK', '');
  quien := a2;
  r := pg_temp.intenta_como(quien, $q$select api.fn_resolver_actualizacion_capa('TC4B-01','aprobar')$q$);
  perform pg_temp.reg('B24 La administracion aprueba', r = 'OK', r);
  perform pg_temp.sin_identidad();
  perform pg_temp.reg('B25 La capa queda con 120 elementos, archivo y fecha de corte nuevos y la marca de ingesta pendiente',
    (select n_elementos = 120 and archivo = 'nueva.gpkg' and metadatos_extra ->> 'fecha_corte' = '2026-10-01' and (metadatos_extra ->> 'geometria_pendiente_ingesta')::boolean
       and not metadatos_extra ? 'actualizacion_pendiente' from core.capa where id='TC4B-01'), '');
  perform pg_temp.reg('B26 Se ligo el indicador propuesto', exists (select 1 from core.capa_indicador where id_capa='TC4B-01' and id_indicador = ind), '');
  perform pg_temp.reg('B27 Quedan versiones y dictamenes de la actualizacion',
    (select count(*) from core.capa_version where id_capa='TC4B-01' and nota like 'Actualizacion%') >= 4
    and (select count(*) from core.dictamen where objeto_id='TC4B-01' and comentario in ('Actualizacion aprobada.','Falta la localidad de Carmen.')) = 2, '');
  perform pg_temp.reg('B28 La bitacora de cambios registra la capa', (select count(*) from core.bitacora_cambio where tabla_afectada='capa' and id_registro='TC4B-01') >= 3, '');
  -- una capa en borrador no se actualiza por esta via
  quien := ca;
  perform pg_temp.intenta_como(quien, format($q$select api.fn_guardar_capa(%L)$q$, jsonb_build_object('id','TC4B-02','titulo','Otra','proposito','Prueba','tipo_geometria','Punto','srid_origen',4326,'responsable','SEDUMOP','metadatos_extra',ficha)));
  r := pg_temp.intenta_como(quien, format($q$select api.fn_proponer_actualizacion_capa('TC4B-02', %L)$q$, prop));
  perform pg_temp.reg('B29 Una capa en borrador no se actualiza por la via de propuesta', r like '55000%', r);
  -- bitacora de catalogos y vinculos (api.bitacora_catalogos): la administracion la ve, otro capturista no ve lo ajeno
  perform pg_temp.yo(ad);
  perform pg_temp.reg('B30 La administracion ve en la bitacora de catalogos el vinculo capa-indicador',
    pg_temp.cuenta($q$select 1 from api.bitacora_catalogos where tabla = 'capa_indicador' and recurso_id like 'TC4B-01%'$q$) >= 1, '');
  perform pg_temp.yo(cb);
  perform pg_temp.reg('B31 Otro capturista no ve lo ajeno en la bitacora de catalogos',
    pg_temp.cuenta($q$select 1 from api.bitacora_catalogos where recurso_id like 'TC4B-01%'$q$) = 0, '');
end $$;

select n, case when ok then 'PASA' else 'FALLA' end as resultado, caso, detalle from resultados order by n;
select count(*) filter (where ok) as pasan, count(*) filter (where not ok) as fallan from resultados;
do $$ begin
  if exists (select 1 from resultados where not ok) then raise exception 'Hay pruebas del Ciclo 4b que fallan'; end if;
end $$;
rollback;
