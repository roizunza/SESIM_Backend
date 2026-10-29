-- Ciclo 4 (5/7) -- Funciones api.* de escritura de instrumentos de origen (D-20).
-- El Administrador (o el Titular) da de alta el instrumento y adjunta su PDF; lo envia a revision; solo el Administrador
-- Titular lo dictamina (D-16): validar, publicar o rechazar. Cuatro ojos: quien lo envio no lo dictamina.
-- Sin borrado fisico: la baja es logica (activo = false), para no romper la bitacora.
--   borrador --enviar (exige ruta_pdf)--> revision --validar--> vigente_admin --publicar--> vigente_publico
--   revision | vigente_admin | vigente_publico --rechazar (comentario obligatorio)--> borrador
-- `publicado` se mantiene solo (trigger trg_instrumento_a_sincronizar, migracion 219). El historial vive en core.bitacora_cambio.

create or replace function api.fn_guardar_instrumento(p_datos jsonb) returns jsonb
language plpgsql security definer set search_path = core, public as $$
declare v_id text; v_ant core.instrumento_origen; v_r core.instrumento_origen; v_fila core.instrumento_origen; v_existe boolean;
begin
  perform core.exigir_rol(array['administrador','administrador_titular'], 'guardar instrumentos');
  perform core.exigir_claves(p_datos, array['id','clave','nombre','ambito','id_unidad_ambito','competencia',
    'vigencia_desde','vigencia_hasta','ruta_pdf'], 'instrumento');
  v_id := nullif(btrim(p_datos ->> 'id'), '');

  if v_id is not null then
    select * into v_ant from core.instrumento_origen where id = v_id;
    v_existe := found;
  else
    v_existe := false;
  end if;

  if not v_existe then
    if v_id is null then
      perform pg_advisory_xact_lock(hashtext('instrumento_origen.id'));
      select 'I' || lpad((coalesce(max(substr(id, 2)::int), 0) + 1)::text, 2, '0') into v_id
        from core.instrumento_origen where id ~ '^I[0-9]+$';
    end if;
    v_r := jsonb_populate_record(null::core.instrumento_origen, p_datos || jsonb_build_object('id', v_id));
    insert into core.instrumento_origen (id, clave, nombre, ambito, id_unidad_ambito, competencia, vigencia_desde, vigencia_hasta,
        ruta_pdf, activo, publicado, estatus)
    values (v_id, v_r.clave, v_r.nombre, v_r.ambito, v_r.id_unidad_ambito, v_r.competencia, v_r.vigencia_desde, v_r.vigencia_hasta,
        v_r.ruta_pdf, true, false, 'borrador')
    returning * into v_fila;
  else
    if v_ant.estatus <> 'borrador' then
      raise exception 'El instrumento % esta en "%": para editarlo, el Titular debe devolverlo a borrador (rechazar con comentario).',
        v_id, v_ant.estatus using errcode = '55000';
    end if;
    v_r := jsonb_populate_record(null::core.instrumento_origen, to_jsonb(v_ant) || p_datos);
    update core.instrumento_origen set clave = v_r.clave, nombre = v_r.nombre, ambito = v_r.ambito,
        id_unidad_ambito = v_r.id_unidad_ambito, competencia = v_r.competencia, vigencia_desde = v_r.vigencia_desde,
        vigencia_hasta = v_r.vigencia_hasta, ruta_pdf = v_r.ruta_pdf
     where id = v_id returning * into v_fila;
  end if;
  return to_jsonb(v_fila);
end $$;

create or replace function api.fn_enviar_instrumento_revision(p_id text) returns jsonb
language plpgsql security definer set search_path = core, public as $$
declare v_i core.instrumento_origen; v_fila core.instrumento_origen;
begin
  perform core.exigir_rol(array['administrador','administrador_titular'], 'enviar instrumentos a revision');
  select * into v_i from core.instrumento_origen where id = p_id;
  if not found then raise exception 'El instrumento % no existe.', p_id using errcode = 'P0002'; end if;
  if v_i.estatus <> 'borrador' then
    raise exception 'El instrumento % ya esta en "%"; solo se envia a revision desde borrador.', p_id, v_i.estatus using errcode = '55000';
  end if;
  if not v_i.activo then
    raise exception 'El instrumento % esta dado de baja.', p_id using errcode = '55000';
  end if;
  if v_i.ruta_pdf is null then
    raise exception 'El instrumento % no tiene PDF adjunto; adjuntalo antes de enviarlo a revision.', p_id using errcode = '23514';
  end if;
  update core.instrumento_origen set estatus = 'revision' where id = p_id returning * into v_fila;
  return to_jsonb(v_fila);
end $$;

create or replace function api.fn_dictaminar_instrumento(p_id text, p_decision text, p_comentario text default null) returns jsonb
language plpgsql security definer set search_path = core, public as $$
declare v_i core.instrumento_origen; v_nuevo text; v_envio uuid; v_fila core.instrumento_origen;
begin
  perform core.exigir_rol(array['administrador_titular'], 'dictaminar instrumentos (D-16: solo el Administrador Titular)');
  if p_decision not in ('validar','publicar','rechazar') then
    raise exception 'Decision no valida: "%". Usa validar, publicar o rechazar.', p_decision using errcode = '22023';
  end if;
  select * into v_i from core.instrumento_origen where id = p_id for update;
  if not found then raise exception 'El instrumento % no existe.', p_id using errcode = 'P0002'; end if;

  if p_decision = 'rechazar' then
    if v_i.estatus not in ('revision','vigente_admin','vigente_publico') then
      raise exception 'El instrumento % esta en "%": no hay nada que rechazar.', p_id, v_i.estatus using errcode = '55000';
    end if;
    if btrim(coalesce(p_comentario, '')) = '' then
      raise exception 'Rechazar exige un comentario con el motivo.' using errcode = '23514';
    end if;
    v_nuevo := 'borrador';
  else
    if p_decision = 'validar' and v_i.estatus <> 'revision' then
      raise exception 'El instrumento % esta en "%": solo se valida desde revision.', p_id, v_i.estatus using errcode = '55000';
    end if;
    if p_decision = 'publicar' and v_i.estatus <> 'vigente_admin' then
      raise exception 'El instrumento % esta en "%": solo se publica uno ya validado (vigente_admin).', p_id, v_i.estatus using errcode = '55000';
    end if;
    v_envio := core.quien_envio('instrumento_origen', p_id);
    if v_envio is not null and v_envio = auth.uid() then
      raise exception 'Cuatro ojos: quien envio el instrumento % a revision no puede % tambien.', p_id,
        case p_decision when 'validar' then 'validarlo' else 'publicarlo' end using errcode = '42501';
    end if;
    if v_i.ruta_pdf is null then
      raise exception 'El instrumento % no tiene PDF adjunto.', p_id using errcode = '23514';
    end if;
    v_nuevo := case p_decision when 'validar' then 'vigente_admin' else 'vigente_publico' end;
  end if;

  insert into core.dictamen (objeto_tipo, objeto_id, decision, estado_previo, estado_nuevo, comentario, id_usuario)
    values ('instrumento', p_id, p_decision, v_i.estatus, v_nuevo, nullif(btrim(p_comentario), ''), auth.uid());
  update core.instrumento_origen set estatus = v_nuevo where id = p_id returning * into v_fila;
  return to_jsonb(v_fila);
end $$;

create or replace function api.fn_baja_instrumento(p_id text, p_activo boolean default false) returns jsonb
language plpgsql security definer set search_path = core, public as $$
declare v_i core.instrumento_origen; v_fila core.instrumento_origen;
begin
  perform core.exigir_rol(array['administrador','administrador_titular'], 'dar de baja instrumentos');
  select * into v_i from core.instrumento_origen where id = p_id;
  if not found then raise exception 'El instrumento % no existe.', p_id using errcode = 'P0002'; end if;
  if not p_activo and v_i.estatus = 'vigente_publico' then
    raise exception 'El instrumento % esta publicado: el Titular debe retirarlo del publico (rechazar) antes de la baja.', p_id using errcode = '55000';
  end if;
  update core.instrumento_origen set activo = p_activo where id = p_id returning * into v_fila;
  return to_jsonb(v_fila);
end $$;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as firma from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'api' and p.proname in ('fn_guardar_instrumento','fn_enviar_instrumento_revision',
              'fn_dictaminar_instrumento','fn_baja_instrumento')
  loop
    execute format('revoke all on function %s from public, anon', f.firma);
    execute format('grant execute on function %s to authenticated', f.firma);
  end loop;
end $$;

comment on function api.fn_guardar_instrumento(jsonb) is 'Ciclo 4 (D-20): alta (borrador) o edicion de un instrumento de origen. Administrador y Titular. Solo en borrador.';
comment on function api.fn_enviar_instrumento_revision(text) is 'Ciclo 4 (D-20): borrador -> revision; exige el PDF adjunto.';
comment on function api.fn_dictaminar_instrumento(text, text, text) is 'Ciclo 4 (D-20, D-16): solo el Administrador Titular valida, publica o rechaza; cuatro ojos; rechazar exige comentario.';
