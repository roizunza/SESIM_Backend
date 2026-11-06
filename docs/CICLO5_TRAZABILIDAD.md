# Ciclo 5 · Trazabilidad y control de cambios

**Estado:** backend y pantalla listos y probados en mi entorno (27/27 casos SQL, 64/64 de regresión del Ciclo 3, 14/14 del traductor del front, 5 recorridos en navegador). **Falta la corrida en tu stack real** (pasos al final).

## 1. Decisión: no se aplican las migraciones 122–124 del front del Ciclo 5

El front del Ciclo 5 trae su propio backend (`core.solicitud_cambio`, `core.bitacora_operativa`, vistas `api.*`, RLS y dos triggers). Se comparó contra el modelo v2.2 ya implementado:

| Tema | Su SQL (122–124) | Nuestro modelo | Veredicto |
|---|---|---|---|
| Estado de la propuesta | `solicitud_cambio.estatus`: borrador / en_revision / aprobado / rechazado | `capa.estatus`: borrador / revision / vigente_admin / vigente_publico + `dictamen` + `capa_version` | Duplica la máquina de estados; vocabularios distintos |
| Compuertas | «aprobado» no exige nada | D-17: metadato ISO completo + restricción de uso pública para publicar; D-16: solo el Titular publica instrumentos | Su «aprobado» se salta las compuertas |
| Historial inmutable | `bitacora_operativa` (append-only por permisos) | `bitacora_cambio`: solo inserción por trigger (ni el dueño puede UPDATE/DELETE/TRUNCATE), con foto previa y nueva | Duplica; la nuestra es más fuerte |
| Quién dictamina | `administrador` y `administrador_titular` | Igual que la regla de publicar: lo decide el modelo (D-16) | Conflicto con D-16 en instrumentos |
| Escritura | POST/PATCH directo del front a las tablas | Regla de 207: el núcleo solo se escribe por funciones `api.*` (Ciclos 4 y 8) | Contradice la arquitectura |
| Llaves | `auth.users` | `core.perfil` | Distinto |
| Auditor | No ve `en_revision` | Auditor ve todo (Alcances; RLS de 207) | Se adopta lo nuestro (ver §5) |

**Conclusión:** tu hipótesis es correcta; adoptarlas habría creado un segundo sistema de control de cambios paralelo al nuestro.

## 2. Lo que sí faltaba (y es el backend real del Ciclo 5) · migración `218_ciclo5_trazabilidad.sql`

1. **Nada escribía en `core.bitacora_cambio`** (cero triggers; la tabla estaba vacía). Se agrega `core.fn_auditar_cambio()` y un disparador `trg_auditoria` en 8 tablas: `capa`, `instrumento_origen`, `indicador`, `medicion_indicador`, `evidencia_medicion`, `umbral_semaforo`, `hallazgo_auditoria`, `periodo`. Registra INSERT / UPDATE / DELETE / CAMBIO_ESTADO con la identidad de `auth.uid()` (o `app.actor_id` para servicio-procesos, igual que el Ciclo 1), la IP de `x-forwarded-for`, y no deja huella en UPDATE sin cambios reales. Sin sesión (migraciones, cargas) queda como «sistema». Las 490 mil filas de `capa_vector` no se auditan (carga masiva del Ciclo 9).
2. **El Capturista no podía leer sus cambios** (el índice `bitacora_cambio_actor_idx` ya lo preveía). Política «lo mío»: ve los eventos de los objetos que tocó, incluido el rechazo de la administración y su motivo (`core.toco_objeto()`); el dictamen sobre lo suyo también.
3. **Vista `api.bitacora_operativa`** con la forma que pinta la pantalla: quién (nombre, rol, código estable CAP-001 / ADM-001 / AUD-001), qué (`nuevo`, `actualizacion`, `envio`, `aprobacion`, `publicacion`, `despublicacion`, `rechazo`, `baja`), cuándo, estatus real, motivo (del dictamen), ficha técnica (de los metadatos ISO de la capa) y archivos. RLS de quien consulta; anon sin acceso.

No se abre ningún INSERT/UPDATE nuevo: las escrituras siguen siendo por funciones `api.*` del Ciclo 4.

## 3. Front: qué se portó y a dónde apunta

| Pieza de su front | Qué se hizo |
|---|---|
| `bitacora-logs.tsx` (+css) | **Portada** como `components/bitacora/BitacoraLogs.tsx`: sin datos de muestra; lee `api.bitacora_operativa`; rol desde nuestra sesión real (`useSesion`); estatus del modelo SESIM; columna «Acción» en las tres tablas; botón de dictamen solo sobre el estado vigente del recurso; modo `embebido`. Montada como pestaña **«Cambios (servidor)»** en `BitacoraPagina` (la primera). Nuestras pestañas Cuentas / Operación local / Hallazgos siguen. |
| `supabase-api.ts`, `auth-context.tsx`, `login-card.tsx` | **No se portan:** nuestro `supabase.js` + `sesion.js` ya hacen login real, `api.mi_perfil`, refresco y cierre de sesión. |
| `panel-dictamen.tsx`, `capturista-modal.tsx` | **Pendientes (Ciclo 4):** hoy son maqueta con datos de muestra y necesitan las funciones `api.*` de enviar a revisión y dictaminar; se recablean al terminar el CRUD de capas e instrumentos. El botón «Determinar dictamen» queda visible pero deshabilitado con su explicación. |
| Sidebars (3 perfiles) | **Sin cambio:** los nuestros ya enlazan a `/bitacora`. |
| `servicio-procesos` (`main.py`, `seed_dev.py`) | **Sin cambio:** `administrador_titular` ya está homologado en nuestro backend. |

Dos ajustes de contenido a su pantalla: el «dictamen de rechazo» decía que los archivos se eliminan; en SESIM la capa regresa a **borrador** y su historial se conserva, y se descarga como `.txt` (antes era un texto con extensión PDF). Y el icono `Map` de lucide tapa al `Map` de JavaScript dentro de ese archivo (error real que se encontró y corrigió en la prueba de navegador).

## 4. Pruebas

- `db/pruebas/ciclo5_pruebas.sql` · **27 casos** con identidad real (`auth.uid()` de Supabase): auditoría de cada tipo de cambio, ciclo completo de una capa (envío, rechazo, corrección, validación), inmutabilidad, quién ve qué (Capturista A, Capturista B, Administrador, Titular, Auditor, ciudadano), compuertas D-16 y D-17 intactas, IP, sistema y servicio de procesos. Corre en una transacción con ROLLBACK. `./scripts/pruebas-ciclo5.sh`.
- Regresión: las 64 del Ciclo 3 siguen en verde con la 218 aplicada.
- `front/scripts/prueba-bitacora.mjs` · **14 casos** del traductor, con filas reales volcadas de la vista tras un ciclo completo.
- Navegador (Chromium): 3 perfiles × escritorio + móvil con las filas reales de la vista: Capturista ve 7 de 10 eventos (solo su capa), Administrador y Auditor ven los 10, el rechazo y su motivo son visibles para el Capturista, el filtro por estatus funciona, y «Determinar dictamen» aparece solo en la capa que sigue en revisión.

## 5. Decisiones que quedan en tus manos

- **Auditor y `en_revision`:** su front ocultaba al Auditor los eventos en revisión («audita solo lo consumado»). El modelo (Alcances / RLS de 207) le da lectura total, y la pantalla ahora sigue al backend. Si prefieren la regla de su equipo, es una sola política más en `bitacora_cambio` y una línea en el front.
- **D-20 (propuesta): estatus para instrumentos.** `instrumento_origen` solo tiene `publicado`. Para que un Capturista pueda proponer un PDF y que pase por revisión como una capa, hace falta `estatus` (y la ruta del PDF) en `instrumento_origen`, con la regla D-16 intacta (publicar = Titular). Hoy la bitácora ya registra publicar/despublicar instrumentos. Lo trato en el Ciclo 4.
- **Quién publica una capa:** el modelo permite al Administrador dictaminar `validar`/`publicar`; solo los instrumentos son exclusivos del Titular (D-16). Confirmar si se mantiene.

## 6. Cómo correrlo en tu stack

```bash
cp /mnt/d/SESIM.OCT2026/Back/db/migrations/218_ciclo5_trazabilidad.sql ~/Back/db/migrations/
cp /mnt/d/SESIM.OCT2026/Back/db/pruebas/ciclo5_pruebas.sql ~/Back/db/pruebas/
cp /mnt/d/SESIM.OCT2026/Back/scripts/pruebas-ciclo5.sh ~/Back/scripts/ && chmod +x ~/Back/scripts/pruebas-ciclo5.sh
cp -r /mnt/d/SESIM.OCT2026/Back/front/src ~/Back/front/ && cp -r /mnt/d/SESIM.OCT2026/Back/front/scripts ~/Back/front/
cd ~/Back && ./scripts/migrar.sh && ./scripts/pruebas-ciclo5.sh && ./scripts/pruebas-ciclo3.sh
cd front && node scripts/prueba-bitacora.mjs && npm run dev
```
Esperado: 27/27, 64/64 (con el archivo `ciclo3_pruebas.sql` corregido) y 14/14. En el front: inicia sesión → Bitácora → pestaña «Cambios (servidor)». Estará vacía hasta que haya cambios; las funciones del Ciclo 4 la irán llenando.
