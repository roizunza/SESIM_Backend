-- Migración 251 · Renumeración E4SegVial01/E4SegVial02 → DSin01/DSin02 · Redactada el 2026-11-24 y probada en bases locales. La aplica Rocío con scripts/migrar.sh: la fecha real de aplicación queda en core.schema_migraciones.
-- Autorizada su redacción el 2026-11-24 (Rocío: tablero a DSin, copia de los 22 vínculos por capa como excepción
-- por renumeración, y baja lógica directa con activo = false sin pasar por «rechazar»).
--
-- Registro del cambio de claves (regla: nunca reutilizar una clave; clave anterior → nueva → nombre → qué cambió)
--   E4SegVial01 → DSin01 · «Siniestros de tránsito en carreteras federales, Campeche 2022» · cambia la clave; 9 elementos.
--   E4SegVial02 → DSin02 · «Accidentes de tránsito en zonas urbanas y suburbanas por municipio, Campeche 2023» · cambia la clave; 13 elementos.
-- Equivalencia verificada por Rocío en la VM el 2026-11-24 (solo lectura): mismos id_origen, nombre, clasificación y municipio,
-- 0 diferencias; geometría a ≤ 0.0000008 grados (unos 8 cm: redondeo de coordenadas); DSin01 con los mismos 7,937 puntos y
-- DSin02 con 61,080 contra 60,424 (+656, 1.1 %). Km por municipio de DSin01 iguales a los de E4SegVial01 (diferencia máxima 0.001 km).
-- Las claves E4SegVial01 y E4SegVial02 NO se reasignan nunca.
--
-- Qué hace (todo en una transacción; se puede aplicar dos veces sin duplicar nada)
--   0. Comprobaciones previas: las cuatro capas existen; mismos conteos por par; km de DSin01 = km de E4SegVial01 (tolerancia 0.05 km);
--      el tablero aún lee las claves viejas. Si algo falla, aborta sin cambiar nada.
--   1. api.tablero_territorio() lee DSin01 y DSin02 en lugar de E4SegVial01 y E4SegVial02 (E4SegVial07 y E4SegVial08 no cambian).
--   2. Copia los vínculos capa–indicador de cada clave vieja a su clave nueva (22 por capa). EXCEPCIÓN POR RENUMERACIÓN: se hace
--      por SQL y no con api.fn_vincular_capa_indicador, que solo liga indicadores aprobados; hoy solo 2 de 113 están aprobados
--      y ninguno de los 22 lo está. No aprueba ningún indicador. Los vínculos viejos NO se borran.
--   3. Baja lógica de E4SegVial01 y E4SegVial02 (activo = false). Directa, sin «rechazar»: estatus no cambia (sigue vigente_publico),
--      por lo que no se abre seguimiento de plazos. Deja la nota en core.capa_version y en metadatos_extra -> baja. La baja
--      queda también en core.bitacora_cambio (trigger de auditoría de core.capa y core.capa_indicador; sin sesión se registra como «sistema»).
--
-- Qué NO hace: no toca datos de capa_vector, ni el DER, ni políticas RLS, ni las otras capas del Eje 4 (E4SegVial03 a 08), ni indicadores.
-- Efecto esperado: el público deja de ver E4SegVial01 y E4SegVial02 (la política capa_select_publico exige estatus vigente_publico Y activo);
-- el tablero sigue con las mismas cifras leyendo DSin01 y DSin02. Con sesión, el geovisor solo las oculta si el front trae el cambio
-- de `capas.js` (parche de front que acompaña a esta migración); antes de ese cambio los roles con sesión seguirán viendo el duplicado.
-- Reversión: db/reversiones/251_revertir_renumeracion_dsin.sql.
begin;

do $previas$
declare
  n_v1 int; n_n1 int; n_v2 int; n_n2 int; km_v numeric; km_n numeric; f text;
begin
  if (select count(*) from core.capa where id in ('E4SegVial01','E4SegVial02','DSin01','DSin02')) <> 4 then
    raise exception '251: faltan capas (E4SegVial01, E4SegVial02, DSin01 o DSin02); no se cambia nada.' using errcode = 'P0002';
  end if;
  select count(*) into n_v1 from core.capa_vector where id_capa = 'E4SegVial01';
  select count(*) into n_n1 from core.capa_vector where id_capa = 'DSin01';
  select count(*) into n_v2 from core.capa_vector where id_capa = 'E4SegVial02';
  select count(*) into n_n2 from core.capa_vector where id_capa = 'DSin02';
  if n_v1 <> n_n1 or n_v2 <> n_n2 or n_n1 = 0 or n_n2 = 0 then
    raise exception '251: los conteos por par no coinciden (E4SegVial01 % / DSin01 %; E4SegVial02 % / DSin02 %); no se cambia nada.', n_v1, n_n1, n_v2, n_n2 using errcode = '23514';
  end if;
  select coalesce(sum(st_length(geom::geography)), 0) / 1000.0 into km_v from core.capa_vector where id_capa = 'E4SegVial01' and geometrytype(geom) like '%LINESTRING';
  select coalesce(sum(st_length(geom::geography)), 0) / 1000.0 into km_n from core.capa_vector where id_capa = 'DSin01'       and geometrytype(geom) like '%LINESTRING';
  if abs(km_v - km_n) > 0.05 then
    raise exception '251: los km de DSin01 (%) y E4SegVial01 (%) difieren más de 0.05 km; no se cambia nada.', round(km_n, 3), round(km_v, 3) using errcode = '23514';
  end if;
  f := pg_get_functiondef('api.tablero_territorio()'::regprocedure);
  if f not like '%E4SegVial01%' and f like '%DSin01%' then
    raise notice '251: api.tablero_territorio() ya lee DSin01 (se vuelve a escribir igual).';
  elsif f not like '%E4SegVial01%' then
    raise exception '251: api.tablero_territorio() no es la definición esperada (no menciona E4SegVial01 ni DSin01); revisar antes de reemplazarla.' using errcode = '23514';
  end if;
  raise notice '251 previas OK: DSin01 % elementos y % km (E4SegVial01 % km); DSin02 % elementos.', n_n1, round(km_n, 3), round(km_v, 3), n_n2;
end
$previas$;

-- 1. El tablero lee las claves nuevas
create or replace function api.tablero_territorio()
returns jsonb language sql stable security invoker
set search_path = core, public, extensions
as $$
  select jsonb_build_object(
    'generado', to_char(now() at time zone 'utc', 'YYYY-MM-DD'),
    'origen', 'base de datos (core.capa_vector)',
    'filas', coalesce(jsonb_agg(jsonb_build_object(
        'capa', t.id_capa, 'mun', t.cve_mun, 'clasif', t.clasif, 'n', t.n, 'km', t.km)
        order by t.id_capa, t.cve_mun, t.clasif), '[]'::jsonb))
  from (
    select v.id_capa, v.cve_mun, coalesce(v.clasif, '') as clasif, count(*)::int as n,
           round((coalesce(sum(case when geometrytype(v.geom) like '%LINESTRING'
                                    then st_length(v.geom::geography) end), 0) / 1000.0)::numeric, 2) as km
      from core.capa_vector v
     where v.id_capa in ('DIt06','DIt04','DTp01','DIt02','DTc05',
                         'DSin01','DSin02','E4SegVial07','E4SegVial08',
                         'E5Gen01','E5Gen02','E5Gen04')
     group by v.id_capa, v.cve_mun, coalesce(v.clasif, '')
  ) t
$$;
grant execute on function api.tablero_territorio() to anon, authenticated;

do $cambios$
declare
  par record; n_ins int; n_tot int; n_baja int := 0; n_baja_i int; nota text;
begin
  for par in select * from (values ('E4SegVial01','DSin01'), ('E4SegVial02','DSin02')) as t(vieja, nueva) loop
    -- 2. Vínculos capa–indicador: excepción por renumeración (no aprueba indicadores)
    insert into core.capa_indicador (id_capa, id_indicador)
      select par.nueva, ci.id_indicador from core.capa_indicador ci where ci.id_capa = par.vieja
      on conflict do nothing;
    get diagnostics n_ins = row_count;
    select count(*) into n_tot from core.capa_indicador where id_capa = par.nueva;
    raise notice '251 vínculos: % → % · copiados ahora %, la clave nueva queda con % (la vieja conserva %).',
      par.vieja, par.nueva, n_ins, n_tot, (select count(*) from core.capa_indicador where id_capa = par.vieja);

    -- 3. Baja lógica de la clave vieja (solo si sigue activa)
    nota := 'Baja lógica por renumeración: ' || par.vieja || ' → ' || par.nueva || ' (migración 251, decidida por Rocío el 2026-11-24). '
         || 'Directa (activo = false), sin «rechazar»: el estatus no cambia. Mismos datos que ' || par.nueva || '. '
         || 'Los ' || (select count(*) from core.capa_indicador where id_capa = par.vieja) || ' vínculos con indicadores se copiaron a ' || par.nueva
         || ' como excepción por renumeración (sin aprobar indicadores).';
    update core.capa
       set activo = false,
           updated_at = now(),
           metadatos_extra = metadatos_extra || jsonb_build_object('baja', jsonb_build_object(
             'motivo', 'Clave renumerada',
             'clave_nueva', par.nueva,
             'clave_anterior', par.vieja,
             'fecha', core.hoy_mx()::text,
             'migracion', '251',
             'estatus_al_dar_de_baja', estatus,
             'nota', nota))
     where id = par.vieja and activo;
    get diagnostics n_baja_i = row_count;
    n_baja := n_baja + n_baja_i;
    if n_baja_i = 1 then
      perform core.registrar_version_capa(par.vieja, 'Baja lógica por renumeración a ' || par.nueva || ' (migración 251).');
    end if;
  end loop;
  raise notice '251: capas dadas de baja ahora: % de 2.', n_baja;
end
$cambios$;

-- Comprobación final (aborta y deshace todo si algo no quedó como se dijo)
do $final$
declare r record; f text := pg_get_functiondef('api.tablero_territorio()'::regprocedure);
begin
  if f like '%E4SegVial01%' or f like '%E4SegVial02%' or f not like '%DSin01%' or f not like '%DSin02%' then
    raise exception '251: el tablero no quedó leyendo DSin01 y DSin02.';
  end if;
  for r in select * from (values ('E4SegVial01','DSin01'), ('E4SegVial02','DSin02')) as t(vieja, nueva) loop
    if (select count(*) from core.capa_indicador where id_capa = r.nueva) < (select count(*) from core.capa_indicador where id_capa = r.vieja) then
      raise exception '251: % tiene menos vínculos que %.', r.nueva, r.vieja;
    end if;
    if (select activo from core.capa where id = r.vieja) or not (select activo from core.capa where id = r.nueva) then
      raise exception '251: estado de activo inesperado en % / %.', r.vieja, r.nueva;
    end if;
  end loop;
  raise notice '251 final OK: tablero en DSin01/DSin02; E4SegVial01 y E4SegVial02 inactivas; DSin01 y DSin02 activas con sus vínculos.';
end
$final$;

notify pgrst, 'reload schema';
commit;
