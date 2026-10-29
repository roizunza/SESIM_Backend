-- Ciclo 5 -- Trazabilidad y control de cambios.
--
-- Decision (28-oct-2026): NO se adoptan las migraciones 122-124 del front del Ciclo 5 (solicitud_cambio /
-- bitacora_operativa): duplicaban la maquina de estados de capa.estatus + dictamen + capa_version y la
-- bitacora general core.bitacora_cambio, y su estatus "aprobado" saltaba las compuertas D-16 y D-17.
-- Lo que SI faltaba en nuestro modelo es esto:
--   1. nada escribia en core.bitacora_cambio  -> trigger de auditoria generico (fn_auditar_cambio);
--   2. el Capturista no podia leer sus propios cambios (el indice bitacora_cambio_actor_idx ya lo preveia)
--      ni los dictamenes de la administracion sobre lo suyo -> dos politicas de lectura "propia";
--   3. el front del Ciclo 5 necesita una bitacora legible (quien, que, cuando, estatus, motivo)
--                                                     -> vista api.bitacora_operativa.
-- Las ESCRITURAS siguen siendo solo por funciones api.* (Ciclos 4 y 8): esta migracion no abre ningun INSERT/UPDATE.

-- ---------------------------------------------------------------------------------------------
-- 1. Auditoria generica. Argumentos del trigger: (columna llave, columna de estado [opcional]).
--    Escribe en core.bitacora_cambio con la identidad de quien actua: auth.uid() (sesion real) o, para el
--    servicio de procesos, el GUC app.actor_id (misma convencion que core.bitacora del Ciclo 1). Sin
--    identidad (migraciones, cargas) id_usuario queda nulo. Un UPDATE que no cambia nada (salvo updated_at)
--    no deja huella. Si cambia la columna de estado, la accion es CAMBIO_ESTADO.
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
  v_col_id  text := tg_argv[0];
  v_col_est text := nullif(tg_argv[1], '');
begin
  v_uid := coalesce(auth.uid(), nullif(current_setting('app.actor_id', true), '')::uuid);
  if v_uid is not null and not exists (select 1 from core.perfil p where p.id_usuario = v_uid) then
    v_uid := null;                         -- cuenta sin perfil (p. ej. llave de servicio): se registra como sistema
  end if;

  if tg_op = 'INSERT' then
    v_new := to_jsonb(new); v_accion := 'INSERT'; v_reg := v_new;
  elsif tg_op = 'DELETE' then
    v_old := to_jsonb(old); v_accion := 'DELETE'; v_reg := v_old;
  else
    v_old := to_jsonb(old); v_new := to_jsonb(new); v_reg := v_new;
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
  values (v_uid, tg_table_name, v_reg ->> v_col_id, v_accion, v_old, v_new, v_ip);

  return case tg_op when 'DELETE' then old else new end;
end $$;
comment on function core.fn_auditar_cambio() is
  'Trigger de Ciclo 5: registra en core.bitacora_cambio (solo insercion) cada alta, cambio, cambio de estado y baja de las tablas de control, con la identidad de auth.uid().';

do $$
declare r record;
begin
  for r in select * from (values
      ('capa',                'id', 'estatus'),
      ('instrumento_origen',  'id', 'publicado'),
      ('indicador',           'id', 'estatus_aprobado'),
      ('medicion_indicador',  'id', 'estado'),
      ('evidencia_medicion',  'id', ''),
      ('umbral_semaforo',     'id', ''),
      ('hallazgo_auditoria',  'id', 'estado'),
      ('periodo',             'id', '')
    ) as v(tabla, col_id, col_estado)
  loop
    execute format('drop trigger if exists trg_auditoria on core.%I', r.tabla);
    execute format(
      'create trigger trg_auditoria after insert or update or delete on core.%I
         for each row execute function core.fn_auditar_cambio(%L, %L)', r.tabla, r.col_id, r.col_estado);
  end loop;
end $$;

-- ---------------------------------------------------------------------------------------------
-- 2. Lectura "lo mio" para el Capturista (Auditor, Administrador y Titular ya leen todo desde 207).
--    "Lo mio" = todo lo que ocurrio sobre los objetos (capas, instrumentos, mediciones) que la persona toco:
--    asi ve el dictamen de la administracion (rechazo y su motivo) sobre su propia carga, no solo sus pasos.
--    Se resuelve con una funcion SECURITY DEFINER para no consultar la misma tabla desde su propia politica.
-- ---------------------------------------------------------------------------------------------
create or replace function core.toco_objeto(p_tabla text, p_id text) returns boolean
language sql stable security definer set search_path = core, public as $$
  select exists (select 1 from core.bitacora_cambio b
                  where b.id_usuario = auth.uid() and b.tabla_afectada = p_tabla and b.id_registro = p_id)
$$;
comment on function core.toco_objeto(text, text) is
  'true si la cuenta en sesion dejo al menos un evento sobre ese registro. Sirve a las politicas de lectura del Capturista.';
revoke all on function core.toco_objeto(text, text) from public, anon;
grant execute on function core.toco_objeto(text, text) to authenticated;

drop policy if exists bitacora_cambio_select_propio on core.bitacora_cambio;
create policy bitacora_cambio_select_propio on core.bitacora_cambio for select to authenticated
  using (core.rol_actual() = 'capturista'
         and (id_usuario = auth.uid() or core.toco_objeto(tabla_afectada, id_registro)));

drop policy if exists dictamen_select_propio on core.dictamen;
create policy dictamen_select_propio on core.dictamen for select to authenticated
  using (core.rol_actual() = 'capturista'
         and core.toco_objeto(case objeto_tipo when 'medicion' then 'medicion_indicador' else objeto_tipo end, objeto_id));

-- ---------------------------------------------------------------------------------------------
-- 3. Quien es quien: nombre, rol y codigo estable (CAP-001, ADM-001, AUD-001) sin abrir core.perfil
--    al Capturista. Solo se alcanza a traves de api.bitacora_operativa (core no se expone por la API).
-- ---------------------------------------------------------------------------------------------
create or replace function core.actor_resumen(p_id uuid) returns jsonb
language sql stable security definer set search_path = core, public as $$
  select jsonb_build_object(
           'nombre', p.nombre,
           'rol',    p.rol,
           'codigo', case when p.rol = 'auditor' then 'AUD' when p.rol = 'capturista' then 'CAP' else 'ADM' end
                     || '-' || lpad((select count(*) from core.perfil q
                                      where (case when q.rol in ('administrador','administrador_titular') then 'adm' else q.rol end)
                                          = (case when p.rol in ('administrador','administrador_titular') then 'adm' else p.rol end)
                                        and (q.creado_en, q.id_usuario) <= (p.creado_en, p.id_usuario))::text, 3, '0'))
    from core.perfil p where p.id_usuario = p_id
$$;
comment on function core.actor_resumen(uuid) is
  'Nombre, rol y codigo estable (CAP-001, ADM-001, AUD-001) de una cuenta. Uso interno de api.bitacora_operativa.';
revoke all on function core.actor_resumen(uuid) from public, anon;
grant execute on function core.actor_resumen(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 4. api.bitacora_operativa: la bitacora de cartografia (capa) e instrumentos, lista para pintar.
--    operacion: nuevo | actualizacion | envio | aprobacion | publicacion | despublicacion | rechazo | baja
--      CAMBIO_ESTADO de una capa: revision -> envio; vigente_admin -> aprobacion; vigente_publico -> publicacion;
--      vuelta a borrador desde revision/vigente_admin -> rechazo (el motivo sale del dictamen de la misma transaccion).
--    estatus: el estatus propio del sistema (borrador | revision | vigente_admin | vigente_publico; instrumento:
--      publicado -> vigente_publico, no publicado -> borrador).
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
  case b.tabla_afectada
    when 'instrumento_origen' then case when coalesce((coalesce(b.datos_nuevos, b.datos_previos) ->> 'publicado')::boolean, false)
                                        then 'vigente_publico' else 'borrador' end
    else coalesce(b.datos_nuevos ->> 'estatus', b.datos_previos ->> 'estatus')
  end                                             as estatus,
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
  case when b.tabla_afectada = 'capa'
       then jsonb_strip_nulls(jsonb_build_object('principal', x.n ->> 'archivo', 'geojson', x.n ->> 'geojson'))
       else '{}'::jsonb end                       as archivos,
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
      when b.tabla_afectada = 'instrumento_origen' then
           case when (b.datos_nuevos ->> 'publicado')::boolean then 'publicacion' else 'despublicacion' end
      else case b.datos_nuevos ->> 'estatus'
             when 'revision'        then 'envio'
             when 'vigente_admin'   then 'aprobacion'
             when 'vigente_publico' then 'publicacion'
             else case when b.datos_previos ->> 'estatus' in ('revision','vigente_admin') then 'rechazo' else 'actualizacion' end
           end
    end as operacion) o on true
-- el motivo viene del dictamen de la misma decision (en produccion, de la misma transaccion; se tolera 1 minuto)
left join lateral (select dd.comentario from core.dictamen dd
                    where b.tabla_afectada = 'capa' and dd.objeto_tipo = 'capa' and dd.objeto_id = b.id_registro
                      and dd.decision = case o.operacion when 'rechazo' then 'rechazar' when 'aprobacion' then 'validar'
                                                         when 'publicacion' then 'publicar' end
                      and dd.fecha between b.fecha - interval '1 minute' and b.fecha + interval '1 minute'
                    order by abs(extract(epoch from dd.fecha - b.fecha)), dd.fecha desc limit 1) d on true
where b.tabla_afectada in ('capa', 'instrumento_origen');
comment on view api.bitacora_operativa is
  'Bitacora de cambios de cartografia e instrumentos (Ciclo 5): quien, que, cuando, estatus y motivo. La RLS de core.bitacora_cambio decide que ve cada perfil: el Capturista solo lo suyo; Administrador, Titular y Auditor todo.';
revoke all on api.bitacora_operativa from public, anon, authenticated;
grant select on api.bitacora_operativa to authenticated;
