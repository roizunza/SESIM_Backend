-- Ciclo 12 · Bloque A (flujos 1–6 de capas) · Reclamar capa, id asignado por el servidor, compuerta de geometría e ingesta de geometrías.
-- Redactada el 2026-11-25 y probada SOLO en una base local de pruebas (migraciones 099–250). NO se ha aplicado en la VM.
-- Decisiones de Rocío (25-nov-2026) que implementa: reclamo solo de borradores sin creador, gana la primera, sin tocar el DER;
-- no validar ni publicar una capa sin geometría (solo vectoriales); la ingesta reemplaza (no duplica) las geometrías del borrador.
--
-- QUÉ CAMBIA (ninguna tabla del DER: no hay columnas ni restricciones nuevas)
--   1. core.creo_objeto: además del evento INSERT, reconoce un evento UPDATE con datos_nuevos->>'evento' = 'reclamo_capa' hecho por la cuenta.
--   2. core.capa_sin_creador(id): borrador sin evento INSERT de ninguna cuenta y sin reclamo previo (capas sembradas / huérfanas, F-01).
--   3. api.fn_capas_reclamables(): lista de esos borradores para el Capturista (la política RLS no se los deja ver todavía).
--   4. api.fn_reclamar_capa(id): el Capturista toma una capa sin creador. Bloquea la fila: gana la primera solicitud, la segunda recibe error.
--      Escribe un evento UPDATE en core.bitacora_cambio (único lugar de «propiedad», no hay columna). El cliente no puede escribir esa marca.
--   5. api.fn_guardar_capa (definición de 250): acepta `prefijo_id` para que el SERVIDOR asigne el número siguiente (dos dígitos) bajo
--      bloqueo asesor; sigue aceptando `id` explícito (compatibilidad con pruebas y con el front actual).
--   6. api.fn_dictaminar_capa (definición de 250): validar y publicar exigen al menos un elemento en core.capa_vector (se exceptúa tipo_geometria = 'Ráster',
--      que hoy no existe en el CHECK de core.capa: la excepción queda lista sin tocar el DER).
--   7. Ingesta (solo servicio-procesos, nunca el navegador): core.autorizar_ingesta_capa, core.derivar_territorio, core.ingestar_capa_lote,
--      core.cerrar_ingesta_capa. Reemplazan las geometrías de la capa, derivan cve_ent/cve_mun/id_unidad/metodo_cve_mun, revisan el tipo de
--      geometría contra core.capa.tipo_geometria y dejan un evento en la bitácora.
--
-- QUÉ NO CAMBIA
--   Roles, estatus, cuatro ojos, ficha mínima, políticas RLS, plazos de rechazo, claves de capa existentes, controladores del backend.
--
-- ASPECTOS A SABER (pendientes de decisión de Rocío, no supuestos)
--   · Elementos fuera de Campeche (a más de 1,000 m de un municipio): la base histórica los guarda con la entidad vecina (07, 23, 27, 31…) y cve_mun '000'.
--     Para derivar la entidad vecina hace falta el marco estatal, que la plataforma no tiene. Por ahora la ingesta RECHAZA el archivo completo y dice
--     cuántos y cuáles elementos quedaron fuera. 'proximidad_aguas_estatales' tampoco se deriva (no hay polígono de aguas estatales en la base).
--   · cve_loc queda vacío en lo derivado (id_unidad = municipio): derivar localidad exige confirmar qué geometría tienen las 2,772 localidades.
--   · Las funciones de ingesta solo las ejecuta service_role (o el dueño). Autorizan con auth.uid(): el servicio fija
--     set_config('request.jwt.claim.sub', <uid verificado>, true) dentro de su transacción, así actúa a nombre de la persona y no con poderes propios.
--   · Reversión: reversiones/252_revertir_bloque_a_capas.sql (restaura las definiciones de 250 y quita lo nuevo; las geometrías ya ingeridas se conservan).

begin;

-- 1. Propiedad de la capa: INSERT o reclamo ----------------------------------------------------------------------------------------
create or replace function core.creo_objeto(p_tabla text, p_id text) returns boolean
language sql stable security definer set search_path = core, public as $$
  select exists (select 1 from core.bitacora_cambio b
                  where b.id_usuario = auth.uid() and b.tabla_afectada = p_tabla and b.id_registro = p_id
                    and (b.accion = 'INSERT'
                         or (b.accion = 'UPDATE' and p_tabla = 'capa' and b.datos_nuevos ->> 'evento' = 'reclamo_capa')))
$$;

-- 2. Capa sin creador ----------------------------------------------------------------------------------------------------------------
create or replace function core.capa_sin_creador(p_id text) returns boolean
language sql stable security definer set search_path = core, public as $$
  select exists (select 1 from core.capa c where c.id = p_id and c.estatus = 'borrador')
     and not exists (select 1 from core.bitacora_cambio b
                      where b.tabla_afectada = 'capa' and b.id_registro = p_id
                        and ((b.accion = 'INSERT' and b.id_usuario is not null)
                             or (b.accion = 'UPDATE' and b.datos_nuevos ->> 'evento' = 'reclamo_capa')))
$$;
revoke all on function core.capa_sin_creador(text) from public, anon;
grant execute on function core.capa_sin_creador(text) to authenticated;

-- 3. Lista de reclamables (el Capturista no ve estos borradores por RLS) -------------------------------------------------------------
create or replace function api.fn_capas_reclamables()
returns table (id text, titulo text, proposito text, tipo_geometria text, n_elementos integer, n_geometrias bigint, responsable text,
               conjunto_datos text, nomenclatura text)
language plpgsql stable security definer set search_path = core, public as $$
begin
  perform core.exigir_rol(array['capturista'], 'ver las capas que se pueden reclamar');
  return query
    select c.id::text, c.titulo, c.proposito, c.tipo_geometria, c.n_elementos,
           (select count(*) from core.capa_vector v where v.id_capa = c.id), c.responsable, c.conjunto_datos, c.nomenclatura
      from core.capa c
     where c.activo and core.capa_sin_creador(c.id::text)
     order by c.id;
end $$;
revoke all on function api.fn_capas_reclamables() from public, anon;
grant execute on function api.fn_capas_reclamables() to authenticated;

-- 4. Reclamar capa -------------------------------------------------------------------------------------------------------------------
create or replace function api.fn_reclamar_capa(p_id text) returns jsonb
language plpgsql security definer set search_path = core, public as $$
declare v_c core.capa; v_uid uuid := auth.uid();
begin
  perform core.exigir_rol(array['capturista'], 'reclamar capas (solo el Capturista)');
  select * into v_c from core.capa where id = p_id for update;      -- el bloqueo hace ganar a la primera solicitud
  if not found then raise exception 'La capa % no existe.', p_id using errcode = 'P0002'; end if;
  if not v_c.activo then raise exception 'La capa % esta dada de baja.', p_id using errcode = '55000'; end if;
  if v_c.estatus <> 'borrador' then
    raise exception 'La capa % esta en "%": solo se reclaman borradores.', p_id, v_c.estatus using errcode = '55000';
  end if;
  if core.creo_objeto('capa', p_id) then
    raise exception 'La capa % ya es tuya.', p_id using errcode = '55000';
  end if;
  if not core.capa_sin_creador(p_id) then
    raise exception 'La capa % ya tiene un Capturista asignado: no se puede reclamar.', p_id using errcode = '55000';
  end if;
  insert into core.bitacora_cambio (id_usuario, tabla_afectada, id_registro, accion, datos_previos, datos_nuevos)
  values (v_uid, 'capa', p_id, 'UPDATE',
          jsonb_build_object('titulo', v_c.titulo, 'estatus', v_c.estatus, 'creador', null),
          jsonb_build_object('evento', 'reclamo_capa', 'titulo', v_c.titulo, 'estatus', v_c.estatus, 'reclamada_por', v_uid));
  return to_jsonb(v_c);
end $$;
revoke all on function api.fn_reclamar_capa(text) from public, anon;
grant execute on function api.fn_reclamar_capa(text) to authenticated;

-- 5. api.fn_guardar_capa (definición de 250 + prefijo_id) -------------------------------------------------------------------------
create or replace function api.fn_guardar_capa(p_datos jsonb) returns jsonb
language plpgsql security definer set search_path = core, public as $$
declare
  v_rol text; v_id text; v_ant core.capa; v_r core.capa; v_fila core.capa; v_existe boolean; v_meta jsonb;
  v_pref text; v_n integer;
begin
  v_rol := core.exigir_rol(array['capturista'], 'guardar capas (solo el Capturista: la administracion dictamina)');
  perform core.exigir_claves(p_datos, array['id','prefijo_id','titulo','proposito','tipo_geometria','srid_origen','responsable','conjunto_datos',
    'id_instrumento','metadatos_extra','archivo','grupos','nomenclatura','n_elementos','geojson','simbologia'], 'capa');
  v_id := nullif(btrim(p_datos ->> 'id'), '');
  v_pref := nullif(btrim(p_datos ->> 'prefijo_id'), '');
  if v_id is not null and v_pref is not null then
    raise exception 'Manda el id de una capa existente o un prefijo para una capa nueva, no ambos.' using errcode = '22023';
  end if;
  if v_id is null and v_pref is null then raise exception 'Falta el id de la capa (o el prefijo para una capa nueva).' using errcode = '22023'; end if;

  if v_pref is not null then
    -- Capa nueva: el servidor asigna el siguiente numero de dos digitos del prefijo (nunca reutiliza una clave, aunque la capa este de baja).
    if v_pref !~ '^[A-Za-z][A-Za-z0-9]{0,9}$' then
      raise exception 'El prefijo "%" no es valido: letras y numeros, empieza con letra, hasta 10 caracteres.', v_pref using errcode = '22023';
    end if;
    perform pg_advisory_xact_lock(hashtext('sesim.capa.asignar_id'));
    select coalesce(max(substring(c.id from '[0-9]{2}$')::integer), 0) + 1 into v_n
      from core.capa c where c.id ~ ('^' || v_pref || '[0-9]{2}$');
    if v_n > 99 then raise exception 'El prefijo % ya uso los numeros 01 a 99.', v_pref using errcode = '23514'; end if;
    v_id := v_pref || lpad(v_n::text, 2, '0');
    p_datos := (p_datos - 'prefijo_id') || jsonb_build_object('id', v_id);
  else
    p_datos := p_datos - 'prefijo_id';
  end if;

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
end $$;

-- 6. api.fn_dictaminar_capa (definición de 250 + compuerta de geometría) ---------------------------------------------------------
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
    -- compuerta de geometria: una capa vectorial sin un solo elemento en core.capa_vector no se valida ni se publica
    if v_c.tipo_geometria is distinct from 'Ráster'
       and not exists (select 1 from core.capa_vector v where v.id_capa = p_id) then
      raise exception 'La capa % no tiene geometrias cargadas (core.capa_vector esta vacia): no se puede % hasta que se ingiera su archivo.', p_id,
        case p_decision when 'validar' then 'validar' else 'publicar' end using errcode = '23514';
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

-- 7. Ingesta de geometrias (solo servicio-procesos) -----------------------------------------------------------------------------------
-- 7a. Autoriza a la cuenta en sesion (auth.uid(), fijada por el servicio) a escribir geometrias de la capa.
--     modo 'borrador'      : Capturista que creo o reclamo la capa; la capa debe seguir en borrador y activa.
--     modo 'actualizacion' : Administrador o Titular, con una actualizacion pendiente (se ingiere justo antes de aprobarla) o ya aprobada
--                            con geometria_pendiente_ingesta (para cerrar).
create or replace function core.autorizar_ingesta_capa(p_id text, p_modo text) returns core.capa
language plpgsql security definer set search_path = core, public as $$
declare v_rol text; v_c core.capa;
begin
  if p_modo not in ('borrador','actualizacion') then
    raise exception 'Modo de ingesta no valido: "%".', p_modo using errcode = '22023';
  end if;
  if p_modo = 'borrador' then
    v_rol := core.exigir_rol(array['capturista'], 'cargar geometrias de un borrador (solo el Capturista dueño de la capa)');
  else
    v_rol := core.exigir_rol(array['administrador','administrador_titular'], 'ingerir la geometria de una actualizacion aprobada');
  end if;
  select * into v_c from core.capa where id = p_id for update;
  if not found then raise exception 'La capa % no existe.', p_id using errcode = 'P0002'; end if;
  if not v_c.activo then raise exception 'La capa % esta dada de baja.', p_id using errcode = '55000'; end if;
  if p_modo = 'borrador' then
    if v_c.estatus <> 'borrador' then
      raise exception 'La capa % esta en "%": solo se cargan geometrias a un borrador (una capa vigente se actualiza con una propuesta).', p_id, v_c.estatus using errcode = '55000';
    end if;
    if not core.creo_objeto('capa', p_id) then
      raise exception 'Solo puedes cargar geometrias a las capas que diste de alta o reclamaste tu.' using errcode = '42501';
    end if;
  else
    if coalesce(v_c.metadatos_extra -> 'actualizacion_pendiente' ->> 'estado', '') <> 'pendiente'
       and coalesce((v_c.metadatos_extra ->> 'geometria_pendiente_ingesta')::boolean, false) is not true then
      raise exception 'La capa % no tiene una actualizacion pendiente ni geometria por ingerir.', p_id using errcode = '55000';
    end if;
  end if;
  return v_c;
end $$;
revoke all on function core.autorizar_ingesta_capa(text, text) from public, anon, authenticated;
grant execute on function core.autorizar_ingesta_capa(text, text) to service_role;

-- 7b. Territorio de una geometria 4326: municipio por interseccion (el de mayor traslape) o por proximidad <= 1000 m.
--     Devuelve metodo nulo si no cae en Campeche ni a 1000 m (politica pendiente: ver cabecera).
create or replace function core.derivar_territorio(p_geom geometry)
returns table (id_unidad text, cve_ent text, cve_mun text, metodo text)
language plpgsql stable security definer set search_path = core, public, extensions as $$
declare v_dim integer := ST_Dimension(p_geom);
begin
  return query
    select u.id::text, u.cve_ent::text, u.cve_mun::text, 'interseccion'::text
      from core.unidad_territorial u join core.unidad_territorial_geom g on g.id_unidad = u.id
     where u.nivel = 'municipio' and ST_Intersects(g.geom, p_geom)
     order by case v_dim when 0 then 0
                         when 1 then ST_Length(ST_Intersection(g.geom, p_geom)::geography)
                         else ST_Area(ST_Intersection(g.geom, p_geom)::geography) end desc, u.id
     limit 1;
  if found then return; end if;
  return query
    select u.id::text, u.cve_ent::text, u.cve_mun::text, 'proximidad<=1000m'::text
      from core.unidad_territorial u join core.unidad_territorial_geom g on g.id_unidad = u.id
     where u.nivel = 'municipio' and ST_DWithin(g.geom::geography, p_geom::geography, 1000)
     order by ST_Distance(g.geom::geography, p_geom::geography), u.id
     limit 1;
end $$;
revoke all on function core.derivar_territorio(geometry) from public, anon, authenticated;
grant execute on function core.derivar_territorio(geometry) to service_role;

-- 7c. Un lote de elementos. p_lote = [{"id_origen": "...", "wkb": "<hex WKB/EWKB>", "srid": 6372, "nombre": "...", "propiedades": {...}}].
--     p_primer_lote = true borra antes las geometrias que la capa ya tenia (re-subir un .gpkg corregido REEMPLAZA, no duplica).
--     Todo o nada: el servicio manda todos los lotes en UNA transaccion; cualquier error revierte incluso el borrado.
create or replace function core.ingestar_capa_lote(p_id text, p_modo text, p_lote jsonb, p_primer_lote boolean default false)
returns jsonb
language plpgsql security definer set search_path = core, public, extensions as $$
declare
  v_c core.capa; v_antes bigint := null; v_ins integer; v_vacias text; v_tipo text; v_fuera integer; v_fuera_ej text; v_dup text;
  v_tipos text[];
begin
  v_c := core.autorizar_ingesta_capa(p_id, p_modo);
  if p_lote is null or jsonb_typeof(p_lote) <> 'array' or jsonb_array_length(p_lote) = 0 then
    raise exception 'El lote debe ser una lista no vacia de elementos.' using errcode = '22023';
  end if;
  if p_primer_lote then
    select count(*) into v_antes from core.capa_vector where id_capa = p_id;
    perform set_config('sesim.ingesta_antes.' || p_id, v_antes::text, true);
    delete from core.capa_vector where id_capa = p_id;
  end if;
  v_tipos := case v_c.tipo_geometria when 'Punto' then array['ST_Point','ST_MultiPoint']
                                      when 'Línea' then array['ST_LineString','ST_MultiLineString']
                                      else array['ST_Polygon','ST_MultiPolygon'] end;

  if to_regclass('pg_temp.lote_ingesta') is null then
    create temporary table pg_temp.lote_ingesta (
      id_origen text, geom geometry, nombre text, propiedades jsonb, id_unidad text, cve_ent text, cve_mun text, metodo text) on commit drop;
  else
    truncate pg_temp.lote_ingesta;
  end if;

  insert into pg_temp.lote_ingesta (id_origen, geom, nombre, propiedades)
  select btrim(e ->> 'id_origen'),
         case when nullif(e ->> 'wkb', '') is null then null else
           ST_Force2D(ST_MakeValid(ST_Transform(
             ST_SetSRID(ST_GeomFromWKB(decode(e ->> 'wkb', 'hex')), coalesce(nullif(e ->> 'srid', '')::integer, v_c.srid_origen, 4326)), 4326))) end,
         nullif(btrim(e ->> 'nombre'), ''),
         coalesce(e -> 'propiedades', '{}'::jsonb)
    from jsonb_array_elements(p_lote) e;

  if exists (select 1 from pg_temp.lote_ingesta where coalesce(id_origen, '') = '' or geom is null or ST_IsEmpty(geom)) then
    select string_agg(coalesce(nullif(id_origen, ''), '(sin id)'), ', ') into v_vacias from (
      select id_origen from pg_temp.lote_ingesta where coalesce(id_origen, '') = '' or geom is null or ST_IsEmpty(geom) limit 5) x;
    raise exception 'Hay elementos sin id_origen o con geometria vacia (primeros: %).', v_vacias using errcode = '23514';
  end if;
  if exists (select 1 from pg_temp.lote_ingesta where jsonb_typeof(propiedades) <> 'object') then
    raise exception 'Las propiedades de cada elemento deben ser un objeto JSON.' using errcode = '22023';
  end if;

  select ST_GeometryType(geom) into v_tipo from pg_temp.lote_ingesta where not (ST_GeometryType(geom) = any (v_tipos)) limit 1;
  if v_tipo is not null then
    raise exception 'La capa % es de tipo "%" pero el archivo trae elementos de tipo "%": corrige el tipo en la ficha o sube otro archivo.',
      p_id, v_c.tipo_geometria,
      case when v_tipo like '%Point' then 'Punto' when v_tipo like '%LineString' then 'Línea' when v_tipo like '%Polygon' then 'Polígono'
           else replace(v_tipo, 'ST_', '') end using errcode = '23514';
  end if;

  select string_agg(id_origen, ', ') into v_dup from (
    select id_origen from pg_temp.lote_ingesta group by id_origen having count(*) > 1 limit 5) d;
  if v_dup is not null then
    raise exception 'Hay id_origen repetidos en el archivo (primeros: %). Elige otra columna de identificador.', v_dup using errcode = '23505';
  end if;

  update pg_temp.lote_ingesta l set (id_unidad, cve_ent, cve_mun, metodo) =
    (select t.id_unidad, t.cve_ent, t.cve_mun, t.metodo from core.derivar_territorio(l.geom) t);

  select count(*), string_agg(id_origen, ', ') filter (where rn <= 5) into v_fuera, v_fuera_ej from (
    select id_origen, row_number() over (order by id_origen) rn from pg_temp.lote_ingesta where metodo is null) f;
  if v_fuera > 0 then
    raise exception '% elemento(s) quedan fuera de Campeche, a mas de 1,000 m de cualquier municipio (primeros: %). La politica para elementos fuera del estado esta pendiente de decision: el archivo no se cargo.',
      v_fuera, v_fuera_ej using errcode = '23514';
  end if;

  insert into core.capa_vector (id_capa, id_unidad, id_origen, cve_ent, cve_mun, nombre, metodo_cve_mun, propiedades, geom)
  select p_id, id_unidad, id_origen, cve_ent, cve_mun, nombre, metodo, propiedades, geom from pg_temp.lote_ingesta;
  get diagnostics v_ins = row_count;
  return jsonb_build_object('insertados', v_ins, 'borrados_previos', v_antes);
end $$;
revoke all on function core.ingestar_capa_lote(text, text, jsonb, boolean) from public, anon, authenticated;
grant execute on function core.ingestar_capa_lote(text, text, jsonb, boolean) to service_role;

-- 7d. Cierra la ingesta: n_elementos real, bandera de geometria pendiente apagada y evento en la bitacora.
create or replace function core.cerrar_ingesta_capa(p_id text, p_modo text, p_archivo text default null) returns jsonb
language plpgsql security definer set search_path = core, public as $$
declare v_c core.capa; v_n integer; v_antes text; v_metodos jsonb; v_meta jsonb;
begin
  v_c := core.autorizar_ingesta_capa(p_id, p_modo);
  select count(*) into v_n from core.capa_vector where id_capa = p_id;
  if v_n = 0 then raise exception 'La capa % quedo sin elementos: la ingesta no se cierra.', p_id using errcode = '23514'; end if;
  select coalesce(jsonb_object_agg(coalesce(metodo_cve_mun, 'sin_metodo'), n), '{}'::jsonb) into v_metodos
    from (select metodo_cve_mun, count(*) n from core.capa_vector where id_capa = p_id group by 1) m;
  v_antes := nullif(current_setting('sesim.ingesta_antes.' || p_id, true), '');
  v_meta := coalesce(v_c.metadatos_extra, '{}'::jsonb) - 'geometria_pendiente_ingesta';
  update core.capa set n_elementos = v_n, metadatos_extra = v_meta, archivo = coalesce(nullif(btrim(p_archivo), ''), archivo), updated_at = now()
   where id = p_id;
  insert into core.bitacora_cambio (id_usuario, tabla_afectada, id_registro, accion, datos_previos, datos_nuevos)
  values (auth.uid(), 'capa_vector', p_id, 'UPDATE',
          jsonb_build_object('n_elementos', v_c.n_elementos, 'geometrias_antes', v_antes),
          jsonb_build_object('evento', 'ingesta_geometrias', 'modo', p_modo, 'n_elementos', v_n, 'por_metodo', v_metodos,
                             'archivo', coalesce(nullif(btrim(p_archivo), ''), v_c.archivo)));
  perform core.registrar_version_capa(p_id, 'Geometrias ingeridas: ' || v_n || ' elementos.');
  return jsonb_build_object('n_elementos', v_n, 'por_metodo', v_metodos);
end $$;
revoke all on function core.cerrar_ingesta_capa(text, text, text) from public, anon, authenticated;
grant execute on function core.cerrar_ingesta_capa(text, text, text) to service_role;

comment on function api.fn_reclamar_capa(text) is 'Bloque A (F-01): el Capturista reclama un borrador sin creador. Gana la primera solicitud; deja un evento UPDATE (reclamo_capa) en core.bitacora_cambio. No reasigna capas que ya tienen Capturista.';
comment on function api.fn_capas_reclamables() is 'Bloque A: borradores sin creador que el Capturista puede reclamar.';
comment on function core.ingestar_capa_lote(text, text, jsonb, boolean) is 'Bloque A: ingesta por lotes de geometrias. Solo servicio-procesos (service_role), actuando a nombre de la persona via request.jwt.claim.sub. Reemplaza las geometrias previas en el primer lote.';
comment on function core.cerrar_ingesta_capa(text, text, text) is 'Bloque A: cierra la ingesta (n_elementos real, bitacora, version de capa).';

notify pgrst, 'reload schema';
commit;
