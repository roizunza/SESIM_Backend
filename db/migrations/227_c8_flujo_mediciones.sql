-- Ciclo 8 (1/1) -- Flujo de captura, revision y dictamen de MEDICIONES: unica via de escritura en la base.
-- SIN cambios al ER: no hay tablas ni columnas nuevas; solo funciones api.fn_* y una ayuda interna.
--
-- Regla acordada con Ismael (6-nov-2026): cuando la administracion rechaza una medicion, esta pasa a `rechazado`
-- (NO vuelve a borrador). Asi el Capturista ve la alerta y el comentario de correccion hasta que la reenvia.
-- Las capas y los instrumentos (Ciclo 4) siguen volviendo a borrador: son otro objeto con otro ciclo de vida.
--
-- Maquina de estados de core.medicion_indicador (D-04 / R12; mismos cinco estados de la tabla):
--   borrador  --enviar (Capturista, autor, >= 1 evidencia vigente)-->  revision
--   rechazado --enviar (Capturista, autor, >= 1 evidencia vigente)-->  revision
--   revision      --validar (Administrador | Titular, cuatro ojos)-->  vigente_admin
--   vigente_admin --publicar (Administrador | Titular)-------------->  vigente_publico
--   revision | vigente_admin --rechazar (con comentario)------------>  rechazado
--   vigente_publico: sin salida (despublicar una medicion es una decision aparte).
--
-- Nadie escribe directo en core.medicion_indicador: authenticated solo tiene SELECT (migracion 207).
-- Cada decision deja una fila en core.dictamen (quien, cuando, de que estado a cual, motivo) y el disparador de
-- auditoria del Ciclo 5 deja el CAMBIO_ESTADO en core.bitacora_cambio con auth.uid().

-- ---------------------------------------------------------------------------------------------
-- Ayudas internas (no se exponen por la API)
-- ---------------------------------------------------------------------------------------------
-- Periodo por tipo, anio y corte («2026», «2026-S1», «2026-T3», «2026-M07»); lo crea si no existe.
-- Mismas etiquetas y fechas que genera el front (operacion.js · obtenerOCrearPeriodo).
create or replace function core.obtener_o_crear_periodo(p_tipo text, p_anio integer, p_sub integer) returns integer
language plpgsql security definer set search_path = core, public as $$
declare v_et text; v_ini date; v_fin date; v_id integer;
begin
  if p_tipo is null or p_tipo not in ('anual','semestral','trimestral','mensual') then
    raise exception 'Tipo de periodo no valido: "%". Usa anual, semestral, trimestral o mensual.', coalesce(p_tipo, 'vacio') using errcode = '22023';
  end if;
  if p_anio is null or p_anio not between 2000 and 2100 then
    raise exception 'El anio del periodo debe estar entre 2000 y 2100.' using errcode = '22023';
  end if;
  if p_tipo = 'anual' then
    v_et := p_anio::text; v_ini := make_date(p_anio, 1, 1); v_fin := make_date(p_anio, 12, 31);
  elsif p_tipo = 'semestral' then
    if p_sub is null or p_sub not between 1 and 2 then raise exception 'El semestre debe ser 1 o 2.' using errcode = '22023'; end if;
    v_et := p_anio || '-S' || p_sub;
    v_ini := make_date(p_anio, case p_sub when 1 then 1 else 7 end, 1);
    v_fin := case p_sub when 1 then make_date(p_anio, 6, 30) else make_date(p_anio, 12, 31) end;
  elsif p_tipo = 'trimestral' then
    if p_sub is null or p_sub not between 1 and 4 then raise exception 'El trimestre debe estar entre 1 y 4.' using errcode = '22023'; end if;
    v_et := p_anio || '-T' || p_sub;
    v_ini := make_date(p_anio, (p_sub - 1) * 3 + 1, 1);
    v_fin := (v_ini + interval '3 months' - interval '1 day')::date;
  else
    if p_sub is null or p_sub not between 1 and 12 then raise exception 'El mes debe estar entre 1 y 12.' using errcode = '22023'; end if;
    v_et := p_anio || '-M' || lpad(p_sub::text, 2, '0');
    v_ini := make_date(p_anio, p_sub, 1);
    v_fin := (v_ini + interval '1 month' - interval '1 day')::date;
  end if;
  select id into v_id from core.periodo where etiqueta = v_et;
  if v_id is null then
    insert into core.periodo (anio, etiqueta, tipo_periodo, fecha_inicio, fecha_fin)
      values (p_anio, v_et, p_tipo, v_ini, v_fin)
      on conflict (etiqueta) do nothing returning id into v_id;
    if v_id is null then select id into v_id from core.periodo where etiqueta = v_et; end if;
  end if;
  return v_id;
end $$;
revoke all on function core.obtener_o_crear_periodo(text, integer, integer) from public, anon, authenticated;
comment on function core.obtener_o_crear_periodo(text, integer, integer) is
  'Ciclo 8 (interna): devuelve el id del periodo (anual, semestral, trimestral o mensual) y lo crea con su etiqueta y fechas si no existe.';

-- true si la medicion tiene su evidencia vigente (ER-5, R12).
create or replace function core.tiene_evidencia_vigente(p_id_medicion uuid) returns boolean
language sql stable security definer set search_path = core, public as $$
  select exists (select 1 from core.evidencia_medicion e where e.id_medicion = p_id_medicion and e.vigente)
$$;
revoke all on function core.tiene_evidencia_vigente(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Captura: crear o editar una medicion (solo el Capturista, solo la suya, solo en borrador o rechazado)
-- ---------------------------------------------------------------------------------------------
-- p_datos: id (opcional: con id edita), id_indicador, id_unidad, tipo_periodo, anio, sub, valor, valor_texto, desagregaciones.
-- Una medicion rechazada que se edita SIGUE rechazada: la alerta y el comentario permanecen hasta reenviarla.
create or replace function api.fn_guardar_medicion(p_datos jsonb) returns jsonb
language plpgsql security definer set search_path = core, public as $$
declare
  v_id uuid; v_m core.medicion_indicador; v_ind core.indicador; v_uni core.unidad_territorial; v_perfil core.perfil;
  v_valor numeric; v_texto text; v_desag jsonb; v_per integer; v_anio integer; v_sub integer; v_tipo text;
  v_dup core.medicion_indicador; v_fila core.medicion_indicador;
begin
  perform core.exigir_rol(array['capturista'], 'capturar mediciones');
  perform core.exigir_claves(p_datos,
    array['id','id_indicador','id_unidad','tipo_periodo','anio','sub','valor','valor_texto','desagregaciones'], 'la medicion');

  begin
    v_id    := nullif(btrim(p_datos ->> 'id'), '')::uuid;
    v_valor := nullif(btrim(p_datos ->> 'valor'), '')::numeric;
    v_anio  := nullif(btrim(p_datos ->> 'anio'), '')::integer;
    v_sub   := nullif(btrim(p_datos ->> 'sub'), '')::integer;
  exception when others then
    raise exception 'Algun dato de la medicion no tiene el formato esperado (id, valor, anio o corte).' using errcode = '22023';
  end;
  v_tipo  := nullif(btrim(p_datos ->> 'tipo_periodo'), '');
  v_texto := nullif(btrim(p_datos ->> 'valor_texto'), '');
  v_desag := case when p_datos -> 'desagregaciones' is null or jsonb_typeof(p_datos -> 'desagregaciones') = 'null'
                  then '{}'::jsonb else p_datos -> 'desagregaciones' end;
  if jsonb_typeof(v_desag) <> 'object' then
    raise exception 'Las desagregaciones deben venir como objeto (dimension: valor).' using errcode = '22023';
  end if;
  if nullif(btrim(p_datos ->> 'id_indicador'), '') is null or nullif(btrim(p_datos ->> 'id_unidad'), '') is null
     or v_tipo is null or v_anio is null then
    raise exception 'Indicador, unidad territorial y periodo son obligatorios.' using errcode = '23514';
  end if;
  if v_valor is null and v_texto is null then
    raise exception 'Captura un valor cuantitativo o cualitativo.' using errcode = '23514';
  end if;

  select * into v_ind from core.indicador where id = btrim(p_datos ->> 'id_indicador');
  if not found then raise exception 'El indicador % no existe.', btrim(p_datos ->> 'id_indicador') using errcode = 'P0002'; end if;
  if not (v_ind.estatus_aprobado and v_ind.activo) then
    raise exception 'El indicador % no esta aprobado o esta dado de baja: no admite mediciones.', v_ind.id using errcode = '23514';
  end if;

  select * into v_uni from core.unidad_territorial where id = btrim(p_datos ->> 'id_unidad');
  if not found then raise exception 'La unidad territorial % no existe.', btrim(p_datos ->> 'id_unidad') using errcode = 'P0002'; end if;
  if not v_uni.activo then
    raise exception 'La unidad territorial % esta dada de baja.', v_uni.id using errcode = '23514';
  end if;
  select * into v_perfil from core.perfil where id_usuario = auth.uid();
  if v_perfil.ambito = 'municipal' and v_perfil.cve_mun is not null and v_uni.cve_mun is distinct from v_perfil.cve_mun then
    raise exception 'Tu cuenta captura solo en el municipio %: la unidad % es de otro.', v_perfil.cve_mun, v_uni.id using errcode = '42501';
  end if;

  v_per := core.obtener_o_crear_periodo(v_tipo, v_anio, v_sub);

  select * into v_dup from core.medicion_indicador
   where id_indicador = v_ind.id and id_unidad = v_uni.id and id_periodo = v_per and id is distinct from v_id;
  if found then
    raise exception 'Ya existe una medicion de % para esa unidad territorial y periodo (estado: %).', v_ind.id, v_dup.estado using errcode = '23505';
  end if;

  if v_id is null then
    insert into core.medicion_indicador (id_indicador, id_unidad, id_periodo, usuario_captura, valor, valor_texto, desagregaciones)
      values (v_ind.id, v_uni.id, v_per, auth.uid(), v_valor, v_texto, v_desag)
      returning * into v_fila;
  else
    select * into v_m from core.medicion_indicador where id = v_id for update;
    if not found then raise exception 'No existe esa medicion.' using errcode = 'P0002'; end if;
    if v_m.usuario_captura <> auth.uid() then
      raise exception 'Solo quien capturo la medicion puede editarla.' using errcode = '42501';
    end if;
    if v_m.estado not in ('borrador','rechazado') then
      raise exception 'Solo se editan mediciones en borrador o rechazadas (hoy: %).', v_m.estado using errcode = '55000';
    end if;
    update core.medicion_indicador
       set id_indicador = v_ind.id, id_unidad = v_uni.id, id_periodo = v_per,
           valor = v_valor, valor_texto = v_texto, desagregaciones = v_desag, updated_at = now()
     where id = v_id returning * into v_fila;
  end if;
  return to_jsonb(v_fila);
end $$;

-- ---------------------------------------------------------------------------------------------
-- Envio a revision (borrador o rechazado -> revision)
-- ---------------------------------------------------------------------------------------------
create or replace function api.fn_enviar_medicion_revision(p_id uuid) returns jsonb
language plpgsql security definer set search_path = core, public as $$
declare v_m core.medicion_indicador; v_fila core.medicion_indicador;
begin
  perform core.exigir_rol(array['capturista'], 'enviar mediciones a revision');
  select * into v_m from core.medicion_indicador where id = p_id for update;
  if not found then raise exception 'No existe esa medicion.' using errcode = 'P0002'; end if;
  if v_m.usuario_captura <> auth.uid() then
    raise exception 'Solo quien capturo la medicion puede enviarla.' using errcode = '42501';
  end if;
  if v_m.estado not in ('borrador','rechazado') then
    raise exception 'La medicion esta en "%": solo se envia desde borrador o rechazado.', v_m.estado using errcode = '55000';
  end if;
  if not core.tiene_evidencia_vigente(p_id) then
    raise exception 'Se requiere al menos una evidencia documental vigente para enviar la medicion.' using errcode = '23514';
  end if;
  -- al volver a revision se limpia la firma del rechazo: el motivo y quien rechazo siguen en core.dictamen y en la bitacora
  update core.medicion_indicador
     set estado = 'revision', usuario_validacion = null, fecha_validacion = null, updated_at = now()
   where id = p_id returning * into v_fila;
  return to_jsonb(v_fila);
end $$;

-- ---------------------------------------------------------------------------------------------
-- Dictamen (Administrador o Titular): validar, publicar o rechazar
-- ---------------------------------------------------------------------------------------------
create or replace function api.fn_dictaminar_medicion(p_id uuid, p_decision text, p_comentario text default null) returns jsonb
language plpgsql security definer set search_path = core, public as $$
declare v_m core.medicion_indicador; v_nuevo text; v_fila core.medicion_indicador; v_anio integer;
begin
  perform core.exigir_rol(array['administrador','administrador_titular'], 'dictaminar mediciones');
  if p_decision is null or p_decision not in ('validar','publicar','rechazar') then
    raise exception 'Decision no valida: "%". Usa validar, publicar o rechazar.', coalesce(p_decision, 'vacia') using errcode = '22023';
  end if;
  select * into v_m from core.medicion_indicador where id = p_id for update;
  if not found then raise exception 'No existe esa medicion.' using errcode = 'P0002'; end if;

  -- cuatro ojos: quien capturo no dictamina su propia medicion (ademas lo exige la restriccion medicion_cuatro_ojos)
  if v_m.usuario_captura = auth.uid() then
    raise exception 'Cuatro ojos: quien capturo la medicion no puede dictaminarla.' using errcode = '42501';
  end if;

  if p_decision = 'rechazar' then
    if v_m.estado not in ('revision','vigente_admin') then
      raise exception 'La medicion esta en "%": solo se rechaza desde revision o desde validada.', v_m.estado using errcode = '55000';
    end if;
    if btrim(coalesce(p_comentario, '')) = '' then
      raise exception 'Rechazar exige un comentario con el motivo.' using errcode = '23514';
    end if;
    v_nuevo := 'rechazado';
  elsif p_decision = 'validar' then
    if v_m.estado <> 'revision' then
      raise exception 'La medicion esta en "%": solo se valida desde revision.', v_m.estado using errcode = '55000';
    end if;
    if not core.tiene_evidencia_vigente(p_id) then
      raise exception 'No se puede validar sin evidencia documental vigente (R12).' using errcode = '23514';
    end if;
    v_nuevo := 'vigente_admin';
  else
    if v_m.estado <> 'vigente_admin' then
      raise exception 'La medicion esta en "%": solo se publica una medicion ya validada (vigente_admin).', v_m.estado using errcode = '55000';
    end if;
    if not core.tiene_evidencia_vigente(p_id) then
      raise exception 'No se puede publicar sin evidencia documental vigente (R12).' using errcode = '23514';
    end if;
    v_nuevo := 'vigente_publico';
  end if;

  insert into core.dictamen (objeto_tipo, objeto_id, decision, estado_previo, estado_nuevo, comentario, id_usuario)
    values ('medicion', p_id::text, p_decision, v_m.estado, v_nuevo, nullif(btrim(p_comentario), ''), auth.uid());

  if p_decision = 'publicar' then
    update core.medicion_indicador set estado = v_nuevo, updated_at = now() where id = p_id returning * into v_fila;
    -- la primera medicion publicada de un indicador con valor numerico fija su linea base (referencia del semaforo)
    if v_fila.valor is not null then
      select anio into v_anio from core.periodo where id = v_fila.id_periodo;
      update core.indicador set linea_base = v_fila.valor, anio_linea_base = v_anio, updated_at = now()
       where id = v_fila.id_indicador and linea_base is null;
    end if;
  else
    -- validar y rechazar firman al revisor (la restriccion medicion_firma_validacion lo exige fuera de borrador y revision)
    update core.medicion_indicador
       set estado = v_nuevo, usuario_validacion = auth.uid(), fecha_validacion = now(), updated_at = now()
     where id = p_id returning * into v_fila;
  end if;
  return to_jsonb(v_fila);
end $$;

-- ---------------------------------------------------------------------------------------------
-- Alerta de devoluciones: mediciones rechazadas con el motivo del ultimo rechazo
-- El Capturista ve las suyas; Administrador, Titular y Auditor, todas.
-- ---------------------------------------------------------------------------------------------
create or replace function api.fn_mediciones_devueltas() returns table (
  id_medicion uuid, id_indicador text, nombre_indicador text, id_unidad text, nombre_unidad text, periodo text,
  motivo text, devuelta_en timestamptz, devuelta_por text, id_capturista uuid, capturista text)
language plpgsql stable security definer set search_path = core, public as $$
declare v_rol text;
begin
  v_rol := core.exigir_rol(array['capturista','administrador','administrador_titular','auditor'], 'consultar mediciones devueltas');
  return query
    select m.id, m.id_indicador::text, i.nombre, m.id_unidad::text,
           case u.nivel when 'municipio' then u.nom_mun else u.nom_loc || ', ' || u.nom_mun end,
           p.etiqueta, d.comentario, d.fecha, pr.nombre, m.usuario_captura, pc.nombre
      from core.medicion_indicador m
      join core.indicador i on i.id = m.id_indicador
      join core.unidad_territorial u on u.id = m.id_unidad
      join core.periodo p on p.id = m.id_periodo
      left join lateral (select dd.comentario, dd.fecha, dd.id_usuario from core.dictamen dd
                          where dd.objeto_tipo = 'medicion' and dd.objeto_id = m.id::text and dd.decision = 'rechazar'
                          order by dd.fecha desc limit 1) d on true
      left join core.perfil pr on pr.id_usuario = d.id_usuario
      left join core.perfil pc on pc.id_usuario = m.usuario_captura
     where m.estado = 'rechazado'
       and (v_rol <> 'capturista' or m.usuario_captura = auth.uid())
     order by d.fecha desc nulls last;
end $$;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as firma from pg_proc p where p.pronamespace = 'api'::regnamespace
            and p.proname in ('fn_guardar_medicion','fn_enviar_medicion_revision','fn_dictaminar_medicion','fn_mediciones_devueltas')
  loop
    execute format('revoke all on function %s from public, anon', f.firma);
    execute format('grant execute on function %s to authenticated', f.firma);
  end loop;
end $$;

comment on function api.fn_guardar_medicion(jsonb) is 'Ciclo 8: da de alta (borrador) o edita una medicion. Solo el Capturista y solo la suya, en borrador o rechazada; una rechazada editada sigue rechazada hasta reenviarla. Crea el periodo si no existe.';
comment on function api.fn_enviar_medicion_revision(uuid) is 'Ciclo 8: borrador o rechazado -> revision. Solo el autor; exige evidencia vigente (R12). Limpia la firma del rechazo anterior.';
comment on function api.fn_dictaminar_medicion(uuid, text, text) is 'Ciclo 8: validar (revision -> vigente_admin), publicar (vigente_admin -> vigente_publico, fija la linea base si falta) o rechazar (-> rechazado, comentario obligatorio). Administrador y Titular; cuatro ojos; deja constancia en core.dictamen.';
comment on function api.fn_mediciones_devueltas() is 'Ciclo 8: mediciones en estado rechazado con el motivo del ultimo rechazo. El Capturista ve las suyas; la administracion y el Auditor todas.';
