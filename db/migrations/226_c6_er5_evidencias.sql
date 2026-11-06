-- Ciclo 6 (1/1) -- ER-5: evidencia vigente y reemplazada; bucket privado `evidencias`; funciones de registro y verificacion.
-- Autorizado por Ismael el 29-oct-2026. Ver docs/ciclo-6-cambios-er.md.
--
-- Reglas decididas:
--   * Una sola evidencia VIGENTE por medicion. Si la medicion es rechazada, el capturista la REEMPLAZA: la anterior no se
--     borra (vigente = false) y su historia queda en core.bitacora_cambio (cero borrados fisicos).
--   * Archivos: solo PDF, JPG y PNG, maximo 10 MB, en un bucket privado de Supabase Storage.
--   * Quien puede subir y ver: igual que la medicion (la RLS de medicion_indicador decide).

-- ER-5. evidencia_medicion.vigente + una sola vigente por medicion
alter table core.evidencia_medicion add column vigente boolean not null default true;
create unique index evidencia_una_vigente_por_medicion on core.evidencia_medicion (id_medicion) where vigente;
comment on column core.evidencia_medicion.vigente is 'ER-5: true en la evidencia que respalda hoy a la medicion (una sola). Al reemplazarla pasa a false; nunca se borra.';
comment on table core.evidencia_medicion is 'Medio de verificacion de una medicion: archivo con huella SHA-256. Una sola vigente por medicion (ER-5); las reemplazadas se conservan. Se exige la vigente para validar (R12).';

-- La vista de la API debe incluir la columna nueva (usaba select *).
create or replace view api.evidencia_medicion as
  select id, id_medicion, id_usuario, url_archivo, tipo_documento, hash_archivo, fecha_subida, vigente from core.evidencia_medicion;
alter view api.evidencia_medicion set (security_invoker = true);
grant select on api.evidencia_medicion to authenticated;
revoke all on api.evidencia_medicion from anon, public;

-- R12 vigila solo la evidencia vigente
CREATE OR REPLACE FUNCTION core.verificar_integridad()
 RETURNS TABLE(chequeo text, ok boolean, detalle text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'core', 'public'
AS $function$
declare n int;
begin
  select count(*) into n from pg_class c join pg_namespace s on s.oid = c.relnamespace
   where s.nspname = 'core' and c.relkind = 'r' and obj_description(c.oid, 'pg_class') is null;
  chequeo := 'Toda tabla de core tiene comentario'; ok := n = 0; detalle := n || ' sin comentario'; return next;

  select count(*) into n from api.diccionario where descripcion is null;
  chequeo := 'Todo campo de core tiene descripcion'; ok := n = 0; detalle := n || ' campos sin descripcion'; return next;

  select count(*) into n from pg_class c join pg_namespace s on s.oid = c.relnamespace
   where s.nspname = 'core' and c.relkind = 'r' and not c.relrowsecurity;
  chequeo := 'RLS activo en toda tabla de core'; ok := n = 0; detalle := n || ' tablas sin RLS'; return next;

  select count(*) into n from core.indicador i
   where not exists (select 1 from core.indicador_instrumento x where x.id_indicador = i.id);
  chequeo := 'Todo indicador esta alineado a un instrumento'; ok := n = 0; detalle := n || ' sin instrumento'; return next;

  select count(*) into n from core.indicador i
   where (select count(*) from core.indicador_eje e where e.id_indicador = i.id and e.principal) <> 1
      or not exists (select 1 from core.indicador_eje e where e.id_indicador = i.id and e.id_eje = i.id_eje and e.principal);
  chequeo := 'Cada indicador tiene un solo eje principal y coincide con indicador.id_eje'; ok := n = 0; detalle := n || ' inconsistentes'; return next;

  select count(*) into n from core.indicador where estatus_aprobado and tendencia is null and valor_meta is null;
  chequeo := 'Ningun indicador aprobado viola la compuerta'; ok := n = 0; detalle := n || ' violaciones'; return next;

  select count(*) into n from core.unidad_territorial l
   where l.nivel = 'localidad' and (select m.cve_mun from core.unidad_territorial m where m.id = l.id_padre) <> l.cve_mun;
  chequeo := 'Cada localidad cuelga del municipio en que esta hoy'; ok := n = 0; detalle := n || ' desalineadas'; return next;

  select count(*) into n from core.medicion_indicador m join core.indicador i on i.id = m.id_indicador
   where not (i.estatus_aprobado and i.activo);
  chequeo := 'Ninguna medicion sobre indicador no aprobado'; ok := n = 0; detalle := n || ' mediciones'; return next;

  select count(*) into n from core.medicion_indicador m
   where m.estado in ('vigente_admin','vigente_publico')
     and not exists (select 1 from core.evidencia_medicion e where e.id_medicion = m.id and e.vigente);
  chequeo := 'Toda medicion vigente tiene una evidencia vigente (R12)'; ok := n = 0; detalle := n || ' sin evidencia'; return next;

  select count(*) into n from core.capa c where c.estatus = 'vigente_publico'
   and (btrim(coalesce(c.metadatos_extra->>'custodio','')) = '' or btrim(coalesce(c.metadatos_extra->>'linaje','')) = '');
  chequeo := 'Toda capa publica tiene custodio y linaje'; ok := n = 0; detalle := n || ' capas'; return next;
end $function$;

-- ---------------------------------------------------------------------------------------------
-- Reglas de archivo (una sola fuente de verdad)
-- ---------------------------------------------------------------------------------------------
create or replace function core.evidencia_max_bytes() returns bigint language sql immutable as $$ select 10485760::bigint $$;
comment on function core.evidencia_max_bytes() is 'Ciclo 6: tamano maximo por evidencia (10 MB).';

create or replace function core.evidencia_extension(p_mime text) returns text language sql immutable as
$$ select case p_mime when 'application/pdf' then 'pdf' when 'image/jpeg' then 'jpg' when 'image/png' then 'png' end $$;

-- Puede subir evidencia a esa medicion: su autor, con cuenta activa, mientras este en borrador o rechazada.
create or replace function core.puede_subir_evidencia(p_id_medicion uuid) returns boolean
language sql stable security definer set search_path = core, public as $$
  select core.rol_actual() in ('capturista','administrador','administrador_titular')
     and exists (select 1 from core.medicion_indicador m
                  where m.id = p_id_medicion and m.usuario_captura = auth.uid() and m.estado in ('borrador','rechazado'))
$$;
revoke all on function core.puede_subir_evidencia(uuid) from public, anon;
grant execute on function core.puede_subir_evidencia(uuid) to authenticated;

-- El nombre del objeto en el bucket debe ser <id_medicion>/<sha256>.<pdf|jpg|png> y la medicion debe ser de quien sube.
create or replace function core.nombre_evidencia_permitido(p_nombre text) returns boolean
language plpgsql stable security definer set search_path = core, public as $$
begin
  if p_nombre !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{64}\.(pdf|jpg|png)$' then return false; end if;
  return core.puede_subir_evidencia(split_part(p_nombre, '/', 1)::uuid);
end $$;
revoke all on function core.nombre_evidencia_permitido(text) from public, anon;
grant execute on function core.nombre_evidencia_permitido(text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Bucket privado y politicas (solo si existe Supabase Storage; en un Postgres solo se omite)
-- ---------------------------------------------------------------------------------------------
do $$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise notice 'No hay esquema storage: se omite el bucket evidencias (en Supabase se crea aqui).';
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('evidencias', 'evidencias', false, core.evidencia_max_bytes(), array['application/pdf','image/jpeg','image/png'])
  on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

  execute 'drop policy if exists evidencias_leer on storage.objects';
  execute 'drop policy if exists evidencias_subir on storage.objects';
  -- Lee quien puede ver la evidencia registrada (la RLS de evidencia_medicion hereda la de la medicion). Nunca anon.
  execute $p$create policy evidencias_leer on storage.objects for select to authenticated
    using (bucket_id = 'evidencias' and exists (select 1 from core.evidencia_medicion e where e.url_archivo = 'evidencias/' || name))$p$;
  -- Sube su autor, solo con el nombre canonico y solo mientras la medicion esta en borrador o rechazada.
  execute $p$create policy evidencias_subir on storage.objects for insert to authenticated
    with check (bucket_id = 'evidencias' and core.nombre_evidencia_permitido(name))$p$;
  -- Sin politicas de UPDATE ni DELETE: nadie sobrescribe ni borra un archivo desde la API.
end $$;

-- ---------------------------------------------------------------------------------------------
-- API
-- ---------------------------------------------------------------------------------------------
-- Registra (o reemplaza) la evidencia vigente de una medicion. El archivo ya debe estar en el bucket en
-- <id_medicion>/<sha256>.<ext>: el servidor comprueba que exista y que su tamano coincida con lo declarado.
create or replace function api.fn_registrar_evidencia(
  p_id_medicion uuid, p_tipo_documento text, p_hash text, p_mime text, p_bytes bigint) returns jsonb
language plpgsql security definer set search_path = core, public as $$
declare
  v_m core.medicion_indicador; v_ext text; v_ruta text; v_ant uuid; v_fila core.evidencia_medicion; v_meta jsonb; v_n int;
begin
  perform core.exigir_rol(array['capturista','administrador','administrador_titular'], 'registrar evidencias');
  select * into v_m from core.medicion_indicador where id = p_id_medicion;
  if not found then raise exception 'No existe esa medicion.' using errcode = 'P0002'; end if;
  if v_m.usuario_captura <> auth.uid() then
    raise exception 'Solo quien capturo la medicion registra su evidencia.' using errcode = '42501';
  end if;
  if v_m.estado not in ('borrador','rechazado') then
    raise exception 'La evidencia solo se cambia con la medicion en borrador o rechazada (hoy: %).', v_m.estado using errcode = '55000';
  end if;
  if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'La huella debe ser un SHA-256 en hexadecimal minuscula (64 caracteres).' using errcode = '22023';
  end if;
  if btrim(coalesce(p_tipo_documento, '')) = '' then
    raise exception 'Indica el tipo de documento (oficio, reporte, fotografia...).' using errcode = '23514';
  end if;
  v_ext := core.evidencia_extension(p_mime);
  if v_ext is null then
    raise exception 'Tipo de archivo no permitido (%): solo PDF, JPG o PNG.', coalesce(p_mime, 'sin tipo') using errcode = '22023';
  end if;
  if p_bytes is null or p_bytes < 1 or p_bytes > core.evidencia_max_bytes() then
    raise exception 'El archivo debe pesar entre 1 byte y 10 MB.' using errcode = '22023';
  end if;
  if exists (select 1 from core.evidencia_medicion e where e.hash_archivo = p_hash) then
    raise exception 'Ese archivo ya esta registrado como evidencia (huella duplicada).' using errcode = '23505';
  end if;

  v_ruta := p_id_medicion::text || '/' || p_hash || '.' || v_ext;
  if to_regclass('storage.objects') is not null then
    execute 'select count(*), max(metadata::text)::jsonb from storage.objects where bucket_id = ''evidencias'' and name = $1' into v_n, v_meta using v_ruta;
    if v_n = 0 then
      raise exception 'El archivo no esta en el almacenamiento: subelo a evidencias/% antes de registrarlo.', v_ruta using errcode = 'P0002';
    end if;
    if v_meta ? 'size' and (v_meta ->> 'size')::bigint <> p_bytes then
      raise exception 'El tamano del archivo subido (% bytes) no coincide con el declarado (%).', v_meta ->> 'size', p_bytes using errcode = '22023';
    end if;
  end if;

  select id into v_ant from core.evidencia_medicion where id_medicion = p_id_medicion and vigente for update;
  if v_ant is not null then update core.evidencia_medicion set vigente = false where id = v_ant; end if;
  insert into core.evidencia_medicion (id_medicion, id_usuario, url_archivo, tipo_documento, hash_archivo, vigente)
    values (p_id_medicion, auth.uid(), 'evidencias/' || v_ruta, btrim(p_tipo_documento), p_hash, true) returning * into v_fila;
  return to_jsonb(v_fila) || jsonb_build_object('reemplazo_a', v_ant);
end $$;

-- F11: el Auditor (o la administracion) compara la huella calculada del archivo con la guardada.
-- Si NO coincide se levanta solo un hallazgo de severidad alta a nombre del Auditor; coincidir no cambia nada.
create or replace function api.fn_verificar_evidencia(p_id uuid, p_hash_calculado text) returns jsonb
language plpgsql security definer set search_path = core, public as $$
declare v_rol text; v_e core.evidencia_medicion; v_ok boolean; v_h uuid; v_desc text;
begin
  v_rol := core.exigir_rol(array['auditor','administrador','administrador_titular'], 'verificar la integridad de una evidencia');
  select * into v_e from core.evidencia_medicion where id = p_id;
  if not found then raise exception 'No existe esa evidencia.' using errcode = 'P0002'; end if;
  if p_hash_calculado is null or p_hash_calculado !~ '^[0-9a-f]{64}$' then
    raise exception 'La huella debe ser un SHA-256 en hexadecimal minuscula (64 caracteres).' using errcode = '22023';
  end if;
  v_ok := (v_e.hash_archivo = p_hash_calculado);
  if not v_ok and v_rol = 'auditor' then
    v_desc := 'Integridad: el archivo de la evidencia ' || v_e.id || ' no coincide con su huella registrada (esperada ' || v_e.hash_archivo || ', calculada ' || p_hash_calculado || ').';
    select id into v_h from core.hallazgo_auditoria where id_medicion = v_e.id_medicion and descripcion = v_desc and estado = 'abierto';
    if v_h is null then
      insert into core.hallazgo_auditoria (id_medicion, id_auditor, descripcion, severidad) values (v_e.id_medicion, auth.uid(), v_desc, 'alta') returning id into v_h;
    end if;
  end if;
  return jsonb_build_object('id_evidencia', v_e.id, 'coincide', v_ok, 'vigente', v_e.vigente, 'hash_registrado', v_e.hash_archivo, 'hash_calculado', p_hash_calculado, 'id_hallazgo', v_h);
end $$;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as firma from pg_proc p where p.pronamespace = 'api'::regnamespace and p.proname in ('fn_registrar_evidencia','fn_verificar_evidencia')
  loop
    execute format('revoke all on function %s from public, anon', f.firma);
    execute format('grant execute on function %s to authenticated', f.firma);
  end loop;
end $$;
comment on function api.fn_registrar_evidencia(uuid, text, text, text, bigint) is 'Ciclo 6: registra o reemplaza la evidencia vigente de una medicion (solo su autor, en borrador o rechazada). El archivo debe estar ya en el bucket evidencias.';
comment on function api.fn_verificar_evidencia(uuid, text) is 'Ciclo 6 (F11): compara la huella SHA-256 calculada con la registrada; si no coincide, el Auditor deja un hallazgo de severidad alta.';
