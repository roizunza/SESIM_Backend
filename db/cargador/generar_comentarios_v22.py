#!/usr/bin/env python3
"""Genera la migracion 209 (COMENTARIOS del modelo v2.2).
Entrada: comentarios_diccionario.json (lo deja generar_migraciones_v22.py desde la hoja `diccionario`
del Interno) + las descripciones manuales de abajo (tablas y campos que el Excel no trae).
Salida: ../migrations/209_comentarios_modelo_v22.sql  -- solo escribe donde el objeto existe y
aun no tiene comentario, asi que es seguro en cualquier orden y no pisa lo que ya hay.
"""
import json, os
aqui = os.path.dirname(os.path.abspath(__file__))
auto = json.load(open(os.path.join(aqui, "comentarios_diccionario.json"), encoding="utf8"))

TABLAS = {
 "unidad_territorial": "Municipios (13) y localidades (2,772) de Campeche con su CVEGEO de INEGI y poblacion. Llave del territorio para mediciones, capas e instrumentos municipales.",
 "unidad_territorial_geom": "Poligono de cada unidad territorial (relacion 1 a 0..1). Se carga en el Ciclo 9 desde los GeoJSON oficiales.",
 "eje_tematico": "Los 5 ejes estrategicos de la EEMSV que clasifican a los indicadores.",
 "sector": "Sector tematico o administrativo de un indicador: definitivo (SD-xx) u original (SO-xx).",
 "fuente_informacion": "Fuente oficial del dato de un indicador (INEGI, ATUS, CONEVAL, SICT...).",
 "instrumento_origen": "Ley, plan o estrategia de donde nace un indicador: la EEMSV (estatal) y los PIMUS municipales.",
 "matriz_instrumento": "Renglon de la matriz de indicadores de un PIMUS: objetivo, meta e indicador tal como lo nombra el plan.",
 "indicador": "Ficha tecnica MIR-SMART de cada indicador del sistema. Solo los aprobados (que pasan la compuerta) admiten mediciones.",
 "indicador_eje": "Tabla puente indicador-eje: todos los ejes que atiende un indicador; el principal coincide con indicador.id_eje.",
 "indicador_instrumento": "Vinculo muchos-a-muchos entre indicadores e instrumentos: origen (nace en el instrumento), directa (mide lo mismo) o parcial.",
 "umbral_semaforo": "Umbrales del semaforo (verde, amarillo) versionados por vigencia; id_indicador nulo = umbral global.",
 "periodo": "Corte de tiempo de una medicion (anio y etiqueta). Los tipos y fechas los llena el equipo (OBS-21).",
 "medicion_indicador": "Valor medido de un indicador en una unidad territorial y un periodo, con su estado dentro del flujo captura-revision-validacion-publicacion y la firma de quien captura y quien valida.",
 "evidencia_medicion": "Medio de verificacion de una medicion: archivo con huella SHA-256. Se exige al menos uno para validar (R12).",
 "capa": "Capa tematica del visor: sus metadatos ISO, estatus de publicacion y vinculo con el instrumento de origen.",
 "capa_indicador": "Vinculo capa-indicador: que capas ayudan a leer cada indicador.",
 "capa_vector": "Elemento geografico individual de una capa (punto, linea o poligono) con sus atributos tematicos en `propiedades`. Se carga en el Ciclo 9.",
 "capa_version": "Historial de versiones de la ficha de metadatos de cada capa; la vigente es la mayor.",
 "bitacora_cambio": "Bitacora general de cambios del sistema. Solo insercion: no admite UPDATE, DELETE ni TRUNCATE. Equivale a la tabla `bitacora` del documento v2.2.",
 "dictamen": "Constancia de cada decision de revision (validar, rechazar, publicar) sobre una medicion, capa o indicador.",
 "hallazgo_auditoria": "Observacion del Auditor sobre una medicion, con severidad y seguimiento hasta su cierre.",
 "invitacion": "Invitacion de alta con token de un solo uso (solo su hash). Mecanismo latente: la decision vigente es el alta directa por el Administrador Titular.",
 "bitacora": "Bitacora de cuentas (Ciclo 1): altas, cambios de rol, de ambito, bajas y reactivaciones sobre core.perfil.",
 "perfil": "Cuenta de la plataforma: rol, ambito y dependencia de cada persona, ligada 1 a 1 con auth.users. Equivale a `usuario` + `perfil` del documento v2.2.",
 "schema_migraciones": "Control de migraciones aplicadas (nombre, sha256, origen y fecha). Lo mantiene scripts/migrar.sh.",
}
CAMPOS = {
 "bitacora": {"id":"Identificador del evento de cuenta.","actor_id_usuario":"Cuenta que hizo el cambio (nulo en procesos de sistema).","actor_rol":"Rol de quien hizo el cambio al momento del evento.","objetivo_id_usuario":"Cuenta afectada por el cambio.","objetivo_rol":"Rol de la cuenta afectada al momento del evento (fotografia, no referencia viva).","accion":"alta | cambio_rol | cambio_ambito | baja | reactivacion.","detalle":"Datos del cambio en JSON (rol anterior y nuevo, etc.).","creado_en":"Momento del evento."},
 "perfil": {"id":"Identificador del perfil.","id_usuario":"Cuenta de Supabase (auth.users.id) a la que pertenece; es el id de usuario del sistema.","nombre":"Nombre completo de la persona.","rol":"capturista | administrador | administrador_titular | auditor.","ambito":"estatal | municipal. Hoy siempre estatal; el municipal es semilla latente.","cve_mun":"Municipio de la cuenta si el ambito fuera municipal; hoy nulo.","dependencia":"Area o dependencia institucional (catalogo pendiente).","activo":"Baja logica: false = cuenta dada de baja (se conserva su historial).","creado_en":"Fecha de alta."},
 "schema_migraciones": {"nombre":"Archivo de migracion aplicado.","sha256":"Huella del archivo al aplicarse; si cambia despues, el runner aborta.","origen":"initdb | runner | adoptada.","aplicada_en":"Momento de aplicacion."},
 "capa": {"metadatos_extra":"Metadatos ISO de la capa en JSON: custodio, contacto, fuente, linaje, escala, sistema de coordenadas, fecha de corte, periodicidad, restriccion de uso. Para publicar se exigen custodio, fuente_origen, linaje y sistema_coordenadas.","created_at":"Alta del registro.","updated_at":"Ultima modificacion."},
 "capa_vector": {"propiedades":"Atributos tematicos del elemento en JSON (jerarquia, sentido, siniestros, indices...); varian por capa."},
 "capa_version": {"id":"Identificador de la version.","id_capa":"Capa versionada.","version":"Numero de version (1 = carga oficial inicial).","estatus":"Estatus de la capa en esa version.","metadatos":"Fotografia de los metadatos en esa version.","id_usuario":"Quien genero la version (nulo en cargas de sistema).","nota":"Motivo del cambio.","created_at":"Momento de la version."},
 "dictamen": {"id":"Identificador del dictamen.","objeto_tipo":"medicion | capa | indicador.","objeto_id":"Llave del objeto dictaminado, como texto.","decision":"validar | rechazar | publicar.","estado_previo":"Estado antes de la decision.","estado_nuevo":"Estado despues de la decision.","comentario":"Motivo; obligatorio al rechazar.","id_usuario":"Administrador que dictamina.","fecha":"Momento del dictamen."},
 "hallazgo_auditoria": {"id":"Identificador del hallazgo.","id_medicion":"Medicion observada.","id_auditor":"Auditor que lo levanta.","descripcion":"Que se observa.","severidad":"baja | media | alta.","estado":"abierto | atendido | cerrado.","respuesta":"Respuesta de la administracion.","fecha":"Momento del hallazgo.","fecha_cierre":"Fecha de cierre; obligatoria si esta cerrado."},
 "indicador": {"responsable":"Responsable o competente del dato del indicador (D-03: pendiente de captura por indicador)."},
 "indicador_eje": {"id_indicador":"Indicador.","id_eje":"Eje que atiende.","principal":"true en el eje principal (uno por indicador, igual a indicador.id_eje)."},
 "invitacion": {"rol":"Rol que tendra la cuenta invitada."},
 "umbral_semaforo": {"id":"Identificador del umbral.","id_indicador":"Indicador al que aplica; nulo = umbral global.","verde_desde":"Porcentaje de cumplimiento desde el cual es verde (90).","amarillo_desde":"Porcentaje desde el cual es amarillo (70); por debajo es rojo.","vigente_desde":"Inicio de vigencia.","vigente_hasta":"Fin de vigencia; nulo = vigente.","id_usuario":"Quien lo definio.","created_at":"Alta del registro."},
}
for t, cs in CAMPOS.items():
    auto.setdefault(t, {}).update({k: v for k, v in cs.items() if k not in auto.get(t, {})})
for t, cs in auto.items():  # las descripciones manuales de CAMPOS ganan donde el Excel no trae el campo
    pass

carga = {"tablas": TABLAS, "campos": auto}
js = json.dumps(carga, ensure_ascii=False)
assert "$j$" not in js
sql = f"""-- GENERADO por db/cargador/generar_comentarios_v22.py (diccionario del Interno + descripciones manuales).
-- Ciclo 3 -- Paso 2: COMMENT en toda tabla y campo de core. api.diccionario se lee de aqui.
-- Solo escribe donde el objeto existe y aun no tiene comentario.
do $c$
declare
  j jsonb := $j${js}$j$::jsonb;
  t text; c text; d text;
begin
  for t, d in select key, value from jsonb_each_text(j->'tablas') loop
    if to_regclass('core.' || t) is not null and obj_description(to_regclass('core.' || t), 'pg_class') is null then
      execute format('comment on table core.%I is %L', t, d);
    end if;
  end loop;
  for t in select key from jsonb_each(j->'campos') loop
    if to_regclass('core.' || t) is null then continue; end if;
    for c, d in select key, value from jsonb_each_text(j->'campos'->t) loop
      if exists (select 1 from pg_attribute a where a.attrelid = to_regclass('core.' || t) and a.attname = c
                    and a.attnum > 0 and not a.attisdropped)
         and col_description(to_regclass('core.' || t), (select attnum from pg_attribute where attrelid = to_regclass('core.' || t) and attname = c)) is null then
        execute format('comment on column core.%I.%I is %L', t, c, d);
      end if;
    end loop;
  end loop;
end $c$;
"""
open(os.path.join(aqui, "..", "migrations", "209_comentarios_modelo_v22.sql"), "w", encoding="utf8").write(sql)
print("209 escrita:", sum(len(v) for v in auto.values()), "campos,", len(TABLAS), "tablas")
