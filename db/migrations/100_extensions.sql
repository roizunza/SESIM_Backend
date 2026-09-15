-- Ciclo 1 (rehecho sobre Supabase autoalojado) -- extensiones.
--
-- pgcrypto: ya viene habilitada en la imagen de Supabase, pero se declara
--   igual por si acaso.
--
-- pgjwt YA NO se instala: lo traia la version anterior (pre-Supabase) para
--   que una funcion propia (api.login) firmara el JWT a mano. Con Supabase,
--   el JWT lo emite GoTrue; Postgres solo lo verifica (auth.uid(), auth.role()).
--
-- postgis: para los ciclos de capas geoespaciales (Ciclo 4 en adelante).
--   Se declara desde ahora para no tener que reconstruir esta imagen mas
--   adelante. Si CREATE EXTENSION postgis fallara en la primera corrida
--   real, el ajuste es instalar el paquete
--   correspondiente en db/Dockerfile antes de este paso -- no afecta nada
--   de lo demas.
create extension if not exists pgcrypto;
create extension if not exists postgis;
