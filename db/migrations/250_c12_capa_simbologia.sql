-- Ciclo 12 · Simbología por capa en core.capa.simbologia (jsonb) · G4a, camino C.
-- Redactada el 2026-11-24 y probada en bases locales; autorizada por Rocío («autorizo la migración 250»). La aplica Rocío con scripts/migrar.sh: la fecha real de aplicación queda en core.schema_migraciones.
--
-- QUÉ CAMBIA
--   1. core.capa: columna nueva `simbologia jsonb not null default '{}'` (única tabla del DER que se toca; no se quita nada).
--   2. core.fn_simbologia_valida(jsonb): regla de forma (objeto vacío, o con "tipo" de texto y no más de 100,000 bytes).
--      Los 58 estilos de public/sesim/simbologia.json miden como máximo 24,318 bytes; el tope es una guarda técnica, no una regla de negocio.
--   3. api.capa se recrea (select * se fija al crearla: sin esto la columna no sale por la API). Mismos permisos (anon y authenticated, solo lectura).
--   4. api.fn_guardar_capa (definición de 236): acepta `simbologia`. Vacía o ausente = conserva la que ya tiene.
--   5. api.fn_proponer_actualizacion_capa (definición de 236): acepta `simbologia` y la guarda dentro de actualizacion_pendiente.
--   6. api.fn_resolver_actualizacion_capa (definición de 233): al APROBAR copia la simbología propuesta a la columna; al rechazar no cambia nada.
--
-- QUÉ NO CAMBIA
--   Roles (guardar y proponer siguen siendo solo del Capturista; aprobar, de Administrador/Titular con cuatro ojos), estatus, políticas RLS
--   (la simbología se ve exactamente cuando se ve la capa), compuerta de publicación, ficha mínima, plazos de rechazo, claves de capa.
--   La simbología es opcional: una capa sin ella se sigue pintando con el respaldo actual.
--
-- ASPECTOS A SABER
--   · core.capa_version guarda solo metadatos_extra: la simbología vigente NO queda versionada ahí. Sí queda la propuesta pendiente
--     (va dentro de actualizacion_pendiente) y la bitácora de cambios (trg_auditoria registra la fila completa antes y después).
--   · Reversión: reversiones/250_revertir_capa_simbologia.sql. Borra la columna: respalda antes si ya hay estilos cargados.

begin;

-- 1. Regla de forma ---------------------------------------------------------------------------------------------------------------
create or replace function core.fn_simbologia_valida(p_s jsonb) returns boolean
language sql immutable set search_path = core, public as $$
  select coalesce(
    jsonb_typeof(p_s) = 'object'
    and (p_s = '{}'::jsonb
         or (jsonb_typeof(p_s -> 'tipo') = 'string' and btrim(p_s ->> 'tipo') <> '' and octet_length(p_s::text) <= 100000)),
    false)
$$;
comment on function core.fn_simbologia_valida(jsonb) is
  'Ciclo 12. Una simbologia valida es un objeto JSON vacio (sin estilo propio) o con "tipo" de texto no vacio y no mas de 100,000 bytes.';

-- 2. Columna ----------------------------------------------------------------------------------------------------------------------
alter table core.capa add column if not exists simbologia jsonb not null default '{}'::jsonb;
alter table core.capa drop constraint if exists capa_simbologia_valida;
alter table core.capa add constraint capa_simbologia_valida check (core.fn_simbologia_valida(simbologia));
comment on column core.capa.simbologia is
  'Ciclo 12 (G4a, camino C). Estilo de la capa en formato QGIS (singleSymbol, categorizedSymbol, graduatedSymbol o ruleRenderer, con capas_simbolo y props). {} = sin estilo propio: el front usa su respaldo. La manda el Capturista al subir o actualizar la capa; nadie la edita con la capa publicada.';

-- 3. Vista de la API --------------------------------------------------------------------------------------------------------------
create or replace view api.capa with (security_invoker = true) as select * from core.capa;

-- 4. Guardar (alta o edición en borrador) -----------------------------------------------------------------------------------------
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

-- 5. Proponer la actualización de una capa vigente --------------------------------------------------------------------------------
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
    'variacion_elementos','indicadores_agregar','campos','simbologia'], 'actualizacion de capa');
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
  if p_datos ? 'simbologia' and not core.fn_simbologia_valida(p_datos -> 'simbologia') then
    raise exception 'La simbologia debe ser un objeto JSON con "tipo" (o vacio) y no pasar de 100 KB.' using errcode = '22023';
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
  -- simbologia vacia o ausente = se conserva la vigente (no se guarda nada en la propuesta)
  if p_datos ? 'simbologia' and p_datos -> 'simbologia' <> '{}'::jsonb then
    v_prop := v_prop || jsonb_build_object('simbologia', p_datos -> 'simbologia');
  end if;
  update core.capa set metadatos_extra = coalesce(metadatos_extra, '{}'::jsonb) || jsonb_build_object('actualizacion_pendiente', v_prop),
         updated_at = now() where id = p_id returning * into v_fila;
  update core.rechazo_seguimiento set estado = 'atendida', decidido_en = now(), decidido_por = auth.uid()
   where objeto_tipo = 'capa' and objeto_id = p_id and estado in ('pendiente','retomada','vencida','descartada');
  perform core.registrar_version_capa(p_id, 'Actualizacion propuesta (' || btrim(p_datos ->> 'motivo') || ').');
  return to_jsonb(v_fila);
end $function$;

-- 6. Resolver (aprobar o rechazar) la actualización -------------------------------------------------------------------------------
create or replace function api.fn_resolver_actualizacion_capa(p_id text, p_decision text, p_comentario text default null) returns jsonb
language plpgsql security definer set search_path = core, public as $$
declare v_c core.capa; v_p jsonb; v_fila core.capa; v_meta jsonb; v_i text; v_simb jsonb;
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
  -- la simbologia propuesta (si la hay y es valida) pasa a la columna al aprobar; en la ficha solo queda la marca
  v_simb := case when core.fn_simbologia_valida(v_p -> 'simbologia') and v_p -> 'simbologia' <> '{}'::jsonb then v_p -> 'simbologia' end;
  if p_decision = 'aprobar' then
    v_meta := v_meta || jsonb_build_object('fecha_corte', v_p -> 'fecha_corte', 'geometria_pendiente_ingesta', true,
      'ultima_actualizacion', (v_p - 'estado' - 'simbologia') || jsonb_build_object('aprobada_por', auth.uid(), 'aprobada_en', now(),
                                                                                    'simbologia_actualizada', v_simb is not null));
    update core.capa set n_elementos = (v_p ->> 'n_elementos')::integer, archivo = v_p ->> 'archivo', metadatos_extra = v_meta,
           simbologia = coalesce(v_simb, simbologia), updated_at = now()
     where id = p_id returning * into v_fila;
    for v_i in select jsonb_array_elements_text(coalesce(v_p -> 'indicadores_agregar', '[]'::jsonb)) loop
      insert into core.capa_indicador (id_capa, id_indicador) values (p_id, v_i) on conflict do nothing;
    end loop;
    perform core.registrar_version_capa(p_id, 'Actualizacion aprobada: ' || (v_p ->> 'motivo') || '.');
  else
    update core.capa set metadatos_extra = v_meta || jsonb_build_object('ultima_actualizacion_rechazada',
        (v_p - 'estado' - 'simbologia') || jsonb_build_object('rechazada_por', auth.uid(), 'rechazada_en', now(), 'motivo_rechazo', btrim(p_comentario))),
      updated_at = now() where id = p_id returning * into v_fila;
    perform core.registrar_version_capa(p_id, 'Actualizacion rechazada: ' || btrim(p_comentario));
  end if;
  return to_jsonb(v_fila);
end $$;

comment on function api.fn_guardar_capa(jsonb) is 'Ciclo 4 (+Ciclo 12: simbologia): alta o edicion (borrador) de una capa. Solo el Capturista y solo las suyas; la administracion dictamina, no carga. simbologia vacia o ausente conserva la existente.';
comment on function api.fn_proponer_actualizacion_capa(text, jsonb) is 'Ciclo 4 (+Ciclo 12: simbologia): propone actualizar una capa vigente. Solo el Capturista. Si trae simbologia no vacia, viaja en la propuesta y pasa a la capa al aprobarse.';
comment on function api.fn_resolver_actualizacion_capa(text, text, text) is 'Administrador y Titular: aprueba o rechaza la actualizacion propuesta (cuatro ojos). Al aprobar copia n_elementos, archivo y, si la propuesta la trae, la simbologia.';

notify pgrst, 'reload schema';
commit;
