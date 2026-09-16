-- Ciclo 1 -- FIX de 108_hook_custom_access_token.sql.
--
-- Bug encontrado el 15 sept al intentar sacar un JWT real de
-- sesimcapturista1@gmail.com para las pruebas de RLS de Ciclo 3
-- (core.observacion): jsonb_set() es una funcion STRICT de Postgres --
-- si cualquiera de sus argumentos es NULL, regresa NULL (no un jsonb con
-- esa llave en null). La version anterior de esta funcion hacia:
--
--   claims := jsonb_set(claims, '{rol}', to_jsonb(v_rol), true);
--
-- Cuando una cuenta no tiene fila en core.perfil, v_rol es NULL,
-- to_jsonb(v_rol) tambien es NULL, y jsonb_set(...) con un argumento NULL
-- regresa NULL -- rompiendo "claims" entero, y de ahi el "event" completo
-- que regresa la funcion. GoTrue entonces rechaza el login con:
--   "output claims do not conform to the expected schema:
--    (root): Invalid type. Expected: object, given: null"


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

  -- jsonb_build_object SI soporta NULL (produce {"rol": null}) -- a
  -- diferencia de jsonb_set, que es strict y tumbaba la funcion entera.
  claims := claims || jsonb_build_object('rol', v_rol);

  return jsonb_set(event, '{claims}', claims);
end;
$$;

comment on function core.custom_access_token_hook(jsonb) is 'Custom Access Token Hook de GoTrue (self-hosted): agrega el rol de core.perfil como claim de CONVENIENCIA en el JWT, solo para que el front lo lea sin round-trip extra. No reemplaza la resolucion en vivo del rol para autorizacion -- RLS y servicio-procesos la siguen haciendo directo contra core.perfil. Fix 15 sept: ya no usa jsonb_set con un valor potencialmente NULL (jsonb_set es strict y tumbaba la funcion entera cuando la cuenta no tenia perfil) -- ahora usa jsonb_build_object, que si soporta NULL.';
