-- Ciclo 3 (ajuste) -- Decision D-16: gestionar umbrales del semaforo y PUBLICAR instrumentos
-- es exclusivo del Administrador Titular.
--
-- Se refleja en el MODELO, no solo en el front ni en las funciones del Ciclo 4:
--  * core.instrumento_origen.publicado: solo un instrumento publicado se ofrece al publico (215).
--  * core.exigir_titular(): trigger que rechaza (42501) cualquier alta, cambio o baja de umbrales y
--    cualquier cambio del estado "publicado" cuando quien actua trae sesion y NO es Titular.
--    Se evalua con auth.uid(), que sobrevive a funciones SECURITY DEFINER: aunque una funcion
--    api.* del Ciclo 4 se equivoque, la base no deja pasar a otro perfil.
--    Sin sesion (migraciones, servicio de procesos con llave de servicio) no se interpone.

alter table core.instrumento_origen
  add column publicado    boolean not null default false,
  add column publicado_en timestamptz,
  add constraint instrumento_publicado_activo check (not publicado or activo);

-- la vista api se creo con "select *" antes de esta columna: se rehace para que la incluya
create or replace view api.instrumento_origen with (security_invoker = true) as select * from core.instrumento_origen;

comment on column core.instrumento_origen.publicado is
  'true = el instrumento se ofrece al publico (dashboard publico). Solo el Administrador Titular lo cambia (D-16).';
comment on column core.instrumento_origen.publicado_en is
  'Momento en que se publico por ultima vez; null si nunca se ha publicado.';

-- Los 6 instrumentos de la carga oficial (EEMSV, PIMUS, etc.) son documentos normativos oficiales:
-- se dejan publicados. El Titular puede despublicar cualquiera.
update core.instrumento_origen set publicado = true, publicado_en = now() where activo;

create or replace function core.exigir_titular() returns trigger
language plpgsql security definer set search_path = core, public as $$
begin
  if auth.uid() is not null and core.rol_actual() is distinct from 'administrador_titular' then
    raise exception 'Solo el Administrador Titular puede % (D-16).', tg_argv[0]
      using errcode = 'insufficient_privilege';
  end if;
  return case tg_op when 'DELETE' then old else new end;
end $$;
comment on function core.exigir_titular() is
  'Trigger de D-16: con sesion, solo el Administrador Titular pasa. Lanza 42501 para cualquier otro perfil.';

create trigger trg_umbral_solo_titular
  before insert or update or delete on core.umbral_semaforo
  for each row execute function core.exigir_titular('gestionar umbrales del semaforo');

create trigger trg_instrumento_publicar_ins
  before insert on core.instrumento_origen
  for each row when (new.publicado)
  execute function core.exigir_titular('publicar instrumentos');

create trigger trg_instrumento_publicar_upd
  before update on core.instrumento_origen
  for each row when (new.publicado is distinct from old.publicado)
  execute function core.exigir_titular('publicar o despublicar instrumentos');
