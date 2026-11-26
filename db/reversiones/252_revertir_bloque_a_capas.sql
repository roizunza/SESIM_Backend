-- Reversión de la migración 252 (Bloque A de capas). Redactada el 2026-11-25; probada en base local; NO aplicada en la VM.
-- Restaura las definiciones de la 250 de core.creo_objeto, api.fn_guardar_capa y api.fn_dictaminar_capa, y quita las funciones nuevas.
-- No toca datos: las geometrías ya ingeridas, los eventos de reclamo y los de ingesta en core.bitacora_cambio se CONSERVAN
-- (la bitácora es de solo inserción). Tras revertir, una capa reclamada deja de reconocerse como de quien la reclamó (core.creo_objeto vuelve a
-- mirar solo el INSERT): si hay reclamos hechos, la 252 no debería revertirse sin avisar a esas cuentas.
-- Antes de correrla, cuenta los reclamos:  select count(*) from core.bitacora_cambio where datos_nuevos ->> 'evento' = 'reclamo_capa';

begin;

drop function if exists api.fn_reclamar_capa(text);
drop function if exists api.fn_capas_reclamables();
drop function if exists core.cerrar_ingesta_capa(text, text, text);
drop function if exists core.ingestar_capa_lote(text, text, jsonb, boolean);
drop function if exists core.derivar_territorio(geometry);
drop function if exists core.autorizar_ingesta_capa(text, text);
drop function if exists core.capa_sin_creador(text);

create or replace function core.creo_objeto(p_tabla text, p_id text) returns boolean
language sql stable security definer set search_path = core, public as $$
  select exists (select 1 from core.bitacora_cambio b
                  where b.id_usuario = auth.uid() and b.tabla_afectada = p_tabla and b.id_registro = p_id and b.accion = 'INSERT')
$$;

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
    'id_instrumento','metadatos_extra','archivo','grupos','nomenclatura','n_elementos','geojson','simbologia'], 'capa');
  v_id := nullif(btrim(p_datos ->> 'id'), '');
  if v_id is null then raise exception 'Falta el id de la capa.' using errcode = '22023'; end if;
  if p_datos ? 'metadatos_extra' and jsonb_typeof(p_datos -> 'metadatos_extra') <> 'object' then
    raise exception 'metadatos_extra debe ser un objeto JSON.' using errcode = '22023';
  end if;
  if p_datos ? 'simbologia' and not core.fn_simbologia_valida(p_datos -> 'simbologia') then
    raise exception 'La simbologia debe ser un objeto JSON con "tipo" (o vacio) y no pasar de 100 KB.' using errcode = '22023';
  end if;

  select * into v_ant from core.capa where id = v_id;
  v_existe := found;

  if not v_existe then
    v_r := jsonb_populate_record(null::core.capa, jsonb_build_object('metadatos_extra', '{}'::jsonb) || p_datos);
    insert into core.capa (id, titulo, proposito, tipo_geometria, srid_origen, estatus, responsable, conjunto_datos, id_instrumento,
        metadatos_extra, archivo, grupos, nomenclatura, n_elementos, geojson, simbologia)
    values (v_r.id, v_r.titulo, v_r.proposito, v_r.tipo_geometria, v_r.srid_origen, 'borrador', v_r.responsable, v_r.conjunto_datos,
        v_r.id_instrumento, v_r.metadatos_extra, v_r.archivo, v_r.grupos, v_r.nomenclatura, v_r.n_elementos, v_r.geojson,
        coalesce(v_r.simbologia, '{}'::jsonb))
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
        n_elementos = v_r.n_elementos, geojson = v_r.geojson,
        simbologia = case when v_r.simbologia is null or v_r.simbologia = '{}'::jsonb then v_ant.simbologia else v_r.simbologia end,
        updated_at = now()
     where id = v_id returning * into v_fila;
  end if;
  return to_jsonb(v_fila);
end $function$;

CREATE OR REPLACE FUNCTION api.fn_dictaminar_capa(p_id text, p_decision text, p_comentario text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'core', 'public'
AS $function$
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
end $function$;

notify pgrst, 'reload schema';
commit;
