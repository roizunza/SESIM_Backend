# SESIM · Informe técnico del Ciclo 4
**CRUD de catálogos, capas e instrumentos (TDR 6.2.2 e)** · Corte: 28-oct-2026

**Estado:** backend, front y pruebas listos y verificados en mi entorno: 138/138 casos SQL nuevos, 64/64 de regresión del Ciclo 3, 27/27 del Ciclo 5 y 30/30 pasos de un recorrido en navegador sobre la base real. **Falta la corrida en tu stack real** (§8): ahí entran GoTrue y PostgREST de verdad, que aquí se simularon.

Anexo: `ciclo-4-cambios-er.md` (cambios al entidad-relación, con justificación).

## 1. Qué se entregó

| Pieza | Archivos |
|---|---|
| Cambios al ER y estatus de instrumentos (D-20) | `db/migrations/219_c4_er_instrumento_estatus_dictamen.sql` |
| Ayudas, permisos y auditoría ampliada | `220_c4_ayudas_permisos_auditoria.sql` |
| Funciones de catálogos | `221_c4_api_catalogos.sql` |
| Funciones de capas | `222_c4_api_capas.sql` |
| Funciones de instrumentos | `223_c4_api_instrumentos.sql` |
| Usuarios e invitaciones | `224_c4_api_usuarios_invitaciones.sql` |
| Rechazos con plazo en días hábiles (ER-4) | `225_c4_er4_plazo_rechazos.sql` |
| Pruebas | `db/pruebas/ciclo4_pruebas.sql`, `scripts/pruebas-ciclo4.sh`, `front/scripts/prueba-ciclo4-real.mjs` (contra GoTrue y PostgREST reales) |
| Canje de invitación | `servicio-procesos/main.py` (dos rutas nuevas) |
| Front | `lib/sesim/catalogoApi.js`, `supabase.js` (`rpc`, `procesosPublico`), `InvitacionesPanel.jsx`, `pages/AceptarInvitacion.jsx`, `DictamenModal.tsx`, `BitacoraLogs.tsx`, `CapaCargaModal.jsx`, `RechazosPanel.jsx`, `App.jsx`, `AdminLayout.jsx` |

## 2. Principio de diseño

Nadie escribe directo en las tablas del núcleo. Toda escritura pasa por una función `api.fn_*` (`SECURITY DEFINER`, `search_path` fijo) que: decide por rol con un mensaje claro, aplica las compuertas del modelo, y al escribir dispara el `trg_auditoria` del Ciclo 5, de modo que la bitácora registra a la persona real (`auth.uid()` sobrevive a las funciones definer). `anon` no puede ejecutar ninguna (caso C30) y ningún rol de la API tiene INSERT, UPDATE ni DELETE sobre `core` (caso A04).

**Sin borrado físico.** La baja es lógica (`activo = false`), para no romper la bitácora. La única excepción son las filas de vínculo (capa–indicador, indicador–eje, indicador–instrumento), que se quitan con función y quedan auditadas (la foto previa guarda lo que se quitó).

## 3. Funciones por perfil

| Perfil | Puede |
|---|---|
| Capturista | Alta y edición de **sus** capas en borrador, vincularlas a indicadores, enviarlas a revisión (ficha completa); **lista de sus rechazos con plazo**: retomar, quitar de su lista o reenviar |
| Administrador | Lo anterior sobre cualquier capa; **dictaminar capas** (validar, publicar, rechazar); catálogos (ejes, sectores, fuentes, indicadores, matriz, vínculos); alta, edición y envío de **instrumentos**; baja lógica de capas e instrumentos; ver todos los rechazos con plazo y **reabrir** los vencidos o descartados |
| Administrador Titular | Todo lo del Administrador; **dictaminar instrumentos** (D-16); **umbrales del semáforo** (D-16); emitir y revocar invitaciones; listar usuarios; dar de baja y reactivar cuentas; **calendario de días inhábiles** |
| Auditor | Solo lectura total, incluido lo que está en revisión (regla autorizada) y la lista de rechazos con plazo |
| Ciudadano (`anon`) | Solo lo publicado (D-14); ninguna escritura |

## 4. Máquina de estados

Capas e instrumentos comparten los mismos cuatro estados:

```
borrador --enviar--> revision --validar--> vigente_admin --publicar--> vigente_publico
revision | vigente_admin | vigente_publico --rechazar (con comentario)--> borrador
```

- **Enviar a revisión** exige la ficha completa (custodio, fuente de origen, linaje, sistema de coordenadas y restricción de uso) en las capas, y el PDF adjunto en los instrumentos. El error nombra lo que falta.
- **Cuatro ojos.** Quien envió a revisión no valida ni publica (se lee de la bitácora con `core.quien_envio`). Rechazar lo puede hacer cualquier administrador autorizado.
- **Compuertas D-17.** Una capa solo se publica con restricción de uso «pública»; la función avisa con un mensaje claro antes de que salte el CHECK.
- **Retirar del público** es rechazar una capa o instrumento publicado: vuelve a borrador y la bitácora lo lee como «despublicación». No se da de baja lo que sigue publicado.
- **Historial.** Cada cambio de estado de una capa deja una fila en `core.dictamen` (si lo dicta la administración), una versión en `core.capa_version` y un evento `CAMBIO_ESTADO` en `bitacora_cambio`. En instrumentos, dictamen y `bitacora_cambio` (ver ER-3).
- **Editar** solo se puede en borrador; el estatus nunca viaja en el formulario de guardado (se rechaza con 22023), solo cambia por las funciones de flujo.

## 5. Usuarios e invitaciones

- **Emitir.** `api.fn_emitir_invitacion(correo, rol)`, solo Titular: token aleatorio de 48 hex, la base guarda únicamente su SHA-256 y lo devuelve **una sola vez**; vigencia de 7 días; rechaza correos mal formados, ya registrados, o con otra invitación vigente.
- **Consultar.** `api.fn_invitaciones()` y `api.fn_usuarios()` (correo y último acceso salen de `auth.users`, que la API no expone). La tabla de invitaciones no se expone en la API (regla del Ciclo 3, caso C32), por eso se consulta por función y sin la huella.
- **Canjear.** La persona abre `/invitacion?token=…`; `servicio-procesos` verifica el token, crea la cuenta en GoTrue (Admin API) y llama a `core.fn_consumir_invitacion`, que crea el perfil con el rol de la invitación y la marca usada. El alta queda en `core.bitacora` a nombre de quien invitó. Si el perfil falla después de crear la cuenta, el servicio retira la cuenta de GoTrue para no dejar huérfanas.
- **Baja y reactivación.** `fn_dar_de_baja_usuario` / `fn_reactivar_usuario`: lógica, bloquea el acceso en GoTrue (disparador de la 126) y queda en `core.bitacora`. Nadie se da de baja a sí mismo; no se da de baja al último Titular activo.
- **Auditoría.** La bitácora de cambios de `invitacion` nunca contiene la huella del token, y el Administrador no la lee.

## 6. Front

- **Usuarios e invitaciones (Titular):** contra el servidor. Genera el enlace de invitación, lista emitidas con su estado (vigente, usada, revocada, vencida), revoca, y da de baja o reactiva. Sin `localStorage`.
- **Canje (`/invitacion`):** pantalla pública y responsiva donde la persona elige nombre y contraseña (mínimo 10 caracteres).
- **Dictamen:** el botón «Determinar Dictamen» de la bitácora ya funciona (antes estaba deshabilitado). Abre un modal con Validar o Publicar y Rechazar (comentario obligatorio). Para instrumentos el botón solo se habilita al Titular. Los errores del servidor (cuatro ojos, permisos) se muestran tal cual.
- **Cargar capa:** `CapaCargaModal` suma fuente de origen y linaje, y los botones «Registrar borrador» y «Registrar y enviar a revisión». Registra la ficha; el archivo geográfico lo carga el servicio de procesos en el Ciclo 9.
- **`supabase.js`:** `rpc()` conserva el mensaje del servidor (antes un 403 se reescribía como «No tiene permiso») y `procesosPublico()` atiende el canje sin sesión.
- **Rechazos y plazos (ER-4):** el Capturista ve en su barra «Mis rechazos por atender» con insignia; el Administrador y el Titular, «Rechazos y plazos». Cada fila trae el motivo, quién rechazó, días hábiles restantes y estado. El Capturista decide *Retomar* o *Quitar de mi lista*, y una retomada se reenvía a revisión desde ahí. El Administrador y el Titular *reabren* vencidos o descartados. El Titular además edita los días inhábiles. Responsivo (tarjetas en móvil).
- **Aviso de modo local:** ahora dice que usuarios, invitaciones, catálogos, capas e instrumentos ya operan contra el servidor y que mediciones y evidencias siguen locales hasta los Ciclos 6 a 8.

**Nota sobre `capturista-modal.tsx` y `panel-dictamen.tsx`.** Con esos nombres solo existían en el front del Ciclo 5 de tu compañero; en el nuestro, el dictamen de capas vive en la bitácora (`BitacoraLogs`) y la carga de capas en `CapaCargaModal`, y fueron esas piezas las que se recablearon. `PanelDictamen.jsx` y `MedicionModal.jsx` de nuestro front son del flujo de **mediciones**, que corresponde a los Ciclos 6 a 8, y no se tocaron.

## 6 bis. Rechazos con plazo en días hábiles (ER-4)

**Qué pediste.** Que cuando la administración rechace una capa o un instrumento, quien lo envió reciba el rechazo como una lista propia, decida si lo **retoma** o lo **quita de su lista de pendientes**, y que tenga **vencimiento en días hábiles**. Decidimos hacerlo ahora, en este ciclo, con tres reglas tuyas: plazo de **10 días hábiles (lunes a viernes)** con un calendario de inhábiles que edita el Titular y que cargas tú, y que al vencer el pendiente **salga solo de su lista**.

**Cómo funciona.**

| Paso | Qué pasa |
|---|---|
| 1. Rechazo | El Administrador o el Titular rechaza con motivo (ya era obligatorio). Un disparador sobre `core.dictamen` crea el seguimiento: destinatario = quien envió a revisión, estado **pendiente**, plazo = 10 días hábiles desde hoy |
| 2. Decisión del destinatario | **Retomar** (queda *retomada*, sigue en su lista) o **Quitar de mi lista** (*descartada*: sale de su lista, la capa sigue en borrador, nada se borra) |
| 3. Reenvío | Al enviar de nuevo a revisión el seguimiento pasa a **atendida** y se cierra |
| 4. Vencimiento | Pasado el plazo, el pendiente o la retomada pasan a **vencida** y salen de su lista. Se calcula al consultar, al decidir y al reenviar: no necesita tarea programada |
| 5. Después del vencimiento o de quitarla | El Capturista **no puede reenviar** esa capa (mensaje claro). Un Administrador o el Titular **reabre** el rechazo con plazo nuevo de 10 días hábiles |

**Quién puede qué.** Solo el destinatario decide sobre su rechazo (ni el Administrador decide por él). El Capturista ve únicamente los suyos; Administrador, Titular y Auditor ven todos. Reabre el Administrador o el Titular; el Auditor no. El calendario de días inhábiles lo edita solo el Titular y lo leen todos los perfiles.

**Qué se agregó a la base (migración 225).** Tablas `core.rechazo_seguimiento` y `core.dia_inhabil` (ER-4, ver el anexo); funciones `api.fn_pendientes_rechazo`, `fn_decidir_rechazo`, `fn_reabrir_rechazo`, `fn_guardar_dia_inhabil`, `fn_quitar_dia_inhabil`; vista `api.dia_inhabil`; auxiliares `core.sumar_dias_habiles`, `dias_habiles_entre`, `es_dia_habil`, `vencer_rechazos`, `plazo_rechazo_dias` (10). Todo queda en `bitacora_cambio`. Con esto son **31** las funciones `api.fn_*` (ninguna ejecutable por `anon`).

**Limitaciones que conviene conocer.**

- **El calendario de inhábiles empieza vacío**: mientras no lo cargues solo cuentan como no laborables sábado y domingo. Cárgalo desde *Rechazos y plazos* (Titular).
- **Retomar y reenviar exige que la capa sea editable por el Capturista.** Hoy el Capturista puede reenviar si la ficha ya está completa, pero la pantalla para *corregir* la ficha de una capa es la del Administrador (`CapaCargaModal`). La pantalla de edición de capas para el Capturista queda con las vistas de catálogos (§10).
- **El plazo no tiene avisos activos** (correo o notificación al acercarse el vencimiento): hoy se ve la cuenta regresiva en la lista. Un aviso programado sería un servicio aparte.
- **No aplica a indicadores ni a mediciones**: los indicadores no pasan por revisión (§8 bis) y las mediciones llegan en los Ciclos 6 a 8, donde el mismo mecanismo puede reutilizarse.

## 7. Pruebas

- **`./scripts/pruebas-ciclo4.sh`: 138 casos**, con identidad real de cada perfil, en una transacción con ROLLBACK. Cubren: catálogos (permisos por perfil, claves inventadas rechazadas, compuerta de aprobación del indicador, eje principal protegido, baja bloqueada con indicadores activos, umbrales solo del Titular y un único umbral abierto); capas (ciclo completo con rechazo y reenvío, ficha incompleta, edición ajena, cuatro ojos, D-17, retiro del público, ver solo lo propio); instrumentos (D-20, D-16, PDF obligatorio, sincronía `estatus` ↔ `publicado`, visibilidad por perfil y para el ciudadano, historial); usuarios e invitaciones (huella SHA-256, vigencia, duplicados, canje, token usado o revocado, funciones de canje cerradas a la API, baja y reactivación, último Titular); auditoría (todas las tablas con disparador, el Auditor lee todo, el Administrador no lee invitaciones, sin DELETE directo); y rechazos con plazo (grupo R: cálculo de días hábiles con fines de semana e inhábiles, seguimiento al rechazar capas e instrumentos, quién decide, retomar, quitar de la lista, vencimiento, reabrir, reenvío bloqueado o cerrado, calendario solo del Titular, auditoría y cierre a la API).
- **Regresión:** Ciclo 3, **64/64**; Ciclo 5, **27/27** (la E01 se ajustó, ver el anexo).
- **Navegador (Chromium), 20 pasos:** el Titular emite una invitación, otra persona la canjea en móvil (390 px), el mismo enlace deja de servir, el Titular da de baja y reactiva, y no ve baja sobre sí mismo; un Capturista registra y envía una capa y el servidor le niega el dictamen con mensaje legible; un Administrador la rechaza (sin comentario lo pide), la reenvía y no puede validarla él mismo (cuatro ojos en pantalla); otro Administrador la valida y la publica; una capa publicada no admite baja. Sin errores de JavaScript.
- **Un hallazgo corregido durante las pruebas.** El ciclo 3 prueba que «la API no expone invitaciones»; mi primer diseño agregaba una vista `api.invitacion`. La prueba C32 lo detectó y se cambió por la función `api.fn_invitaciones()`.

**Qué NO se probó aquí:** el arnés simula PostgREST y GoTrue sobre la misma base Postgres (migraciones reales y funciones reales, pero con un traductor mío en medio). El canje contra GoTrue real (`/admin/users`) no se pudo ejercitar. Eso se verifica en tu stack (§8).

## 8. Cómo correrlo en tu stack

```bash
cd ~/Back
cp /mnt/d/SESIM.OCT2026/Back/db/migrations/22[0-4]_c4_*.sql /mnt/d/SESIM.OCT2026/Back/db/migrations/219_c4_*.sql db/migrations/
cp /mnt/d/SESIM.OCT2026/Back/db/pruebas/ciclo[45]_pruebas.sql db/pruebas/
cp /mnt/d/SESIM.OCT2026/Back/scripts/pruebas-ciclo4.sh scripts/ && chmod +x scripts/pruebas-ciclo4.sh
cp /mnt/d/SESIM.OCT2026/Back/servicio-procesos/main.py servicio-procesos/
cp -r /mnt/d/SESIM.OCT2026/Back/front/src front/
./scripts/migrar.sh && ./scripts/pruebas-ciclo4.sh && ./scripts/pruebas-ciclo5.sh && ./scripts/pruebas-ciclo3.sh
# reiniciar el servicio de procesos (nuevas rutas /invitacion/*) y PostgREST (recarga el esquema)
```

Esperado: 138/138, 27/27 y 64/64. Para el recorrido real: entra como Titular, abre **Usuarios e invitaciones**, genera un enlace con un correo tuyo de prueba, ábrelo en una ventana privada y crea la cuenta; debe aparecer como «usada» y la persona como usuaria activa. En producción conviene que `VITE_PROCESOS_URL` apunte al servicio y que `/invitacion/*` sea alcanzable sin token desde el navegador.

## 8 bis. ¿Ya se puede subir un indicador, mandarlo a revisión y que lo aprueben?

**Respuesta corta: con indicadores todavía no; con capas sí, y es el flujo que puedes probar hoy.** Hay tres cosas distintas y conviene no mezclarlas:

| Qué | Quién lo sube | ¿Pasa por revisión? | Estado |
|---|---|---|---|
| **Indicador (catálogo)**: su definición, meta, tendencia, eje | Administrador o Titular | **No.** Se crea y se aprueba en la misma función (`api.fn_guardar_indicador`, con `estatus_aprobado`). La única compuerta es que sin tendencia ni cifra de meta no se aprueba. No hay «enviar a revisión» de indicadores ni un segundo par de ojos | Funciona en el servidor; **sin pantalla** todavía |
| **Medición (el valor capturado de un indicador)**: lo que el Capturista sube y el Administrador valida | Capturista | Sí, en el modelo (borrador → revisión → vigente_admin → vigente_publico, con evidencia) | **Ciclos 6 a 8.** Hoy las mediciones siguen en modo local del navegador y no llegan al servidor |
| **Capa** y **instrumento** | Capturista (capas), Administrador (capas e instrumentos) | Sí, con cuatro ojos | **Funciona de punta a punta en el servidor y en pantalla** |

Si lo que quieres probar es «un Capturista sube algo y la administración lo aprueba», hoy se hace con una **capa**. Pasos, con tres cuentas (Capturista, Administrador y un segundo Administrador o el Titular; el segundo es necesario por los cuatro ojos):

1. **Cuentas.** Entra como Titular, abre *Usuarios e invitaciones* y genera un enlace por cada cuenta que falte. Cada persona lo abre y crea su contraseña en `/invitacion`.
2. **Subir.** El Administrador abre *Cargar / actualizar capa*, elige un GeoJSON y el PDF de la ficha, completa la ficha (incluidos **fuente de origen** y **linaje**, que son obligatorios para enviar) y pulsa **Registrar y enviar a revisión**. La capa queda en estatus *revisión*. (El Capturista puede hacer lo mismo por la API; en la interfaz, esa carga está hoy en el panel del Administrador porque así lo definía la Tabla 3 del documento.)
3. **Dictaminar.** Otra persona con perfil Administrador o Titular entra a *Bitácora → Cambios (servidor)*, busca la capa y pulsa **Determinar Dictamen**. Puede **Validar** (pasa a *vigente interno*) o **Rechazar** (el motivo es obligatorio y la capa regresa a borrador).
4. **Publicar.** Con la capa validada, el mismo botón ofrece **Publicar**. Solo se publica si su restricción de uso es «pública».
5. **Cuatro ojos.** Si quien la envió intenta validarla o publicarla, el servidor lo niega con el mensaje «Cuatro ojos…». Es el comportamiento esperado, no una falla.
6. **Instrumentos.** Mismo flujo, pero el dictamen lo hace solo el Titular y la pantalla para subirlos todavía no existe (la función `api.fn_guardar_instrumento` sí).

**Para que un indicador pase por revisión como una capa** haría falta definir una regla nueva: un estatus de revisión del indicador y quién lo propone. Eso cambia el entidad-relación (hoy `indicador` solo tiene `estatus_aprobado`, un sí o no), así que **no lo hice y te lo consulto**: ¿quieres que el Capturista proponga indicadores y el Administrador los apruebe, o el catálogo se queda como atribución exclusiva de la administración y la revisión aplica solo a las mediciones? Además falta la pantalla de captura del catálogo.

## 8 ter. Prueba contra GoTrue y PostgREST reales (sin simulación)

El recorrido en navegador del §7 usó un arnés mío que imitaba GoTrue y PostgREST. Para probar contra el stack de verdad se entrega `front/scripts/prueba-ciclo4-real.mjs` (Node 18+, solo `fetch`, sin dependencias). Habla con las mismas rutas que usa el front: `/auth/v1/token` (GoTrue), `/rest/v1/rpc/*` y `/rest/v1/<vista>` con `Content-Profile: api` / `Accept-Profile: api` (PostgREST) y `/invitacion/*` (servicio-procesos).

**1. Una sola vez: cuatro cuentas de prueba reales** (usa correos tuyos o de pruebas, no de personal real):

- Titular: el que ya tienes.
- Con el Titular, en *Usuarios e invitaciones*, genera un enlace por cada una y créalas en `/invitacion`: un **Capturista**, un **Administrador** y **otro Administrador** (hacen falta dos por los cuatro ojos). Alternativa por API: `POST /admin/alta-usuario` de servicio-procesos con el token del Titular.

**2. Variables de entorno** (en la terminal donde corras el script):

```bash
export SESIM_URL=http://localhost:8000        # gateway de Supabase (el mismo que usa VITE_SUPABASE_URL, pero absoluto)
export ANON_KEY=...                            # ANON_KEY de tu .env del backend
export PROCESOS_URL=http://localhost:8010      # servicio-procesos (puerto real de tu compose)
export TIT_CORREO=... TIT_PASS=...
export ADM_CORREO=... ADM_PASS=...
export ADM2_CORREO=... ADM2_PASS=...
export CAP_CORREO=... CAP_PASS=...
export DOMINIO_PRUEBA=tu-dominio.mx            # opcional: la cuenta temporal será ciclo4.xxxx@ese dominio
node front/scripts/prueba-ciclo4-real.mjs
```

**3. Qué comprueba (35 verificaciones).**

| Bloque | Verifica, en el stack real |
|---|---|
| GoTrue | Las cuatro cuentas inician sesión; `api.mi_perfil` devuelve el rol; sin sesión no se lee ningún perfil |
| Permisos | El Capturista no escribe catálogos (403); sin sesión no se ejecuta ninguna función; el Administrador no toca umbrales (D-16) |
| Capa | Alta en borrador, ficha incompleta rechazada con lo que falta, envío a revisión, rechazo sin motivo (400) y con motivo, el Capturista ve el rechazo en `bitacora_operativa`, cuatro ojos (403), validación por otro Administrador, publicación, el ciudadano la ve y deja de verla al retirarla, baja lógica, ciclo completo en la bitácora con actores reales |
| Invitación | El Administrador no puede emitir (403); el Titular sí (token de 48 hex); servicio-procesos reconoce el token, rechaza uno falso y **crea la cuenta en GoTrue** al canjear; el mismo token no se canjea dos veces; la cuenta nueva inicia sesión con su contraseña y nace con el rol de la invitación |
| Baja | El Titular da de baja la cuenta y **GoTrue real le niega el inicio de sesión** (es lo único que el arnés no podía comprobar: lo hace el disparador de la migración 126 al fijar `banned_until`) |

Cada fila termina en `PASA` o `FALLA` con el código y el mensaje del servidor. El script sale con código 0 si todo pasa.

**4. Qué deja.** Una capa de prueba (`T4-…`) dada de baja y una cuenta de prueba dada de baja. No se borran porque la bitácora es de solo inserción y referencia a las cuentas. Si te estorban, se identifican por el prefijo `T4-` y `ciclo4.` y se pueden ocultar con baja lógica (ya lo están).

**5. Si algo falla.**

- *401 en todo:* la `ANON_KEY` o `SESIM_URL` no son las del gateway; prueba `curl $SESIM_URL/auth/v1/health`.
- *404 en `/rest/v1/rpc/fn_…`:* PostgREST no recargó el esquema tras migrar; reinícialo (o `NOTIFY pgrst, 'reload schema'`) y confirma que `api` está en `PGRST_DB_SCHEMAS`.
- *Falla el canje (502):* servicio-procesos no alcanza a GoTrue; revisa `GOTRUE_INTERNAL_URL` y `SERVICE_ROLE_KEY` del servicio y que se reinició con el `main.py` nuevo.
- *Falla solo «la cuenta dada de baja ya no puede iniciar sesión»:* la migración 126 no está aplicada o GoTrue no lee `banned_until`; revisa el disparador `trg_bloquear_cuenta_en_baja`.
- *Códigos de error:* PostgREST traduce 42501 a 403 y los errores de regla (`23514`, `55000`, `22023`) a 400; el script espera eso.

**Cómo lo validé yo.** Corrí el mismo script contra mi arnés: 30 de 35 pasan. Las 5 que no pasan allí son diferencias del arnés, no del backend, y se esperan en el stack real: el arnés no filtra por `id=eq.…` (dos verificaciones de visibilidad pública), traduce todos los errores de clase 23 a 409 en vez de 400 (dos), y no implementa el bloqueo de GoTrue (una). Por eso la corrida en tu stack es la que cierra el ciclo.

## 9. Decisiones que tomé y puedes vetar

1. **Cuatro ojos en capas e instrumentos** (quien envía no dictamina). Es la regla ya vigente para mediciones; la extendí.
2. **Rechazar desde `vigente_publico`** es el «retiro del público» (vuelve a borrador).
3. **Enviar a revisión exige la ficha completa.** Así el Administrador no recibe capas que no puede validar.
4. **El Administrador no lee la bitácora de invitaciones**; Titular y Auditor sí.
5. **`fecha_baja` / `id_usuario_baja` no se agregaron** (sería el cuarto cambio al ER); ver el anexo.
6. **Un Titular que sube un instrumento no lo dictamina él mismo**; lo valida otro Titular.
7. **El plazo se cuenta desde el día del rechazo sin incluirlo** y el último día sí cuenta; el vencimiento es al terminar ese día. El día se toma en horario de Ciudad de México.
8. **Si el rechazo no tiene a quién avisar** (objeto de la carga inicial, sin envío a revisión registrado), no se crea seguimiento.

## 10. Pendientes

- Corrida en tu Supabase real (§8), incluido el canje contra GoTrue.
- Bucket de almacenamiento para los PDF de instrumentos y fichas de capa; carga de elementos geográficos (Ciclo 9).
- Pantalla de edición de la ficha de capa para el **Capturista** y vistas de captura de **catálogos** (ejes, sectores, fuentes, indicadores, matriz, umbrales) en el front: las funciones existen y están probadas y exportadas en `catalogoApi.js`, pero esta entrega recableó los componentes de capas, instrumentos en bitácora y usuarios, que son los existentes. Las pantallas de catálogo se arman encima de las mismas funciones.
- Sin cambios respecto de ciclos previos: D-18 (siete indicadores sin tendencia ni meta), 12 capas sin linaje, cambios a los Excel Interno y Externo pendientes de tu autorización, rotación de credenciales de desarrollo.
