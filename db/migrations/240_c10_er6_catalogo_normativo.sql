-- 240_c10_er6_catalogo_normativo.sql
-- ER-6 (autorizado por Ismael el 14-nov-2026) -- Catalogo de instrumentos normativos en la base, con su PDF.
-- Ver docs/er6-catalogo-instrumentos-cambios-er.md.
--
-- Que agrega (3 tablas nuevas, 1 valor nuevo en dictamen, 1 bucket publico):
--   core.instrumento_normativo   las 36 fichas del catalogo (leyes, NOM, programas, PIMUS...). La CLAVE ES EL ID: DOC-E001...
--   core.documento_instrumento   el PDF de cada ficha, con version, huella SHA-256, bytes y paginas. Nunca se borra.
--   core.relacion_normativa      concordancias entre fichas (origen > destino), por validar o validadas.
--   core.dictamen.objeto_tipo    admite 'instrumento_normativo'.
--   bucket publico `instrumentos` (solo PDF, hasta 200 MB por archivo).
--
-- Reglas (las mismas que ya rigen a capas e instrumentos de origen; nada nuevo que aprender):
--   * Ciclo de vida D-20:  borrador -> revision -> vigente_admin -> vigente_publico.
--     Enviar a revision EXIGE el PDF principal. Validar y publicar es SOLO del Administrador Titular (D-16).
--     Cuatro ojos: quien envio no dictamina. Rechazar exige comentario y regresa a borrador (tambien retira del publico).
--     La baja es logica (activo = false), solo del Titular y nunca mientras este publicado. Cero borrados fisicos.
--   * Vista publica: anon lee SOLO fichas publicadas y activas (estatus = vigente_publico), sus documentos vigentes y las
--     relaciones entre fichas publicadas. Nunca ve borradores, quien subio un archivo ni la bitacora.
--   * CLAVE <-> ARCHIVO: el nombre en el bucket es  <clave>/<clave>_v<NN>_<sha16>.pdf  (complemento: _c<NN>_),
--     donde <sha16> son los primeros 16 caracteres del SHA-256 del archivo. La politica de subida lo exige y la
--     funcion de registro lo vuelve a comprobar contra la ficha, la version siguiente y la huella declarada.

-- ---------------------------------------------------------------------------------------------
-- 1. Tablas
-- ---------------------------------------------------------------------------------------------
create table core.instrumento_normativo (
  id                      text primary key
                          constraint instnorm_id_formato check (id ~ '^DOC-[EFMN][0-9]{3}$'),
  nombre                  text not null check (btrim(nombre) <> ''),
  nombre_oficial          text,
  tipo                    text not null check (btrim(tipo) <> ''),
  escala                  text not null check (escala in ('E','F','M')),
  subtipo                 text,
  nivel_piramide          integer not null check (nivel_piramide between 1 and 6),
  seccion_banco           text,
  dependencia             text,
  fuente                  text,
  fecha_publicacion       date,
  ultima_actualizacion    date,
  estatus_verificacion    text not null default 'por_validar'
                          check (estatus_verificacion in ('vigente_verificado','referencia_federal','por_validar','pendiente_integracion')),
  estatus_documental      text,
  descripcion             text,
  articulos               text,
  uso_sesim               text,
  evidencia               text,
  vinculacion             text,
  observaciones           text,
  enlaces                 jsonb not null default '[]'::jsonb check (jsonb_typeof(enlaces) = 'array'),
  url_oficial             text check (url_oficial is null or url_oficial ~ '^https?://'),
  cobertura_geografica    text,
  id_unidad               varchar(9) references core.unidad_territorial(id),
  id_instrumento_origen   varchar(12) references core.instrumento_origen(id),
  limitaciones            text,
  cobertura_temporal      text,
  variables               text,
  emisor                  text,
  instrumento_publicacion text,
  aprobacion              text,
  publicacion             jsonb,
  ultima_reforma          jsonb,
  articulos_verificados   jsonb not null default '[]'::jsonb check (jsonb_typeof(articulos_verificados) = 'array'),
  fuentes_verificacion    jsonb not null default '[]'::jsonb check (jsonb_typeof(fuentes_verificacion) = 'array'),
  fecha_verificacion      date,
  estatus                 text not null default 'borrador'
                          constraint instnorm_estatus_valido check (estatus in ('borrador','revision','vigente_admin','vigente_publico')),
  publicado               boolean not null default false,
  publicado_en            timestamptz,
  activo                  boolean not null default true,
  -- la letra de la clave sigue al tipo y la escala: N = Norma Oficial Mexicana; E, F, M = escala estatal, federal, municipal
  constraint instnorm_letra_clave check (substr(id, 5, 1) = case when tipo = 'Norma Oficial Mexicana' then 'N' else escala end),
  constraint instnorm_publicado_es_estatus check (publicado = (estatus = 'vigente_publico')),
  constraint instnorm_publicado_en check (not publicado or publicado_en is not null)
);
create unique index instnorm_origen_unico on core.instrumento_normativo (id_instrumento_origen) where id_instrumento_origen is not null;
create index instnorm_unidad_idx on core.instrumento_normativo (id_unidad) where id_unidad is not null;
create index instnorm_publico_idx on core.instrumento_normativo (publicado, activo);

create table core.documento_instrumento (
  id                 uuid primary key default gen_random_uuid(),
  id_instrumento     text not null references core.instrumento_normativo(id),
  rol                text not null default 'principal' check (rol in ('principal','complemento')),
  version            integer not null check (version >= 1),
  vigente            boolean not null default true,
  ruta               text not null unique
                     constraint docinst_ruta_formato check (ruta ~ '^instrumentos/DOC-[EFMN][0-9]{3}/DOC-[EFMN][0-9]{3}_[vc][0-9]{2}_[0-9a-f]{16}\.pdf$'),
  hash_archivo       char(64) not null check (hash_archivo ~ '^[0-9a-f]{64}$'),
  bytes              bigint not null check (bytes >= 1),
  paginas            integer check (paginas is null or paginas >= 1),
  texto_seleccionable boolean,
  id_usuario         uuid references auth.users(id),
  creado_en          timestamptz not null default now(),
  unique (id_instrumento, rol, version),
  -- el nombre del archivo repite la clave, el rol, la version y la huella: nada puede contradecirse
  constraint docinst_ruta_coincide check (
    ruta = 'instrumentos/' || id_instrumento || '/' || id_instrumento || '_' ||
           case rol when 'principal' then 'v' else 'c' end || lpad(version::text, 2, '0') || '_' || substr(hash_archivo, 1, 16) || '.pdf')
);
create unique index docinst_una_vigente on core.documento_instrumento (id_instrumento, rol) where vigente;
create unique index docinst_hash_por_instrumento on core.documento_instrumento (id_instrumento, hash_archivo);

create table core.relacion_normativa (
  id                  text primary key,
  id_origen           text not null references core.instrumento_normativo(id),
  id_destino          text not null references core.instrumento_normativo(id),
  tipo_relacion       text not null default 'concordancia' check (tipo_relacion in ('concordancia','fundamento','derivacion','complemento')),
  descripcion         text,
  estatus             text not null default 'por_validar' check (estatus in ('por_validar','validada')),
  activo              boolean not null default true,
  constraint relnorm_distintos check (id_origen <> id_destino),
  constraint relnorm_id_coincide check (id = id_origen || '>' || id_destino)
);
create index relnorm_destino_idx on core.relacion_normativa (id_destino);

-- dictamen: el dictamen de una ficha normativa se guarda donde ya se guardan los demas
alter table core.dictamen drop constraint dictamen_objeto_tipo_check;
alter table core.dictamen add constraint dictamen_objeto_tipo_check
  check (objeto_tipo in ('medicion','capa','indicador','instrumento','instrumento_normativo'));

-- ---------------------------------------------------------------------------------------------
-- 2. Disparadores: publicado <-> estatus (misma funcion que instrumento_origen), candado D-16 y auditoria
--    "trg_instrumento_a_sincronizar" dispara ANTES que "trg_instnorm_publicar_*" (orden alfabetico).
-- ---------------------------------------------------------------------------------------------
create trigger trg_instrumento_a_sincronizar
  before insert or update on core.instrumento_normativo
  for each row execute function core.fn_instrumento_sincronizar();
create trigger trg_instnorm_publicar_ins
  before insert on core.instrumento_normativo
  for each row when (new.publicado) execute function core.exigir_titular('publicar instrumentos normativos');
create trigger trg_instnorm_publicar_upd
  before update on core.instrumento_normativo
  for each row when (new.publicado is distinct from old.publicado) execute function core.exigir_titular('publicar o despublicar instrumentos normativos');

create trigger trg_auditoria after insert or update or delete on core.instrumento_normativo
  for each row execute function core.fn_auditar_cambio('id', 'estatus', '');
create trigger trg_auditoria after insert or update or delete on core.documento_instrumento
  for each row execute function core.fn_auditar_cambio('id', '', '');
create trigger trg_auditoria after insert or update or delete on core.relacion_normativa
  for each row execute function core.fn_auditar_cambio('id', 'estatus', '');

-- ---------------------------------------------------------------------------------------------
-- 3. Acceso: nadie escribe directo; lectura por rol y lectura publica de lo publicado
-- ---------------------------------------------------------------------------------------------
alter table core.instrumento_normativo enable row level security;
alter table core.documento_instrumento enable row level security;
alter table core.relacion_normativa enable row level security;
revoke all on core.instrumento_normativo, core.documento_instrumento, core.relacion_normativa from public, anon, authenticated;
grant select on core.instrumento_normativo, core.relacion_normativa to authenticated;
grant select on core.documento_instrumento to authenticated;

-- Con cuenta: la administracion y el Auditor ven todo (borradores incluidos); el Capturista, solo lo publicado.
create policy instnorm_select_por_rol on core.instrumento_normativo for select to authenticated
  using (core.rol_actual() in ('administrador','administrador_titular','auditor')
         or (core.rol_actual() is not null and publicado and activo));
create policy docinst_select_por_rol on core.documento_instrumento for select to authenticated
  using (core.rol_actual() in ('administrador','administrador_titular','auditor')
         or (core.rol_actual() is not null and vigente
             and exists (select 1 from core.instrumento_normativo i where i.id = id_instrumento)));
create policy relnorm_select_por_rol on core.relacion_normativa for select to authenticated
  using (core.rol_actual() in ('administrador','administrador_titular','auditor')
         or (core.rol_actual() is not null and activo
             and exists (select 1 from core.instrumento_normativo i where i.id = id_origen)
             and exists (select 1 from core.instrumento_normativo i where i.id = id_destino)));

-- Sin cuenta (anon): solo lo publicado y activo. Los subselects heredan la RLS de anon, asi que
-- un documento o una relacion solo se ve si la ficha (o las dos fichas) tambien se ve.
grant usage on schema core to anon;
grant select on core.instrumento_normativo to anon;
create policy instnorm_select_publico on core.instrumento_normativo for select to anon
  using (publicado and activo);
grant select (id, id_instrumento, rol, version, vigente, ruta, hash_archivo, bytes, paginas, texto_seleccionable, creado_en)
  on core.documento_instrumento to anon;
create policy docinst_select_publico on core.documento_instrumento for select to anon
  using (vigente and exists (select 1 from core.instrumento_normativo i where i.id = id_instrumento));
grant select on core.relacion_normativa to anon;
create policy relnorm_select_publico on core.relacion_normativa for select to anon
  using (activo
         and exists (select 1 from core.instrumento_normativo i where i.id = id_origen)
         and exists (select 1 from core.instrumento_normativo i where i.id = id_destino));

-- ---------------------------------------------------------------------------------------------
-- 4. Vistas de la API (security_invoker: la RLS de arriba decide que ve cada quien)
-- ---------------------------------------------------------------------------------------------
-- Ficha + datos de su PDF principal vigente. `clave` es el mismo id (una sola clave por instrumento).
create or replace view api.instrumento_normativo with (security_invoker = true) as
select n.*,
       n.id as clave,
       case n.escala when 'E' then 'Estatal' when 'F' then 'Federal' else 'Municipal' end as ambito,
       d.ruta          as pdf_ruta,
       d.version       as pdf_version,
       d.hash_archivo  as pdf_hash,
       d.bytes         as pdf_bytes,
       d.paginas       as pdf_paginas,
       d.texto_seleccionable as pdf_texto_seleccionable
  from core.instrumento_normativo n
  left join core.documento_instrumento d on d.id_instrumento = n.id and d.rol = 'principal' and d.vigente;
comment on view api.instrumento_normativo is 'ER-6: catalogo de instrumentos normativos con su PDF principal vigente. Anon ve solo fichas publicadas (vigente_publico); la administracion y el Auditor, todas.';
revoke all on api.instrumento_normativo from public, anon, authenticated;
grant select on api.instrumento_normativo to anon, authenticated;

-- Documentos vigentes (principal y complemento) sin datos de personas: lo que consume la vista publica.
create or replace view api.documento_instrumento_publico with (security_invoker = true) as
select id, id_instrumento, rol, version, vigente, ruta, hash_archivo, bytes, paginas, texto_seleccionable, creado_en
  from core.documento_instrumento;
comment on view api.documento_instrumento_publico is 'ER-6: documentos de instrumentos normativos publicados, sin quien los subio.';
revoke all on api.documento_instrumento_publico from public, anon, authenticated;
grant select on api.documento_instrumento_publico to anon, authenticated;

-- Historial completo de versiones con autor: solo cuentas (la RLS limita a administracion y Auditor lo no vigente).
create or replace view api.documento_instrumento with (security_invoker = true) as
select id, id_instrumento, rol, version, vigente, ruta, hash_archivo, bytes, paginas, texto_seleccionable, id_usuario, creado_en
  from core.documento_instrumento;
comment on view api.documento_instrumento is 'ER-6: todas las versiones de los PDF de instrumentos normativos, con quien las registro.';
revoke all on api.documento_instrumento from public, anon, authenticated;
grant select on api.documento_instrumento to authenticated;

create or replace view api.relacion_normativa with (security_invoker = true) as
select * from core.relacion_normativa;
comment on view api.relacion_normativa is 'ER-6: relaciones entre instrumentos normativos. Anon ve las activas entre fichas publicadas (la UI debe mostrar su estatus: por_validar o validada).';
revoke all on api.relacion_normativa from public, anon, authenticated;
grant select on api.relacion_normativa to anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 5. Reglas de archivo (una sola fuente de verdad) y nombre canonico
-- ---------------------------------------------------------------------------------------------
create or replace function core.instrumento_max_bytes() returns bigint language sql immutable as $$ select 209715200::bigint $$;
comment on function core.instrumento_max_bytes() is 'ER-6: tamano maximo por PDF de instrumento normativo (200 MB).';

-- Nombre canonico del objeto dentro del bucket (sin el prefijo del bucket).
create or replace function core.nombre_documento_instrumento(p_clave text, p_rol text, p_version int, p_hash text) returns text
language sql immutable as $$
  select p_clave || '/' || p_clave || '_' || case p_rol when 'principal' then 'v' else 'c' end
         || lpad(p_version::text, 2, '0') || '_' || substr(p_hash, 1, 16) || '.pdf'
$$;
comment on function core.nombre_documento_instrumento(text, text, int, text) is 'ER-6: <clave>/<clave>_<v|c><NN>_<sha16>.pdf, el unico nombre admitido en el bucket instrumentos.';

-- La politica de subida: nombre canonico, ficha en borrador y activa, version = la siguiente, y perfil administrativo.
create or replace function core.nombre_instrumento_permitido(p_nombre text) returns boolean
language plpgsql stable security definer set search_path = core, public as $$
declare v_clave text; v_rol text; v_ver int; v_sig int;
begin
  if p_nombre !~ '^DOC-[EFMN][0-9]{3}/DOC-[EFMN][0-9]{3}_[vc][0-9]{2}_[0-9a-f]{16}\.pdf$' then return false; end if;
  if core.rol_actual() is null or core.rol_actual() not in ('administrador','administrador_titular') then return false; end if;
  v_clave := split_part(p_nombre, '/', 1);
  if substr(split_part(p_nombre, '/', 2), 1, 8) <> v_clave then return false; end if;
  v_rol := case substr(split_part(p_nombre, '/', 2), 10, 1) when 'v' then 'principal' else 'complemento' end;
  v_ver := substr(split_part(p_nombre, '/', 2), 11, 2)::int;
  if not exists (select 1 from core.instrumento_normativo where id = v_clave and estatus = 'borrador' and activo) then return false; end if;
  select coalesce(max(version), 0) + 1 into v_sig from core.documento_instrumento where id_instrumento = v_clave and rol = v_rol;
  return v_ver = v_sig;
end $$;
revoke all on function core.nombre_instrumento_permitido(text) from public, anon;
grant execute on function core.nombre_instrumento_permitido(text) to authenticated;
comment on function core.nombre_instrumento_permitido(text) is 'ER-6: true solo si el nombre del PDF es canonico (clave, rol, version siguiente, sha16), la ficha esta en borrador y quien sube es Administrador o Titular.';

-- ---------------------------------------------------------------------------------------------
-- 6. Bucket publico (solo si existe Supabase Storage; en un Postgres solo se omite)
-- ---------------------------------------------------------------------------------------------
do $$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise notice 'No hay esquema storage: se omite el bucket instrumentos (en Supabase se crea aqui).';
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('instrumentos', 'instrumentos', true, core.instrumento_max_bytes(), array['application/pdf'])
  on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

  execute 'drop policy if exists instrumentos_leer on storage.objects';
  execute 'drop policy if exists instrumentos_subir on storage.objects';
  -- Publico: cualquiera con el enlace descarga el PDF (los documentos son oficiales y el nombre lleva una huella que no se adivina).
  -- Esta politica solo permite LISTAR a la administracion y al Auditor; anon no lista el bucket.
  execute $p$create policy instrumentos_leer on storage.objects for select to authenticated
    using (bucket_id = 'instrumentos' and core.rol_actual() in ('administrador','administrador_titular','auditor'))$p$;
  execute $p$create policy instrumentos_subir on storage.objects for insert to authenticated
    with check (bucket_id = 'instrumentos' and core.nombre_instrumento_permitido(name))$p$;
  -- Sin politicas de UPDATE ni DELETE: nadie sobrescribe ni borra un PDF desde la API.
end $$;

-- ---------------------------------------------------------------------------------------------
-- 7. Funciones api.* de escritura
-- ---------------------------------------------------------------------------------------------
create or replace function api.fn_guardar_instrumento_normativo(p_datos jsonb) returns jsonb
language plpgsql security definer set search_path = core, public as $$
declare v_id text; v_ant core.instrumento_normativo; v_r core.instrumento_normativo; v_fila core.instrumento_normativo;
        v_existe boolean; v_letra text; v_datos jsonb;
begin
  perform core.exigir_rol(array['administrador','administrador_titular'], 'guardar instrumentos normativos');
  perform core.exigir_claves(p_datos, array['id','nombre','nombre_oficial','tipo','escala','subtipo','nivel_piramide','seccion_banco',
    'dependencia','fuente','fecha_publicacion','ultima_actualizacion','estatus_verificacion','estatus_documental','descripcion',
    'articulos','uso_sesim','evidencia','vinculacion','observaciones','enlaces','url_oficial','cobertura_geografica','id_unidad',
    'id_instrumento_origen','limitaciones','cobertura_temporal','variables','emisor','instrumento_publicacion','aprobacion',
    'publicacion','ultima_reforma','articulos_verificados','fuentes_verificacion','fecha_verificacion'], 'instrumento normativo');
  v_id := nullif(btrim(p_datos ->> 'id'), '');
  if v_id is not null then
    select * into v_ant from core.instrumento_normativo where id = v_id;
    v_existe := found;
  else
    v_existe := false;
  end if;

  if not v_existe then
    v_datos := p_datos;
    if v_id is null then
      -- clave nueva: la letra la da el tipo (N = NOM) o la escala (E, F, M); el numero es el siguiente de esa letra
      v_letra := case when p_datos ->> 'tipo' = 'Norma Oficial Mexicana' then 'N' else p_datos ->> 'escala' end;
      if v_letra is null or v_letra not in ('E','F','M','N') then
        raise exception 'Para asignar la clave indica la escala (E, F o M) y el tipo.' using errcode = '22023';
      end if;
      perform pg_advisory_xact_lock(hashtext('instrumento_normativo.id'));
      select 'DOC-' || v_letra || lpad((coalesce(max(substr(id, 6)::int), 0) + 1)::text, 3, '0') into v_id
        from core.instrumento_normativo where id like 'DOC-' || v_letra || '%';
    end if;
    v_r := jsonb_populate_record(null::core.instrumento_normativo, v_datos || jsonb_build_object('id', v_id));
    insert into core.instrumento_normativo (id, nombre, nombre_oficial, tipo, escala, subtipo, nivel_piramide, seccion_banco, dependencia,
        fuente, fecha_publicacion, ultima_actualizacion, estatus_verificacion, estatus_documental, descripcion, articulos, uso_sesim,
        evidencia, vinculacion, observaciones, enlaces, url_oficial, cobertura_geografica, id_unidad, id_instrumento_origen, limitaciones,
        cobertura_temporal, variables, emisor, instrumento_publicacion, aprobacion, publicacion, ultima_reforma, articulos_verificados,
        fuentes_verificacion, fecha_verificacion, estatus, publicado, activo)
    values (v_r.id, v_r.nombre, v_r.nombre_oficial, v_r.tipo, v_r.escala, v_r.subtipo, v_r.nivel_piramide, v_r.seccion_banco, v_r.dependencia,
        v_r.fuente, v_r.fecha_publicacion, v_r.ultima_actualizacion, coalesce(v_r.estatus_verificacion, 'por_validar'), v_r.estatus_documental,
        v_r.descripcion, v_r.articulos, v_r.uso_sesim, v_r.evidencia, v_r.vinculacion, v_r.observaciones,
        coalesce(v_r.enlaces, '[]'::jsonb), v_r.url_oficial, v_r.cobertura_geografica, v_r.id_unidad, v_r.id_instrumento_origen, v_r.limitaciones,
        v_r.cobertura_temporal, v_r.variables, v_r.emisor, v_r.instrumento_publicacion, v_r.aprobacion, v_r.publicacion, v_r.ultima_reforma,
        coalesce(v_r.articulos_verificados, '[]'::jsonb), coalesce(v_r.fuentes_verificacion, '[]'::jsonb), v_r.fecha_verificacion,
        'borrador', false, true)
    returning * into v_fila;
  else
    if v_ant.estatus <> 'borrador' then
      raise exception 'El instrumento % esta en "%": para editarlo, el Titular debe devolverlo a borrador (rechazar con comentario).',
        v_id, v_ant.estatus using errcode = '55000';
    end if;
    if not v_ant.activo then
      raise exception 'El instrumento % esta dado de baja.', v_id using errcode = '55000';
    end if;
    v_r := jsonb_populate_record(null::core.instrumento_normativo, to_jsonb(v_ant) || p_datos);
    update core.instrumento_normativo set nombre = v_r.nombre, nombre_oficial = v_r.nombre_oficial, tipo = v_r.tipo, escala = v_r.escala,
        subtipo = v_r.subtipo, nivel_piramide = v_r.nivel_piramide, seccion_banco = v_r.seccion_banco, dependencia = v_r.dependencia,
        fuente = v_r.fuente, fecha_publicacion = v_r.fecha_publicacion, ultima_actualizacion = v_r.ultima_actualizacion,
        estatus_verificacion = v_r.estatus_verificacion, estatus_documental = v_r.estatus_documental, descripcion = v_r.descripcion,
        articulos = v_r.articulos, uso_sesim = v_r.uso_sesim, evidencia = v_r.evidencia, vinculacion = v_r.vinculacion,
        observaciones = v_r.observaciones, enlaces = v_r.enlaces, url_oficial = v_r.url_oficial,
        cobertura_geografica = v_r.cobertura_geografica, id_unidad = v_r.id_unidad, id_instrumento_origen = v_r.id_instrumento_origen,
        limitaciones = v_r.limitaciones, cobertura_temporal = v_r.cobertura_temporal, variables = v_r.variables, emisor = v_r.emisor,
        instrumento_publicacion = v_r.instrumento_publicacion, aprobacion = v_r.aprobacion, publicacion = v_r.publicacion,
        ultima_reforma = v_r.ultima_reforma, articulos_verificados = v_r.articulos_verificados,
        fuentes_verificacion = v_r.fuentes_verificacion, fecha_verificacion = v_r.fecha_verificacion
     where id = v_id returning * into v_fila;
  end if;
  return to_jsonb(v_fila);
end $$;

-- Registra la version siguiente del PDF (principal o complemento) de una ficha en borrador. El archivo ya debe estar en
-- el bucket con el nombre canonico: el servidor comprueba que exista y que su tamano coincida con lo declarado.
create or replace function api.fn_registrar_documento_instrumento(
  p_id_instrumento text, p_rol text, p_hash text, p_bytes bigint, p_paginas int default null, p_texto_seleccionable boolean default null)
returns jsonb
language plpgsql security definer set search_path = core, public as $$
declare v_i core.instrumento_normativo; v_ver int; v_nombre text; v_ant uuid; v_fila core.documento_instrumento; v_n int; v_meta jsonb;
begin
  perform core.exigir_rol(array['administrador','administrador_titular'], 'registrar el PDF de un instrumento normativo');
  select * into v_i from core.instrumento_normativo where id = p_id_instrumento for update;
  if not found then raise exception 'El instrumento % no existe.', p_id_instrumento using errcode = 'P0002'; end if;
  if not v_i.activo then raise exception 'El instrumento % esta dado de baja.', p_id_instrumento using errcode = '55000'; end if;
  if v_i.estatus <> 'borrador' then
    raise exception 'El instrumento % esta en "%": para cambiar su PDF, el Titular debe devolverlo a borrador (rechazar con comentario).',
      p_id_instrumento, v_i.estatus using errcode = '55000';
  end if;
  if p_rol is null or p_rol not in ('principal','complemento') then
    raise exception 'El rol del documento debe ser principal o complemento.' using errcode = '22023';
  end if;
  if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'La huella debe ser un SHA-256 en hexadecimal minuscula (64 caracteres).' using errcode = '22023';
  end if;
  if p_bytes is null or p_bytes < 1 or p_bytes > core.instrumento_max_bytes() then
    raise exception 'El PDF debe pesar entre 1 byte y 200 MB.' using errcode = '22023';
  end if;
  if p_paginas is not null and p_paginas < 1 then
    raise exception 'El numero de paginas debe ser 1 o mas.' using errcode = '22023';
  end if;
  if exists (select 1 from core.documento_instrumento where id_instrumento = p_id_instrumento and hash_archivo = p_hash) then
    raise exception 'Ese archivo ya esta registrado en el instrumento % (huella duplicada).', p_id_instrumento using errcode = '23505';
  end if;

  select coalesce(max(version), 0) + 1 into v_ver from core.documento_instrumento where id_instrumento = p_id_instrumento and rol = p_rol;
  v_nombre := core.nombre_documento_instrumento(p_id_instrumento, p_rol, v_ver, p_hash);

  if to_regclass('storage.objects') is not null then
    execute 'select count(*), max(metadata::text)::jsonb from storage.objects where bucket_id = ''instrumentos'' and name = $1' into v_n, v_meta using v_nombre;
    if v_n = 0 then
      raise exception 'El archivo no esta en el almacenamiento: subelo a instrumentos/% antes de registrarlo.', v_nombre using errcode = 'P0002';
    end if;
    if v_meta ? 'size' and (v_meta ->> 'size')::bigint <> p_bytes then
      raise exception 'El tamano del archivo subido (% bytes) no coincide con el declarado (%).', v_meta ->> 'size', p_bytes using errcode = '22023';
    end if;
  end if;

  select id into v_ant from core.documento_instrumento where id_instrumento = p_id_instrumento and rol = p_rol and vigente for update;
  if v_ant is not null then update core.documento_instrumento set vigente = false where id = v_ant; end if;
  insert into core.documento_instrumento (id_instrumento, rol, version, vigente, ruta, hash_archivo, bytes, paginas, texto_seleccionable, id_usuario)
    values (p_id_instrumento, p_rol, v_ver, true, 'instrumentos/' || v_nombre, p_hash, p_bytes, p_paginas, p_texto_seleccionable, auth.uid())
    returning * into v_fila;
  return to_jsonb(v_fila) || jsonb_build_object('reemplazo_a', v_ant);
end $$;

-- CARGA INICIAL de PDF (la hace el servidor con la llave de servicio, nunca una persona con sesion): registra la version
-- siguiente aunque la ficha ya este publicada, porque las 35 fichas sembradas nacieron publicas sin archivo. Exige las mismas
-- reglas de archivo (huella, tamano, nombre canonico, el archivo ya en el bucket) y se niega si hay una sesion de usuario.
create or replace function core.registrar_documento_carga_inicial(
  p_id_instrumento text, p_rol text, p_hash text, p_bytes bigint, p_paginas int default null, p_texto_seleccionable boolean default null)
returns jsonb
language plpgsql security definer set search_path = core, public as $$
declare v_i core.instrumento_normativo; v_ver int; v_nombre text; v_ant uuid; v_fila core.documento_instrumento; v_n int; v_meta jsonb;
begin
  if auth.uid() is not null then
    raise exception 'La carga inicial de PDF solo la hace el servidor (sin sesion de usuario); las personas usan api.fn_registrar_documento_instrumento.' using errcode = '42501';
  end if;
  select * into v_i from core.instrumento_normativo where id = p_id_instrumento for update;
  if not found then raise exception 'El instrumento % no existe.', p_id_instrumento using errcode = 'P0002'; end if;
  if p_rol is null or p_rol not in ('principal','complemento') then
    raise exception 'El rol del documento debe ser principal o complemento.' using errcode = '22023';
  end if;
  if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'La huella debe ser un SHA-256 en hexadecimal minuscula (64 caracteres).' using errcode = '22023';
  end if;
  if p_bytes is null or p_bytes < 1 or p_bytes > core.instrumento_max_bytes() then
    raise exception 'El PDF debe pesar entre 1 byte y 200 MB.' using errcode = '22023';
  end if;
  if exists (select 1 from core.documento_instrumento where id_instrumento = p_id_instrumento and hash_archivo = p_hash) then
    raise exception 'Ese archivo ya esta registrado en el instrumento % (huella duplicada).', p_id_instrumento using errcode = '23505';
  end if;
  select coalesce(max(version), 0) + 1 into v_ver from core.documento_instrumento where id_instrumento = p_id_instrumento and rol = p_rol;
  v_nombre := core.nombre_documento_instrumento(p_id_instrumento, p_rol, v_ver, p_hash);
  if to_regclass('storage.objects') is not null then
    execute 'select count(*), max(metadata::text)::jsonb from storage.objects where bucket_id = ''instrumentos'' and name = $1' into v_n, v_meta using v_nombre;
    if v_n = 0 then
      raise exception 'El archivo no esta en el almacenamiento: subelo a instrumentos/% antes de registrarlo.', v_nombre using errcode = 'P0002';
    end if;
    if v_meta ? 'size' and (v_meta ->> 'size')::bigint <> p_bytes then
      raise exception 'El tamano del archivo subido (% bytes) no coincide con el declarado (%).', v_meta ->> 'size', p_bytes using errcode = '22023';
    end if;
  end if;
  select id into v_ant from core.documento_instrumento where id_instrumento = p_id_instrumento and rol = p_rol and vigente for update;
  if v_ant is not null then update core.documento_instrumento set vigente = false where id = v_ant; end if;
  insert into core.documento_instrumento (id_instrumento, rol, version, vigente, ruta, hash_archivo, bytes, paginas, texto_seleccionable, id_usuario)
    values (p_id_instrumento, p_rol, v_ver, true, 'instrumentos/' || v_nombre, p_hash, p_bytes, p_paginas, p_texto_seleccionable, null)
    returning * into v_fila;
  return to_jsonb(v_fila) || jsonb_build_object('reemplazo_a', v_ant);
end $$;
revoke all on function core.registrar_documento_carga_inicial(text, text, text, bigint, int, boolean) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function core.registrar_documento_carga_inicial(text, text, text, bigint, int, boolean) to service_role;
  end if;
end $$;
comment on function core.registrar_documento_carga_inicial(text, text, text, bigint, int, boolean) is 'ER-6: carga inicial de PDF hecha por el servidor (llave de servicio). Se niega con sesion de usuario; mismas reglas de archivo que api.fn_registrar_documento_instrumento.';

create or replace function api.fn_enviar_instrumento_normativo_revision(p_id text) returns jsonb
language plpgsql security definer set search_path = core, public as $$
declare v_i core.instrumento_normativo; v_fila core.instrumento_normativo;
begin
  perform core.exigir_rol(array['administrador','administrador_titular'], 'enviar instrumentos normativos a revision');
  select * into v_i from core.instrumento_normativo where id = p_id for update;
  if not found then raise exception 'El instrumento % no existe.', p_id using errcode = 'P0002'; end if;
  if v_i.estatus <> 'borrador' then
    raise exception 'El instrumento % ya esta en "%"; solo se envia a revision desde borrador.', p_id, v_i.estatus using errcode = '55000';
  end if;
  if not v_i.activo then raise exception 'El instrumento % esta dado de baja.', p_id using errcode = '55000'; end if;
  if not exists (select 1 from core.documento_instrumento where id_instrumento = p_id and rol = 'principal' and vigente) then
    raise exception 'El instrumento % no tiene PDF principal; adjuntalo antes de enviarlo a revision.', p_id using errcode = '23514';
  end if;
  update core.instrumento_normativo set estatus = 'revision' where id = p_id returning * into v_fila;
  return to_jsonb(v_fila);
end $$;

create or replace function api.fn_dictaminar_instrumento_normativo(p_id text, p_decision text, p_comentario text default null) returns jsonb
language plpgsql security definer set search_path = core, public as $$
declare v_i core.instrumento_normativo; v_nuevo text; v_envio uuid; v_fila core.instrumento_normativo;
begin
  perform core.exigir_rol(array['administrador_titular'], 'dictaminar instrumentos normativos (D-16: solo el Administrador Titular)');
  if p_decision not in ('validar','publicar','rechazar') then
    raise exception 'Decision no valida: "%". Usa validar, publicar o rechazar.', p_decision using errcode = '22023';
  end if;
  select * into v_i from core.instrumento_normativo where id = p_id for update;
  if not found then raise exception 'El instrumento % no existe.', p_id using errcode = 'P0002'; end if;

  if p_decision = 'rechazar' then
    if v_i.estatus not in ('revision','vigente_admin','vigente_publico') then
      raise exception 'El instrumento % esta en "%": no hay nada que rechazar.', p_id, v_i.estatus using errcode = '55000';
    end if;
    if btrim(coalesce(p_comentario, '')) = '' then
      raise exception 'Rechazar exige un comentario con el motivo.' using errcode = '23514';
    end if;
    v_nuevo := 'borrador';
  else
    if p_decision = 'validar' and v_i.estatus <> 'revision' then
      raise exception 'El instrumento % esta en "%": solo se valida desde revision.', p_id, v_i.estatus using errcode = '55000';
    end if;
    if p_decision = 'publicar' and v_i.estatus <> 'vigente_admin' then
      raise exception 'El instrumento % esta en "%": solo se publica uno ya validado (vigente_admin).', p_id, v_i.estatus using errcode = '55000';
    end if;
    if not v_i.activo then raise exception 'El instrumento % esta dado de baja.', p_id using errcode = '55000'; end if;
    v_envio := core.quien_envio('instrumento_normativo', p_id);
    if v_envio is not null and v_envio = auth.uid() then
      raise exception 'Cuatro ojos: quien envio el instrumento % a revision no puede % tambien.', p_id,
        case p_decision when 'validar' then 'validarlo' else 'publicarlo' end using errcode = '42501';
    end if;
    if not exists (select 1 from core.documento_instrumento where id_instrumento = p_id and rol = 'principal' and vigente) then
      raise exception 'El instrumento % no tiene PDF principal.', p_id using errcode = '23514';
    end if;
    v_nuevo := case p_decision when 'validar' then 'vigente_admin' else 'vigente_publico' end;
  end if;

  insert into core.dictamen (objeto_tipo, objeto_id, decision, estado_previo, estado_nuevo, comentario, id_usuario)
    values ('instrumento_normativo', p_id, p_decision, v_i.estatus, v_nuevo, nullif(btrim(p_comentario), ''), auth.uid());
  update core.instrumento_normativo set estatus = v_nuevo where id = p_id returning * into v_fila;
  return to_jsonb(v_fila);
end $$;

create or replace function api.fn_baja_instrumento_normativo(p_id text, p_activo boolean default false) returns jsonb
language plpgsql security definer set search_path = core, public as $$
declare v_i core.instrumento_normativo; v_fila core.instrumento_normativo;
begin
  perform core.exigir_rol(array['administrador_titular'], 'dar de baja instrumentos normativos (solo el Administrador Titular)');
  select * into v_i from core.instrumento_normativo where id = p_id for update;
  if not found then raise exception 'El instrumento % no existe.', p_id using errcode = 'P0002'; end if;
  if not p_activo and v_i.estatus = 'vigente_publico' then
    raise exception 'El instrumento % esta publicado: el Titular debe retirarlo del publico (rechazar) antes de la baja.', p_id using errcode = '55000';
  end if;
  update core.instrumento_normativo set activo = p_activo where id = p_id returning * into v_fila;
  return to_jsonb(v_fila);
end $$;

-- Relaciones entre fichas: el Administrador propone (por_validar); validarlas es del Titular.
create or replace function api.fn_guardar_relacion_normativa(p_datos jsonb) returns jsonb
language plpgsql security definer set search_path = core, public as $$
declare v_o text; v_d text; v_id text; v_ant core.relacion_normativa; v_fila core.relacion_normativa; v_tipo text; v_desc text;
begin
  perform core.exigir_rol(array['administrador','administrador_titular'], 'proponer relaciones entre instrumentos normativos');
  perform core.exigir_claves(p_datos, array['id_origen','id_destino','tipo_relacion','descripcion'], 'relacion normativa');
  v_o := nullif(btrim(p_datos ->> 'id_origen'), ''); v_d := nullif(btrim(p_datos ->> 'id_destino'), '');
  if v_o is null or v_d is null then raise exception 'Indica el instrumento de origen y el de destino.' using errcode = '22023'; end if;
  v_id := v_o || '>' || v_d;
  v_tipo := coalesce(nullif(btrim(p_datos ->> 'tipo_relacion'), ''), 'concordancia');
  v_desc := nullif(btrim(p_datos ->> 'descripcion'), '');
  select * into v_ant from core.relacion_normativa where id = v_id for update;
  if not found then
    insert into core.relacion_normativa (id, id_origen, id_destino, tipo_relacion, descripcion, estatus, activo)
      values (v_id, v_o, v_d, v_tipo, v_desc, 'por_validar', true) returning * into v_fila;
  else
    -- editar una relacion la vuelve a dejar por validar (lo validado ya no es lo mismo)
    update core.relacion_normativa set tipo_relacion = v_tipo, descripcion = v_desc, estatus = 'por_validar', activo = true
     where id = v_id returning * into v_fila;
  end if;
  return to_jsonb(v_fila);
end $$;

create or replace function api.fn_validar_relacion_normativa(p_id text, p_estatus text default 'validada') returns jsonb
language plpgsql security definer set search_path = core, public as $$
declare v_fila core.relacion_normativa;
begin
  perform core.exigir_rol(array['administrador_titular'], 'validar relaciones entre instrumentos normativos (solo el Administrador Titular)');
  if p_estatus not in ('validada','por_validar') then
    raise exception 'Estatus no valido: "%". Usa validada o por_validar.', p_estatus using errcode = '22023';
  end if;
  update core.relacion_normativa set estatus = p_estatus where id = p_id returning * into v_fila;
  if not found then raise exception 'La relacion % no existe.', p_id using errcode = 'P0002'; end if;
  return to_jsonb(v_fila);
end $$;

create or replace function api.fn_baja_relacion_normativa(p_id text, p_activo boolean default false) returns jsonb
language plpgsql security definer set search_path = core, public as $$
declare v_fila core.relacion_normativa;
begin
  perform core.exigir_rol(array['administrador','administrador_titular'], 'dar de baja relaciones entre instrumentos normativos');
  update core.relacion_normativa set activo = p_activo where id = p_id returning * into v_fila;
  if not found then raise exception 'La relacion % no existe.', p_id using errcode = 'P0002'; end if;
  return to_jsonb(v_fila);
end $$;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as firma from pg_proc p where p.pronamespace = 'api'::regnamespace
            and p.proname in ('fn_guardar_instrumento_normativo','fn_registrar_documento_instrumento','fn_enviar_instrumento_normativo_revision',
              'fn_dictaminar_instrumento_normativo','fn_baja_instrumento_normativo','fn_guardar_relacion_normativa',
              'fn_validar_relacion_normativa','fn_baja_relacion_normativa')
  loop
    execute format('revoke all on function %s from public, anon', f.firma);
    execute format('grant execute on function %s to authenticated', f.firma);
  end loop;
end $$;

-- ---------------------------------------------------------------------------------------------
-- 8. Documentacion (alimenta api.diccionario y core.verificar_integridad)
-- ---------------------------------------------------------------------------------------------
comment on table core.instrumento_normativo is 'ER-6: ficha de cada instrumento normativo del catalogo (ley, NOM, programa, PIMUS...). La clave es el id (DOC-E001...). Ciclo de vida D-20; solo se muestra al publico lo publicado.';
comment on table core.documento_instrumento is 'ER-6: PDF de una ficha normativa, por version. El nombre del archivo repite clave, version y huella. Se conservan todas las versiones; nunca se borra.';
comment on table core.relacion_normativa is 'ER-6: relacion entre dos fichas normativas (origen > destino). Nace por_validar; la valida el Administrador Titular.';

do $$
declare r record;
begin
  for r in select * from (values
    ('instrumento_normativo','id','Clave unica del instrumento: DOC- + letra (E estatal, F federal, M municipal, N Norma Oficial Mexicana) + 3 digitos. Es tambien el prefijo de su PDF.'),
    ('instrumento_normativo','nombre','Nombre corto con que se muestra el instrumento.'),
    ('instrumento_normativo','nombre_oficial','Titulo oficial completo, tal como aparece en el documento.'),
    ('instrumento_normativo','tipo','Tipo de instrumento: Ley, Reglamento, Norma Oficial Mexicana, Programa, Plan, Estrategia, Constitucion...'),
    ('instrumento_normativo','escala','Escala del instrumento: E estatal, F federal, M municipal.'),
    ('instrumento_normativo','subtipo','Precision del tipo (por ejemplo, ordenamiento estatal principal).'),
    ('instrumento_normativo','nivel_piramide','Nivel en la piramide normativa, de 1 (mas alto) a 6.'),
    ('instrumento_normativo','seccion_banco','Seccion del banco de instrumentos donde se ubica la ficha.'),
    ('instrumento_normativo','dependencia','Dependencia responsable, cuando aplica.'),
    ('instrumento_normativo','fuente','Fuente de consulta de la ficha, cuando aplica.'),
    ('instrumento_normativo','fecha_publicacion','Fecha de publicacion original del instrumento.'),
    ('instrumento_normativo','ultima_actualizacion','Fecha de la ultima reforma o actualizacion conocida.'),
    ('instrumento_normativo','estatus_verificacion','Estado de la verificacion documental: vigente_verificado, referencia_federal, por_validar o pendiente_integracion. No es el ciclo de publicacion (ver estatus).'),
    ('instrumento_normativo','estatus_documental','Etiqueta libre de la situacion del documento (por ejemplo, PDF directo identificado).'),
    ('instrumento_normativo','descripcion','Resumen de que regula el instrumento.'),
    ('instrumento_normativo','articulos','Articulos o apartados relevantes para SESIM.'),
    ('instrumento_normativo','uso_sesim','Para que se usa el instrumento dentro de SESIM.'),
    ('instrumento_normativo','evidencia','Evidencia documental asociada, cuando existe.'),
    ('instrumento_normativo','vinculacion','Vinculacion con otros elementos del sistema, cuando existe.'),
    ('instrumento_normativo','observaciones','Notas de revision documental.'),
    ('instrumento_normativo','enlaces','Lista JSON de enlaces de consulta: [{titulo, url}].'),
    ('instrumento_normativo','url_oficial','Enlace a la fuente oficial del documento.'),
    ('instrumento_normativo','cobertura_geografica','Territorio que cubre el instrumento.'),
    ('instrumento_normativo','id_unidad','Unidad territorial (municipio) que cubre, cuando es municipal.'),
    ('instrumento_normativo','id_instrumento_origen','Instrumento de origen (EEMSV o PIMUS) con el que esta ficha concuerda, cuando existe. A lo mas una ficha por instrumento de origen.'),
    ('instrumento_normativo','limitaciones','Limitaciones conocidas del instrumento.'),
    ('instrumento_normativo','cobertura_temporal','Periodo que cubre el instrumento.'),
    ('instrumento_normativo','variables','Variables o temas que aborda.'),
    ('instrumento_normativo','emisor','Autoridad que emitio el instrumento.'),
    ('instrumento_normativo','instrumento_publicacion','Instrumento juridico con que se publico (decreto, acuerdo).'),
    ('instrumento_normativo','aprobacion','Sesion o acto de aprobacion, cuando aplica.'),
    ('instrumento_normativo','publicacion','Datos de la publicacion original (JSON: medio, fecha, numero, instrumento).'),
    ('instrumento_normativo','ultima_reforma','Datos de la ultima reforma (JSON: medio, fecha, numero, instrumento).'),
    ('instrumento_normativo','articulos_verificados','Lista JSON de articulos verificados contra el texto oficial.'),
    ('instrumento_normativo','fuentes_verificacion','Lista JSON de enlaces usados para verificar.'),
    ('instrumento_normativo','fecha_verificacion','Fecha en que se verifico la ficha.'),
    ('instrumento_normativo','estatus','Etapa de publicacion (D-20): borrador | revision | vigente_admin | vigente_publico. Solo el Titular valida y publica (D-16); quien envio a revision no dictamina.'),
    ('instrumento_normativo','publicado','Derivado: true solo si estatus = vigente_publico. Lo mantiene un disparador; es lo que ve el publico.'),
    ('instrumento_normativo','publicado_en','Fecha y hora en que se publico por ultima vez.'),
    ('instrumento_normativo','activo','false = dado de baja (logica; no se borra).'),
    ('documento_instrumento','id','Identificador del registro del documento.'),
    ('documento_instrumento','id_instrumento','Ficha a la que pertenece el PDF (su clave DOC-xxxx).'),
    ('documento_instrumento','rol','principal (el texto del instrumento) o complemento (por ejemplo, un resumen ejecutivo).'),
    ('documento_instrumento','version','Version del documento dentro de su ficha y rol: 1, 2, 3...'),
    ('documento_instrumento','vigente','true en la version que se muestra hoy (una por ficha y rol); las anteriores se conservan.'),
    ('documento_instrumento','ruta','Ruta del PDF en el almacenamiento: instrumentos/<clave>/<clave>_<v|c><NN>_<sha16>.pdf.'),
    ('documento_instrumento','hash_archivo','Huella SHA-256 del archivo, en hexadecimal minuscula.'),
    ('documento_instrumento','bytes','Tamano del archivo en bytes.'),
    ('documento_instrumento','paginas','Numero de paginas del PDF, cuando se conoce.'),
    ('documento_instrumento','texto_seleccionable','true si el PDF tiene texto seleccionable (no es solo imagen escaneada).'),
    ('documento_instrumento','id_usuario','Cuenta que registro el documento (no se muestra al publico).'),
    ('documento_instrumento','creado_en','Fecha y hora del registro.'),
    ('relacion_normativa','id','Identificador: <id_origen>><id_destino>.'),
    ('relacion_normativa','id_origen','Instrumento de origen de la relacion.'),
    ('relacion_normativa','id_destino','Instrumento de destino de la relacion.'),
    ('relacion_normativa','tipo_relacion','concordancia, fundamento, derivacion o complemento.'),
    ('relacion_normativa','descripcion','Explicacion de la relacion.'),
    ('relacion_normativa','estatus','por_validar o validada (la valida el Administrador Titular).'),
    ('relacion_normativa','activo','false = relacion dada de baja (logica).')
  ) as v(tabla, columna, texto)
  loop
    execute format('comment on column core.%I.%I is %L', r.tabla, r.columna, r.texto);
  end loop;
end $$;

comment on function api.fn_guardar_instrumento_normativo(jsonb) is 'ER-6 (D-20): alta (borrador, con clave DOC-xxxx automatica si no se manda) o edicion de una ficha normativa. Administrador y Titular; solo en borrador.';
comment on function api.fn_registrar_documento_instrumento(text, text, text, bigint, int, boolean) is 'ER-6: registra la version siguiente del PDF de una ficha en borrador. El archivo ya debe estar en el bucket instrumentos con el nombre canonico.';
comment on function api.fn_enviar_instrumento_normativo_revision(text) is 'ER-6 (D-20): borrador -> revision; exige el PDF principal.';
comment on function api.fn_dictaminar_instrumento_normativo(text, text, text) is 'ER-6 (D-20, D-16): solo el Titular valida, publica o rechaza; cuatro ojos; rechazar exige comentario.';
comment on function api.fn_baja_instrumento_normativo(text, boolean) is 'ER-6: baja o reactivacion logica de una ficha. Solo el Titular; no mientras este publicada.';
comment on function api.fn_guardar_relacion_normativa(jsonb) is 'ER-6: propone o edita una relacion entre fichas; queda por_validar.';
comment on function api.fn_validar_relacion_normativa(text, text) is 'ER-6: el Titular valida (o regresa a por_validar) una relacion.';
comment on function api.fn_baja_relacion_normativa(text, boolean) is 'ER-6: baja o reactivacion logica de una relacion.';

notify pgrst, 'reload schema';
