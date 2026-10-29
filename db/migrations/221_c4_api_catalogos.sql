-- Ciclo 4 (3/7) -- Funciones api.* de escritura de los catalogos (TDR 6.2.2 e).
-- Matriz de permisos (Alcances, Ciclo 4): escritura solo de la administracion (Administrador y Titular);
-- lectura de los demas perfiles (ya resuelta por la RLS de 207). Los umbrales del semaforo son solo del Titular (D-16).
-- Reglas comunes:
--   * Son SECURITY DEFINER: el rol de la API no tiene INSERT/UPDATE sobre core (207 se mantiene). La identidad real de
--     quien actua es auth.uid(), asi que los disparadores de auditoria del Ciclo 5 la registran en core.bitacora_cambio.
--   * Sin borrado: "dar de baja" es activo = false. Solo se borran vinculos (tablas puente), y tambien quedan en bitacora.
--   * Cada funcion recibe un objeto JSON con los campos del registro; los campos que no vengan no se modifican.
--     Un campo desconocido se rechaza (no se ignora en silencio).

-- ---------------------------------------------------------------------------------------------
-- Ejes tematicos
-- ---------------------------------------------------------------------------------------------
create or replace function api.fn_guardar_eje(p_datos jsonb) returns jsonb
language plpgsql security definer set search_path = core, public as $$
declare v_id int; v_ant core.eje_tematico; v_r core.eje_tematico; v_fila core.eje_tematico;
begin
  perform core.exigir_rol(array['administrador','administrador_titular'], 'gestionar el catalogo de ejes tematicos');
  perform core.exigir_claves(p_datos, array['id','numero_eje','nombre','activo'], 'eje tematico');
  v_id := nullif(p_datos ->> 'id', '')::int;
  if v_id is null then raise exception 'Falta el id del eje.' using errcode = '22023'; end if;

  select * into v_ant from core.eje_tematico where id = v_id;
  if not found then
    v_r := jsonb_populate_record(null::core.eje_tematico, jsonb_build_object('activo', true) || p_datos);
    insert into core.eje_tematico (id, numero_eje, nombre, activo) values (v_r.id, v_r.numero_eje, v_r.nombre, v_r.activo)
      returning * into v_fila;
  else
    v_r := jsonb_populate_record(null::core.eje_tematico, to_jsonb(v_ant) || p_datos);
    if v_ant.activo and not v_r.activo and exists (select 1 from core.indicador i where i.id_eje = v_id and i.activo) then
      raise exception 'No se puede dar de baja el eje %: tiene indicadores activos.', v_id using errcode = '23514';
    end if;
    update core.eje_tematico set numero_eje = v_r.numero_eje, nombre = v_r.nombre, activo = v_r.activo where id = v_id
      returning * into v_fila;
  end if;
  return to_jsonb(v_fila);
end $$;

-- ---------------------------------------------------------------------------------------------
-- Sectores
-- ---------------------------------------------------------------------------------------------
create or replace function api.fn_guardar_sector(p_datos jsonb) returns jsonb
language plpgsql security definer set search_path = core, public as $$
declare v_id text; v_ant core.sector; v_r core.sector; v_fila core.sector;
begin
  perform core.exigir_rol(array['administrador','administrador_titular'], 'gestionar el catalogo de sectores');
  perform core.exigir_claves(p_datos, array['id','nombre','tipo','activo'], 'sector');
  v_id := nullif(btrim(p_datos ->> 'id'), '');
  if v_id is null then raise exception 'Falta el id del sector.' using errcode = '22023'; end if;

  select * into v_ant from core.sector where id = v_id;
  if not found then
    v_r := jsonb_populate_record(null::core.sector, jsonb_build_object('activo', true) || p_datos);
    insert into core.sector (id, nombre, tipo, activo) values (v_r.id, v_r.nombre, v_r.tipo, v_r.activo) returning * into v_fila;
  else
    v_r := jsonb_populate_record(null::core.sector, to_jsonb(v_ant) || p_datos);
    if v_ant.activo and not v_r.activo and exists (select 1 from core.indicador i where i.id_sector = v_id and i.activo) then
      raise exception 'No se puede dar de baja el sector %: tiene indicadores activos.', v_id using errcode = '23514';
    end if;
    update core.sector set nombre = v_r.nombre, tipo = v_r.tipo, activo = v_r.activo where id = v_id returning * into v_fila;
  end if;
  return to_jsonb(v_fila);
end $$;

-- ---------------------------------------------------------------------------------------------
-- Fuentes de informacion (el id se asigna solo si no viene)
-- ---------------------------------------------------------------------------------------------
create or replace function api.fn_guardar_fuente(p_datos jsonb) returns jsonb
language plpgsql security definer set search_path = core, public as $$
declare v_id int; v_ant core.fuente_informacion; v_r core.fuente_informacion; v_fila core.fuente_informacion;
begin
  perform core.exigir_rol(array['administrador','administrador_titular'], 'gestionar el catalogo de fuentes de informacion');
  perform core.exigir_claves(p_datos, array['id','nombre','siglas','activo'], 'fuente de informacion');
  v_id := nullif(p_datos ->> 'id', '')::int;

  if v_id is null then
    perform pg_advisory_xact_lock(hashtext('core.fuente_informacion.id'));
    select coalesce(max(id), 0) + 1 into v_id from core.fuente_informacion;
    v_r := jsonb_populate_record(null::core.fuente_informacion, jsonb_build_object('activo', true) || p_datos || jsonb_build_object('id', v_id));
    insert into core.fuente_informacion (id, nombre, siglas, activo) values (v_r.id, v_r.nombre, v_r.siglas, v_r.activo) returning * into v_fila;
    return to_jsonb(v_fila);
  end if;

  select * into v_ant from core.fuente_informacion where id = v_id;
  if not found then
    v_r := jsonb_populate_record(null::core.fuente_informacion, jsonb_build_object('activo', true) || p_datos);
    insert into core.fuente_informacion (id, nombre, siglas, activo) values (v_r.id, v_r.nombre, v_r.siglas, v_r.activo) returning * into v_fila;
  else
    v_r := jsonb_populate_record(null::core.fuente_informacion, to_jsonb(v_ant) || p_datos);
    if v_ant.activo and not v_r.activo and exists (select 1 from core.indicador i where i.id_fuente = v_id and i.activo) then
      raise exception 'No se puede dar de baja la fuente %: tiene indicadores activos.', v_id using errcode = '23514';
    end if;
    update core.fuente_informacion set nombre = v_r.nombre, siglas = v_r.siglas, activo = v_r.activo where id = v_id returning * into v_fila;
  end if;
  return to_jsonb(v_fila);
end $$;

-- ---------------------------------------------------------------------------------------------
-- Indicadores. El eje principal (id_eje) siempre tiene su fila principal en indicador_eje (invariante de la carga oficial).
-- ---------------------------------------------------------------------------------------------
create or replace function api.fn_guardar_indicador(p_datos jsonb) returns jsonb
language plpgsql security definer set search_path = core, public as $$
declare v_id text; v_ant core.indicador; v_r core.indicador; v_fila core.indicador; v_existe boolean;
begin
  perform core.exigir_rol(array['administrador','administrador_titular'], 'gestionar el catalogo de indicadores');
  perform core.exigir_claves(p_datos, array['id','id_eje','id_sector','id_fuente','clave','nombre','variable','meta','tendencia',
    'valor_meta','linea_base','anio_linea_base','nivel_mir','smart_medible','smart_alcanzable','smart_temporal',
    'estatus_aprobado','responsable','activo'], 'indicador');
  v_id := nullif(btrim(p_datos ->> 'id'), '');
  if v_id is null then raise exception 'Falta el id del indicador.' using errcode = '22023'; end if;

  select * into v_ant from core.indicador where id = v_id;
  v_existe := found;
  if not v_existe then
    v_r := jsonb_populate_record(null::core.indicador, jsonb_build_object(
             'activo', true, 'estatus_aprobado', false, 'smart_medible', false, 'smart_alcanzable', false, 'smart_temporal', false,
             'clave', upper(v_id)) || p_datos);
  else
    v_r := jsonb_populate_record(null::core.indicador, to_jsonb(v_ant) || p_datos);
  end if;

  if v_r.estatus_aprobado and v_r.tendencia is null and v_r.valor_meta is null then
    raise exception 'El indicador % no se puede aprobar: falta la tendencia o el valor de la meta.', v_id using errcode = '23514';
  end if;

  if not v_existe then
    insert into core.indicador (id, id_eje, id_sector, id_fuente, clave, nombre, variable, meta, tendencia, valor_meta, linea_base,
        anio_linea_base, nivel_mir, smart_medible, smart_alcanzable, smart_temporal, estatus_aprobado, responsable, activo)
    values (v_r.id, v_r.id_eje, v_r.id_sector, v_r.id_fuente, v_r.clave, v_r.nombre, v_r.variable, v_r.meta, v_r.tendencia, v_r.valor_meta,
        v_r.linea_base, v_r.anio_linea_base, v_r.nivel_mir, v_r.smart_medible, v_r.smart_alcanzable, v_r.smart_temporal,
        v_r.estatus_aprobado, v_r.responsable, v_r.activo)
    returning * into v_fila;
  else
    update core.indicador set id_eje = v_r.id_eje, id_sector = v_r.id_sector, id_fuente = v_r.id_fuente, clave = v_r.clave,
        nombre = v_r.nombre, variable = v_r.variable, meta = v_r.meta, tendencia = v_r.tendencia, valor_meta = v_r.valor_meta,
        linea_base = v_r.linea_base, anio_linea_base = v_r.anio_linea_base, nivel_mir = v_r.nivel_mir,
        smart_medible = v_r.smart_medible, smart_alcanzable = v_r.smart_alcanzable, smart_temporal = v_r.smart_temporal,
        estatus_aprobado = v_r.estatus_aprobado, responsable = v_r.responsable, activo = v_r.activo, updated_at = now()
     where id = v_id returning * into v_fila;
  end if;

  -- eje principal sincronizado con indicador_eje
  if not exists (select 1 from core.indicador_eje where id_indicador = v_id and id_eje = v_fila.id_eje and principal) then
    update core.indicador_eje set principal = false where id_indicador = v_id and principal;
    insert into core.indicador_eje (id_indicador, id_eje, principal) values (v_id, v_fila.id_eje, true)
      on conflict (id_indicador, id_eje) do update set principal = true;
  end if;
  return to_jsonb(v_fila);
end $$;

-- Ejes adicionales de un indicador (el principal lo gobierna id_eje)
create or replace function api.fn_asignar_indicador_eje(p_indicador text, p_eje int) returns jsonb
language plpgsql security definer set search_path = core, public as $$
declare v_fila core.indicador_eje;
begin
  perform core.exigir_rol(array['administrador','administrador_titular'], 'asignar ejes a un indicador');
  if not exists (select 1 from core.indicador where id = p_indicador) then
    raise exception 'El indicador % no existe.', p_indicador using errcode = 'P0002';
  end if;
  insert into core.indicador_eje (id_indicador, id_eje, principal) values (p_indicador, p_eje, false)
    on conflict (id_indicador, id_eje) do update set principal = core.indicador_eje.principal
    returning * into v_fila;
  return to_jsonb(v_fila);
end $$;

create or replace function api.fn_quitar_indicador_eje(p_indicador text, p_eje int) returns void
language plpgsql security definer set search_path = core, public as $$
begin
  perform core.exigir_rol(array['administrador','administrador_titular'], 'quitar ejes de un indicador');
  if exists (select 1 from core.indicador_eje where id_indicador = p_indicador and id_eje = p_eje and principal) then
    raise exception 'El eje % es el principal de %: cambia primero el eje del indicador.', p_eje, p_indicador using errcode = '23514';
  end if;
  delete from core.indicador_eje where id_indicador = p_indicador and id_eje = p_eje;
  if not found then raise exception 'El indicador % no tiene asignado el eje %.', p_indicador, p_eje using errcode = 'P0002'; end if;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Matriz de instrumentos y correspondencia indicador-instrumento
-- ---------------------------------------------------------------------------------------------
create or replace function api.fn_guardar_matriz_instrumento(p_datos jsonb) returns jsonb
language plpgsql security definer set search_path = core, public as $$
declare v_id text; v_ant core.matriz_instrumento; v_r core.matriz_instrumento; v_fila core.matriz_instrumento;
begin
  perform core.exigir_rol(array['administrador','administrador_titular'], 'gestionar la matriz de instrumentos');
  perform core.exigir_claves(p_datos, array['id','id_instrumento','clave_oe','objetivo','meta','indicador_origen','tendencia'], 'renglon de la matriz');
  v_id := nullif(btrim(p_datos ->> 'id'), '');
  if v_id is null then raise exception 'Falta el id del renglon de la matriz.' using errcode = '22023'; end if;
  select * into v_ant from core.matriz_instrumento where id = v_id;
  if not found then
    v_r := jsonb_populate_record(null::core.matriz_instrumento, p_datos);
    insert into core.matriz_instrumento (id, id_instrumento, clave_oe, objetivo, meta, indicador_origen, tendencia)
      values (v_r.id, v_r.id_instrumento, v_r.clave_oe, v_r.objetivo, v_r.meta, v_r.indicador_origen, v_r.tendencia) returning * into v_fila;
  else
    v_r := jsonb_populate_record(null::core.matriz_instrumento, to_jsonb(v_ant) || p_datos);
    update core.matriz_instrumento set id_instrumento = v_r.id_instrumento, clave_oe = v_r.clave_oe, objetivo = v_r.objetivo,
        meta = v_r.meta, indicador_origen = v_r.indicador_origen, tendencia = v_r.tendencia where id = v_id returning * into v_fila;
  end if;
  return to_jsonb(v_fila);
end $$;

create or replace function api.fn_vincular_indicador_instrumento(p_indicador text, p_instrumento text,
                                                                  p_correspondencia text, p_matriz text default null) returns jsonb
language plpgsql security definer set search_path = core, public as $$
declare v_id int; v_fila core.indicador_instrumento;
begin
  perform core.exigir_rol(array['administrador','administrador_titular'], 'vincular indicadores con instrumentos');
  select i.id into v_id from core.indicador_instrumento i
   where i.id_indicador = p_indicador and i.id_instrumento = p_instrumento and i.id_matriz is not distinct from p_matriz;
  if v_id is not null then
    update core.indicador_instrumento set correspondencia = p_correspondencia where id = v_id returning * into v_fila;
  else
    perform pg_advisory_xact_lock(hashtext('core.indicador_instrumento.id'));
    insert into core.indicador_instrumento (id, id_indicador, id_instrumento, id_matriz, correspondencia)
      values ((select coalesce(max(id), 0) + 1 from core.indicador_instrumento), p_indicador, p_instrumento, p_matriz, p_correspondencia)
      returning * into v_fila;
  end if;
  return to_jsonb(v_fila);
end $$;

create or replace function api.fn_quitar_indicador_instrumento(p_id int) returns void
language plpgsql security definer set search_path = core, public as $$
begin
  perform core.exigir_rol(array['administrador','administrador_titular'], 'quitar vinculos de indicador con instrumento');
  delete from core.indicador_instrumento where id = p_id;
  if not found then raise exception 'No existe el vinculo %.', p_id using errcode = 'P0002'; end if;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Umbrales del semaforo (D-16: solo el Titular; ademas lo exige el disparador core.exigir_titular)
-- Cierra el umbral vigente del mismo alcance (global si p_indicador es null) y abre el nuevo.
-- ---------------------------------------------------------------------------------------------
create or replace function api.fn_guardar_umbral(p_indicador text, p_verde numeric, p_amarillo numeric,
                                                  p_desde date default current_date) returns jsonb
language plpgsql security definer set search_path = core, public as $$
declare v_fila core.umbral_semaforo;
begin
  perform core.exigir_rol(array['administrador_titular'], 'gestionar los umbrales del semaforo (D-16)');
  if p_indicador is not null and not exists (select 1 from core.indicador where id = p_indicador) then
    raise exception 'El indicador % no existe.', p_indicador using errcode = 'P0002';
  end if;
  update core.umbral_semaforo set vigente_hasta = greatest(p_desde - 1, vigente_desde)
   where id_indicador is not distinct from p_indicador and vigente_hasta is null;
  insert into core.umbral_semaforo (id_indicador, verde_desde, amarillo_desde, vigente_desde, id_usuario)
    values (p_indicador, p_verde, p_amarillo, p_desde, auth.uid()) returning * into v_fila;
  return to_jsonb(v_fila);
end $$;

-- ---------------------------------------------------------------------------------------------
-- Permisos: solo cuentas con sesion (la funcion decide por rol); nada para anon
-- ---------------------------------------------------------------------------------------------
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as firma from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'api' and p.proname in ('fn_guardar_eje','fn_guardar_sector','fn_guardar_fuente','fn_guardar_indicador',
              'fn_asignar_indicador_eje','fn_quitar_indicador_eje','fn_guardar_matriz_instrumento','fn_vincular_indicador_instrumento',
              'fn_quitar_indicador_instrumento','fn_guardar_umbral')
  loop
    execute format('revoke all on function %s from public, anon', f.firma);
    execute format('grant execute on function %s to authenticated', f.firma);
  end loop;
end $$;

comment on function api.fn_guardar_eje(jsonb)        is 'Ciclo 4: crea o edita un eje tematico (Administrador, Titular). Baja = activo false; no se da de baja con indicadores activos.';
comment on function api.fn_guardar_sector(jsonb)     is 'Ciclo 4: crea o edita un sector (Administrador, Titular).';
comment on function api.fn_guardar_fuente(jsonb)     is 'Ciclo 4: crea o edita una fuente de informacion; el id se asigna solo si no viene (Administrador, Titular).';
comment on function api.fn_guardar_indicador(jsonb)  is 'Ciclo 4: crea o edita un indicador y mantiene su eje principal en indicador_eje; no se aprueba sin tendencia o meta (Administrador, Titular).';
comment on function api.fn_guardar_umbral(text, numeric, numeric, date) is 'Ciclo 4 (D-16): fija el umbral vigente del semaforo, global o de un indicador; solo el Administrador Titular.';
