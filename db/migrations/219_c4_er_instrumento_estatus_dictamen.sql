-- Ciclo 4 (1/7) -- Cambios al entidad-relacion autorizados por Ismael (nov-2026). Ver docs/ciclo-4-cambios-er.md.
--
--  ER-1  core.instrumento_origen + estatus + ruta_pdf   (decision D-20)
--        El instrumento normativo pasa por el mismo ciclo de vida que una capa:
--        borrador -> revision -> vigente_admin -> vigente_publico. `publicado` (D-16, migracion 214) se conserva
--        y queda DERIVADO de estatus: publicado = (estatus = 'vigente_publico'). Un trigger los mantiene
--        sincronizados en los dos sentidos, de modo que nada de lo anterior (vistas, politicas del rol anon,
--        trigger D-16) cambia de significado.
--  ER-2  core.dictamen.objeto_tipo admite 'instrumento'  (el dictamen de un instrumento se registra donde ya
--        se registran los de capa, medicion e indicador, en vez de crear otra tabla).
--  (ER-3, sin cambio: core.capa_version NO se replica para instrumentos; su historial queda en core.bitacora_cambio,
--        que ya guarda la foto previa y la nueva de cada cambio -- Ciclo 5.)

-- ---------------------------------------------------------------------------------------------
-- ER-1. Columnas nuevas
-- ---------------------------------------------------------------------------------------------
alter table core.instrumento_origen
  add column estatus  text not null default 'borrador'
      constraint instrumento_estatus_valido check (estatus in ('borrador','revision','vigente_admin','vigente_publico')),
  add column ruta_pdf text
      constraint instrumento_ruta_pdf_no_vacia check (ruta_pdf is null or btrim(ruta_pdf) <> '');

-- Los instrumentos ya publicados (D-16) quedan en vigente_publico. La auditoria se pausa solo para este ajuste
-- de la carga: no es un cambio hecho por una persona y no debe aparecer en la bitacora como si lo fuera.
alter table core.instrumento_origen disable trigger user;
update core.instrumento_origen set estatus = 'vigente_publico' where publicado;
alter table core.instrumento_origen enable trigger user;

alter table core.instrumento_origen
  add constraint instrumento_publicado_es_estatus check (publicado = (estatus = 'vigente_publico'));

-- ---------------------------------------------------------------------------------------------
-- Sincronia estatus <-> publicado. Se llama "trg_instrumento_a_sincronizar" para que dispare ANTES que
-- trg_instrumento_publicar_* (orden alfabetico de los disparadores BEFORE): asi el candado D-16 ve el valor
-- final de "publicado" y sigue exigiendo al Titular tambien cuando el cambio llega por estatus.
-- ---------------------------------------------------------------------------------------------
create or replace function core.fn_instrumento_sincronizar() returns trigger
language plpgsql set search_path = core, public as $$
begin
  if tg_op = 'INSERT' then
    if new.estatus = 'vigente_publico' or (new.publicado and new.estatus = 'borrador') then
      new.estatus := 'vigente_publico'; new.publicado := true;
      new.publicado_en := coalesce(new.publicado_en, now());
    else
      new.publicado := false;
    end if;
  elsif new.estatus is distinct from old.estatus then
    -- manda el estatus
    new.publicado := (new.estatus = 'vigente_publico');
    if new.publicado and not old.publicado then new.publicado_en := now(); end if;
  elsif new.publicado is distinct from old.publicado then
    -- ruta heredada (D-16): alguien cambio "publicado" directamente
    if new.publicado then
      new.estatus := 'vigente_publico'; new.publicado_en := now();
    else
      new.estatus := 'borrador';
    end if;
  end if;
  return new;
end $$;
comment on function core.fn_instrumento_sincronizar() is
  'Ciclo 4 (ER-1): mantiene publicado = (estatus = vigente_publico) en core.instrumento_origen, cambie el uno o el otro.';

create trigger trg_instrumento_a_sincronizar
  before insert or update on core.instrumento_origen
  for each row execute function core.fn_instrumento_sincronizar();

-- ---------------------------------------------------------------------------------------------
-- ER-2. dictamen admite instrumentos
-- ---------------------------------------------------------------------------------------------
alter table core.dictamen drop constraint dictamen_objeto_tipo_check;
alter table core.dictamen add constraint dictamen_objeto_tipo_check
  check (objeto_tipo in ('medicion','capa','indicador','instrumento'));

-- ---------------------------------------------------------------------------------------------
-- Documentacion (alimenta api.diccionario)
-- ---------------------------------------------------------------------------------------------
comment on column core.instrumento_origen.estatus is
  'Etapa del instrumento (D-20): borrador | revision | vigente_admin | vigente_publico. Solo el Administrador Titular lo valida y publica (D-16); quien lo envio a revision no lo dictamina (cuatro ojos).';
comment on column core.instrumento_origen.ruta_pdf is
  'Ruta del PDF del instrumento en el almacenamiento de archivos (D-20). Obligatoria para enviarlo a revision.';
comment on column core.instrumento_origen.publicado is
  'Derivada de estatus: true si y solo si estatus = vigente_publico (se mantiene sola). Solo el Administrador Titular puede cambiarla (D-16).';

-- La vista api se creo con select * antes de estas columnas
create or replace view api.instrumento_origen with (security_invoker = true) as select * from core.instrumento_origen;

-- Lectura por rol: el Capturista ya no necesita ver los borradores ni los instrumentos en revision de la administracion.
drop policy instrumento_origen_select_activos on core.instrumento_origen;
create policy instrumento_origen_select_por_rol on core.instrumento_origen for select to authenticated using (
  core.rol_actual() in ('administrador','administrador_titular','auditor')
  or (core.rol_actual() = 'capturista' and estatus in ('vigente_admin','vigente_publico')));

drop policy matriz_instrumento_select_activos on core.matriz_instrumento;
create policy matriz_instrumento_select_por_instrumento on core.matriz_instrumento for select to authenticated
  using (exists (select 1 from core.instrumento_origen i where i.id = id_instrumento));

drop policy indicador_instrumento_select_activos on core.indicador_instrumento;
create policy indicador_instrumento_select_por_instrumento on core.indicador_instrumento for select to authenticated
  using (exists (select 1 from core.instrumento_origen i where i.id = id_instrumento));
