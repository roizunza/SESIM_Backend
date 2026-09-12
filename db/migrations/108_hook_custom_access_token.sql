-- Custom Access Token Hook de GoTrue: agrega el rol de negocio como claim
-- "rol" dentro del JWT.
--
-- IMPORTANTE -- que problema resuelve esto y que problema NO resuelve:
--
-- Ismael pidio que el rol "viajara en el JWT". El riesgo real de eso es que
-- si el rol se hornea en el token al iniciar sesion, un cambio de rol o una
-- baja logica hecha DESPUES no se refleja hasta que ese JWT se refresque
-- (por default GoTrue emite tokens de 1 hora) -- alguien dado de baja
-- seguiria "pareciendo" activo para cualquier cosa que confiara ciegamente
-- en el claim del token.
--
-- Por eso esto se implementa como hibrido (decision de Ismael, confirmada):
--   - El claim "rol" que agrega este hook es SOLO para que el FRONT lo lea
--     directo del JWT decodificado (evitar la consulta extra a api.perfil
--     nada mas para saber que layout mostrar, o evitar el parpadeo de
--     carga mientras esa consulta resuelve).
--   - NINGUNA decision de permisos cambia: RLS (core.rol_actual(), en
--     101_schema_core_perfil.sql) y servicio-procesos
--     (_exigir_administrador_vip, en main.py) SIGUEN resolviendo el rol
--     consultando core.perfil en cada request, exactamente igual que antes
--     de este archivo. Asi, una baja o un cambio de rol sigue surtiendo
--     efecto de inmediato donde de verdad importa (autorizacion real); el
--     claim del JWT puede quedar "desactualizado" hasta el proximo refresh,
--     pero eso ya no autoriza nada por si solo.
--
-- Que hace falta en docker-compose.sesim.yml para que esto se active (ver
-- el bloque "auth:" de ese archivo, ya actualizado):
--   GOTRUE_HOOK_CUSTOM_ACCESS_TOKEN_ENABLED: "true"
--   GOTRUE_HOOK_CUSTOM_ACCESS_TOKEN_URI: "pg-functions://postgres/core/custom_access_token_hook"
--
-- No se configura GOTRUE_HOOK_CUSTOM_ACCESS_TOKEN_SECRETS: esa variable es
-- para que GoTrue firme la llamada cuando el hook es un endpoint HTTP
-- propio (para que ese endpoint pueda verificar que la llamada de verdad
-- vino de GoTrue). Con un hook "pg-functions://", GoTrue llama la funcion
-- de SQL directo dentro de la misma base de datos -- no hay HTTP de por
-- medio que firmar. Si tu version de GoTrue insistiera en pedirla de
-- todas formas, avisame con el mensaje de error exacto y lo resolvemos.

create or replace function core.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  claims jsonb;
  v_rol text;
  v_user_id uuid;
begin
  v_user_id := (event ->> 'user_id')::uuid;

  select rol into v_rol from core.perfil where id_usuario = v_user_id;

  claims := coalesce(event -> 'claims', '{}'::jsonb);
  -- Si la cuenta no tiene perfil todavia (no deberia pasar en la practica:
  -- toda alta crea perfil en la misma transaccion, ver servicio-procesos),
  -- se deja el claim en null en vez de omitirlo, para que el front nunca
  -- tenga que distinguir "no vino el claim" de "vino en null".
  claims := jsonb_set(claims, '{rol}', to_jsonb(v_rol), true);

  return jsonb_set(event, '{claims}', claims);
end;
$$;

comment on function core.custom_access_token_hook(jsonb) is 'Custom Access Token Hook de GoTrue (self-hosted): agrega el rol de core.perfil como claim de CONVENIENCIA en el JWT, solo para que el front lo lea sin round-trip extra. No reemplaza la resolucion en vivo del rol para autorizacion -- RLS y servicio-procesos la siguen haciendo directo contra core.perfil, sin depender de este claim, para que una baja/cambio de rol siga surtiendo efecto de inmediato.';

-- GoTrue (self-hosted) se conecta a Postgres como el rol supabase_auth_admin
-- (no como authenticated ni como postgres) -- ese es el rol al que hay que
-- darle permiso de ejecutar la funcion y de leer core.perfil. Se revoca
-- explicitamente de todos los demas: nadie mas deberia poder invocar este
-- hook por su cuenta.
grant usage on schema core to supabase_auth_admin;
grant select on core.perfil to supabase_auth_admin;
grant execute on function core.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function core.custom_access_token_hook(jsonb) from authenticated, anon, public;
