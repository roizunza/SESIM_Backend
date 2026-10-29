-- Ciclo 4 (6/7) -- Usuarios e invitaciones (gestion del Administrador Titular, TDR 6.2.2 e).
-- Emision: el Titular genera un token aleatorio; la base guarda SOLO su huella SHA-256 y lo devuelve una unica vez para armar el
-- enlace. Vigencia de 7 dias. Canje: lo hace servicio-procesos (crea la cuenta en GoTrue y llama core.fn_consumir_invitacion).
-- Baja y reactivacion son logicas (core.perfil.activo): el disparador de la 126 bloquea el acceso en GoTrue y core.bitacora
-- registra el evento. No hay borrado de cuentas.

-- La API no expone la tabla de invitaciones (regla del Ciclo 3, caso C32): el Titular las consulta por funcion, sin la huella.
create or replace function api.fn_invitaciones() returns table (
  id uuid, rol text, correo_destino text, id_usuario_emisor uuid, expira_en timestamptz, usada_en timestamptz,
  id_usuario_creado uuid, revocada boolean, created_at timestamptz, estado text)
language plpgsql stable security definer set search_path = core, public as $$
begin
  perform core.exigir_rol(array['administrador_titular'], 'consultar invitaciones');
  return query
    select i.id, i.rol, i.correo_destino, i.id_usuario_emisor, i.expira_en, i.usada_en, i.id_usuario_creado, i.revocada, i.created_at,
           case when i.usada_en is not null then 'usada'
                when i.revocada then 'revocada'
                when i.expira_en <= now() then 'vencida'
                else 'vigente' end
      from core.invitacion i order by i.created_at desc;
end $$;
comment on function api.fn_invitaciones() is 'Ciclo 4: invitaciones con su estado calculado y sin la huella del token. Solo el Titular.';

create or replace function api.fn_emitir_invitacion(p_correo text, p_rol text) returns jsonb
language plpgsql security definer set search_path = core, auth, extensions, public as $$
declare v_correo text; v_token text; v_fila core.invitacion;
begin
  perform core.exigir_rol(array['administrador_titular'], 'emitir invitaciones');
  v_correo := lower(btrim(coalesce(p_correo, '')));
  if v_correo !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'El correo "%" no es valido.', p_correo using errcode = '22023';
  end if;
  if p_rol not in ('capturista','administrador','administrador_titular','auditor') then
    raise exception 'Rol no valido: "%".', p_rol using errcode = '22023';
  end if;
  if exists (select 1 from auth.users u where lower(u.email) = v_correo) then
    raise exception 'Ya existe una cuenta con el correo %.', v_correo using errcode = '23505';
  end if;
  if exists (select 1 from core.invitacion i where lower(i.correo_destino) = v_correo
              and i.usada_en is null and not i.revocada and i.expira_en > now()) then
    raise exception 'Ya hay una invitacion vigente para %; revocala antes de emitir otra.', v_correo using errcode = '23505';
  end if;
  v_token := encode(gen_random_bytes(24), 'hex');
  insert into core.invitacion (token_hash, rol, correo_destino, id_usuario_emisor, expira_en)
    values (encode(digest(v_token, 'sha256'), 'hex'), p_rol, v_correo, auth.uid(), now() + interval '7 days')
    returning * into v_fila;
  return jsonb_build_object('id', v_fila.id, 'correo_destino', v_fila.correo_destino, 'rol', v_fila.rol,
                            'expira_en', v_fila.expira_en, 'token', v_token);
end $$;

create or replace function api.fn_revocar_invitacion(p_id uuid) returns jsonb
language plpgsql security definer set search_path = core, auth, public as $$
declare v_i core.invitacion; v_fila core.invitacion;
begin
  perform core.exigir_rol(array['administrador_titular'], 'revocar invitaciones');
  select * into v_i from core.invitacion where id = p_id for update;
  if not found then raise exception 'La invitacion no existe.' using errcode = 'P0002'; end if;
  if v_i.usada_en is not null then
    raise exception 'La invitacion ya fue usada; no se puede revocar.' using errcode = '55000';
  end if;
  update core.invitacion set revocada = true where id = p_id returning * into v_fila;
  return jsonb_build_object('id', v_fila.id, 'revocada', v_fila.revocada);
end $$;

-- Lista de usuarios para el panel del Titular (correo y ultimo acceso viven en auth.users, que la API no expone).
create or replace function api.fn_usuarios() returns table (
  id_usuario uuid, nombre text, rol text, ambito text, cve_mun text, dependencia text, activo boolean,
  creado_en timestamptz, correo text, ultimo_acceso timestamptz)
language plpgsql stable security definer set search_path = core, auth, public as $$
begin
  perform core.exigir_rol(array['administrador_titular'], 'listar usuarios');
  return query
    select p.id_usuario, p.nombre, p.rol, p.ambito, p.cve_mun, p.dependencia, p.activo, p.creado_en,
           u.email::text, u.last_sign_in_at
      from core.perfil p left join auth.users u on u.id = p.id_usuario
     order by p.activo desc, p.nombre;
end $$;

create or replace function core.cambiar_activo_usuario(p_id uuid, p_activo boolean) returns jsonb
language plpgsql security definer set search_path = core, auth, public as $$
declare v_p core.perfil; v_titulares int;
begin
  perform core.exigir_rol(array['administrador_titular'], case when p_activo then 'reactivar usuarios' else 'dar de baja usuarios' end);
  select * into v_p from core.perfil where id_usuario = p_id for update;
  if not found then raise exception 'El usuario no existe.' using errcode = 'P0002'; end if;
  if not p_activo then
    if p_id = auth.uid() then
      raise exception 'No puedes darte de baja a ti mismo.' using errcode = '42501';
    end if;
    if v_p.rol = 'administrador_titular' and v_p.activo then
      select count(*) into v_titulares from core.perfil where rol = 'administrador_titular' and activo;
      if v_titulares <= 1 then
        raise exception 'No se puede dar de baja al ultimo Administrador Titular activo.' using errcode = '55000';
      end if;
    end if;
  end if;
  if v_p.activo = p_activo then
    raise exception 'El usuario ya esta %.', case when p_activo then 'activo' else 'dado de baja' end using errcode = '55000';
  end if;
  update core.perfil set activo = p_activo where id_usuario = p_id;
  return jsonb_build_object('id_usuario', p_id, 'activo', p_activo);
end $$;
revoke all on function core.cambiar_activo_usuario(uuid, boolean) from public, anon, authenticated;

create or replace function api.fn_dar_de_baja_usuario(p_id uuid) returns jsonb
language sql security definer set search_path = core, public as $$ select core.cambiar_activo_usuario(p_id, false) $$;
create or replace function api.fn_reactivar_usuario(p_id uuid) returns jsonb
language sql security definer set search_path = core, public as $$ select core.cambiar_activo_usuario(p_id, true) $$;

-- ---------------------------------------------------------------------------------------------
-- Canje (solo servicio-procesos: conexion de servicio, sin auth.uid()). NO se concede a authenticated ni a anon.
-- ---------------------------------------------------------------------------------------------
create or replace function core.fn_invitacion_vigente(p_token text) returns table (id uuid, rol text, correo_destino text)
language sql stable security definer set search_path = core, extensions, public as $$
  select i.id, i.rol, i.correo_destino from core.invitacion i
   where i.token_hash = encode(digest(p_token, 'sha256'), 'hex')
     and i.usada_en is null and not i.revocada and i.expira_en > now()
$$;

create or replace function core.fn_consumir_invitacion(p_token text, p_id_usuario uuid, p_nombre text,
    p_ambito text default 'estatal', p_cve_mun text default null, p_dependencia text default null) returns jsonb
language plpgsql security definer set search_path = core, auth, extensions, public as $$
declare v_i core.invitacion;
begin
  select * into v_i from core.invitacion
   where token_hash = encode(digest(p_token, 'sha256'), 'hex') for update;
  if not found or v_i.usada_en is not null or v_i.revocada or v_i.expira_en <= now() then
    raise exception 'Invitacion no valida, usada, revocada o vencida.' using errcode = '22023';
  end if;
  -- el alta del perfil queda en core.bitacora a nombre de quien invito
  perform set_config('app.actor_id', v_i.id_usuario_emisor::text, true);
  insert into core.perfil (id_usuario, nombre, rol, ambito, cve_mun, dependencia)
    values (p_id_usuario, p_nombre, v_i.rol, p_ambito, p_cve_mun, p_dependencia);
  -- el uso de la invitacion lo hace la persona invitada
  perform set_config('app.actor_id', p_id_usuario::text, true);
  update core.invitacion set usada_en = now(), id_usuario_creado = p_id_usuario where id = v_i.id;
  return jsonb_build_object('id_usuario', p_id_usuario, 'rol', v_i.rol, 'correo', v_i.correo_destino);
end $$;
revoke all on function core.fn_invitacion_vigente(text) from public, anon, authenticated;
revoke all on function core.fn_consumir_invitacion(text, uuid, text, text, text, text) from public, anon, authenticated;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as firma from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'api' and p.proname in ('fn_emitir_invitacion','fn_revocar_invitacion','fn_usuarios','fn_invitaciones',
              'fn_dar_de_baja_usuario','fn_reactivar_usuario')
  loop
    execute format('revoke all on function %s from public, anon', f.firma);
    execute format('grant execute on function %s to authenticated', f.firma);
  end loop;
end $$;

comment on function api.fn_emitir_invitacion(text, text) is 'Ciclo 4: el Titular emite una invitacion (7 dias). Devuelve el token UNA sola vez; la base guarda solo su SHA-256.';
comment on function core.fn_consumir_invitacion(text, uuid, text, text, text, text) is 'Ciclo 4: canje del token por servicio-procesos. Crea el perfil con el rol de la invitacion y la marca usada. No se expone a la API.';
