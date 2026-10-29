-- Ciclo 4 (4/7) -- Funciones api.* de escritura de capas (metadatos y flujo de revision).
-- Roles: el Capturista da de alta y edita SUS capas mientras estan en borrador y las envia a revision; el Administrador y el
-- Titular pueden ademas dictaminar y publicar (decision de negocio del 29-oct-2026). El archivo geografico (capa_vector) lo carga
-- el servicio de procesos en el Ciclo 9; aqui se gestionan la ficha y el estatus.
-- Maquina de estados (la misma de las mediciones, Alcances):
--   borrador --enviar--> revision --validar--> vigente_admin --publicar--> vigente_publico
--   revision | vigente_admin | vigente_publico --rechazar (comentario obligatorio)--> borrador
-- Cuatro ojos: quien envio la capa a revision no la valida ni la publica. Cada cambio de estado deja: una fila en
-- core.dictamen (si lo dicta la administracion), una version en core.capa_version y, por los disparadores del Ciclo 5, un
-- evento CAMBIO_ESTADO en core.bitacora_cambio.

create or replace function core.registrar_version_capa(p_id text, p_nota text) returns void
language plpgsql security definer set search_path = core, public as $$
begin
  insert into core.capa_version (id_capa, version, estatus, metadatos, id_usuario, nota)
  select c.id, coalesce((select max(v.version) from core.capa_version v where v.id_capa = c.id), 0) + 1,
         c.estatus, c.metadatos_extra, auth.uid(), p_nota
    from core.capa c where c.id = p_id;
end $$;
revoke all on function core.registrar_version_capa(text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Alta y edicion de la ficha (solo en borrador)
-- ---------------------------------------------------------------------------------------------
create or replace function api.fn_guardar_capa(p_datos jsonb) returns jsonb
language plpgsql security definer set search_path = core, public as $$
declare
  v_rol text; v_id text; v_ant core.capa; v_r core.capa; v_fila core.capa; v_existe boolean; v_meta jsonb;
begin
  v_rol := core.exigir_rol(array['capturista','administrador','administrador_titular'], 'guardar capas');
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
end $$;

-- ---------------------------------------------------------------------------------------------
-- Enviar a revision
-- ---------------------------------------------------------------------------------------------
create or replace function api.fn_enviar_capa_revision(p_id text) returns jsonb
language plpgsql security definer set search_path = core, public as $$
declare v_rol text; v_c core.capa; v_falta text[]; v_fila core.capa;
begin
  v_rol := core.exigir_rol(array['capturista','administrador','administrador_titular'], 'enviar capas a revision');
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
end $$;

-- ---------------------------------------------------------------------------------------------
-- Dictamen de la administracion
-- ---------------------------------------------------------------------------------------------
create or replace function api.fn_dictaminar_capa(p_id text, p_decision text, p_comentario text default null) returns jsonb
language plpgsql security definer set search_path = core, public as $$
declare v_c core.capa; v_nuevo text; v_envio uuid; v_fila core.capa;
begin
  perform core.exigir_rol(array['administrador','administrador_titular'], 'dictaminar capas');
  if p_decision not in ('validar','publicar','rechazar') then
    raise exception 'Decision no valida: "%". Usa validar, publicar o rechazar.', p_decision using errcode = '22023';
  end if;
  select * into v_c from core.capa where id = p_id for update;
  if not found then raise exception 'La capa % no existe.', p_id using errcode = 'P0002'; end if;

  if p_decision = 'rechazar' then
    if v_c.estatus not in ('revision','vigente_admin','vigente_publico') then
      raise exception 'La capa % esta en "%": no hay nada que rechazar.', p_id, v_c.estatus using errcode = '55000';
    end if;
    if btrim(coalesce(p_comentario, '')) = '' then
      raise exception 'Rechazar exige un comentario con el motivo.' using errcode = '23514';
    end if;
    v_nuevo := 'borrador';
  else
    if p_decision = 'validar' and v_c.estatus <> 'revision' then
      raise exception 'La capa % esta en "%": solo se valida desde revision.', p_id, v_c.estatus using errcode = '55000';
    end if;
    if p_decision = 'publicar' and v_c.estatus <> 'vigente_admin' then
      raise exception 'La capa % esta en "%": solo se publica una capa ya validada (vigente_admin).', p_id, v_c.estatus using errcode = '55000';
    end if;
    -- cuatro ojos
    v_envio := core.quien_envio('capa', p_id);
    if v_envio is not null and v_envio = auth.uid() then
      raise exception 'Cuatro ojos: quien envio la capa % a revision no puede % tambien.', p_id,
        case p_decision when 'validar' then 'validarla' else 'publicarla' end using errcode = '42501';
    end if;
    if array_length(core.faltantes_ficha(v_c.metadatos_extra), 1) > 0 then
      raise exception 'La ficha de la capa % esta incompleta; falta: %.', p_id,
        array_to_string(core.faltantes_ficha(v_c.metadatos_extra), ', ') using errcode = '23514';
    end if;
    if p_decision = 'publicar' and v_c.metadatos_extra ->> 'restriccion_uso' is distinct from 'pública' then
      raise exception 'La capa % no se puede publicar: su restriccion de uso es "%", no "pública" (D-17).', p_id,
        coalesce(v_c.metadatos_extra ->> 'restriccion_uso', 'sin definir') using errcode = '23514';
    end if;
    v_nuevo := case p_decision when 'validar' then 'vigente_admin' else 'vigente_publico' end;
  end if;

  insert into core.dictamen (objeto_tipo, objeto_id, decision, estado_previo, estado_nuevo, comentario, id_usuario)
    values ('capa', p_id, p_decision, v_c.estatus, v_nuevo, nullif(btrim(p_comentario), ''), auth.uid());
  update core.capa set estatus = v_nuevo, updated_at = now() where id = p_id returning * into v_fila;
  perform core.registrar_version_capa(p_id, case p_decision when 'validar' then 'Validada por la administracion.'
                                                          when 'publicar' then 'Publicada.'
                                                          else 'Rechazada: ' || btrim(p_comentario) end);
  return to_jsonb(v_fila);
end $$;

-- ---------------------------------------------------------------------------------------------
-- Vinculos capa-indicador y baja logica
-- ---------------------------------------------------------------------------------------------
create or replace function core.puede_tocar_vinculos_capa(p_capa text) returns void
language plpgsql security definer set search_path = core, public as $$
declare v_rol text; v_c core.capa;
begin
  v_rol := core.exigir_rol(array['capturista','administrador','administrador_titular'], 'vincular capas con indicadores');
  select * into v_c from core.capa where id = p_capa;
  if not found then raise exception 'La capa % no existe.', p_capa using errcode = 'P0002'; end if;
  if v_rol = 'capturista' and not (core.creo_objeto('capa', p_capa) and v_c.estatus = 'borrador') then
    raise exception 'Solo puedes vincular capas tuyas que sigan en borrador.' using errcode = '42501';
  end if;
end $$;
revoke all on function core.puede_tocar_vinculos_capa(text) from public, anon, authenticated;

create or replace function api.fn_vincular_capa_indicador(p_capa text, p_indicador text) returns jsonb
language plpgsql security definer set search_path = core, public as $$
declare v_fila core.capa_indicador;
begin
  perform core.puede_tocar_vinculos_capa(p_capa);
  if not exists (select 1 from core.indicador where id = p_indicador) then
    raise exception 'El indicador % no existe.', p_indicador using errcode = 'P0002';
  end if;
  insert into core.capa_indicador (id_capa, id_indicador) values (p_capa, p_indicador)
    on conflict do nothing returning * into v_fila;
  return coalesce(to_jsonb(v_fila), jsonb_build_object('id_capa', p_capa, 'id_indicador', p_indicador));
end $$;

create or replace function api.fn_quitar_capa_indicador(p_capa text, p_indicador text) returns void
language plpgsql security definer set search_path = core, public as $$
begin
  perform core.puede_tocar_vinculos_capa(p_capa);
  delete from core.capa_indicador where id_capa = p_capa and id_indicador = p_indicador;
  if not found then raise exception 'La capa % no esta vinculada al indicador %.', p_capa, p_indicador using errcode = 'P0002'; end if;
end $$;

create or replace function api.fn_baja_capa(p_id text, p_activo boolean default false) returns jsonb
language plpgsql security definer set search_path = core, public as $$
declare v_c core.capa; v_fila core.capa;
begin
  perform core.exigir_rol(array['administrador','administrador_titular'], 'dar de baja capas');
  select * into v_c from core.capa where id = p_id;
  if not found then raise exception 'La capa % no existe.', p_id using errcode = 'P0002'; end if;
  if not p_activo and v_c.estatus = 'vigente_publico' then
    raise exception 'La capa % esta publicada: retirala del publico (rechazar) antes de darla de baja.', p_id using errcode = '55000';
  end if;
  update core.capa set activo = p_activo, updated_at = now() where id = p_id returning * into v_fila;
  return to_jsonb(v_fila);
end $$;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as firma from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'api' and p.proname in ('fn_guardar_capa','fn_enviar_capa_revision','fn_dictaminar_capa',
              'fn_vincular_capa_indicador','fn_quitar_capa_indicador','fn_baja_capa')
  loop
    execute format('revoke all on function %s from public, anon', f.firma);
    execute format('grant execute on function %s to authenticated', f.firma);
  end loop;
end $$;

comment on function api.fn_guardar_capa(jsonb) is 'Ciclo 4: da de alta (borrador) o edita la ficha de una capa. Capturista: solo las suyas; Administrador y Titular: cualquiera. Solo se edita en borrador.';
comment on function api.fn_enviar_capa_revision(text) is 'Ciclo 4: borrador -> revision. Exige la ficha completa (custodio, fuente, linaje, sistema de coordenadas, restriccion de uso).';
comment on function api.fn_dictaminar_capa(text, text, text) is 'Ciclo 4: validar (revision -> vigente_admin), publicar (vigente_admin -> vigente_publico, exige restriccion publica) o rechazar (vuelve a borrador, comentario obligatorio). Administrador y Titular; cuatro ojos.';
