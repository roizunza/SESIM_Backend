-- Ciclo 4 (2/7) -- Ayudas comunes de las funciones api.* de escritura, lectura del Capturista sobre sus capas
-- y ampliacion de la auditoria del Ciclo 5 a las tablas que ahora se escriben. Sin cambios al ER.

-- ---------------------------------------------------------------------------------------------
-- 1. Ayudas (uso interno: ninguna se expone por la API)
-- ---------------------------------------------------------------------------------------------
-- Exige sesion activa y que el rol este entre los permitidos. Devuelve el rol de quien actua.
create or replace function core.exigir_rol(p_roles text[], p_accion text) returns text
language plpgsql stable security definer set search_path = core, public as $$
declare v_rol text := core.rol_actual();
begin
  if v_rol is null then
    raise exception 'Necesitas iniciar sesion con una cuenta activa para %.', p_accion using errcode = '42501';
  end if;
  if not (v_rol = any (p_roles)) then
    raise exception 'Tu perfil (%) no puede %.', v_rol, p_accion using errcode = '42501';
  end if;
  return v_rol;
end $$;
revoke all on function core.exigir_rol(text[], text) from public, anon;
grant execute on function core.exigir_rol(text[], text) to authenticated;

-- Campos de la ficha que la capa necesita completos para enviarse a revision (mismos de la compuerta D-17).
create or replace function core.faltantes_ficha(p_metadatos jsonb) returns text[]
language sql immutable set search_path = core, public as $$
  select coalesce(array_agg(c order by o), '{}')
    from unnest(array['custodio','fuente_origen','linaje','sistema_coordenadas','restriccion_uso']) with ordinality as t(c, o)
   where btrim(coalesce(p_metadatos ->> c, '')) = ''
$$;

-- Quien envio a revision por ultima vez un registro (para el principio de cuatro ojos).
create or replace function core.quien_envio(p_tabla text, p_id text) returns uuid
language sql stable security definer set search_path = core, public as $$
  select b.id_usuario from core.bitacora_cambio b
   where b.tabla_afectada = p_tabla and b.id_registro = p_id and b.accion = 'CAMBIO_ESTADO'
     and b.datos_nuevos ->> 'estatus' = 'revision'
   order by b.fecha desc limit 1
$$;
revoke all on function core.quien_envio(text, text) from public, anon;
grant execute on function core.quien_envio(text, text) to authenticated;

-- true si la cuenta en sesion es quien dio de alta el registro (evento INSERT en la bitacora de cambios).
create or replace function core.creo_objeto(p_tabla text, p_id text) returns boolean
language sql stable security definer set search_path = core, public as $$
  select exists (select 1 from core.bitacora_cambio b
                  where b.id_usuario = auth.uid() and b.tabla_afectada = p_tabla and b.id_registro = p_id and b.accion = 'INSERT')
$$;
revoke all on function core.creo_objeto(text, text) from public, anon;
grant execute on function core.creo_objeto(text, text) to authenticated;

-- Llaves que el cliente manda y la base no reconoce: se rechazan en lugar de ignorarlas en silencio.
create or replace function core.exigir_claves(p_datos jsonb, p_permitidas text[], p_objeto text) returns void
language plpgsql immutable set search_path = core, public as $$
declare v_raras text[];
begin
  if p_datos is null or jsonb_typeof(p_datos) <> 'object' then
    raise exception 'Los datos de % deben venir como objeto JSON.', p_objeto using errcode = '22023';
  end if;
  select array_agg(k) into v_raras from jsonb_object_keys(p_datos) k where not (k = any (p_permitidas));
  if v_raras is not null then
    raise exception 'Campos no permitidos en %: %.', p_objeto, array_to_string(v_raras, ', ') using errcode = '22023';
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------
-- 2. Auditoria (Ciclo 5) ampliada: llaves compuestas y columnas que no deben quedar en la bitacora
--    tg_argv: (columna llave[,columna llave...], columna de estado, columnas a ocultar)
-- ---------------------------------------------------------------------------------------------
create or replace function core.fn_auditar_cambio() returns trigger
language plpgsql security definer set search_path = core, public as $$
declare
  v_uid     uuid;
  v_old     jsonb;
  v_new     jsonb;
  v_accion  text;
  v_reg     jsonb;
  v_ip      inet;
  v_cols_id text[] := string_to_array(tg_argv[0], ',');
  v_col_est text := nullif(tg_argv[1], '');
  v_ocultar text[] := coalesce(string_to_array(nullif(tg_argv[2], ''), ','), '{}');
begin
  v_uid := coalesce(auth.uid(), nullif(current_setting('app.actor_id', true), '')::uuid);
  if v_uid is not null and not exists (select 1 from core.perfil p where p.id_usuario = v_uid) then
    v_uid := null;                         -- cuenta sin perfil (p. ej. llave de servicio): se registra como sistema
  end if;

  if tg_op = 'INSERT' then
    v_new := to_jsonb(new) - v_ocultar; v_accion := 'INSERT'; v_reg := v_new;
  elsif tg_op = 'DELETE' then
    v_old := to_jsonb(old) - v_ocultar; v_accion := 'DELETE'; v_reg := v_old;
  else
    v_old := to_jsonb(old) - v_ocultar; v_new := to_jsonb(new) - v_ocultar; v_reg := v_new;
    if (v_new - 'updated_at') = (v_old - 'updated_at') then
      return new;                          -- no cambio nada
    end if;
    v_accion := case when v_col_est is not null and (v_old -> v_col_est) is distinct from (v_new -> v_col_est)
                     then 'CAMBIO_ESTADO' else 'UPDATE' end;
  end if;

  begin
    v_ip := nullif(btrim(split_part(
              (nullif(current_setting('request.headers', true), '')::json) ->> 'x-forwarded-for', ',', 1)), '')::inet;
  exception when others then
    v_ip := null;
  end;

  insert into core.bitacora_cambio (id_usuario, tabla_afectada, id_registro, accion, datos_previos, datos_nuevos, ip_origen)
  values (v_uid, tg_table_name,
          (select string_agg(coalesce(v_reg ->> c, ''), '|' order by o) from unnest(v_cols_id) with ordinality as t(c, o)),
          v_accion, v_old, v_new, v_ip);

  return case tg_op when 'DELETE' then old else new end;
end $$;
comment on function core.fn_auditar_cambio() is
  'Trigger de Ciclo 5 (ampliado en Ciclo 4): registra en core.bitacora_cambio (solo insercion) cada alta, cambio, cambio de estado y baja, con la identidad de auth.uid(). Argumentos: llave(s) separadas por coma, columna de estado, columnas a ocultar.';

do $$
declare r record;
begin
  for r in select * from (values
      ('instrumento_origen',   'id',                     'estatus',          ''),
      ('eje_tematico',         'id',                     '',                 ''),
      ('sector',               'id',                     '',                 ''),
      ('fuente_informacion',   'id',                     '',                 ''),
      ('matriz_instrumento',   'id',                     '',                 ''),
      ('indicador_instrumento','id',                     '',                 ''),
      ('indicador_eje',        'id_indicador,id_eje',    '',                 ''),
      ('capa_indicador',       'id_capa,id_indicador',   '',                 ''),
      ('invitacion',           'id',                     '',                 'token_hash')
    ) as v(tabla, col_id, col_estado, ocultar)
  loop
    execute format('drop trigger if exists trg_auditoria on core.%I', r.tabla);
    execute format(
      'create trigger trg_auditoria after insert or update or delete on core.%I
         for each row execute function core.fn_auditar_cambio(%L, %L, %L)', r.tabla, r.col_id, r.col_estado, r.ocultar);
  end loop;
end $$;

-- La bitacora de cambios del Administrador no incluye las invitaciones (son del Titular, como la tabla); el Auditor si las ve.
drop policy bitacora_cambio_select on core.bitacora_cambio;
create policy bitacora_cambio_select on core.bitacora_cambio for select to authenticated
using (core.rol_actual() in ('administrador_titular','auditor')
       or (core.rol_actual() = 'administrador' and tabla_afectada <> 'invitacion'));

-- ---------------------------------------------------------------------------------------------
-- 3. El Capturista lee las capas que el mismo dio de alta (borrador, en revision), no solo las vigentes.
-- ---------------------------------------------------------------------------------------------
drop policy capa_select_por_rol on core.capa;
create policy capa_select_por_rol on core.capa for select to authenticated using (
  core.rol_actual() in ('administrador', 'administrador_titular', 'auditor')
  or (core.rol_actual() = 'capturista'
      and (estatus in ('vigente_admin', 'vigente_publico') or core.creo_objeto('capa', id))));

-- ---------------------------------------------------------------------------------------------
-- 4. api.bitacora_operativa: el estatus ahora sale de la columna `estatus` tambien en instrumentos (D-20),
--    y retirar del publico (vigente_publico -> borrador) se llama despublicacion en capas e instrumentos.
--    Mismas columnas que en la migracion 218.
-- ---------------------------------------------------------------------------------------------
create or replace view api.bitacora_operativa with (security_invoker = true) as
select
  b.id,
  b.fecha                                         as creado_en,
  b.id_usuario                                    as actor_id_usuario,
  a.info ->> 'rol'                                as rol,
  a.info ->> 'nombre'                             as actor_nombre,
  a.info ->> 'codigo'                             as codigo_usuario,
  b.tabla_afectada                                as tabla,
  b.id_registro                                   as recurso_id,
  case b.tabla_afectada when 'capa' then 'cartografia' else 'instrumento' end as tipo,
  coalesce(b.datos_nuevos ->> 'titulo', b.datos_previos ->> 'titulo',
           b.datos_nuevos ->> 'nombre', b.datos_previos ->> 'nombre', b.id_registro)  as titulo,
  o.operacion,
  coalesce(b.datos_nuevos ->> 'estatus', b.datos_previos ->> 'estatus') as estatus,
  d.comentario                                    as comentario_admin,
  jsonb_build_object(
    'fuente',            coalesce(x.m ->> 'fuente_origen', x.n ->> 'competencia', 'No especificada'),
    'responsable',       coalesce(x.n ->> 'responsable', x.n ->> 'competencia', x.m ->> 'custodio', 'Gobierno de Campeche'),
    'escala',            coalesce(x.m ->> 'escala', x.n ->> 'ambito'),
    'periodicidad',      x.m ->> 'periodicidad',
    'monitor',           x.n ->> 'grupos',
    'instrumentoOrigen', coalesce(x.n ->> 'id_instrumento', b.id_registro),
    'fecha',             x.m ->> 'fecha_corte',
    'horizonte',         null,
    'ejeEvaluacion',     null,
    'restriccionUso',    x.m ->> 'restriccion_uso')  as ficha_tecnica,
  case b.tabla_afectada
    when 'capa' then jsonb_strip_nulls(jsonb_build_object('principal', x.n ->> 'archivo', 'geojson', x.n ->> 'geojson'))
    else jsonb_strip_nulls(jsonb_build_object('principal', x.n ->> 'ruta_pdf'))
  end                                             as archivos,
  b.datos_previos,
  b.datos_nuevos
from core.bitacora_cambio b
cross join lateral (select y.n, coalesce(y.n -> 'metadatos_extra', '{}'::jsonb) as m
                      from (select coalesce(b.datos_nuevos, b.datos_previos) as n) y) x
left join lateral (select core.actor_resumen(b.id_usuario) as info) a on true
left join lateral (select
    case
      when b.accion = 'INSERT' then 'nuevo'
      when b.accion = 'DELETE' then 'baja'
      when b.accion = 'UPDATE' then 'actualizacion'
      else case b.datos_nuevos ->> 'estatus'
             when 'revision'        then 'envio'
             when 'vigente_admin'   then 'aprobacion'
             when 'vigente_publico' then 'publicacion'
             else case b.datos_previos ->> 'estatus'
                    when 'vigente_publico' then 'despublicacion'
                    when 'revision'        then 'rechazo'
                    when 'vigente_admin'   then 'rechazo'
                    else 'actualizacion' end
           end
    end as operacion) o on true
-- el motivo viene del dictamen de la misma decision (misma transaccion; se tolera 1 minuto)
left join lateral (select dd.comentario from core.dictamen dd
                    where dd.objeto_tipo = case b.tabla_afectada when 'capa' then 'capa' else 'instrumento' end
                      and dd.objeto_id = b.id_registro
                      and dd.decision = case o.operacion when 'rechazo' then 'rechazar' when 'despublicacion' then 'rechazar'
                                                         when 'aprobacion' then 'validar' when 'publicacion' then 'publicar' end
                      and dd.fecha between b.fecha - interval '1 minute' and b.fecha + interval '1 minute'
                    order by abs(extract(epoch from dd.fecha - b.fecha)), dd.fecha desc limit 1) d on true
where b.tabla_afectada in ('capa', 'instrumento_origen');
comment on view api.bitacora_operativa is
  'Bitacora de cambios de cartografia e instrumentos (Ciclo 5, ajustada en Ciclo 4): quien, que, cuando, estatus y motivo. La RLS de core.bitacora_cambio decide que ve cada perfil: el Capturista solo lo suyo; Administrador, Titular y Auditor todo.';
