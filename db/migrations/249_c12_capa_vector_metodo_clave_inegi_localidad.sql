-- Ciclo 12 · core.capa_vector.metodo_cve_mun acepta 'clave_inegi_localidad'.
-- PARA REVISIÓN DE ROCÍO. NO está aplicada. Autorizada su redacción el 2026-11-23 («Apruebo ampliar la restricción de la base»).
--
-- Por qué: el paquete SESIM_dataset_FINAL_ trae 6 elementos cuyo municipio se asignó por la clave INEGI de su localidad
-- (metodo_cve_mun = 'clave_inegi_localidad'). La restricción actual solo admite interseccion, proximidad<=1000m,
-- proximidad_aguas_estatales y fuera_de_campeche, así que la carga completa fallaría en esos 6 elementos.
-- Qué cambia: solo la lista de valores permitidos de UNA restricción CHECK (se agrega un valor; ninguno se quita).
-- Qué no cambia: columnas, tipos, llaves, políticas RLS ni datos. No es un cambio de tablas del DER, es una regla de dominio
-- (aun así, quedó aprobada por la responsable antes de redactarse).
-- Seguridad: todas las filas actuales cumplen la lista nueva (es una ampliación), por eso no hay riesgo de que falle al aplicarse.
-- Reversión: reversiones/249_revertir_capa_vector_metodo_clave_inegi_localidad.sql (solo sirve si ningún elemento usa el valor nuevo).

alter table core.capa_vector drop constraint if exists capa_vector_metodo_cve_mun_check;
alter table core.capa_vector add constraint capa_vector_metodo_cve_mun_check
  check (metodo_cve_mun = any (array['interseccion', 'proximidad<=1000m', 'proximidad_aguas_estatales', 'fuera_de_campeche', 'clave_inegi_localidad']));
