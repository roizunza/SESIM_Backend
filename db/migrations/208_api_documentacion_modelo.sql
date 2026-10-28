-- Ciclo 3 -- Paso 7: vistas expuestas por la API para el modelo v2.2 + documentacion viva.
-- Cada api.<tabla> es security_invoker: la RLS de core decide que ve cada cuenta.

do $$
declare t text;
begin
  foreach t in array array[
    'unidad_territorial','unidad_territorial_geom','eje_tematico','sector','fuente_informacion',
    'instrumento_origen','matriz_instrumento','indicador','indicador_eje','indicador_instrumento',
    'umbral_semaforo','periodo','capa','capa_indicador','capa_vector','capa_version',
    'medicion_indicador','evidencia_medicion','dictamen','hallazgo_auditoria','bitacora_cambio']
  loop
    execute format('create or replace view api.%I with (security_invoker = true) as select * from core.%I', t, t);
    execute format('revoke all on api.%I from public, anon, authenticated', t);
    execute format('grant select on api.%I to authenticated', t);
    execute format('comment on view api.%I is %L', t, 'Vista de lectura de core.' || t || ' (RLS de quien consulta). Ver api.diccionario.');
  end loop;
end $$;

-- DICCIONARIO DE DATOS vivo: se lee de los COMMENT de la base, no se escribe a mano (D-10).
create or replace view api.diccionario with (security_invoker = true) as
select
  c.relname                                    as tabla,
  a.attnum                                     as orden,
  a.attname                                    as campo,
  format_type(a.atttypid, a.atttypmod)         as tipo,
  not a.attnotnull                             as admite_nulos,
  (select string_agg(distinct case k.contype when 'p' then 'PK' when 'f' then 'FK'
                                             when 'u' then 'UQ' when 'c' then 'CHECK' end, ', ')
     from pg_constraint k where k.conrelid = c.oid and a.attnum = any (k.conkey)) as llave,
  d.description                                as descripcion,
  td.description                               as descripcion_tabla
from pg_class c
join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'core'
join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
left join pg_description d  on d.objoid = c.oid and d.objsubid = a.attnum
left join pg_description td on td.objoid = c.oid and td.objsubid = 0
where c.relkind = 'r';
comment on view api.diccionario is 'Diccionario de datos del esquema core generado desde los COMMENT de la base: tabla, campo, tipo, llaves y descripcion.';
revoke all on api.diccionario from public, anon, authenticated;
grant select on api.diccionario to authenticated;

-- RELACIONES (llaves foraneas) para el diagrama entidad-relacion.
create or replace view api.relaciones with (security_invoker = true) as
select
  k.conname                                   as restriccion,
  hijo.relname                                as tabla_hija,
  (select string_agg(att.attname, ', ' order by u.ord)
     from unnest(k.conkey) with ordinality u(attnum, ord)
     join pg_attribute att on att.attrelid = k.conrelid and att.attnum = u.attnum) as columna_hija,
  padre.relname                               as tabla_padre,
  (select bool_and(not att.attnotnull)
     from pg_attribute att where att.attrelid = k.conrelid and att.attnum = any (k.conkey)) as hija_opcional
from pg_constraint k
join pg_class hijo  on hijo.oid  = k.conrelid
join pg_class padre on padre.oid = k.confrelid
join pg_namespace nh on nh.oid = hijo.relnamespace  and nh.nspname = 'core'
join pg_namespace np on np.oid = padre.relnamespace and np.nspname = 'core'
where k.contype = 'f';
comment on view api.relaciones is 'Llaves foraneas del esquema core (tabla hija -> tabla padre) y si la relacion es opcional.';
revoke all on api.relaciones from public, anon, authenticated;
grant select on api.relaciones to authenticated;

-- VERIFICACION DE INTEGRIDAD: una consulta que responde "esta sana la base?".
create or replace function core.verificar_integridad()
returns table (chequeo text, ok boolean, detalle text)
language plpgsql stable set search_path = core, public as $$
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
     and not exists (select 1 from core.evidencia_medicion e where e.id_medicion = m.id);
  chequeo := 'Toda medicion vigente tiene al menos una evidencia (R12)'; ok := n = 0; detalle := n || ' sin evidencia'; return next;

  select count(*) into n from core.capa c where c.estatus = 'vigente_publico'
   and (btrim(coalesce(c.metadatos_extra->>'custodio','')) = '' or btrim(coalesce(c.metadatos_extra->>'linaje','')) = '');
  chequeo := 'Toda capa publica tiene custodio y linaje'; ok := n = 0; detalle := n || ' capas'; return next;
end $$;
comment on function core.verificar_integridad() is 'Chequeos de sanidad del modelo v2.2: documentacion completa, RLS activo, alineacion indicador-instrumento-eje, compuertas de aprobacion y evidencia. Corre: select * from core.verificar_integridad();';
revoke all on function core.verificar_integridad() from public, anon, authenticated;
