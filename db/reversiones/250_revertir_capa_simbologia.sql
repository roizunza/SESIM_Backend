-- Reversión de la 250 · simbología por capa. NO se aplica sola.
-- ADVERTENCIA: borra la columna core.capa.simbologia y con ella los estilos ya cargados. Si hay estilos que conservar, respáldalos antes:
--   pg_dump -Fc -t core.capa > respaldo_antes_revertir_250.dump
-- Restaura las tres funciones a su definición anterior (api.fn_guardar_capa y api.fn_proponer_actualizacion_capa: migración 236;
-- api.fn_resolver_actualizacion_capa: migración 233) y la vista api.capa sin la columna.
-- Una propuesta pendiente que ya lleve "simbologia" dentro de actualizacion_pendiente se aprobaría sin copiarla (queda ignorada).

begin;

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

create or replace function api.fn_resolver_actualizacion_capa(p_id text, p_decision text, p_comentario text default null) returns jsonb
language plpgsql security definer set search_path = core, public as $$
declare v_c core.capa; v_p jsonb; v_fila core.capa; v_meta jsonb; v_i text;
begin
  perform core.exigir_rol(array['administrador','administrador_titular'], 'dictaminar actualizaciones de capas');
  if p_decision not in ('aprobar','rechazar') then
    raise exception 'Decision no valida: "%". Usa aprobar o rechazar.', p_decision using errcode = '22023';
  end if;
  select * into v_c from core.capa where id = p_id for update;
  if not found then raise exception 'La capa % no existe.', p_id using errcode = 'P0002'; end if;
  v_p := v_c.metadatos_extra -> 'actualizacion_pendiente';
  if v_p is null or v_p ->> 'estado' <> 'pendiente' then
    raise exception 'La capa % no tiene una actualizacion pendiente.', p_id using errcode = '55000';
  end if;
  if (v_p ->> 'propuesta_por')::uuid = auth.uid() then
    raise exception 'Cuatro ojos: quien propuso la actualizacion de % no la resuelve tambien.', p_id using errcode = '42501';
  end if;
  if p_decision = 'rechazar' and btrim(coalesce(p_comentario, '')) = '' then
    raise exception 'Rechazar exige un comentario con el motivo.' using errcode = '23514';
  end if;

  -- el dictamen va primero: el seguimiento del rechazo lee la propuesta para saber a quien avisar
  insert into core.dictamen (objeto_tipo, objeto_id, decision, estado_previo, estado_nuevo, comentario, id_usuario)
    values ('capa', p_id, case p_decision when 'aprobar' then 'validar' else 'rechazar' end, v_c.estatus, v_c.estatus,
            coalesce(nullif(btrim(p_comentario), ''), 'Actualizacion aprobada.'), auth.uid());

  v_meta := coalesce(v_c.metadatos_extra, '{}'::jsonb) - 'actualizacion_pendiente';
  if p_decision = 'aprobar' then
    v_meta := v_meta || jsonb_build_object('fecha_corte', v_p -> 'fecha_corte', 'geometria_pendiente_ingesta', true,
      'ultima_actualizacion', (v_p - 'estado') || jsonb_build_object('aprobada_por', auth.uid(), 'aprobada_en', now()));
    update core.capa set n_elementos = (v_p ->> 'n_elementos')::integer, archivo = v_p ->> 'archivo', metadatos_extra = v_meta, updated_at = now()
     where id = p_id returning * into v_fila;
    for v_i in select jsonb_array_elements_text(coalesce(v_p -> 'indicadores_agregar', '[]'::jsonb)) loop
      insert into core.capa_indicador (id_capa, id_indicador) values (p_id, v_i) on conflict do nothing;
    end loop;
    perform core.registrar_version_capa(p_id, 'Actualizacion aprobada: ' || (v_p ->> 'motivo') || '.');
  else
    update core.capa set metadatos_extra = v_meta || jsonb_build_object('ultima_actualizacion_rechazada',
        (v_p - 'estado') || jsonb_build_object('rechazada_por', auth.uid(), 'rechazada_en', now(), 'motivo_rechazo', btrim(p_comentario))),
      updated_at = now() where id = p_id returning * into v_fila;
    perform core.registrar_version_capa(p_id, 'Actualizacion rechazada: ' || btrim(p_comentario));
  end if;
  return to_jsonb(v_fila);
end $$;

comment on function api.fn_guardar_capa(jsonb) is 'Ciclo 4: alta o edicion (borrador) de una capa. Solo el Capturista y solo las suyas; la administracion dictamina, no carga.';
comment on function api.fn_proponer_actualizacion_capa(text, jsonb) is 'Ciclo 4: propone actualizar una capa vigente. Solo el Capturista; la administracion aprueba o rechaza.';
comment on function api.fn_resolver_actualizacion_capa(text, text, text) is 'Administrador y Titular: aprueba o rechaza (comentario obligatorio) la actualizacion pendiente de una capa. Cuatro ojos. Un rechazo abre el plazo de 10 dias habiles para quien la propuso.';

drop view if exists api.capa;
create view api.capa with (security_invoker = true) as
  select id, uuid_legado, titulo, proposito, tipo_geometria, srid_origen, estatus, responsable, conjunto_datos, id_instrumento, metadatos_extra, archivo, grupos, nomenclatura, n_elementos, geojson, activo, created_at, updated_at
  from core.capa;
revoke all on api.capa from public, anon, authenticated;
grant select on api.capa to authenticated;
grant select on api.capa to anon;
comment on view api.capa is 'Vista de lectura de core.capa (RLS de quien consulta). Ver api.diccionario.';

alter table core.capa drop constraint if exists capa_simbologia_valida;
alter table core.capa drop column if exists simbologia;
drop function if exists core.fn_simbologia_valida(jsonb);

notify pgrst, 'reload schema';
commit;
