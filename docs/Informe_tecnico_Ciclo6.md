# SESIM · Informe técnico del Ciclo 6
**Evidencias y medios de verificación (TDR 6.2.2 f)** · Corte: 29-oct-2026

**Estado:** backend, pruebas y piezas de front listos y verificados en mi entorno: **50/50** casos SQL nuevos del Ciclo 6, **138/138** del Ciclo 4, **64/64** del Ciclo 3 y **27/27** del Ciclo 5. **Falta la corrida en tu Supabase real** (§6): el Storage aquí se simuló y las políticas de `storage.objects` hay que confirmarlas en el servicio de verdad.

Anexo: `ciclo-6-cambios-er.md` (ER-5, con justificación).

## 1. Qué se pidió y qué se decidió

| Tema | Decisión (Ismael, 29-oct-2026) |
|---|---|
| Almacén | **Supabase Storage**, bucket privado `evidencias` |
| Tipos y tamaño | **Solo PDF y JPG/PNG, máximo 10 MB** |
| Cantidad | **Una sola evidencia por medición**; si la medición es rechazada, el capturista la **reemplaza** (la anterior no se borra) |
| Acceso | **Igual que la medición** |
| Cambio al ER | **ER-5** autorizado: columna `vigente` + índice único parcial |
| Alcance visual | El flujo visual completo de mediciones se cierra en el **Ciclo 8**; aquí se certifican el bucket, las políticas y las huellas **inyectando datos de prueba directamente en el servidor** |

**Justificación de ER-5.** La regla «cero borrados físicos» y la regla «una sola evidencia, reemplazable por el capturista» solo caben juntas si la tabla distingue la evidencia que rige de las reemplazadas. La columna `vigente` con índice único parcial lo resuelve sin tablas nuevas, conserva el rastro (en la propia tabla y en la bitácora) y deja al capturista subsanar sus rechazos sin pasar por el Administrador, igual que ya ocurre con las capas. El detalle y las alternativas descartadas están en el anexo.

## 2. Qué se entregó

| Pieza | Archivos |
|---|---|
| ER-5, bucket, políticas y funciones | `db/migrations/226_c6_er5_evidencias.sql` |
| Pruebas | `db/pruebas/ciclo6_pruebas.sql`, `scripts/pruebas-ciclo6.sh` |
| Prueba contra el stack real | `front/scripts/prueba-ciclo6-real.mjs`, `db/pruebas/ciclo6_semilla_medicion.sql` |
| Simulación de Storage para pruebas locales | `db/pruebas/stub_storage.sql` (no es migración) |
| Front | `lib/sesim/supabase.js` (`subirObjeto`, `urlFirmada`), `lib/sesim/catalogoApi.js` (`subirEvidencia`, `evidenciasDeMedicion`, `abrirEvidencia`, `verificarEvidencia`, `huellaSha256`, `validarArchivoEvidencia`) |

## 3. Cómo funciona

1. **Subir.** El capturista (autor de la medición, con la medición en borrador o rechazada) calcula el SHA-256 del archivo en el navegador y lo sube a `evidencias/<id_medicion>/<sha256>.<pdf|jpg|png>`. La política de subida solo lo permite con ese nombre exacto y a su autor; el bucket rechaza otros tipos y más de 10 MB.
2. **Registrar.** `api.fn_registrar_evidencia(medición, tipo de documento, huella, tipo MIME, bytes)` valida autor y estado, tipo y tamaño, huella única, y **comprueba en el almacén que el archivo exista y que su tamaño coincida** con lo declarado. Queda como evidencia **vigente**.
3. **Reemplazar.** Si la medición fue rechazada, repetir los pasos 1 y 2: la función marca la anterior como no vigente y registra la nueva en la misma transacción. Nada se borra y ambos movimientos quedan en la bitácora.
4. **Leer.** Quien puede ver la medición puede ver su evidencia (la RLS de la medición decide): el capturista las suyas; Administrador, Titular y Auditor desde que sale del borrador. El archivo se abre con un enlace firmado temporal. **El ciudadano (sin sesión) no accede a ningún archivo**, tampoco de mediciones públicas.
5. **Verificar (F11).** `api.fn_verificar_evidencia(evidencia, huella calculada)`: el Auditor (o la administración) carga el archivo, el navegador calcula su SHA-256 y el servidor lo compara con el registrado. Si **no coincide**, se levanta automáticamente un hallazgo de severidad alta a nombre del Auditor (sin duplicarlo si repite la verificación); el Administrador y el Titular pueden verificar pero no levantan hallazgos.

**Quién puede qué.**

| Perfil | Evidencias |
|---|---|
| Capturista | Sube, registra y reemplaza la de **sus** mediciones en borrador o rechazadas; ve las suyas |
| Administrador / Titular | Ven las de mediciones fuera del borrador; verifican integridad; no suben por el autor |
| Auditor | Ve las de mediciones fuera del borrador; verifica y levanta hallazgos |
| Ciudadano (`anon`) | Nada |

## 4. Pruebas

- **`./scripts/pruebas-ciclo6.sh`: 50 casos**, con identidad real de cada perfil y archivos representados por objetos del bucket, en una transacción con ROLLBACK. Cubren: ER-5 (columna, vista, índice único parcial); bucket (privado, 10 MB, tres tipos, sin políticas de UPDATE/DELETE); subida (autor sí; otro capturista, Administrador y ciudadano no; nombre o extensión inválidos; medición en revisión); registro (tipo, tamaño, huella, tipo de documento, archivo ausente, tamaño distinto, perfiles, estados, huella duplicada, auditoría); reemplazo (vigente y reemplazada, nada se borra, bitácora, sin borrado por la API, huella reemplazada no reutilizable); lectura por perfil (API y bucket); verificación (coincide, no coincide con hallazgo, sin duplicados, perfiles, huella mal formada, `anon`); integridad R12 y auditoría.
- **Regresión:** Ciclo 3, **64/64** (C38 ya cuenta 27 tablas; ER-5 no agrega tablas); Ciclo 4, **138/138**; Ciclo 5, **27/27**.

## 5. Decisiones que tomé y puedes vetar

1. **El ciudadano no accede a archivos de evidencia**, ni siquiera de mediciones publicadas. Es lo más conservador; abrir evidencias públicas sería una política nueva.
2. **La huella es única en toda la tabla** (regla previa): el mismo archivo no puede respaldar dos mediciones, y una huella reemplazada tampoco se reutiliza.
3. **El objeto se nombra por su huella** (`<medición>/<sha256>.<ext>`): evita choques y nombres arbitrarios, y hace que la ruta pruebe el contenido.
4. **Solo el autor sube y registra**; el Administrador no lo hace por él (misma regla que en capas con cuatro ojos).
5. **Un hallazgo por falla de integridad lo levanta solo el Auditor**; la administración que verifica solo recibe el resultado.
6. **La verificación compara contra la huella que calcula el navegador.** No se recalcula desde el almacén (ver pendientes).

## 6. Cómo correrlo en tu stack

1. Aplica `226_c6_er5_evidencias.sql` y recarga el esquema de PostgREST.
2. Confirma que existe el bucket: en Studio → Storage debe aparecer `evidencias` (privado, 10 MB, PDF/JPG/PNG), con las políticas `evidencias_leer` y `evidencias_subir`.
3. Corre `./scripts/pruebas-ciclo6.sh` contra tu base si tiene el esquema `storage` (Supabase lo trae): 50/50.
4. Prueba real de punta a punta: `psql -v correo_capturista="'capturista@…'" -f db/pruebas/ciclo6_semilla_medicion.sql` imprime el id de una medición de prueba; luego corre `front/scripts/prueba-ciclo6-real.mjs` con las variables que indica su encabezado (pausa una vez para que cambies el estado de la medición con un `update`).

**Si algo falla.**

- *La migración avisa «No hay esquema storage» y no crea el bucket:* la base no es la de Supabase; en Supabase el aviso no debe aparecer.
- *Error de permisos al crear las políticas sobre `storage.objects`:* ejecuta la migración con el rol `postgres` del contenedor de base de datos de Supabase; si aun así se niega, créalas desde Studio con el mismo texto (están en la migración).
- *Subida con 400 o 403 con la medición correcta:* el nombre del objeto debe ser exactamente `<id_medicion>/<sha256 en minúsculas>.<pdf|jpg|png>`.
- *«El tamaño del archivo subido no coincide»:* el servidor lee `metadata.size` del objeto; si tu versión de Storage lo guarda con otro nombre, avísame y lo ajusto.

## 7. Pendientes

- **Corrida en tu Supabase real** (§6). Las políticas de `storage.objects` y la lectura de `metadata.size` se probaron contra una simulación del esquema, no contra Storage de verdad.
- **Recalcular la huella en el servidor** descargando el objeto (servicio de procesos), para detectar alteraciones del archivo en el almacén y no solo comparar lo que el navegador calcula. Es una mejora de F11 que no cambia el modelo.
- **Validar el contenido real del archivo** (firma del PDF o de la imagen): hoy el bucket confía en el tipo declarado.
- **Pantallas de evidencia dentro del flujo de mediciones** y **bucket de PDF de instrumentos y fichas de capa:** el primero llega con el Ciclo 8; el segundo reutiliza este mecanismo.
- **Mediciones por la API:** hasta el Ciclo 8 las mediciones se crean solo con datos de prueba en el servidor.
- Sin cambios respecto de ciclos previos: D-18, 12 capas sin linaje, cambios a los Excel Interno y Externo, rotación de credenciales de desarrollo, corrida real del Ciclo 4.
