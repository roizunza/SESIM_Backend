# Modelo de datos v2.2 en el backend (Ciclo 3, TDR 6.2.2 b)

Fuente: `Arquitectura_Datos_SESIM.docx` v2.2 y `SESIM_Interno.xlsx`. Todo vive en el esquema `core`
(nucleo, sin exposicion directa) y se lee por `api.*` (vistas `security_invoker`: la RLS decide).

## Migraciones

| Archivo | Que hace |
|---|---|
| 200 | Aparta el modelo anterior (110-119) al esquema `legado`; sin acceso desde la API |
| 201-206 | Las tablas: territorio, catalogos macro, indicador, medicion, capas, trazabilidad |
| 207 | RLS y permisos (lectura por perfil; nadie escribe directo) |
| 208 | Vistas `api.*`, `api.diccionario`, `api.relaciones`, `core.verificar_integridad()` |
| 209 | COMMENT de toda tabla y campo (generado: `db/cargador/generar_comentarios_v22.py`) |
| 210-212 | Carga oficial (generada desde el Interno: `db/cargador/generar_migraciones_v22.py`) |
| 213 | Indices de `core.bitacora_cambio` (actor+fecha, fecha) pedidos por los Alcances |
| 214 | D-16: `instrumento_origen.publicado` y trigger `core.exigir_titular()` (umbrales y publicar instrumentos: solo Administrador Titular) |
| 215 | Lectura publica: el rol `anon` lee lo publico (dashboard sin cuenta) y nada de personas ni del proceso |
| 216 | D-17: estatus de capas (vigente_admin para las internas), compuertas y visibilidad de capas por perfil |

Las migraciones 110-119 no se editan (el runner compara su huella); 200 las supera.

## Tablas (24 del modelo + control de migraciones)

Equivalencia con el documento v2.2: `usuario` y `perfil` = `auth.users` + `core.perfil` (Ciclo 1; el rol es un
CHECK, no un catalogo aparte); `bitacora` = `core.bitacora_cambio` (general, solo insercion) y `core.bitacora`
sigue siendo la de cuentas. Las llaves de usuario apuntan a `core.perfil(id_usuario)` = `auth.users.id`.
`invitacion` usa `rol` (texto) en lugar de `id_perfil`.

Agregadas a las 19 del documento (decisiones D-04/D-05/D-06/D-16): `indicador_eje`, `umbral_semaforo`,
`dictamen`, `hallazgo_auditoria`, `capa_version`.

## Reglas que ya viven en la base

- **Compuerta de aprobacion:** un indicador no se aprueba sin tendencia o meta con cifra (CHECK).
- **Solo se captura sobre indicadores aprobados y activos** (trigger).
- **Cuatro ojos:** quien captura no valida; sin firma y fecha de validacion no hay estado vigente (CHECK).
- **Evidencia:** huella SHA-256 de 64 hex, unica (CHECK + UNIQUE). La regla "validar exige >=1 evidencia" se aplica en
  la funcion de transicion (Ciclo 8) y la vigila `core.verificar_integridad()`.
- **Rechazar exige comentario** (CHECK en `dictamen`).
- **Publicar una capa** exige custodio, fuente, linaje y sistema de coordenadas (CHECK).
- **Bitacora general solo insercion:** UPDATE, DELETE y TRUNCATE bloqueados por trigger, incluso al dueno.
- **Lectura por perfil:** Auditor todo; Administrador/Titular todo menos borradores ajenos; Capturista lo suyo mas lo
  publico; cuenta dada de baja no lee nada. **Escritura:** ningun perfil escribe directo; llega por funciones `api.*`
  (Ciclo 4 catalogos, Ciclo 8 flujo).

## Carga oficial

Ver `docs/carga-v22-reporte.md`. Resumen: 5 ejes, 31 sectores, 17 fuentes, 2,785 unidades territoriales, 6 instrumentos,
135 renglones de matriz, 113 indicadores (127 vinculos de eje, 205 de instrumento), 87 capas (66 publicas, 21 borrador) y
1,030 vinculos capa-indicador. No se inventa ningun dato: cada regla de transformacion esta en el generador.
Pendiente del Ciclo 9: 490,224 elementos geograficos y las geometrias.

## Como verificar

```bash
./scripts/migrar.sh                 # aplica 200-216 (en una base existente: --adoptar-hasta 126 la primera vez)
./scripts/pruebas-ciclo3.sh         # 64 casos reales + chequeos de integridad
```

Documentacion viva: `select * from api.diccionario;` y `select * from api.relaciones;`.

## Cambios al Interno / Externo

Ninguno: el Interno se leyo, no se modifico, y el Externo no se toco. Observaciones para decidir (no aplicadas):
la hoja `capa` del Interno no trae `proposito`, `srid_origen`, `estatus`, `id_instrumento` ni `geojson` (se derivaron:
srid de la cadena de coordenadas, instrumento Eemsv01 en capas de Diagnostico y Estrategia, estatus por restriccion de
uso); los ejes adicionales de 14 indicadores solo existen en `qa_nota_transformacion`, no en una hoja `indicador_eje`; el
Interno no trae `responsable` por indicador.


## Lectura publica (rol `anon`, migracion 215) y D-16 (migracion 214)

El ciudadano sin cuenta ve el dashboard publico; la seccion operativa es otro portal con login.

| Objeto | Que lee `anon` |
|---|---|
| Territorio, ejes, sectores, fuentes, periodos | Todo |
| Instrumentos y su matriz | Solo los `publicado` y `activo` (D-16) |
| Indicadores (+ ejes, instrumentos) | Solo `estatus_aprobado` y `activo` |
| Umbrales | `api.umbral_publico` (sin `id_usuario`) |
| Mediciones | `api.medicion_publica`: solo `vigente_publico`, sin capturista ni validador |
| Capas, capa-indicador, elementos | Solo capas `vigente_publico` y activas |
| Perfil, bitacora, invitacion, evidencia, dictamen, hallazgo, versiones de capa, diccionario, borradores | Nada |

`anon` nunca escribe. Para abrir todos los indicadores al publico basta cambiar la politica `indicador_select_publico`.

D-16: con sesion, solo el Administrador Titular puede crear, editar o borrar umbrales y publicar o despublicar un instrumento.
Lo impone el trigger `core.exigir_titular()` (42501), que se evalua con `auth.uid()` y por eso tambien frena a las funciones
SECURITY DEFINER del Ciclo 4. Sin sesion (migraciones, servicio de procesos) no se interpone.


## Estatus de capas (D-17, migracion 216)

Dos ejes: **estatus** (borrador, revision, vigente_admin, vigente_publico) y **restriccion de uso** (publica, interna, reservada).

| Condicion | Estatus | Capas |
|---|---|---|
| Metadato minimo completo y restriccion publica | `vigente_publico` | 66 |
| Metadato minimo completo y restriccion interna | `vigente_admin` (solo uso interno) | 9 |
| Falta metadato minimo (linaje, etc.) | `borrador` | 12 |

Visibilidad: ciudadano (`anon`) 66; Capturista 75 (publicas + uso interno); Administrador, Titular y Auditor 87.
Compuertas: `vigente_publico` exige ademas restriccion publica; `vigente_admin` y `vigente_publico` exigen el metadato minimo.
Las 9 capas movidas dejan su version 2 en `capa_version`. El catalogo estatico del front se regenera con
`python3 scripts/datos/03_aplicar_estatus_d17.py` (misma regla; verificado contra la base).
