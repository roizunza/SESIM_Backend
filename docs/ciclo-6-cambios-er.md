# SESIM · Cambios al entidad-relación en el Ciclo 6

**Corte:** 29-oct-2026 · Anexo del Informe técnico del Ciclo 6 · Migración `226_c6_er5_evidencias.sql`

Regla de trabajo vigente: solo se toca el ER con autorización expresa y cada cambio se anota y justifica aquí. En este ciclo hay **un** cambio, autorizado por Ismael el 29-oct-2026.

## 1. Resumen

| Clave | Cambio | Decisión | Estado |
|---|---|---|---|
| ER-5 | `core.evidencia_medicion` + columna `vigente` y un índice único parcial: una sola evidencia vigente por medición | Una evidencia por medición, reemplazable sin borrar | Aplicado (226) |

Ninguna tabla nueva, ninguna llave nueva, ninguna columna eliminada. Una columna agregada y un índice.

## 2. ER-5 · `evidencia_medicion.vigente`

**Qué cambia.**

| Objeto | Definición |
|---|---|
| Columna `vigente` | `boolean not null default true` |
| Índice `evidencia_una_vigente_por_medicion` | Único y parcial: `(id_medicion) where vigente`. La base no admite dos evidencias vigentes de la misma medición |

**Decisión de negocio (Ismael, 29-oct-2026).** Cada medición tiene **una sola** evidencia. Si la medición es rechazada, el capturista puede **reemplazarla** por otra. Textualmente: la decisión «respeta nuestra regla de cero borrados físicos (manteniendo el rastro de la evidencia rechazada en el historial) y le da autonomía al capturista para subsanar sus propios rechazos, tal como ya lo hacemos con las capas, sin generarle un cuello de botella al Administrador».

**Por qué hace falta un cambio al ER.** «Una sola» y «reemplazar sin borrar» se contradicen si la tabla no distingue la evidencia que hoy respalda a la medición de las que ya fueron sustituidas. Las alternativas evaluadas:

1. *`UNIQUE(id_medicion)` sin reemplazo.* Simple, pero obliga a que cualquier corrección pase por el Administrador (el cuello de botella que se quería evitar) o a borrar la fila (viola cero borrados).
2. *Tabla nueva de historial de evidencias.* Duplica la estructura y la lógica (huella, ruta, autor, fecha) para guardar algo que ya vive en `evidencia_medicion`.
3. *Columna `vigente` con índice parcial (elegida).* Dos cambios mínimos, sin tablas nuevas; la historia sigue en la misma tabla y además en `core.bitacora_cambio`.

**Por qué esta forma (fidelidad al ER).**

- **Mismo patrón que el resto del modelo:** igual que `activo` marca la baja lógica de catálogos y capas, `vigente` marca qué fila rige. Nada se elimina.
- **La restricción vive en la base**, no solo en la función: aunque algo escribiera directo, no habría dos vigentes.
- **Las demás reglas no cambian:** la huella SHA-256 sigue siendo única en toda la tabla (una huella reemplazada tampoco se reutiliza), y la llave foránea a la medición no se toca.

**Impacto en lo ya construido.**

- Vista `api.evidencia_medicion`: recreada para incluir `vigente` (usaba `select *`).
- `core.verificar_integridad()`, chequeo R12: ahora exige **evidencia vigente** (una medición vigente cuya única evidencia fue reemplazada se detecta).
- `api.diccionario`: se alimenta de los `COMMENT`; se agregó el de la columna y se actualizó el de la tabla.
- Auditoría: `evidencia_medicion` ya tenía disparador (Ciclo 5); el reemplazo deja un `UPDATE` de la anterior (`vigente` true → false) y un `INSERT` de la nueva.

**Cómo revertir.** Quitar el índice y la columna `vigente` (previamente decidir qué hacer con las filas reemplazadas: conservarlas en un respaldo) y restablecer el chequeo R12 anterior. No se pierde ninguna evidencia mientras se respalden las filas con `vigente = false`.

## 3. Cambios que **no** son al ER pero conviene dejar anotados

| Qué | Dónde | Por qué |
|---|---|---|
| Bucket privado `evidencias` (10 MB; solo `application/pdf`, `image/jpeg`, `image/png`) | 226 | Almacén decidido: Supabase Storage |
| Políticas de `storage.objects` (`evidencias_leer`, `evidencias_subir`); sin UPDATE ni DELETE | 226 | La lectura hereda la visibilidad de la medición; la subida solo la hace su autor, con nombre canónico y medición en borrador o rechazada |
| Funciones `core.puede_subir_evidencia`, `core.nombre_evidencia_permitido`, `core.evidencia_max_bytes`, `core.evidencia_extension` | 226 | Reglas de archivo en una sola fuente de verdad |
| `api.fn_registrar_evidencia`, `api.fn_verificar_evidencia` | 226 | Única vía de escritura; no ejecutables por `anon` |
| Simulación de Storage para pruebas locales | `db/pruebas/stub_storage.sql` | Solo para probar en un Postgres solo; **no** es migración |

## 4. Lo que **no** se cambió y requiere tu decisión

1. **Tipo MIME y tamaño no se guardan en la tabla.** Se validan al registrar y los hace cumplir el bucket; en la tabla queda la ruta, la huella y el tipo de documento (oficio, reporte, fotografía…). Guardarlos sería otro cambio al ER; no se hizo.
2. **El nombre original del archivo no se conserva.** El objeto se llama `<medición>/<sha256>.<ext>` para impedir choques y nombres raros; el nombre legible se puede guardar en `tipo_documento` o añadirse como columna si lo pides (otro cambio al ER).
