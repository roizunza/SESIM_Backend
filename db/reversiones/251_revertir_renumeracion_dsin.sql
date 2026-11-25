-- Reversión de la migración 251 · NO se aplica sola ni con scripts/migrar.sh (vive en db/reversiones, fuera de db/migrations).
-- Deja api.tablero_territorio() como en la migración 238, reactiva E4SegVial01 y E4SegVial02 (activo = true, sin la clave
-- «baja» de metadatos_extra) y quita de DSin01 y DSin02 los vínculos que la 251 copió de las claves viejas.
-- Ojo: si después de la 251 alguien agregó o quitó vínculos de DSin01/DSin02 a mano, esta reversión solo borra los que
-- coinciden con los de las claves viejas. Las filas de core.capa_version y core.bitacora_cambio que dejó la 251 NO se borran
-- (son historia); la reversión agrega su propia nota de versión.
begin;

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
                         'E4SegVial01','E4SegVial02','E4SegVial07','E4SegVial08',
                         'E5Gen01','E5Gen02','E5Gen04')
     group by v.id_capa, v.cve_mun, coalesce(v.clasif, '')
  ) t
$$;
grant execute on function api.tablero_territorio() to anon, authenticated;

do $rev$
declare par record; n_del int; n_re int;
begin
  for par in select * from (values ('E4SegVial01','DSin01'), ('E4SegVial02','DSin02')) as t(vieja, nueva) loop
    delete from core.capa_indicador n
     where n.id_capa = par.nueva
       and exists (select 1 from core.capa_indicador v where v.id_capa = par.vieja and v.id_indicador = n.id_indicador);
    get diagnostics n_del = row_count;
    update core.capa
       set activo = true, updated_at = now(), metadatos_extra = metadatos_extra - 'baja'
     where id = par.vieja and not activo and metadatos_extra -> 'baja' ->> 'migracion' = '251';
    get diagnostics n_re = row_count;
    if n_re = 1 then
      perform core.registrar_version_capa(par.vieja, 'Reactivada: reversión de la migración 251.');
    end if;
    raise notice '251 reversión: % reactivadas %, vínculos quitados de %: %.', par.vieja, n_re, par.nueva, n_del;
  end loop;
end
$rev$;

notify pgrst, 'reload schema';
commit;
