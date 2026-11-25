-- REVERSIÓN de la migración 249 (NO se aplica sola; no está en db/migrations).
-- Quita 'clave_inegi_localidad' de la lista de metodo_cve_mun. FALLA si ya hay elementos con ese valor
-- (después de cargar el paquete hay 6): en ese caso hay que decidir primero qué valor llevan.
-- Antes de revertir, revise:  select id_capa, id_origen from core.capa_vector where metodo_cve_mun = 'clave_inegi_localidad';

alter table core.capa_vector drop constraint if exists capa_vector_metodo_cve_mun_check;
alter table core.capa_vector add constraint capa_vector_metodo_cve_mun_check
  check (metodo_cve_mun = any (array['interseccion', 'proximidad<=1000m', 'proximidad_aguas_estatales', 'fuera_de_campeche']));
