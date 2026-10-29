-- Ciclo 4 (7/7) -- ER-4: plazo en dias habiles y decision de quien envio sobre cada rechazo.
-- Autorizado por Ismael el 28-oct-2026. Ver docs/ciclo-4-cambios-er.md (ER-4).
--
-- Cuando la administracion RECHAZA una capa o un instrumento, queda una fila de seguimiento para quien lo habia enviado:
--   pendiente --retomar--> retomada --(reenvia a revision)--> atendida
--   pendiente | retomada --quitar de mi lista--> descartada
--   pendiente | retomada --pasan 10 dias habiles--> vencida   (sale de su lista; el registro y su historial se conservan)
--   vencida | descartada --un Administrador reabre--> pendiente (plazo nuevo)
-- No se borra nada ni se da de baja la capa: solo cambia el estado del seguimiento. Todo queda en core.bitacora_cambio.

-- ER-4a. Calendario de dias inhabiles (lo edita el Titular). Vacio al inicio: solo cuentan sabados y domingos como no laborables.
create table core.dia_inhabil (
  fecha       date primary key,
  descripcion text not null check (btrim(descripcion) <> ''),
  created_at  timestamptz not null default now()
);
comment on table core.dia_inhabil is 'ER-4: dias inhabiles oficiales (ademas de sabado y domingo) para contar el plazo de los rechazos. Lo administra el Titular.';

-- ER-4b. Seguimiento de cada rechazo (una fila por dictamen de rechazo de capa o instrumento).
create table core.rechazo_seguimiento (
  id_dictamen     uuid primary key references core.dictamen(id),
  objeto_tipo     text not null check (objeto_tipo in ('capa','instrumento')),
  objeto_id       text not null,
  id_destinatario uuid not null references core.perfil(id_usuario),
  fecha_limite    date not null,
  estado          text not null default 'pendiente'
                  check (estado in ('pendiente','retomada','atendida','descartada','vencida')),
  decidido_en     timestamptz,
  decidido_por    uuid references core.perfil(id_usuario),
  created_at      timestamptz not null default now()
);
create index rechazo_seguimiento_dest_idx on core.rechazo_seguimiento (id_destinatario, estado);
create index rechazo_seguimiento_obj_idx on core.rechazo_seguimiento (objeto_tipo, objeto_id, created_at desc);
comment on table core.rechazo_seguimiento is 'ER-4: plazo (dias habiles) y decision de quien envio sobre un rechazo de la administracion. Estados: pendiente, retomada, atendida, descartada, vencida.';
comment on column core.rechazo_seguimiento.id_destinatario is 'Quien envio el objeto a revision (o, si no consta, quien lo dio de alta).';
comment on column core.rechazo_seguimiento.fecha_limite is 'Ultimo dia para decidir, contando 10 dias habiles desde el rechazo (lunes a viernes menos core.dia_inhabil).';
comment on column core.rechazo_seguimiento.estado is 'pendiente: sin decidir | retomada: decidio corregirla | atendida: ya la reenvio a revision | descartada: la quito de su lista | vencida: se paso el plazo.';


comment on column core.dia_inhabil.fecha is 'Fecha del dia inhabil (llave).';
comment on column core.dia_inhabil.descripcion is 'Motivo: feriado, suspension de labores, etc.';
comment on column core.dia_inhabil.created_at is 'Cuando se agrego al calendario.';
comment on column core.rechazo_seguimiento.id_dictamen is 'Dictamen de rechazo que origina el seguimiento (llave).';
comment on column core.rechazo_seguimiento.objeto_tipo is 'capa o instrumento.';
comment on column core.rechazo_seguimiento.objeto_id is 'Identificador de la capa o del instrumento rechazado.';
comment on column core.rechazo_seguimiento.decidido_en is 'Cuando se tomo la ultima decision (retomar, descartar, vencer, reabrir o atender).';
comment on column core.rechazo_seguimiento.decidido_por is 'Quien tomo la ultima decision; vacio si fue el vencimiento automatico.';
comment on column core.rechazo_seguimiento.created_at is 'Cuando se registro el rechazo.';

alter table core.dia_inhabil enable row level security;
alter table core.rechazo_seguimiento enable row level security;
create policy dia_inhabil_select on core.dia_inhabil for select to authenticated using (true);
-- rechazo_seguimiento: sin politicas; se lee solo por api.fn_pendientes_rechazo (definer).
revoke all on core.rechazo_seguimiento, core.dia_inhabil from anon, authenticated;
grant select on core.dia_inhabil to authenticated;

create view api.dia_inhabil with (security_invoker = true) as select * from core.dia_inhabil;
grant select on api.dia_inhabil to authenticated;
revoke all on api.dia_inhabil from anon, public;

-- Auditoria
create trigger trg_auditoria after insert or update or delete on core.dia_inhabil
  for each row execute function core.fn_auditar_cambio('fecha', '', '');
create trigger trg_auditoria after insert or update or delete on core.rechazo_seguimiento
  for each row execute function core.fn_auditar_cambio('id_dictamen', 'estado', '');

-- ---------------------------------------------------------------------------------------------
-- Calculo de dias habiles
-- ---------------------------------------------------------------------------------------------
create or replace function core.hoy_mx() returns date language sql stable as
$$ select (now() at time zone 'America/Mexico_City')::date $$;

create or replace function core.es_dia_habil(p_fecha date) returns boolean language sql stable
set search_path = core, public as
$$ select extract(isodow from p_fecha) < 6 and not exists (select 1 from core.dia_inhabil d where d.fecha = p_fecha) $$;

-- n dias habiles despues de p_desde (el dia de p_desde no cuenta).
create or replace function core.sumar_dias_habiles(p_desde date, p_n int) returns date
language plpgsql stable set search_path = core, public as $$
declare v_f date := p_desde; v_k int := 0;
begin
  while v_k < p_n loop
    v_f := v_f + 1;
    if core.es_dia_habil(v_f) then v_k := v_k + 1; end if;
  end loop;
  return v_f;
end $$;

-- dias habiles que faltan desde p_desde (sin contarlo) hasta p_hasta (contandolo); 0 si ya paso.
create or replace function core.dias_habiles_entre(p_desde date, p_hasta date) returns int
language sql stable set search_path = core, public as $$
  select count(*)::int from generate_series(p_desde + 1, p_hasta, interval '1 day') g(d) where core.es_dia_habil(g.d::date)
$$;

create or replace function core.plazo_rechazo_dias() returns int language sql immutable as $$ select 10 $$;
comment on function core.plazo_rechazo_dias() is 'ER-4: plazo para decidir sobre un rechazo, en dias habiles (decision de negocio: 10).';

-- Marca como vencidos los rechazos cuyo plazo ya paso. Se llama al consultar, al decidir y al reenviar (no requiere cron).
create or replace function core.vencer_rechazos() returns int
language plpgsql security definer set search_path = core, public as $$
declare n int;
begin
  update core.rechazo_seguimiento set estado = 'vencida', decidido_en = now()
   where estado in ('pendiente','retomada') and fecha_limite < core.hoy_mx();
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function core.vencer_rechazos() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Alta del seguimiento: al insertarse un dictamen de rechazo
-- ---------------------------------------------------------------------------------------------
create or replace function core.fn_seguimiento_de_rechazo() returns trigger
language plpgsql security definer set search_path = core, public as $$
declare v_dest uuid; v_tabla text;
begin
  if new.decision <> 'rechazar' or new.objeto_tipo not in ('capa','instrumento') then return new; end if;
  v_tabla := case new.objeto_tipo when 'capa' then 'capa' else 'instrumento_origen' end;
  v_dest := core.quien_envio(v_tabla, new.objeto_id);
  if v_dest is null then
    select b.id_usuario into v_dest from core.bitacora_cambio b
     where b.tabla_afectada = v_tabla and b.id_registro = new.objeto_id and b.accion = 'INSERT' limit 1;
  end if;
  if v_dest is null then return new; end if;     -- objeto de la carga inicial: no hay a quien avisar
  insert into core.rechazo_seguimiento (id_dictamen, objeto_tipo, objeto_id, id_destinatario, fecha_limite)
    values (new.id, new.objeto_tipo, new.objeto_id, v_dest, core.sumar_dias_habiles(core.hoy_mx(), core.plazo_rechazo_dias()));
  return new;
end $$;
create trigger trg_dictamen_seguimiento after insert on core.dictamen
  for each row execute function core.fn_seguimiento_de_rechazo();

-- ---------------------------------------------------------------------------------------------
-- Al reenviar a revision: se cierra el seguimiento ("atendida"); quien envia sin plazo vigente no puede reenviar
-- ---------------------------------------------------------------------------------------------
create or replace function core.fn_seguimiento_al_reenviar() returns trigger
language plpgsql security definer set search_path = core, public as $$
declare v_tipo text := case tg_table_name when 'capa' then 'capa' else 'instrumento' end; v_ult text;
begin
  if not (new.estatus = 'revision' and old.estatus = 'borrador') then return new; end if;
  perform core.vencer_rechazos();
  select s.estado into v_ult from core.rechazo_seguimiento s
   where s.objeto_tipo = v_tipo and s.objeto_id = new.id::text order by s.created_at desc limit 1;
  if core.rol_actual() = 'capturista' and v_ult in ('vencida','descartada') then
    raise exception 'El rechazo de % esta "%": para reenviarla pide a un Administrador que lo reabra.', new.id,
      case v_ult when 'vencida' then 'vencido (pasaron los dias habiles del plazo)' else 'descartado por ti' end using errcode = '55000';
  end if;
  update core.rechazo_seguimiento set estado = 'atendida', decidido_en = now(), decidido_por = auth.uid()
   where objeto_tipo = v_tipo and objeto_id = new.id::text and estado in ('pendiente','retomada','vencida','descartada');
  return new;
end $$;
create trigger trg_capa_seguimiento before update of estatus on core.capa
  for each row execute function core.fn_seguimiento_al_reenviar();
create trigger trg_instrumento_seguimiento before update of estatus on core.instrumento_origen
  for each row execute function core.fn_seguimiento_al_reenviar();

-- ---------------------------------------------------------------------------------------------
-- API
-- ---------------------------------------------------------------------------------------------
-- Lista de pendientes: el Capturista (o quien envio) ve los suyos; Administrador, Titular y Auditor ven todos.
create or replace function api.fn_pendientes_rechazo(p_incluir_cerrados boolean default false) returns table (
  id_dictamen uuid, objeto_tipo text, objeto_id text, titulo text, motivo text, rechazado_en timestamptz,
  rechazado_por text, id_destinatario uuid, destinatario text, fecha_limite date, dias_habiles_restantes int, estado text)
language plpgsql security definer set search_path = core, public as $$
declare v_rol text;
begin
  v_rol := core.exigir_rol(array['capturista','administrador','administrador_titular','auditor'], 'consultar rechazos');
  perform core.vencer_rechazos();
  return query
    select s.id_dictamen, s.objeto_tipo, s.objeto_id,
           case s.objeto_tipo when 'capa' then (select c.titulo from core.capa c where c.id = s.objeto_id)
                              else (select i.nombre from core.instrumento_origen i where i.id = s.objeto_id) end,
           d.comentario, d.fecha, pr.nombre, s.id_destinatario, pd.nombre, s.fecha_limite,
           case when s.estado in ('pendiente','retomada') then core.dias_habiles_entre(core.hoy_mx(), s.fecha_limite) end,
           s.estado
      from core.rechazo_seguimiento s
      join core.dictamen d on d.id = s.id_dictamen
      left join core.perfil pr on pr.id_usuario = d.id_usuario
      left join core.perfil pd on pd.id_usuario = s.id_destinatario
     where (v_rol <> 'capturista' or s.id_destinatario = auth.uid())
       and (p_incluir_cerrados or s.estado in ('pendiente','retomada'))
     order by (s.estado in ('pendiente','retomada')) desc, s.fecha_limite, d.fecha desc;
end $$;

-- Decision de quien envio: 'retomar' (voy a corregirla) o 'descartar' (la quito de mi lista).
create or replace function api.fn_decidir_rechazo(p_id_dictamen uuid, p_decision text) returns jsonb
language plpgsql security definer set search_path = core, public as $$
declare v_s core.rechazo_seguimiento; v_nuevo text; v_fila core.rechazo_seguimiento;
begin
  perform core.exigir_rol(array['capturista','administrador','administrador_titular'], 'decidir sobre un rechazo');
  if p_decision not in ('retomar','descartar') then
    raise exception 'Decision no valida: "%". Usa retomar o descartar.', p_decision using errcode = '22023';
  end if;
  perform core.vencer_rechazos();
  select * into v_s from core.rechazo_seguimiento where id_dictamen = p_id_dictamen for update;
  if not found then raise exception 'No existe ese rechazo.' using errcode = 'P0002'; end if;
  if v_s.id_destinatario <> auth.uid() then
    raise exception 'Solo quien envio el registro decide sobre su rechazo.' using errcode = '42501';
  end if;
  if v_s.estado = 'vencida' then
    raise exception 'El plazo de este rechazo venció el %; pide a un Administrador que lo reabra.', to_char(v_s.fecha_limite, 'DD/MM/YYYY') using errcode = '55000';
  end if;
  if v_s.estado not in ('pendiente','retomada') then
    raise exception 'Este rechazo ya esta "%".', v_s.estado using errcode = '55000';
  end if;
  v_nuevo := case p_decision when 'retomar' then 'retomada' else 'descartada' end;
  if v_s.estado = v_nuevo then
    raise exception 'Este rechazo ya esta "%".', v_nuevo using errcode = '55000';
  end if;
  update core.rechazo_seguimiento set estado = v_nuevo, decidido_en = now(), decidido_por = auth.uid()
   where id_dictamen = p_id_dictamen returning * into v_fila;
  return to_jsonb(v_fila);
end $$;

-- Un Administrador (o el Titular) reabre un rechazo vencido o descartado, con plazo nuevo.
create or replace function api.fn_reabrir_rechazo(p_id_dictamen uuid) returns jsonb
language plpgsql security definer set search_path = core, public as $$
declare v_s core.rechazo_seguimiento; v_fila core.rechazo_seguimiento;
begin
  perform core.exigir_rol(array['administrador','administrador_titular'], 'reabrir rechazos');
  perform core.vencer_rechazos();
  select * into v_s from core.rechazo_seguimiento where id_dictamen = p_id_dictamen for update;
  if not found then raise exception 'No existe ese rechazo.' using errcode = 'P0002'; end if;
  if v_s.estado not in ('vencida','descartada') then
    raise exception 'Este rechazo esta "%": solo se reabren los vencidos o descartados.', v_s.estado using errcode = '55000';
  end if;
  update core.rechazo_seguimiento
     set estado = 'pendiente', fecha_limite = core.sumar_dias_habiles(core.hoy_mx(), core.plazo_rechazo_dias()),
         decidido_en = now(), decidido_por = auth.uid()
   where id_dictamen = p_id_dictamen returning * into v_fila;
  return to_jsonb(v_fila);
end $$;

-- Calendario de dias inhabiles (Titular)
create or replace function api.fn_guardar_dia_inhabil(p_fecha date, p_descripcion text) returns jsonb
language plpgsql security definer set search_path = core, public as $$
declare v_fila core.dia_inhabil;
begin
  perform core.exigir_rol(array['administrador_titular'], 'administrar el calendario de dias inhabiles');
  if p_fecha is null then raise exception 'Falta la fecha.' using errcode = '22023'; end if;
  insert into core.dia_inhabil (fecha, descripcion) values (p_fecha, p_descripcion)
    on conflict (fecha) do update set descripcion = excluded.descripcion returning * into v_fila;
  return to_jsonb(v_fila);
end $$;
create or replace function api.fn_quitar_dia_inhabil(p_fecha date) returns void
language plpgsql security definer set search_path = core, public as $$
begin
  perform core.exigir_rol(array['administrador_titular'], 'administrar el calendario de dias inhabiles');
  delete from core.dia_inhabil where fecha = p_fecha;
  if not found then raise exception 'La fecha % no esta en el calendario.', p_fecha using errcode = 'P0002'; end if;
end $$;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as firma from pg_proc p where p.pronamespace = 'api'::regnamespace
            and p.proname in ('fn_pendientes_rechazo','fn_decidir_rechazo','fn_reabrir_rechazo','fn_guardar_dia_inhabil','fn_quitar_dia_inhabil')
  loop
    execute format('revoke all on function %s from public, anon', f.firma);
    execute format('grant execute on function %s to authenticated', f.firma);
  end loop;
end $$;

comment on function api.fn_pendientes_rechazo(boolean) is 'ER-4: lista de rechazos con plazo. El Capturista ve los suyos; la administracion y el Auditor ven todos.';
comment on function api.fn_decidir_rechazo(uuid, text) is 'ER-4: quien envio decide retomar (corregirla) o descartar (quitarla de su lista) antes de que venza el plazo.';
comment on function api.fn_reabrir_rechazo(uuid) is 'ER-4: el Administrador reabre un rechazo vencido o descartado con plazo nuevo de 10 dias habiles.';
