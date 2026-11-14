# SESIM · ER-6 · Catálogo de instrumentos normativos en la base

**Corte:** 14-nov-2026 · Migraciones `240_c10_er6_catalogo_normativo.sql` y `241_c10_er6_datos_catalogo.sql` · Pruebas `db/pruebas/ciclo10_er6_pruebas.sql` · Scripts `scripts/instrumentos/`

Regla vigente: solo se toca el ER con autorización expresa. Este cambio lo autorizó Ismael el 14-nov-2026 («haz los cambios, ponlo en lectura pública y sube los MB»). Alcance de esta entrega: **solo el catálogo de instrumentos**. La pestaña «Consulta oficial» (`fuente_documental`) queda para después.

## 1. Resumen del cambio

| Clave | Cambio | Estado |
|---|---|---|
| ER-6 | 3 tablas nuevas: `instrumento_normativo`, `documento_instrumento`, `relacion_normativa` | Aplicado (240) |
| ER-6 | `core.dictamen.objeto_tipo` admite `'instrumento_normativo'` | Aplicado (240) |
| ER-6 | Bucket **público** `instrumentos` (solo PDF, 200 MB por archivo) | Aplicado (240, si existe Storage) |
| ER-6 | Siembra de las 36 fichas y 4 relaciones que hoy viven en `front/public/sesim/catalogo/*.json` | Aplicado (241) |

No se modifica ninguna tabla existente. `core.instrumento_origen` (EEMSV y los 5 PIMUS, con su propio ciclo D-20) queda intacto; la ficha normativa de cada uno apunta a él con `id_instrumento_origen`.

## 2. Una sola clave, en todos lados

La clave **es** el `id`: `DOC-` + letra + 3 dígitos. La letra sigue al tipo y la escala (`E` estatal, `F` federal, `M` municipal, `N` Norma Oficial Mexicana) y la base lo exige con un `CHECK`. El mismo texto aparece en:

| Dónde | Forma |
|---|---|
| Ficha (`instrumento_normativo.id`) y JSON actual | `DOC-E001` |
| Relaciones | `DOC-E008>DOC-F005` (la base exige que el id sea origen>destino) |
| Ruta del PDF | `instrumentos/DOC-E001/DOC-E001_v01_<sha16>.pdf` |
| Directorio de URL del PDF | `…/instrumentos/DOC-E001/…` |
| Dictamen y bitácora | `objeto_id = 'DOC-E001'` |

El nombre del archivo repite la **clave**, el **rol** (`v` = principal, `c` = complemento), la **versión** y los primeros 16 caracteres de la **huella SHA-256**. Un `CHECK` en `documento_instrumento` impide guardar una ruta que contradiga esos datos, y la política de subida del bucket exige el mismo formato, que la ficha exista y esté en borrador, y que la versión sea la siguiente. Dos candados independientes (política de Storage y `CHECK`) más la función de registro, que vuelve a comprobar existencia y tamaño del objeto.

## 3. Flujos (reglas ya vigentes, aplicadas tal cual)

- **Ciclo D-20:** `borrador → revision → vigente_admin → vigente_publico`. Enviar a revisión exige el **PDF principal**.
- **D-16:** validar, publicar, rechazar y dar de baja son **solo del Administrador Titular**. Un disparador (`trg_instnorm_publicar_*`) lo vuelve a exigir aunque alguien llegara a la tabla por otro camino.
- **Cuatro ojos:** quien envió a revisión no valida ni publica.
- **Rechazar** exige comentario, regresa a borrador y **retira del público** (también desde `vigente_publico`).
- **Baja lógica** (`activo = false`), nunca mientras esté publicada. Cero borrados físicos: no hay política de UPDATE ni DELETE en el bucket y no hay `DELETE` concedido en las tablas.
- Alta y edición (solo en borrador) las hacen Administrador y Titular; el Capturista y el Auditor no escriben.
- Relaciones: el Administrador las propone (`por_validar`); validarlas es del Titular; editar una validada la regresa a `por_validar`.
- Versiones del PDF: para cambiar el PDF de una ficha publicada, el Titular la devuelve a borrador; se sube la `v02`; la `v01` se conserva (`vigente = false`, el archivo sigue en el bucket).
- Estatus de **verificación documental** (`estatus_verificacion`: `vigente_verificado`, `referencia_federal`, `por_validar`, `pendiente_integracion`) es independiente del estatus de **publicación** (`estatus`). En el JSON actual ambos se llamaban `estatus`; el front debe leer `estatus_verificacion`.

## 4. Vista pública (usuario sin cuenta)

`anon` lee solo lo publicado y activo:

| Objeto | Lo que ve anon |
|---|---|
| `api.instrumento_normativo` | fichas con `estatus = 'vigente_publico'` y `activo`, con `pdf_ruta`, `pdf_hash`, `pdf_bytes`, `pdf_paginas`, `pdf_version` |
| `api.documento_instrumento_publico` | documentos **vigentes** (principal y complemento) de fichas publicadas, **sin** quién los subió |
| `api.relacion_normativa` | relaciones activas entre dos fichas publicadas (la UI debe mostrar `por_validar`/`validada`) |

No ve borradores, versiones anteriores, `id_usuario` (bloqueado por permiso de columna), bitácora ni dictámenes. Un documento o una relación nunca se ve si su ficha no se ve (el subselect hereda la RLS). Con cuenta: Administrador, Titular y Auditor ven todo; el Capturista solo lo publicado.

**Siembra:** las 35 fichas con `publicable = true` quedan en `vigente_publico` (la vista pública de hoy no cambia); **DOC-E005 (ARTEC)** queda en `borrador`. Desde ahí, cualquier cambio pasa por D-20/D-16. La siembra no deja bitácora (es una carga, no un acto de una persona); la carga de PDF sí deja bitácora, sin autor.

## 5. Archivos: público, 200 MB, y por qué es seguro

- Bucket `instrumentos`: `public = true`, solo `application/pdf`, `file_size_limit` = 209 715 200 bytes. El mayor de los 38 PDFs (PIMUS Campeche) pesa 146 MB.
- **Público** significa que cualquiera con el enlace descarga el PDF sin firmar nada: son documentos oficiales ya públicos. El nombre lleva 16 caracteres de huella, así que un borrador subido no se adivina por la clave. No se puede listar el bucket sin cuenta (solo Administrador, Titular y Auditor).
- Una versión retirada del público deja de aparecer en la API, pero su archivo sigue en el bucket (cero borrados); quien guardó el enlace aún lo abre. Es coherente con ser documentos oficiales.

## 6. Cargar los 38 PDF (carpeta `Catalogo_Instrumentos`)

`scripts/instrumentos/mapa_clave_archivo.json` es la **única** tabla archivo ↔ clave (37 documentos: 36 principales + el Resumen Ejecutivo de la EEMSV como `complemento` de DOC-E006). `POE-PMDU-CANDELARIA.pdf` está declarado como duplicado de la ficha DOC-M006 (el inventario lo confirma por SHA-256) y `SESIM_URL_catalogo_y_consulta_oficial.pdf` no es un instrumento.

1. `python3 scripts/instrumentos/cargar_pdfs.py inventario --carpeta "<…>/Catalogo_Instrumentos"` → concordancia clave ↔ archivo ↔ ficha ↔ objeto en el bucket; **se detiene** si falta un PDF, sobra uno, un nombre no está en el mapa, no empieza con `%PDF-`, pesa más de 200 MB o dos archivos distintos tienen la misma huella.
2. `export SUPABASE_URL=… SERVICE_ROLE_KEY=…` y `… cargar --carpeta …` (en la VM) → sube los que faltan; si ya están con el mismo tamaño no hace nada.
3. `psql … -f scripts/instrumentos/salida/registro.sql` → `core.registrar_documento_carga_inicial` por archivo (idempotente; solo el servidor, sin sesión de usuario).
4. `psql … -f scripts/instrumentos/salida/verificacion.sql` → debe devolver **0 filas** de problemas.

## 7. Ajustes de servidor (los hace infraestructura; no están en SQL)

1. **Límite global de Storage** (`FILE_SIZE_LIMIT` del servicio storage, por defecto 50 MB) a **≥ 200 MB** (`209715200`). Sin esto, la subida de 75–146 MB falla con 413 aunque el bucket permita 200.
2. **Nginx / proxy**: `client_max_body_size 200m;` en la ruta del API.
3. **Respaldo**: Storage vive en el volumen de la VM y la infraestructura no ofrece política de respaldo. Los PDF son reproducibles desde la carpeta de insumos, pero hay que conservar una copia **fuera de la VM** y respaldar `core.documento_instrumento` junto con el volumen (la huella permite comprobar que cada archivo restaurado es el mismo).

## 8. Pruebas

`db/pruebas/ciclo10_er6_pruebas.sql` · 119 casos en verde (se corre sobre la base recién migrada, **antes** de cargar los PDF; si ya hay documentos se detiene con un aviso): siembra (35/1, claves, vínculos), anon (35 fichas, columnas bloqueadas, sin escritura, sin bitácora), roles en alta, nombre canónico (cinco formas inválidas), registro y tamaños, ciclo completo, cuatro ojos (validar y publicar), retiro del público y de sus documentos, versión 2 sin borrar la 1, baja y reactivación, fichas sembradas entrando al mismo flujo, lectura por perfil, nada de escritura directa ni borrado, relaciones, bitácora y carga inicial. Regresión sin cambios: C3 64, C4 145, C4b 33, C5 27, C6 50, C8 66. Solo cambian dos cifras que cuentan tablas (C38 de C3 y S05 de C8: 27 → 30).

## 9. Decisiones y pendientes

- **Inventario real (hecho el 14-nov en tu equipo):** 37 documentos, 0 problemas de concordancia, 899 MB en total, el mayor 146 MB. Cinco PDF no tienen texto seleccionable en sus primeras páginas (PIMUS Campeche, Carmen y Escárcega; PMDU Palizada; Resumen Ejecutivo de la EEMSV): conviene OCR antes de ofrecerlos al público como «buscables». El archivo de PIMUS Champotón se llama `PIMUS_CHAMPOTÓN.pdf` (mayúsculas), ya así en el mapa.

- `api.bitacora_operativa` **no se tocó** (es una vista aprobada que habla de capas e instrumentos de origen): los eventos de ER-6 salen en `api.bitacora_catalogos`. Si se quiere que aparezcan con «envío / aprobación / publicación» en la bitácora operativa, es una migración aparte.
- Los 5 PIMUS (DOC-M011 a M015) están con `estatus_documental = 'Pendiente PDF final'` en la ficha, pero ya hay PDF en la carpeta: el contenido de esas fichas lo actualiza el equipo normativo por el flujo (rechazar → editar → enviar).
- `instrumento_origen.estatus` y `instrumento_normativo.estatus` son ciclos paralelos; una ficha liga a su origen pero no lo sincroniza.
- Siguiente: conectar el front a `api.instrumento_normativo` (botón «Abrir PDF», «Fuente oficial», chip de verificación, sección Documento en la ficha, carga con SHA-256 para admin), y después rediseñar la pestaña. «Consulta oficial» (`fuente_documental`) en una entrega posterior.
