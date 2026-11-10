-- 235_c4_campos_en_propuesta.sql
-- La propuesta de actualizacion de una capa lleva la lista de sus campos ({nombre, tipo, llenos, distintos, ejemplo}) para que
-- la administracion vea que trae el archivo nuevo frente a la capa vigente. Sin cambio de ER: va dentro de
-- metadatos_extra -> actualizacion_pendiente -> campos (y, al aprobar, en ultima_actualizacion).
begin;

create or replace function api.fn_proponer_actualizacion_capa(p_id text, p_datos jsonb) returns jsonb
language plpgsql security definer set search_path = core, public as $$
declare
  v_rol text; v_c core.capa; v_fila core.capa; v_ult text; v_prop jsonb; v_ind jsonb; v_i text;
  v_corte date; v_n integer;
begin
  v_rol := core.exigir_rol(array['capturista','administrador','administrador_titular'], 'proponer la actualizacion de capas');
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
end $$;

comment on function api.fn_proponer_actualizacion_capa(text, jsonb) is 'Captura: propone la actualizacion de una capa vigente (archivo nuevo, campos, motivo, justificacion >= 30 caracteres, fecha de corte, indicadores por ligar). La capa sigue vigente hasta que la administracion apruebe o rechace.';
notify pgrst, 'reload schema';
commit;
