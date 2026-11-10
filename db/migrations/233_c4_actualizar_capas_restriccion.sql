-- Ciclo 4 (ajuste de captura) -- Actualizar capas ya vigentes con justificacion + restriccion de uso a cargo de la administracion.
-- SIN cambios al modelo ER: no hay tablas ni columnas nuevas. Solo funciones y un ajuste de regla.
--
-- 1. Actualizacion de una capa vigente. El Capturista (o la administracion) PROPONE el archivo nuevo con motivo y justificacion;
--    la capa sigue vigente (el publico no pierde la version actual) y la propuesta queda en core.capa.metadatos_extra ->
--    'actualizacion_pendiente'. La administracion la aprueba o la rechaza (cuatro ojos: quien propone no la resuelve). Cada paso deja
--    version en core.capa_version, dictamen (core.dictamen) y evento en core.bitacora_cambio. Un rechazo abre el seguimiento de 10 dias
--    habiles (ER-4) con la persona que propuso como destinataria; al proponer de nuevo, ese seguimiento queda "atendida".
-- 2. La restriccion de uso (publica / interna) ya no la pide el Capturista: la define la administracion con
--    api.fn_definir_restriccion_capa. Se publica solo si es "publica" (D-17, sin cambio). core.faltantes_ficha deja de exigirla.
-- 3. El archivo (GeoPackage) se carga a core.capa_vector con el servicio de procesos (Ciclo 9). Mientras tanto la aprobacion deja
--    la marca geometria_pendiente_ingesta = true en la ficha.

-- ---------------------------------------------------------------------------------------------
-- 2. Restriccion de uso: fuera de la ficha del capturista
-- ---------------------------------------------------------------------------------------------
create or replace function core.faltantes_ficha(p_metadatos jsonb) returns text[]
language sql immutable set search_path = core, public as $$
  select coalesce(array_agg(c order by o), '{}')
    from unnest(array['custodio','fuente_origen','linaje','sistema_coordenadas']) with ordinality as t(c, o)
   where btrim(coalesce(p_metadatos ->> c, '')) = ''
$$;

create or replace function api.fn_definir_restriccion_capa(p_id text, p_restriccion text) returns jsonb
language plpgsql security definer set search_path = core, public as $$
declare v_c core.capa; v_fila core.capa;
begin
  perform core.exigir_rol(array['administrador','administrador_titular'], 'definir la restriccion de uso de una capa');
  if p_restriccion not in ('pública','interna') then
    raise exception 'Restriccion no valida: "%". Usa "pública" o "interna".', p_restriccion using errcode = '22023';
  end if;
  select * into v_c from core.capa where id = p_id for update;
  if not found then raise exception 'La capa % no existe.', p_id using errcode = 'P0002'; end if;
  if v_c.estatus = 'vigente_publico' and p_restriccion <> 'pública' then
    raise exception 'La capa % esta publicada: retirala del publico (rechazar) antes de volverla interna.', p_id using errcode = '55000';
  end if;
  update core.capa set metadatos_extra = coalesce(metadatos_extra, '{}'::jsonb) || jsonb_build_object('restriccion_uso', p_restriccion),
         updated_at = now() where id = p_id returning * into v_fila;
  perform core.registrar_version_capa(p_id, 'Restriccion de uso definida: ' || p_restriccion || '.');
  return to_jsonb(v_fila);
end $$;

-- ---------------------------------------------------------------------------------------------
-- 1. Proponer la actualizacion de una capa vigente
-- ---------------------------------------------------------------------------------------------
create or replace function api.fn_proponer_actualizacion_capa(p_id text, p_datos jsonb) returns jsonb
language plpgsql security definer set search_path = core, public as $$
declare
  v_rol text; v_c core.capa; v_fila core.capa; v_ult text; v_prop jsonb; v_ind jsonb; v_i text;
  v_corte date; v_n integer;
begin
  v_rol := core.exigir_rol(array['capturista','administrador','administrador_titular'], 'proponer la actualizacion de capas');
  perform core.exigir_claves(p_datos, array['archivo','n_elementos','fecha_corte','motivo','justificacion','columna_id_origen',
    'variacion_elementos','indicadores_agregar'], 'actualizacion de capa');
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
    'indicadores_agregar', v_ind);
  update core.capa set metadatos_extra = coalesce(metadatos_extra, '{}'::jsonb) || jsonb_build_object('actualizacion_pendiente', v_prop),
         updated_at = now() where id = p_id returning * into v_fila;
  update core.rechazo_seguimiento set estado = 'atendida', decidido_en = now(), decidido_por = auth.uid()
   where objeto_tipo = 'capa' and objeto_id = p_id and estado in ('pendiente','retomada','vencida','descartada');
  perform core.registrar_version_capa(p_id, 'Actualizacion propuesta (' || btrim(p_datos ->> 'motivo') || ').');
  return to_jsonb(v_fila);
end $$;

-- ---------------------------------------------------------------------------------------------
-- Dictamen de la actualizacion (administracion, cuatro ojos)
-- ---------------------------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------------------------
-- Seguimiento del rechazo: si lo rechazado es una actualizacion, el aviso va a quien la propuso
-- ---------------------------------------------------------------------------------------------
create or replace function core.fn_seguimiento_de_rechazo() returns trigger
language plpgsql security definer set search_path = core, public as $$
declare v_dest uuid; v_tabla text;
begin
  if new.decision <> 'rechazar' or new.objeto_tipo not in ('capa','instrumento') then return new; end if;
  v_tabla := case new.objeto_tipo when 'capa' then 'capa' else 'instrumento_origen' end;
  if new.objeto_tipo = 'capa' then
    select nullif(c.metadatos_extra -> 'actualizacion_pendiente' ->> 'propuesta_por', '')::uuid into v_dest from core.capa c where c.id = new.objeto_id;
  end if;
  if v_dest is null then v_dest := core.quien_envio(v_tabla, new.objeto_id); end if;
  if v_dest is null then
    select b.id_usuario into v_dest from core.bitacora_cambio b
     where b.tabla_afectada = v_tabla and b.id_registro = new.objeto_id and b.accion = 'INSERT' limit 1;
  end if;
  if v_dest is null then return new; end if;     -- objeto de la carga inicial: no hay a quien avisar
  insert into core.rechazo_seguimiento (id_dictamen, objeto_tipo, objeto_id, id_destinatario, fecha_limite)
    values (new.id, new.objeto_tipo, new.objeto_id, v_dest, core.sumar_dias_habiles(core.hoy_mx(), core.plazo_rechazo_dias()));
  return new;
end $$;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as firma from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'api' and p.proname in ('fn_definir_restriccion_capa','fn_proponer_actualizacion_capa','fn_resolver_actualizacion_capa')
  loop
    execute format('revoke all on function %s from public, anon', f.firma);
    execute format('grant execute on function %s to authenticated', f.firma);
  end loop;
end $$;

comment on function api.fn_proponer_actualizacion_capa(text, jsonb) is 'Captura: propone la actualizacion de una capa vigente (archivo nuevo, motivo, justificacion >= 30 caracteres, fecha de corte, indicadores por ligar). La capa sigue vigente hasta que la administracion resuelva.';
comment on function api.fn_resolver_actualizacion_capa(text, text, text) is 'Administrador y Titular: aprueba o rechaza (comentario obligatorio) la actualizacion pendiente de una capa. Cuatro ojos. Un rechazo abre el plazo de 10 dias habiles para quien la propuso.';
comment on function api.fn_definir_restriccion_capa(text, text) is 'Administrador y Titular: fija la restriccion de uso (pública | interna) de una capa. El Capturista ya no la captura; publicar exige "pública" (D-17).';
comment on function core.faltantes_ficha(jsonb) is 'Campos de la ficha que faltan para enviar a revision: custodio, fuente_origen, linaje y sistema_coordenadas. La restriccion de uso la define la administracion.';
