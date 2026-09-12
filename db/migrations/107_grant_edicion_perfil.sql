-- Amplia el GRANT de UPDATE sobre api.perfil.
--
-- 103_schema_api.sql solo daba `grant update (dependencia, activo) on
-- api.perfil` -- suficiente mientras no existia ninguna pantalla de front
-- para editar perfiles. Ahora que se construye la pantalla de "Gestion de
-- usuarios" (Ciclo 1, paso 9), administrador/administrador_vip tambien
-- necesitan poder cambiar el ROL de una cuenta existente (y, aunque hoy no
-- se usa desde el front porque el manejo es solo estatal, se deja tambien
-- ambito/cve_mun por consistencia con lo que YA permitia
-- 102_rls_perfil.sql a nivel de core.perfil).
--
-- Esto NO abre ningun permiso nuevo de negocio: quien puede editar sigue
-- siendo exactamente lo mismo (administrador/administrador_vip, via la
-- policy perfil_update_administracion de 102_rls_perfil.sql) -- este GRANT
-- solo decide QUE COLUMNAS se pueden intentar tocar a traves de la vista
-- api.perfil; la policy sigue decidiendo QUIEN y SOBRE QUE FILAS.

grant update (rol, ambito, cve_mun, dependencia, activo) on api.perfil to authenticated;
