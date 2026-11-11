-- 236_c4_politicas_roles_flujo.sql
-- Flujo por roles (decision del 10-nov-2026):
--   · Indicadores e instrumentos: el Administrador los da de alta y edita (mientras no esten aprobados); SOLO el Administrador
--     Titular los aprueba (instrumentos: ya era D-16; indicadores: nuevo) y SOLO el Titular da de baja indicadores e instrumentos.
--   · Capas: las sube y actualiza SOLO el Capturista, ligadas a un indicador APROBADO y activo. Administrador y Titular las dictaminan
--     (validar, publicar, devolver, aprobar o rechazar actualizaciones) y ambos pueden darlas de baja. Ya no las cargan.
-- Sin cambio de ER: solo reglas de las funciones api.*.
begin;

CREATE OR REPLACE FUNCTION api.fn_guardar_indicador(p_datos jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'core', 'public'
AS $function$
declare v_rol text; v_id text; v_ant core.indicador; v_r core.indicador; v_fila core.indicador; v_existe boolean;
begin
  v_rol := core.exigir_rol(array['administrador','administrador_titular'], 'gestionar el catalogo de indicadores');
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

  -- Administrador: propone (alta y edicion en borrador). Aprobar, dar de baja y tocar un indicador ya aprobado es del Titular.
  if v_rol = 'administrador' then
    if v_existe and v_ant.estatus_aprobado then
      raise exception 'El indicador % ya esta aprobado: solo el Administrador Titular lo modifica.', v_id using errcode = '42501';
    end if;
    if v_r.estatus_aprobado is distinct from (case when v_existe then v_ant.estatus_aprobado else false end) then
      raise exception 'Solo el Administrador Titular aprueba indicadores.' using errcode = '42501';
    end if;
    if v_r.activo is distinct from (case when v_existe then v_ant.activo else true end) then
      raise exception 'Solo el Administrador Titular da de baja o reactiva indicadores.' using errcode = '42501';
    end if;
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
end $function$;

CREATE OR REPLACE FUNCTION api.fn_baja_instrumento(p_id text, p_activo boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'core', 'public'
AS $function$
declare v_i core.instrumento_origen; v_fila core.instrumento_origen;
begin
  perform core.exigir_rol(array['administrador_titular'], 'dar de baja instrumentos (solo el Administrador Titular)');
  select * into v_i from core.instrumento_origen where id = p_id;
  if not found then raise exception 'El instrumento % no existe.', p_id using errcode = 'P0002'; end if;
  if not p_activo and v_i.estatus = 'vigente_publico' then
    raise exception 'El instrumento % esta publicado: el Titular debe retirarlo del publico (rechazar) antes de la baja.', p_id using errcode = '55000';
  end if;
  update core.instrumento_origen set activo = p_activo where id = p_id returning * into v_fila;
  return to_jsonb(v_fila);
end $function$;

CREATE OR REPLACE FUNCTION api.fn_vincular_capa_indicador(p_capa text, p_indicador text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'core', 'public'
AS $function$
declare v_fila core.capa_indicador;
begin
  perform core.puede_tocar_vinculos_capa(p_capa);
  if not exists (select 1 from core.indicador where id = p_indicador) then
    raise exception 'El indicador % no existe.', p_indicador using errcode = 'P0002';
  end if;
  if not exists (select 1 from core.indicador where id = p_indicador and estatus_aprobado and activo) then
    raise exception 'El indicador % no esta aprobado (o esta dado de baja): una capa solo se liga a indicadores aprobados.', p_indicador using errcode = '55000';
  end if;
  insert into core.capa_indicador (id_capa, id_indicador) values (p_capa, p_indicador)
    on conflict do nothing returning * into v_fila;
  return coalesce(to_jsonb(v_fila), jsonb_build_object('id_capa', p_capa, 'id_indicador', p_indicador));
end $function$;

CREATE OR REPLACE FUNCTION api.fn_guardar_capa(p_datos jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'core', 'public'
AS $function$
declare
  v_rol text; v_id text; v_ant core.capa; v_r core.capa; v_fila core.capa; v_existe boolean; v_meta jsonb;
begin
  v_rol := core.exigir_rol(array['capturista'], 'guardar capas (solo el Capturista: la administracion dictamina)');
  perform core.exigir_claves(p_datos, array['id','titulo','proposito','tipo_geometria','srid_origen','responsable','conjunto_datos',
    'id_instrumento','metadatos_extra','archivo','grupos','nomenclatura','n_elementos','geojson'], 'capa');
  v_id := nullif(btrim(p_datos ->> 'id'), '');
  if v_id is null then raise exception 'Falta el id de la capa.' using errcode = '22023'; end if;
  if p_datos ? 'metadatos_extra' and jsonb_typeof(p_datos -> 'metadatos_extra') <> 'object' then
    raise exception 'metadatos_extra debe ser un objeto JSON.' using errcode = '22023';
  end if;

  select * into v_ant from core.capa where id = v_id;
  v_existe := found;

  if not v_existe then
    v_r := jsonb_populate_record(null::core.capa, jsonb_build_object('metadatos_extra', '{}'::jsonb) || p_datos);
    insert into core.capa (id, titulo, proposito, tipo_geometria, srid_origen, estatus, responsable, conjunto_datos, id_instrumento,
        metadatos_extra, archivo, grupos, nomenclatura, n_elementos, geojson)
    values (v_r.id, v_r.titulo, v_r.proposito, v_r.tipo_geometria, v_r.srid_origen, 'borrador', v_r.responsable, v_r.conjunto_datos,
        v_r.id_instrumento, v_r.metadatos_extra, v_r.archivo, v_r.grupos, v_r.nomenclatura, v_r.n_elementos, v_r.geojson)
    returning * into v_fila;
    perform core.registrar_version_capa(v_id, 'Alta de la capa en borrador.');
  else
    if v_ant.estatus <> 'borrador' then
      raise exception 'La capa % esta en "%": para editarla, la administracion debe devolverla a borrador (rechazar con comentario).',
        v_id, v_ant.estatus using errcode = '55000';
    end if;
    if v_rol = 'capturista' and not core.creo_objeto('capa', v_id) then
      raise exception 'Solo puedes editar las capas que diste de alta tu.' using errcode = '42501';
    end if;
    v_meta := coalesce(v_ant.metadatos_extra, '{}'::jsonb) || coalesce(p_datos -> 'metadatos_extra', '{}'::jsonb);
    v_r := jsonb_populate_record(null::core.capa, to_jsonb(v_ant) || (p_datos - 'metadatos_extra') || jsonb_build_object('metadatos_extra', v_meta));
    update core.capa set titulo = v_r.titulo, proposito = v_r.proposito, tipo_geometria = v_r.tipo_geometria, srid_origen = v_r.srid_origen,
        responsable = v_r.responsable, conjunto_datos = v_r.conjunto_datos, id_instrumento = v_r.id_instrumento,
        metadatos_extra = v_r.metadatos_extra, archivo = v_r.archivo, grupos = v_r.grupos, nomenclatura = v_r.nomenclatura,
        n_elementos = v_r.n_elementos, geojson = v_r.geojson, updated_at = now()
     where id = v_id returning * into v_fila;
  end if;
  return to_jsonb(v_fila);
end $function$;

CREATE OR REPLACE FUNCTION api.fn_enviar_capa_revision(p_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'core', 'public'
AS $function$
declare v_rol text; v_c core.capa; v_falta text[]; v_fila core.capa;
begin
  v_rol := core.exigir_rol(array['capturista'], 'enviar capas a revision (solo el Capturista: la administracion dictamina)');
  select * into v_c from core.capa where id = p_id;
  if not found then raise exception 'La capa % no existe.', p_id using errcode = 'P0002'; end if;
  if v_rol = 'capturista' and not core.creo_objeto('capa', p_id) then
    raise exception 'Solo puedes enviar a revision las capas que diste de alta tu.' using errcode = '42501';
  end if;
  if v_c.estatus <> 'borrador' then
    raise exception 'La capa % ya esta en "%"; solo se envia a revision desde borrador.', p_id, v_c.estatus using errcode = '55000';
  end if;
  v_falta := core.faltantes_ficha(v_c.metadatos_extra);
  if array_length(v_falta, 1) > 0 then
    raise exception 'La ficha de la capa % esta incompleta; falta: %.', p_id, array_to_string(v_falta, ', ') using errcode = '23514';
  end if;
  update core.capa set estatus = 'revision', updated_at = now() where id = p_id returning * into v_fila;
  perform core.registrar_version_capa(p_id, 'Enviada a revision.');
  return to_jsonb(v_fila);
end $function$;

CREATE OR REPLACE FUNCTION api.fn_proponer_actualizacion_capa(p_id text, p_datos jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'core', 'public'
AS $function$
declare
  v_rol text; v_c core.capa; v_fila core.capa; v_ult text; v_prop jsonb; v_ind jsonb; v_i text;
  v_corte date; v_n integer;
begin
  v_rol := core.exigir_rol(array['capturista'], 'proponer la actualizacion de capas (solo el Capturista: la administracion dictamina)');
  perform core.exigir_claves(p_datos, array['archivo','n_elementos','fecha_corte','motivo','justificacion','columna_id_origen',
    'variacion_elementos','indicadores_agregar','campos'], 'actualizacion de capa');
  select * into v_c from core.capa where id = p_id for update;
  if not found then raise exception 'La capa % no existe.', p_id using errcode = 'P0002'; end if;
  if not v_c.activo then raise exception 'La capa % esta dada de baja.', p_id using errcode = '55000'; end if;
  if v_c.estatus not in ('vigente_admin','vigente_publico') then
    raise exception 'La capa % esta en "%": la actualizacion aplica a capas vigentes. Si sigue en borrador o en revision, edita su ficha o espera el dictamen.',
      p_id, v_c.estatus using errcode = '55000';
  end if;
  if coalesce(v_c.metadatos_extra -> 'actualizacion_pendiente' ->> 'estado', '') = 'pendiente' then
    raise exception 'La capa % ya tiene una actualizacion esperando dictamen de la administracion.', p_id using errcode = '55000';
  end if;

  if btrim(coalesce(p_datos ->> 'archivo', '')) = '' then raise exception 'Falta el nombre del archivo.' using errcode = '23514'; end if;
  if btrim(coalesce(p_datos ->> 'motivo', '')) = '' then raise exception 'Falta el motivo de la actualizacion.' using errcode = '23514'; end if;
  if char_length(btrim(coalesce(p_datos ->> 'justificacion', ''))) < 30 then
    raise exception 'La justificacion debe tener al menos 30 caracteres.' using errcode = '23514';
  end if;
  begin v_n := (p_datos ->> 'n_elementos')::integer; exception when others then v_n := null; end;
  if v_n is null or v_n < 1 then raise exception 'n_elementos debe ser un entero positivo.' using errcode = '23514'; end if;
  begin v_corte := (p_datos ->> 'fecha_corte')::date; exception when others then v_corte := null; end;
  if v_corte is null then raise exception 'Falta la fecha de corte (AAAA-MM-DD).' using errcode = '23514'; end if;
  if v_corte > core.hoy_mx() then raise exception 'La fecha de corte no puede ser futura.' using errcode = '23514'; end if;

  if p_datos ? 'campos' and jsonb_typeof(p_datos -> 'campos') <> 'array' then
    raise exception 'campos debe ser una lista de {nombre, tipo}.' using errcode = '22023';
  end if;
  v_ind := coalesce(p_datos -> 'indicadores_agregar', '[]'::jsonb);
  if jsonb_typeof(v_ind) <> 'array' then raise exception 'indicadores_agregar debe ser una lista.' using errcode = '22023'; end if;
  for v_i in select jsonb_array_elements_text(v_ind) loop
    if not exists (select 1 from core.indicador where id = v_i) then
      raise exception 'El indicador % no existe.', v_i using errcode = 'P0002';
    end if;
  end loop;

  -- Plazo del rechazo anterior (mismo criterio que al reenviar un borrador)
  perform core.vencer_rechazos();
  select s.estado into v_ult from core.rechazo_seguimiento s
   where s.objeto_tipo = 'capa' and s.objeto_id = p_id and s.id_destinatario = auth.uid() order by s.created_at desc limit 1;
  if v_rol = 'capturista' and v_ult in ('vencida','descartada') then
    raise exception 'El rechazo anterior de % esta "%": pide a un Administrador que lo reabra.', p_id,
      case v_ult when 'vencida' then 'vencido (pasaron los dias habiles del plazo)' else 'descartado por ti' end using errcode = '55000';
  end if;

  v_prop := jsonb_build_object(
    'estado', 'pendiente', 'propuesta_por', auth.uid(), 'propuesta_en', now(), 'estatus_origen', v_c.estatus,
    'archivo', btrim(p_datos ->> 'archivo'), 'n_elementos', v_n, 'n_elementos_antes', v_c.n_elementos, 'fecha_corte', v_corte,
    'motivo', btrim(p_datos ->> 'motivo'), 'justificacion', btrim(p_datos ->> 'justificacion'),
    'columna_id_origen', p_datos ->> 'columna_id_origen', 'variacion_elementos', p_datos -> 'variacion_elementos',
    'indicadores_agregar', v_ind, 'campos', coalesce(p_datos -> 'campos', '[]'::jsonb));
  update core.capa set metadatos_extra = coalesce(metadatos_extra, '{}'::jsonb) || jsonb_build_object('actualizacion_pendiente', v_prop),
         updated_at = now() where id = p_id returning * into v_fila;
  update core.rechazo_seguimiento set estado = 'atendida', decidido_en = now(), decidido_por = auth.uid()
   where objeto_tipo = 'capa' and objeto_id = p_id and estado in ('pendiente','retomada','vencida','descartada');
  perform core.registrar_version_capa(p_id, 'Actualizacion propuesta (' || btrim(p_datos ->> 'motivo') || ').');
  return to_jsonb(v_fila);
end $function$;


comment on function api.fn_guardar_indicador(jsonb) is 'Ciclo 4: alta y edicion de indicadores. El Administrador propone (no aprueba, no da de baja, no toca uno aprobado); el Titular aprueba y da de baja.';
comment on function api.fn_baja_instrumento(text, boolean) is 'Ciclo 4 (D-20): baja o reactivacion de un instrumento. Solo el Administrador Titular.';
comment on function api.fn_vincular_capa_indicador(text, text) is 'Ciclo 4: liga una capa a un indicador APROBADO y activo. Capturista: solo capas suyas en borrador.';
comment on function api.fn_guardar_capa(jsonb) is 'Ciclo 4: alta o edicion (borrador) de una capa. Solo el Capturista y solo las suyas; la administracion dictamina, no carga.';
comment on function api.fn_enviar_capa_revision(text) is 'Ciclo 4: borrador -> revision. Solo el Capturista que la creo.';
comment on function api.fn_proponer_actualizacion_capa(text, jsonb) is 'Ciclo 4: propone actualizar una capa vigente. Solo el Capturista; la administracion aprueba o rechaza.';

notify pgrst, 'reload schema';
commit;
