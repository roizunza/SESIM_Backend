# Mapa de cambios para actualizar los Excel de trabajo (Interno y Externo)

Registro vivo: cada cambio que hacemos en el backend o el front y que le toca a un Excel se agrega aquí. Los originales `SESIM_Interno.xlsx` y `SESIM_Externo.xlsx` están intactos. Existe `SESIM_Interno_v2.3.xlsx` (solo I-6, diccionario). Cuando lo autorices, aplico todo a copias versionadas (por ejemplo `SESIM_Interno_v2.3.xlsx`) y dejo los originales como están.

Última actualización: 28-oct-2026 (Ciclo 3, migraciones 213 a 216).

## Las 9 capas de uso interno (`vigente_admin`)

Todas con metadato mínimo completo y restricción de uso "interna". En el Excel están en la hoja `capa`, columna `metadatos_uso` = `interna`.

| id | Título | Categoría | Geometría | Elementos | Responsable |
|---|---|---|---|---|---|
| DIt01 | Tren Maya (trazo Diagnóstico) | Diagnóstico | Línea | 171 | Tren Maya |
| DIt02 | Ciclovías de Campeche | Diagnóstico | Línea | 53 | INEGI |
| DIt03 | Estaciones del Tren Maya | Diagnóstico | Punto | 11 | SEDATU |
| DIt04 | Estado y calidad de la red urbana | Diagnóstico | Línea | 57,842 | INEGI |
| DTc03 | Equipamiento comercial al por mayor | Diagnóstico | Punto | 1,599 | INEGI |
| DTc04 | Empresas de carga | Diagnóstico | Punto | 288 | INEGI |
| DTp01 | Grado de accesibilidad de las localidades a la carretera pavimentada | Diagnóstico | Punto | 2,762 | CONEVAL |
| DTp02 | Estrategia. Modernización del Transporte Público | Diagnóstico | Punto | 115 | INEGI |
| Nat03 | Área Boscosa | Mapa Base | Polígono | 552 | INEGI |

Suman 63,393 elementos en `capa_vector`. Ninguna está vinculada a un indicador en `capa_indicador`.

## Cambios que le tocan al Interno

| # | Hoja | Cambio | Origen | Estado |
|---|---|---|---|---|
| I-1 | `capa` | Agregar la columna `estatus` con la regla D-17: 66 `vigente_publico`, 9 `vigente_admin`, 12 `borrador`. Hoy la hoja no la trae; el backend la deriva de `metadatos_uso` y del metadato completo. | Migración 216 | Listo para aplicar |
| I-2 | `capa` | Agregar `proposito`, `srid_origen` e `id_instrumento` (el backend los deriva; la hoja no los trae). Observación ya reportada en el Ciclo 3. | Ciclo 3 | Documentado en `pendientes_captura.md`; NO aplicado al Excel (tu instrucción del 28-oct) |
| I-3 | `instrumento_origen` | Agregar la columna `publicado` (los 6 en `TRUE`) y `publicado_en`. Solo el Titular la cambia. | Migración 214 (D-16) | Listo para aplicar |
| I-4 | `indicador` | Siete indicadores sin `tendencia` ni `valor_meta`: filas 20, 21, 22, 43, 44, 45 y 56 (Ee07, Ee08, Ee09, Ee30, Ee31, Ee32, Ga01). Quedan con `estatus_aprobado` en `FALSE` en la base. | D-18 | Esperando tu decisión |
| I-5 | `diccionario` | Agregar los campos nuevos: `instrumento_origen.publicado`, `publicado_en` y la descripción actualizada de `capa.estatus`. | 209, 214, 216 | Listo para aplicar |
| I-6 | `diccionario` y `relaciones` | La hoja describe 19 tablas; el backend tiene 24. Faltan `indicador_eje`, `umbral_semaforo`, `dictamen`, `hallazgo_auditoria` y `capa_version`. | D-04, D-05, D-06, D-16 | HECHO en `SESIM_Interno_v2.3.xlsx` (diccionario filas 165–201, 5 tablas; falta la pestaña `relaciones`, que no se tocó) |
| I-7 | `funciones` | Agregar `core.exigir_titular()` (D-16) y las vistas `api.mi_perfil`, `api.medicion_publica` y `api.umbral_publico`. | 127, 214, 215 | Listo para aplicar |
| I-8 | `Resumen` | Actualizar conteos de `capa` por estatus y mencionar las migraciones 200 a 216. | Todos | Listo para aplicar |

## Cambios que le tocan al Externo

El Externo es la versión de lectura pública, así que debe seguir la misma regla que el rol `anon`. Hoy trae **las 87 capas y los 490,224 elementos**, incluidas las que ya no son públicas.

| # | Hoja | Cambio | Origen | Estado |
|---|---|---|---|---|
| E-1 | `capa` | Quitar las 21 capas que no son públicas: las 9 internas (arriba) y las 12 en borrador (DTts01, Inf01, Inf04, Inf05, Inf06, Inf12, Inf13, Inf14, Inf15, Lim01, Lim05, Loc05). Quedan 66 filas. | D-17 | Requiere tu autorización explícita |
| E-2 | `capa_vector` | Quitar 107,802 filas: 63,393 de las capas internas y 44,409 de las capas en borrador. Quedan 382,422 de 490,224. | D-17 | Requiere tu autorización explícita |
| E-3 | `cruce_capa_municipio` | Quitar las filas de esas 21 capas. | D-17 | Requiere tu autorización explícita |
| E-4 | `capa_indicador` | Sin cambio: ninguna de las 21 capas tiene vínculos. Se mantienen las 1,030 filas. | D-17 | Verificado |
| E-5 | `instrumento_origen` | Agregar `publicado` y dejar solo los instrumentos publicados (hoy los 6). | D-16 | Requiere tu autorización explícita |
| E-6 | `indicador` | Decidir si el Externo muestra los 113 o solo los aprobados (el rol `anon` hoy ve 2). | D-14 y D-18 | Esperando tu decisión |
| E-7 | `diccionario`, `funciones`, `Resumen` | Mismos ajustes documentales que I-5, I-7 e I-8, sin las tablas de personas. | 214 a 216 | Requiere tu autorización explícita |

Nota de seguridad: mientras no se aplique E-1 y E-2, el Externo sigue distribuyendo las capas internas.

## Cambios que NO tocan los Excel

Migración 213 (índices de bitácora), migración 127 (`api.mi_perfil`, solo el login del front), la lectura pública del rol `anon` (se refleja en E-1 a E-6) y el login real del front.

## Cómo seguimos

Cada vez que cerremos algo (indicadores D-18, el CRUD del Ciclo 4, etc.) agrego sus filas a esta tabla. Cuando me digas, genero `SESIM_Interno_v2.3.xlsx` con I-1, I-3, I-5, I-7 e I-8 y, si lo autorizas, `SESIM_Externo_v2.3.xlsx` con E-1 a E-7, siempre como copias nuevas.
