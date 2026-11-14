# SESIM · ER-7 · Fuentes oficiales de información (Consulta oficial) en la base

**Corte:** 14-nov-2026 · Migraciones `242_c10_er7_fuente_documental.sql` y `243_c10_er7_datos_fuentes.sql` · Pruebas `db/pruebas/ciclo10_er7_pruebas.sql` (82 casos) · Se corre con `scripts/pruebas-ciclo10.sh` (ER-6 + ER-7).

Regla vigente: solo se toca el ER con autorización expresa. Ismael autorizó este cambio y fijó cuatro decisiones: (1) las 10 fuentes entran **publicadas**; (2) **edita el Administrador y publica el Titular**; (3) **cada fuente puede tener varios enlaces**; (4) los enlaces y los datos faltantes **quedan editables** desde administración, porque si un enlace se cae el equipo de la Secretaría no puede tocar el front.

## 1. Resumen del cambio

| Clave | Cambio |
|---|---|
| ER-7 | Tabla `core.fuente_documental` (clave `DAT-F###` estadística, `DAT-G###` geoespacial; la letra la exige un `CHECK`) |
| ER-7 | Tabla `core.enlace_fuente` (varios por fuente, cada uno con nombre, URL, orden y marca de verificación) |
| ER-7 | `core.dictamen.objeto_tipo` admite `'fuente_documental'` |
| ER-7 | Vistas `api.fuente_documental` (pública) y `api.enlace_fuente` (solo con sesión) y 7 funciones `api.fn_*` de escritura |
| ER-7 | Siembra de las 10 fuentes y 11 enlaces que hoy viven en `front/public/sesim/catalogo/fuente_documental.json` |

`core` pasa de 30 a 32 tablas (se actualizaron las pruebas C38 del Ciclo 3 y S05 del Ciclo 8). No se modifica ninguna tabla existente.

## 2. Flujos

- Ciclo D-20: `borrador → revision → vigente_admin → vigente_publico`. Enviar a revisión exige al menos un enlace activo.
- D-16: validar, publicar, rechazar y dar de baja la ficha son solo del Titular (disparador incluido). Cuatro ojos: quien envió no valida ni publica. Rechazar exige comentario y retira del público.
- Alta y edición de la ficha: Administrador y Titular, solo en borrador. Capturista y Auditor no escriben.
- La clave se asigna sola (`DAT-F006`, `DAT-G006`…) según el tipo de información.
- Baja lógica de la ficha solo cuando no está publicada. Nada se borra físicamente.

## 3. Regla que agregué sobre las cuatro decisiones (conviene confirmarla)

**Los enlaces se corrigen en cualquier estatus de la ficha, incluso publicada**, por Administrador o Titular, sin pasar por D-20: un enlace roto no puede esperar a un ciclo de revisión. Compuertas: cada cambio queda en bitácora con autor; no se puede dar de baja el **último enlace activo** de una ficha publicada (primero se agrega el nuevo); cambiar la URL borra la marca de verificación (el enlace nuevo aún no se ha comprobado); un enlace no cambia de ficha. El resto de la ficha (institución, cobertura temporal, variables, limitaciones…) sí exige devolverla a borrador.

## 4. Vista pública

`anon` lee solo fichas publicadas y activas, con sus enlaces activos en orden (`enlaces` en JSON y `url_oficial` = el primero). No ve borradores, enlaces dados de baja ni quién verificó (permiso de columna). Con sesión: Administrador, Titular y Auditor ven todo; el Capturista solo lo publicado.

## 5. Siembra

Las 10 fichas entran `vigente_publico` (la vista pública de hoy no cambia), tipo según la sección del banco (5.1 estadística, 5.2 geoespacial), `estatus_verificacion` conservado del JSON. La **institución queda vacía**: no se inventa, la captura el Administrador. VMRC (`DAT-F003`) trae dos enlaces (metadatos y programa). La siembra no deja bitácora.

## 6. Pruebas

82 casos nuevos (siembra, vista pública, roles, flujo, enlaces, cuatro ojos, baja, lectura por perfil, bitácora) y regresión completa en verde: C3 64, C4 145, C4b 33, C5 27, C6 50, C8 66, ER-6 119.

## 7. Pendiente

Pantalla de administración para editar fuentes y enlaces y marcar «responde / no responde»; pasar el front de `fuente_documental.json` a la API (hecho en el front de esta entrega).
