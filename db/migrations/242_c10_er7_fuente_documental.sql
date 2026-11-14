-- 242_c10_er7_fuente_documental.sql
-- ER-7 (autorizado por Ismael el 14-nov-2026: «si deberia de existir en el entidad relacion porque hay que actualizar si es que se cae
-- algun link») -- Fuentes oficiales de informacion de la «Consulta oficial» en la base, con sus enlaces.
-- Ver docs/er7-fuente-documental-cambios-er.md.
--
-- Que agrega (2 tablas nuevas, 1 valor nuevo en dictamen):
--   core.fuente_documental   las 10 fuentes oficiales (ATUS, EDR, VMRC, Encuesta Intercensal, Censo, Marco Geoestadistico, RNC...).
--                            La CLAVE ES EL ID: DAT-F### (estadistica) o DAT-G### (geoespacial).
--   core.enlace_fuente       los enlaces de cada fuente (una fuente puede tener varios, cada uno con su nombre), con la marca de
--                            cuando se verifico que respondia.
--   core.dictamen.objeto_tipo admite 'fuente_documental'.
--
-- Reglas (las mismas que ya rigen a capas, instrumentos de origen e instrumentos normativos; nada nuevo que aprender):
--   * Ciclo D-20 de la ficha:  borrador -> revision -> vigente_admin -> vigente_publico. Enviar a revision EXIGE al menos un enlace activo.
--     Validar y publicar es SOLO del Administrador Titular (D-16). Cuatro ojos. Rechazar exige comentario, regresa a borrador y retira del publico.
--     La baja es logica (activo = false), solo del Titular y nunca mientras este publicada. Cero borrados fisicos.
--   * ENLACES: la ficha pasa por D-20, pero un enlace roto no puede esperar un ciclo de revision. Por eso el Administrador (o el Titular)
--     corrige, agrega, da de baja o marca como verificado un enlace EN CUALQUIER ESTATUS, y cada cambio queda en la bitacora.
--     No se puede dar de baja el ultimo enlace activo de una fuente publicada.
--   * Vista publica: anon lee SOLO fuentes publicadas y activas y sus enlaces activos. Nunca ve borradores ni quien verifico un enlace.

-- ---------------------------------------------------------------------------------------------
-- 1. Tablas
-- ---------------------------------------------------------------------------------------------
create table core.fuente_documental (
  id                    text primary key
                        constraint fuente_id_formato check (id ~ '^DAT-[FG][0-9]{3}$'),
  nombre                text not null check (btrim(nombre) <> ''),
  tipo_informacion      text not null check (tipo_informacion in ('estadistica','geoespacial')),
  subtipo               text,
  seccion_banco         text,
  institucion           text,
  estatus_verificacion  text not null default 'por_validar'
                        check (estatus_verificacion in ('vigente_verificado','por_validar','pendiente_integracion')),
  estatus_documental    text,
  descripcion           text,
  uso_sesim             text,
  cobertura_geografica  text,
  cobertura_temporal    text,
  variables             text,
  limitaciones          text,
  observaciones         text,
  fecha_verificacion    date,
  estatus               text not null default 'borrador'
                        constraint fuente_estatus_valido check (estatus in ('borrador','revision','vigente_admin','vigente_publico')),
  publicado             boolean not null default false,
  publicado_en          timestamptz,
  activo                boolean not null default true,
  -- la letra de la clave sigue al tipo: F = estadistica, G = geoespacial
  constraint fuente_letra_clave check (substr(id, 5, 1) = case tipo_informacion when 'estadistica' then 'F' else 'G' end),
  constraint fuente_publicado_es_estatus check (publicado = (estatus = 'vigente_publico')),
  constraint fuente_publicado_en check (not publicado or publicado_en is not null)
);
create index fuente_publico_idx on core.fuente_documental (publicado, activo);

create table core.enlace_fuente (
  id                   uuid primary key default gen_random_uuid(),
  id_fuente            text not null references core.fuente_documental(id),
  orden                integer not null default 1 check (orden >= 1),
  titulo               text not null check (btrim(titulo) <> ''),
  url                  text not null check (url ~ '^https?://'),
  estatus_enlace       text not null default 'sin_verificar' check (estatus_enlace in ('sin_verificar','responde','no_responde')),
  verificado_en        timestamptz,
  id_usuario_verifico  uuid references auth.users(id),
  activo               boolean not null default true,
  creado_en            timestamptz not null default now(),
  unique (id_fuente, url),
  constraint enlace_verificado_coherente check ((estatus_enlace = 'sin_verificar') = (verificado_en is null))
);
create index enlace_fuente_idx on core.enlace_fuente (id_fuente, orden);

-- dictamen: el dictamen de una fuente se guarda donde ya se guardan los demas
alter table core.dictamen drop constraint dictamen_objeto_tipo_check;
alter table core.dictamen add constraint dictamen_objeto_tipo_check
  check (objeto_tipo in ('medicion','capa','indicador','instrumento','instrumento_normativo','fuente_documental'));

-- ---------------------------------------------------------------------------------------------
-- 2. Disparadores: publicado <-> estatus (misma funcion que instrumento_origen), candado D-16 y auditoria
-- ---------------------------------------------------------------------------------------------
create trigger trg_instrumento_a_sincronizar
  before insert or update on core.fuente_documental
  for each row execute function core.fn_instrumento_sincronizar();
create trigger trg_fuente_publicar_ins
  before insert on core.fuente_documental
  for each row when (new.publicado) execute function core.exigir_titular('publicar fuentes documentales');
create trigger trg_fuente_publicar_upd
  before update on core.fuente_documental
  for each row when (new.publicado is distinct from old.publicado) execute function core.exigir_titular('publicar o despublicar fuentes documentales');

create trigger trg_auditoria after insert or update or delete on core.fuente_documental
  for each row execute function core.fn_auditar_cambio('id', 'estatus', '');
create trigger trg_auditoria after insert or update or delete on core.enlace_fuente
  for each row execute function core.fn_auditar_cambio('id', 'estatus_enlace', '');

-- ---------------------------------------------------------------------------------------------
-- 3. Acceso: nadie escribe directo; lectura por rol y lectura publica de lo publicado
-- ---------------------------------------------------------------------------------------------
alter table core.fuente_documental enable row level security;
alter table core.enlace_fuente enable row level security;
revoke all on core.fuente_documental, core.enlace_fuente from public, anon, authenticated;
grant select on core.fuente_documental, core.enlace_fuente to authenticated;

create policy fuente_select_por_rol on core.fuente_documental for select to authenticated
  using (core.rol_actual() in ('administrador','administrador_titular','auditor')
         or (core.rol_actual() is not null and publicado and activo));
create policy enlace_select_por_rol on core.enlace_fuente for select to authenticated
  using (core.rol_actual() in ('administrador','administrador_titular','auditor')
         or (core.rol_actual() is not null and activo
             and exists (select 1 from core.fuente_documental f where f.id = id_fuente)));

-- Sin cuenta (anon): solo lo publicado y activo. El subselect hereda la RLS de anon: un enlace solo se ve si su fuente se ve.
grant usage on schema core to anon;
grant select on core.fuente_documental to anon;
create policy fuente_select_publico on core.fuente_documental for select to anon
  using (publicado and activo);
grant select (id, id_fuente, orden, titulo, url, estatus_enlace, verificado_en, activo, creado_en) on core.enlace_fuente to anon;
create policy enlace_select_publico on core.enlace_fuente for select to anon
  using (activo and exists (select 1 from core.fuente_documental f where f.id = id_fuente));

-- ---------------------------------------------------------------------------------------------
-- 4. Vistas de la API (security_invoker: la RLS de arriba decide que ve cada quien)
-- ---------------------------------------------------------------------------------------------
-- Ficha + sus enlaces activos como lista JSON [{id, titulo, url, estatus_enlace, verificado_en}], en orden. `clave` es el mismo id y
-- `url_oficial` el primer enlace: la misma forma que tenia el archivo estatico que lee el front.
create or replace view api.fuente_documental with (security_invoker = true) as
select f.*,
       f.id as clave,
       coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'titulo', e.titulo, 'url', e.url,
                                                      'estatus_enlace', e.estatus_enlace, 'verificado_en', e.verificado_en)
                                  order by e.orden, e.titulo)
                   from core.enlace_fuente e where e.id_fuente = f.id and e.activo), '[]'::jsonb) as enlaces,
       (select e.url from core.enlace_fuente e where e.id_fuente = f.id and e.activo order by e.orden, e.titulo limit 1) as url_oficial
  from core.fuente_documental f;
comment on view api.fuente_documental is 'ER-7: fuentes oficiales de informacion con sus enlaces activos. Anon ve solo fuentes publicadas (vigente_publico); la administracion y el Auditor, todas.';
revoke all on api.fuente_documental from public, anon, authenticated;
grant select on api.fuente_documental to anon, authenticated;

-- Todos los enlaces (incluidos los dados de baja) con quien los verifico: para el panel de administracion.
create or replace view api.enlace_fuente with (security_invoker = true) as
select id, id_fuente, orden, titulo, url, estatus_enlace, verificado_en, id_usuario_verifico, activo, creado_en
  from core.enlace_fuente;
comment on view api.enlace_fuente is 'ER-7: enlaces de las fuentes oficiales, con quien verifico cada uno y los dados de baja. Solo cuentas (administracion y Auditor ven todo).';
revoke all on api.enlace_fuente from public, anon, authenticated;
grant select on api.enlace_fuente to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 5. Funciones api.* de escritura
-- ---------------------------------------------------------------------------------------------
create or replace function api.fn_guardar_fuente_documental(p_datos jsonb) returns jsonb
language plpgsql security definer set search_path = core, public as $$
declare v_id text; v_ant core.fuente_documental; v_r core.fuente_documental; v_fila core.fuente_documental;
        v_existe boolean; v_letra text;
begin
  perform core.exigir_rol(array['administrador','administrador_titular'], 'guardar fuentes documentales');
  perform core.exigir_claves(p_datos, array['id','nombre','tipo_informacion','subtipo','seccion_banco','institucion','estatus_verificacion',
    'estatus_documental','descripcion','uso_sesim','cobertura_geografica','cobertura_temporal','variables','limitaciones','observaciones',
    'fecha_verificacion'], 'fuente documental');
  v_id := nullif(btrim(p_datos ->> 'id'), '');
  if v_id is not null then
    select * into v_ant from core.fuente_documental where id = v_id;
    v_existe := found;
  else
    v_existe := false;
  end if;

  if not v_existe then
    if v_id is null then
      -- clave nueva: la letra la da el tipo (F estadistica, G geoespacial); el numero es el siguiente de esa letra
      v_letra := case p_datos ->> 'tipo_informacion' when 'estadistica' then 'F' when 'geoespacial' then 'G' end;
      if v_letra is null then
        raise exception 'Para asignar la clave indica el tipo de informacion (estadistica o geoespacial).' using errcode = '22023';
      end if;
      perform pg_advisory_xact_lock(hashtext('fuente_documental.id'));
      select 'DAT-' || v_letra || lpad((coalesce(max(substr(id, 6)::int), 0) + 1)::text, 3, '0') into v_id
        from core.fuente_documental where id like 'DAT-' || v_letra || '%';
    end if;
    v_r := jsonb_populate_record(null::core.fuente_documental, p_datos || jsonb_build_object('id', v_id));
    insert into core.fuente_documental (id, nombre, tipo_informacion, subtipo, seccion_banco, institucion, estatus_verificacion, estatus_documental,
        descripcion, uso_sesim, cobertura_geografica, cobertura_temporal, variables, limitaciones, observaciones, fecha_verificacion,
        estatus, publicado, activo)
    values (v_r.id, v_r.nombre, v_r.tipo_informacion, v_r.subtipo, v_r.seccion_banco, v_r.institucion,
        coalesce(v_r.estatus_verificacion, 'por_validar'), v_r.estatus_documental, v_r.descripcion, v_r.uso_sesim, v_r.cobertura_geografica,
        v_r.cobertura_temporal, v_r.variables, v_r.limitaciones, v_r.observaciones, v_r.fecha_verificacion, 'borrador', false, true)
    returning * into v_fila;
  else
    if v_ant.estatus <> 'borrador' then
      raise exception 'La fuente % esta en "%": para editarla, el Titular debe devolverla a borrador (rechazar con comentario). Los enlaces si se corrigen sin devolverla.',
        v_id, v_ant.estatus using errcode = '55000';
    end if;
    if not v_ant.activo then
      raise exception 'La fuente % esta dada de baja.', v_id using errcode = '55000';
    end if;
    v_r := jsonb_populate_record(null::core.fuente_documental, to_jsonb(v_ant) || p_datos);
    update core.fuente_documental set nombre = v_r.nombre, tipo_informacion = v_r.tipo_informacion, subtipo = v_r.subtipo,
        seccion_banco = v_r.seccion_banco, institucion = v_r.institucion, estatus_verificacion = v_r.estatus_verificacion,
        estatus_documental = v_r.estatus_documental, descripcion = v_r.descripcion, uso_sesim = v_r.uso_sesim,
        cobertura_geografica = v_r.cobertura_geografica, cobertura_temporal = v_r.cobertura_temporal, variables = v_r.variables,
        limitaciones = v_r.limitaciones, observaciones = v_r.observaciones, fecha_verificacion = v_r.fecha_verificacion
     where id = v_id returning * into v_fila;
  end if;
  return to_jsonb(v_fila);
end $$;

-- Alta o correccion de un enlace. Se permite en cualquier estatus de la fuente (un enlace roto no espera un ciclo de revision).
-- Cambiar la direccion borra la marca de verificacion: el enlace nuevo aun no se ha comprobado.
create or replace function api.fn_guardar_enlace_fuente(p_datos jsonb) returns jsonb
language plpgsql security definer set search_path = core, public as $$
declare v_id uuid; v_f core.fuente_documental; v_ant core.enlace_fuente; v_fila core.enlace_fuente;
        v_fuente text; v_titulo text; v_url text; v_orden int;
begin
  perform core.exigir_rol(array['administrador','administrador_titular'], 'guardar enlaces de fuentes documentales');
  perform core.exigir_claves(p_datos, array['id','id_fuente','titulo','url','orden'], 'enlace de fuente documental');
  v_id := nullif(btrim(p_datos ->> 'id'), '')::uuid;
  v_titulo := nullif(btrim(p_datos ->> 'titulo'), '');
  v_url := nullif(btrim(p_datos ->> 'url'), '');
  v_orden := coalesce(nullif(p_datos ->> 'orden', '')::int, 1);
  if v_id is not null then
    select * into v_ant from core.enlace_fuente where id = v_id for update;
    if not found then raise exception 'El enlace % no existe.', v_id using errcode = 'P0002'; end if;
    v_fuente := v_ant.id_fuente;
    if nullif(p_datos ->> 'id_fuente', '') is not null and p_datos ->> 'id_fuente' <> v_fuente then
      raise exception 'Un enlace no cambia de fuente.' using errcode = '22023';
    end if;
  else
    v_fuente := nullif(btrim(p_datos ->> 'id_fuente'), '');
  end if;
  select * into v_f from core.fuente_documental where id = v_fuente;
  if not found then raise exception 'La fuente % no existe.', coalesce(v_fuente, '(sin indicar)') using errcode = 'P0002'; end if;
  if not v_f.activo then raise exception 'La fuente % esta dada de baja.', v_fuente using errcode = '55000'; end if;

  if v_id is null then
    if v_titulo is null or v_url is null then
      raise exception 'Indica el nombre y la direccion (URL) del enlace.' using errcode = '23514';
    end if;
    insert into core.enlace_fuente (id_fuente, orden, titulo, url) values (v_fuente, v_orden, v_titulo, v_url) returning * into v_fila;
  else
    update core.enlace_fuente
       set titulo = coalesce(v_titulo, titulo),
           url = coalesce(v_url, url),
           orden = case when p_datos ? 'orden' then v_orden else orden end,
           estatus_enlace = case when v_url is not null and v_url <> url then 'sin_verificar' else estatus_enlace end,
           verificado_en = case when v_url is not null and v_url <> url then null else verificado_en end,
           id_usuario_verifico = case when v_url is not null and v_url <> url then null else id_usuario_verifico end
     where id = v_id returning * into v_fila;
  end if;
  return to_jsonb(v_fila);
end $$;

-- Marca el resultado de comprobar un enlace: responde / no responde (fecha y hora de hoy) o lo regresa a sin_verificar.
create or replace function api.fn_marcar_enlace_fuente(p_id uuid, p_estatus text) returns jsonb
language plpgsql security definer set search_path = core, public as $$
declare v_fila core.enlace_fuente;
begin
  perform core.exigir_rol(array['administrador','administrador_titular'], 'marcar la verificacion de enlaces de fuentes documentales');
  if p_estatus not in ('responde','no_responde','sin_verificar') then
    raise exception 'Estatus de enlace no valido: "%". Usa responde, no_responde o sin_verificar.', p_estatus using errcode = '22023';
  end if;
  update core.enlace_fuente
     set estatus_enlace = p_estatus,
         verificado_en = case when p_estatus = 'sin_verificar' then null else now() end,
         id_usuario_verifico = case when p_estatus = 'sin_verificar' then null else auth.uid() end
   where id = p_id returning * into v_fila;
  if not found then raise exception 'El enlace % no existe.', p_id using errcode = 'P0002'; end if;
  return to_jsonb(v_fila);
end $$;

create or replace function api.fn_baja_enlace_fuente(p_id uuid, p_activo boolean default false) returns jsonb
language plpgsql security definer set search_path = core, public as $$
declare v_e core.enlace_fuente; v_f core.fuente_documental; v_fila core.enlace_fuente;
begin
  perform core.exigir_rol(array['administrador','administrador_titular'], 'dar de baja enlaces de fuentes documentales');
  select * into v_e from core.enlace_fuente where id = p_id for update;
  if not found then raise exception 'El enlace % no existe.', p_id using errcode = 'P0002'; end if;
  select * into v_f from core.fuente_documental where id = v_e.id_fuente for update;
  if not p_activo and v_f.publicado
     and not exists (select 1 from core.enlace_fuente x where x.id_fuente = v_e.id_fuente and x.activo and x.id <> p_id) then
    raise exception 'La fuente % esta publicada y este es su ultimo enlace activo: agrega el nuevo antes de dar de baja el roto.', v_e.id_fuente using errcode = '55000';
  end if;
  update core.enlace_fuente set activo = p_activo where id = p_id returning * into v_fila;
  return to_jsonb(v_fila);
end $$;

create or replace function api.fn_enviar_fuente_documental_revision(p_id text) returns jsonb
language plpgsql security definer set search_path = core, public as $$
declare v_f core.fuente_documental; v_fila core.fuente_documental;
begin
  perform core.exigir_rol(array['administrador','administrador_titular'], 'enviar fuentes documentales a revision');
  select * into v_f from core.fuente_documental where id = p_id for update;
  if not found then raise exception 'La fuente % no existe.', p_id using errcode = 'P0002'; end if;
  if v_f.estatus <> 'borrador' then
    raise exception 'La fuente % ya esta en "%"; solo se envia a revision desde borrador.', p_id, v_f.estatus using errcode = '55000';
  end if;
  if not v_f.activo then raise exception 'La fuente % esta dada de baja.', p_id using errcode = '55000'; end if;
  if not exists (select 1 from core.enlace_fuente where id_fuente = p_id and activo) then
    raise exception 'La fuente % no tiene enlaces; agrega al menos uno antes de enviarla a revision.', p_id using errcode = '23514';
  end if;
  update core.fuente_documental set estatus = 'revision' where id = p_id returning * into v_fila;
  return to_jsonb(v_fila);
end $$;

create or replace function api.fn_dictaminar_fuente_documental(p_id text, p_decision text, p_comentario text default null) returns jsonb
language plpgsql security definer set search_path = core, public as $$
declare v_f core.fuente_documental; v_nuevo text; v_envio uuid; v_fila core.fuente_documental;
begin
  perform core.exigir_rol(array['administrador_titular'], 'dictaminar fuentes documentales (D-16: solo el Administrador Titular)');
  if p_decision not in ('validar','publicar','rechazar') then
    raise exception 'Decision no valida: "%". Usa validar, publicar o rechazar.', p_decision using errcode = '22023';
  end if;
  select * into v_f from core.fuente_documental where id = p_id for update;
  if not found then raise exception 'La fuente % no existe.', p_id using errcode = 'P0002'; end if;

  if p_decision = 'rechazar' then
    if v_f.estatus not in ('revision','vigente_admin','vigente_publico') then
      raise exception 'La fuente % esta en "%": no hay nada que rechazar.', p_id, v_f.estatus using errcode = '55000';
    end if;
    if btrim(coalesce(p_comentario, '')) = '' then
      raise exception 'Rechazar exige un comentario con el motivo.' using errcode = '23514';
    end if;
    v_nuevo := 'borrador';
  else
    if p_decision = 'validar' and v_f.estatus <> 'revision' then
      raise exception 'La fuente % esta en "%": solo se valida desde revision.', p_id, v_f.estatus using errcode = '55000';
    end if;
    if p_decision = 'publicar' and v_f.estatus <> 'vigente_admin' then
      raise exception 'La fuente % esta en "%": solo se publica una ya validada (vigente_admin).', p_id, v_f.estatus using errcode = '55000';
    end if;
    if not v_f.activo then raise exception 'La fuente % esta dada de baja.', p_id using errcode = '55000'; end if;
    v_envio := core.quien_envio('fuente_documental', p_id);
    if v_envio is not null and v_envio = auth.uid() then
      raise exception 'Cuatro ojos: quien envio la fuente % a revision no puede % tambien.', p_id,
        case p_decision when 'validar' then 'validarla' else 'publicarla' end using errcode = '42501';
    end if;
    if not exists (select 1 from core.enlace_fuente where id_fuente = p_id and activo) then
      raise exception 'La fuente % no tiene enlaces activos.', p_id using errcode = '23514';
    end if;
    v_nuevo := case p_decision when 'validar' then 'vigente_admin' else 'vigente_publico' end;
  end if;

  insert into core.dictamen (objeto_tipo, objeto_id, decision, estado_previo, estado_nuevo, comentario, id_usuario)
    values ('fuente_documental', p_id, p_decision, v_f.estatus, v_nuevo, nullif(btrim(p_comentario), ''), auth.uid());
  update core.fuente_documental set estatus = v_nuevo where id = p_id returning * into v_fila;
  return to_jsonb(v_fila);
end $$;

create or replace function api.fn_baja_fuente_documental(p_id text, p_activo boolean default false) returns jsonb
language plpgsql security definer set search_path = core, public as $$
declare v_f core.fuente_documental; v_fila core.fuente_documental;
begin
  perform core.exigir_rol(array['administrador_titular'], 'dar de baja fuentes documentales (solo el Administrador Titular)');
  select * into v_f from core.fuente_documental where id = p_id for update;
  if not found then raise exception 'La fuente % no existe.', p_id using errcode = 'P0002'; end if;
  if not p_activo and v_f.estatus = 'vigente_publico' then
    raise exception 'La fuente % esta publicada: el Titular debe retirarla del publico (rechazar) antes de la baja.', p_id using errcode = '55000';
  end if;
  update core.fuente_documental set activo = p_activo where id = p_id returning * into v_fila;
  return to_jsonb(v_fila);
end $$;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as firma from pg_proc p where p.pronamespace = 'api'::regnamespace
            and p.proname in ('fn_guardar_fuente_documental','fn_guardar_enlace_fuente','fn_marcar_enlace_fuente','fn_baja_enlace_fuente',
              'fn_enviar_fuente_documental_revision','fn_dictaminar_fuente_documental','fn_baja_fuente_documental')
  loop
    execute format('revoke all on function %s from public, anon', f.firma);
    execute format('grant execute on function %s to authenticated', f.firma);
  end loop;
end $$;

-- ---------------------------------------------------------------------------------------------
-- 6. Documentacion (alimenta api.diccionario y core.verificar_integridad)
-- ---------------------------------------------------------------------------------------------
comment on table core.fuente_documental is 'ER-7: fuente oficial de informacion estadistica o geoespacial de la Consulta oficial (ATUS, EDR, VMRC, Marco Geoestadistico...). La clave es el id (DAT-F001...). Ciclo de vida D-20; solo se muestra al publico lo publicado.';
comment on table core.enlace_fuente is 'ER-7: enlace de consulta de una fuente oficial. Una fuente puede tener varios; cada uno lleva su nombre y la marca de cuando se verifico que respondia. Se corrige en cualquier estatus de la fuente y cada cambio queda en la bitacora.';

do $$
declare r record;
begin
  for r in select * from (values
    ('fuente_documental','id','Clave unica de la fuente: DAT- + letra (F estadistica, G geoespacial) + 3 digitos.'),
    ('fuente_documental','nombre','Nombre con que se muestra la fuente.'),
    ('fuente_documental','tipo_informacion','Tipo de informacion que ofrece: estadistica o geoespacial. Define la letra de la clave.'),
    ('fuente_documental','subtipo','Desagregacion o forma de la informacion (por ejemplo, estatal y municipal; lineal; puntual).'),
    ('fuente_documental','seccion_banco','Seccion del banco documental donde se ubica la fuente (5.1 estadistica, 5.2 geoespacial).'),
    ('fuente_documental','institucion','Institucion que produce la informacion (por ejemplo, INEGI, SICT). Se captura desde administracion.'),
    ('fuente_documental','estatus_verificacion','Estado de la verificacion documental: vigente_verificado, por_validar o pendiente_integracion. No es el ciclo de publicacion (ver estatus).'),
    ('fuente_documental','estatus_documental','Etiqueta libre de la situacion de la fuente (por ejemplo, Fuente oficial INEGI).'),
    ('fuente_documental','descripcion','Resumen de que ofrece la fuente.'),
    ('fuente_documental','uso_sesim','Para que se usa la fuente dentro de SESIM.'),
    ('fuente_documental','cobertura_geografica','Territorio y desagregacion que cubre la fuente.'),
    ('fuente_documental','cobertura_temporal','Periodo que cubre la fuente.'),
    ('fuente_documental','variables','Variables o campos principales que ofrece.'),
    ('fuente_documental','limitaciones','Limitaciones conocidas de la fuente que el usuario debe tener presentes.'),
    ('fuente_documental','observaciones','Notas de revision documental.'),
    ('fuente_documental','fecha_verificacion','Fecha en que se verifico la ficha de la fuente.'),
    ('fuente_documental','estatus','Etapa de publicacion (D-20): borrador | revision | vigente_admin | vigente_publico. Solo el Titular valida y publica (D-16); quien envio a revision no dictamina.'),
    ('fuente_documental','publicado','Derivado: true solo si estatus = vigente_publico. Lo mantiene un disparador; es lo que ve el publico.'),
    ('fuente_documental','publicado_en','Fecha y hora en que se publico por ultima vez.'),
    ('fuente_documental','activo','false = dada de baja (logica; no se borra).'),
    ('enlace_fuente','id','Identificador del enlace.'),
    ('enlace_fuente','id_fuente','Fuente a la que pertenece el enlace (su clave DAT-xxxx).'),
    ('enlace_fuente','orden','Posicion del enlace dentro de la fuente; el primero es el principal.'),
    ('enlace_fuente','titulo','Nombre con que se muestra el enlace (por ejemplo, Metadatos VMRC 2025).'),
    ('enlace_fuente','url','Direccion del sitio oficial. Debe empezar con http:// o https://.'),
    ('enlace_fuente','estatus_enlace','Resultado de la ultima comprobacion: sin_verificar, responde o no_responde.'),
    ('enlace_fuente','verificado_en','Fecha y hora de la ultima comprobacion; vacia mientras este sin_verificar.'),
    ('enlace_fuente','id_usuario_verifico','Cuenta que hizo la ultima comprobacion (no se muestra al publico).'),
    ('enlace_fuente','activo','false = enlace dado de baja (logica; no se borra).'),
    ('enlace_fuente','creado_en','Fecha y hora en que se registro el enlace.')
  ) as v(tabla, columna, texto)
  loop
    execute format('comment on column core.%I.%I is %L', r.tabla, r.columna, r.texto);
  end loop;
end $$;

comment on function api.fn_guardar_fuente_documental(jsonb) is 'ER-7 (D-20): alta (borrador, con clave DAT-xxxx automatica si no se manda) o edicion de una fuente. Administrador y Titular; solo en borrador.';
comment on function api.fn_guardar_enlace_fuente(jsonb) is 'ER-7: alta o correccion de un enlace de una fuente, en cualquier estatus. Administrador y Titular. Cambiar la URL borra la marca de verificacion.';
comment on function api.fn_marcar_enlace_fuente(uuid, text) is 'ER-7: registra si un enlace respondio o no (con fecha y quien lo comprobo). Administrador y Titular.';
comment on function api.fn_baja_enlace_fuente(uuid, boolean) is 'ER-7: baja o reactivacion logica de un enlace. No se da de baja el ultimo enlace activo de una fuente publicada.';
comment on function api.fn_enviar_fuente_documental_revision(text) is 'ER-7 (D-20): borrador -> revision; exige al menos un enlace activo.';
comment on function api.fn_dictaminar_fuente_documental(text, text, text) is 'ER-7 (D-20, D-16): solo el Titular valida, publica o rechaza; cuatro ojos; rechazar exige comentario.';
comment on function api.fn_baja_fuente_documental(text, boolean) is 'ER-7: baja o reactivacion logica de una fuente. Solo el Titular; no mientras este publicada.';

notify pgrst, 'reload schema';
