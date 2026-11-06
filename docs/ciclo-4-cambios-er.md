# SESIM · Cambios al entidad-relación en el Ciclo 4

**Corte:** 28-oct-2026 · Anexo del Informe técnico del Ciclo 4 · Migraciones `219_c4_er_instrumento_estatus_dictamen.sql` y `225_c4_er4_plazo_rechazos.sql`

Regla de trabajo acordada: solo se tocan las piezas autorizadas (ER-1, ER-2, ER-3 y, desde el 28-oct, ER-4), cada una anotada y justificada aquí, y cualquier otro cambio al ER se consulta antes. Este documento también lista lo que **no** se cambió aunque el documento v2.2 lo sugería, para que decidas tú.

## 1. Resumen

| Clave | Cambio | Decisión | Estado |
|---|---|---|---|
| ER-1 | `core.instrumento_origen` + `estatus` + `ruta_pdf` | D-20 | Aplicado (219) |
| ER-2 | `core.dictamen.objeto_tipo` admite `'instrumento'` | Consecuencia de D-20 | Aplicado (219) |
| ER-3 | `core.capa_version` **no** se replica para instrumentos | Sin cambio al ER | Decidido |
| ER-4 | Dos tablas nuevas: `core.rechazo_seguimiento` y `core.dia_inhabil` | Plazo en días hábiles y decisión de quien envió (autorizado por Ismael el 28-oct) | Aplicado (225) |

ER-1 a ER-3: ninguna tabla nueva, ninguna columna eliminada; dos columnas agregadas y un CHECK ampliado. ER-4: **dos tablas nuevas** (sin tocar las existentes) y ninguna columna eliminada.

## 2. ER-1 · `instrumento_origen`: `estatus` y `ruta_pdf` (D-20)

**Qué cambia.**

| Columna | Tipo | Regla |
|---|---|---|
| `estatus` | texto, no nulo, por omisión `borrador` | CHECK `instrumento_estatus_valido`: `borrador`, `revision`, `vigente_admin`, `vigente_publico` |
| `ruta_pdf` | texto, nulo | CHECK `instrumento_ruta_pdf_no_vacia`: si existe, no está vacía |

Además, el CHECK `instrumento_publicado_es_estatus` obliga a que `publicado = (estatus = 'vigente_publico')`, y el disparador `trg_instrumento_a_sincronizar` mantiene ambas columnas en sincronía en cualquiera de los dos sentidos.

**Por qué.** La regla de negocio que autorizaste dice que el Administrador sube el instrumento y este pasa por revisión antes de publicarse. Hasta el Ciclo 3 el instrumento solo tenía `publicado` (D-16), es decir, dos estados: no existe en la vista pública o sí existe. No había dónde guardar «en revisión», ni dónde registrar el PDF que respalda el instrumento. Sin `estatus` no hay revisión; sin `ruta_pdf` no hay qué revisar.

**Por qué esta forma y no otra (fidelidad al ER).**

1. **Mismo ciclo de vida que la capa.** Se reutilizan los cuatro estados de `capa.estatus` (D-17), con los mismos nombres y la misma máquina. No se inventa un vocabulario nuevo.
2. **`publicado` se conserva y queda derivada.** Las políticas del rol `anon` (migración 215), la vista pública y el candado D-16 siguen leyendo `publicado`. Nada de lo anterior cambia de significado; solo se garantiza que `publicado` no pueda contradecir al estatus.
3. **D-16 intacta.** Publicar o despublicar sigue siendo exclusivo del Administrador Titular. El disparador de sincronía se llama `trg_instrumento_a_sincronizar` para disparar *antes* que `trg_instrumento_publicar_*`: así el candado D-16 ve el valor final de `publicado` y exige al Titular también cuando el cambio llega por `estatus`.
4. **`ruta_pdf` es una ruta, no un binario.** El archivo vive en el almacenamiento de archivos; la base solo guarda la referencia (igual que `capa.archivo`).

**Datos existentes.** Los 6 instrumentos oficiales que ya estaban publicados pasan a `vigente_publico`. La auditoría se pausó solo durante ese ajuste de carga para que no aparezca en la bitácora como si lo hubiera hecho una persona.

**Impacto en lo ya construido.**

- Vista `api.instrumento_origen`: recreada para incluir las dos columnas (usaba `select *`).
- Política de lectura: se reemplaza `instrumento_origen_select_activos` por `instrumento_origen_select_por_rol`. Administrador, Titular y Auditor ven todos los estados; el Capturista solo `vigente_admin` y `vigente_publico` (no necesita ver borradores de la administración); el ciudadano sigue viendo solo lo publicado (política 215, sin cambio).
- Se ajustan `matriz_instrumento_select_por_instrumento` e `indicador_instrumento_select_por_instrumento`: heredan la visibilidad del instrumento al que pertenecen, para que un borrador no filtre su matriz.
- `api.diccionario` y `api.relaciones` se alimentan solos de los `COMMENT` (agregados).

**Cómo revertir.** Quitar los tres objetos (`trg_instrumento_a_sincronizar`, `instrumento_publicado_es_estatus`, columnas `estatus` y `ruta_pdf`) y restablecer la política `instrumento_origen_select_activos`. `publicado` no se pierde, por lo que el regreso no destruye información de publicación.

## 3. ER-2 · `dictamen.objeto_tipo` admite `'instrumento'`

**Qué cambia.** El CHECK `dictamen_objeto_tipo_check` pasa de `('medicion','capa','indicador')` a `('medicion','capa','indicador','instrumento')`.

**Por qué.** El dictamen de un instrumento (validar, publicar, rechazar con motivo) tiene la misma forma que el de una capa o una medición: quién, cuándo, de qué estado a cuál, comentario. `core.dictamen` ya es la tabla polimórfica para eso (`objeto_tipo` + `objeto_id`). Crear `dictamen_instrumento` habría duplicado la tabla y la lógica de «rechazar exige comentario».

**Impacto.** `api.bitacora_operativa` une el motivo del dictamen por `objeto_tipo` (capa o instrumento). Ninguna llave ni política cambia.

**Cómo revertir.** Restablecer el CHECK de tres valores (previamente borrando las filas con `objeto_tipo = 'instrumento'` o conservándolas en un respaldo).

## 4. ER-3 · Sin cambio: `capa_version` no se replica

El documento v2.2 define `capa_version` para el historial de versiones de la capa (metadatos por versión). Se evaluó crear su equivalente para instrumentos y **se decidió no hacerlo**:

- `core.bitacora_cambio` (Ciclo 5) ya guarda foto previa y nueva de cada INSERT, UPDATE y CAMBIO_ESTADO del instrumento, solo-inserción, con el usuario y la IP. Es un historial completo y más fuerte (no se puede editar).
- Un instrumento tiene pocos campos propios (clave, nombre, ámbito, competencia, vigencia, PDF); una tabla de versiones no aportaría nada que la bitácora no tenga.
- Evita sumar una tabla al ER sin necesidad.

Si el equipo quiere un historial de versiones formal del PDF (por ejemplo, para publicar una reforma del mismo instrumento), eso es una decisión nueva y se consulta.

## 4 bis. ER-4 · Seguimiento y plazo de los rechazos

**Qué cambia.** Dos tablas nuevas; no se modifica ninguna tabla existente.

| Tabla | Para qué | Columnas |
|---|---|---|
| `core.rechazo_seguimiento` | Una fila por cada dictamen de **rechazo** de capa o instrumento: a quién le toca decidir, hasta cuándo y qué decidió | `id_dictamen` (llave y FK a `dictamen`), `objeto_tipo` (capa o instrumento), `objeto_id`, `id_destinatario` (FK a `perfil`), `fecha_limite`, `estado` (`pendiente`, `retomada`, `atendida`, `descartada`, `vencida`), `decidido_en`, `decidido_por`, `created_at` |
| `core.dia_inhabil` | Días no laborables oficiales, además de sábado y domingo, para contar el plazo | `fecha` (llave), `descripcion`, `created_at` |

**Por qué.** La regla de negocio que autorizaste: quien envió algo y se lo rechazan debe tener esos rechazos como lista propia, decidir si los retoma o los quita de su lista, y tener un plazo en días hábiles. Eso es información nueva con su propio ciclo de vida (pendiente → retomada → atendida, o descartada, o vencida) que **no cabe** en `dictamen` (el dictamen es un hecho inmutable de la administración; la decisión del capturista es otro hecho, de otra persona y en otro momento) ni en el estatus de la capa (la capa sigue en `borrador`; lo que cambia es el estado del *rechazo*, no el de la capa).

**Por qué esta forma y no otra (fidelidad al ER).**

1. **Una fila por dictamen, con el dictamen como llave.** Cada rechazo tiene exactamente un seguimiento; la relación es 1 a 1 con un hecho que ya existe. No se duplica el motivo: se lee del dictamen.
2. **Polimórfica igual que `dictamen`** (`objeto_tipo` + `objeto_id`), para servir a capas e instrumentos y, más adelante, a mediciones.
3. **Nada se borra.** Quitar de la lista, vencer y reabrir son cambios de estado; el rechazo y su historia permanecen y todo queda en `bitacora_cambio`.
4. **Disparadores en vez de tocar las funciones de los ciclos aprobados.** El seguimiento nace con un disparador sobre `dictamen`, y el cierre y el bloqueo de reenvío con disparadores sobre `capa` e `instrumento_origen`; así las funciones de las migraciones 222 y 223 no se modificaron.
5. **Plazo vigente por regla de negocio, no por `CHECK`:** `core.plazo_rechazo_dias()` devuelve 10; cambiarlo es una línea.
6. **Vencimiento sin tarea programada:** se evalúa al consultar, decidir y reenviar (`core.vencer_rechazos()`); no depende de `pg_cron`.

**Seguridad.** Ambas tablas con RLS y sin permisos directos para `anon` ni `authenticated`; `rechazo_seguimiento` se lee solo por `api.fn_pendientes_rechazo` (definer: el Capturista ve los suyos, la administración y el Auditor todos); `dia_inhabil` se lee por la vista `api.dia_inhabil` (todos los perfiles) y se escribe solo por funciones del Titular. Ambas tienen disparador de auditoría.

**Impacto.** Sube de 25 a 27 el número de tablas de `core`; se ajustó la prueba C38 del Ciclo 3 (conteo de tablas) y A03 del Ciclo 4 (disparadores). Sin efecto sobre `api.diccionario`: las nuevas tablas traen `COMMENT` en todas sus columnas. El calendario empieza **vacío**.

**Cómo revertir.** Quitar los disparadores `trg_dictamen_seguimiento`, `trg_capa_seguimiento` y `trg_instrumento_seguimiento`, las funciones nuevas y las dos tablas. No se pierde ningún dictamen ni cambio de estado de capas o instrumentos.

## 5. Cambios que **no** son al ER pero conviene dejar anotados

Se listan porque tocan la base aunque no cambien el modelo de entidades.

| Qué | Dónde | Por qué |
|---|---|---|
| Disparadores de auditoría en 8 tablas más | 220 | Que cada escritura del CRUD quede en `bitacora_cambio` (Ciclo 5): `eje_tematico`, `sector`, `fuente_informacion`, `matriz_instrumento`, `indicador_instrumento`, `indicador_eje`, `capa_indicador`, `invitacion` |
| `core.fn_auditar_cambio()` generalizada | 220 | Admite llaves compuestas (`indicador_eje`, `capa_indicador`) y columnas enmascaradas (la huella del token de `invitacion` nunca se copia a la bitácora) |
| Política `bitacora_cambio_select` | 220 | El Administrador no lee los eventos de `invitacion` (es de la gestión del Titular); Titular y Auditor leen todo |
| Política `capa_select_por_rol` | 220 | El Capturista ve sus propias capas en borrador y en revisión (`core.creo_objeto`), no solo las vigentes |
| Vista `api.bitacora_operativa` recreada | 220 | Distingue `despublicacion` (vigente_publico → borrador) y entiende instrumentos |
| Funciones auxiliares `core.exigir_rol`, `core.faltantes_ficha`, `core.quien_envio`, `core.creo_objeto`, `core.exigir_claves` | 220 | Reglas compartidas por las funciones `api.fn_*` |
| 26 funciones `api.fn_*` (31 con las de ER-4 en la 225) | 221-224 | Única vía de escritura; `revoke` a `public` y `anon`, `grant` a `authenticated`; cada una decide por rol |
| `core.fn_invitacion_vigente`, `core.fn_consumir_invitacion` | 224 | Canje por servicio-procesos; **no** se conceden a `authenticated` ni `anon` |
| Pruebas C38 (Ciclo 3) y E01 (Ciclo 5) | `ciclo5_pruebas.sql` | E01 contaba «exactamente 8 disparadores de auditoría en toda la base» y ahora cuenta las 8 tablas originales por nombre (las nuevas las cubre `ciclo4_pruebas.sql`, caso A03); C38 cuenta 27 tablas en `core` por las dos de ER-4 |

## 6. Lo que se dejó **sin cambiar** y requiere tu decisión

1. **`usuario.fecha_baja` e `id_usuario_baja`** (aparecen en la matriz de permisos del documento v2.2 como «baja en usuario»). Agregarlas sería un **cuarto cambio al ER**, así que no se hizo. La baja es lógica y está resuelta con lo que ya existe: `core.perfil.activo = false` (el disparador de la migración 126 bloquea el acceso en GoTrue) y `core.bitacora` registra el evento `baja` con quién, a quién y cuándo, más `core.bitacora_cambio` por el disparador de auditoría. La fecha y el autor de la baja son consultables, solo que desde la bitácora y no desde columnas de la cuenta. **¿Se agregan las dos columnas?** Si dices que sí, es una migración chica y reversible.
2. **Archivo geográfico de la capa (`capa_vector`) y PDF del instrumento.** El Ciclo 4 guarda la ficha y el estatus; la carga de elementos geográficos es del Ciclo 9 y el bucket de PDF aún no está configurado. `ruta_pdf` acepta la ruta; no valida que el archivo exista.
3. **Cuatro ojos y un solo Titular.** Como quien envía un instrumento a revisión no puede dictaminarlo, un Titular que sube un instrumento necesita a *otro* Titular para validarlo. Con un solo Titular activo, los instrumentos los sube un Administrador y el Titular los dictamina (el flujo previsto). Si prefieres relajar esta regla para instrumentos subidos por el propio Titular, es una línea en `fn_dictaminar_instrumento`.
