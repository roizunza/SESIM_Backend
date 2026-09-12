# Decisiones del Ciclo 1 -- resueltas y pendientes

## Resueltas en esta vuelta

### Arquitectura: Supabase autoalojado (no una API a la medida)

La primera version de este repo se armo con un esquema `auth` propio,
funciones `api.login`/`api.alta_usuario` hechas a mano y roles de Postgres
por cada perfil de negocio. Ismael aclaro que el acuerdo real era construir
sobre **Supabase**, autoalojado con Docker (confirmado). Se rehizo el Ciclo
1 sobre eso:

- `auth.usuario` propio -> `auth.users` de Supabase (GoTrue).
- `api.login`/`api.confirmar_restablecimiento` propios -> endpoints de
  Supabase Auth (`/auth/v1/token`, `/auth/v1/recover`, `/auth/v1/verify`).
- Roles de Postgres por perfil (capturista/administrador/...) -> un solo
  rol `authenticated` + RLS que consulta `core.perfil.rol` via
  `core.rol_actual()`.
- `core.perfil` (forma de la tabla, candado de ambito/municipio) se
  mantiene igual.
- `servicio-procesos` (Python) se mantiene, pero cambia de trabajo: ya no
  manda correo de restablecimiento (eso lo hace GoTrue solo); ahora resuelve
  el alta de usuarios (ver siguiente punto) y, en ciclos futuros, procesar
  XLSX y capas geoespaciales.

Ver `infra/VENDOR.md` para como se vendorizo la infraestructura oficial de
Supabase, y `README.md` para la arquitectura completa.

### Permisos de `administrador_vip`

Definido por Ismael: **la unica diferencia** de `administrador_vip` frente a
`administrador` es que solo `administrador_vip` puede dar de alta
credenciales nuevas (`POST /admin/alta-usuario` en `servicio-procesos`). En
todo lo demas (ver y editar perfiles existentes) administrador y
administrador_vip se comportan exactamente igual -- eso no cambio.

Implementado en `servicio-procesos/main.py` (`_exigir_administrador_vip`):
valida el JWT de quien llama, busca su perfil, y solo deja pasar si
`rol = 'administrador_vip'` y esta activo. Un `administrador` normal recibe
`403`.

### Convencion de correo de las cuentas semilla

Confirmada por Ismael (reemplaza la propuesta original con sufijos
"+algo@gmail.com"):

| Cuenta | Correo |
|---|---|
| Capturista 1 | `sesimcapturista1@gmail.com` |
| Capturista 2 | `sesimcapturista2@gmail.com` |
| Administrador | `sesimadmin@gmail.com` |
| Administrador vip | `sesimadminvip@gmail.com` |
| Auditor 1 | `sesimauditor1@gmail.com` |
| Auditor 2 | `sesimauditor2@gmail.com` |

Contrasena de las seis (solo desarrollo): `SesimDev2026!`.

### SMTP real

Sigue en pausa: mientras no haya contrasena de aplicacion de Gmail, GoTrue
manda el correo a Mailpit (dev). Cuando exista, el cambio es solo de
configuracion (ver README.md, seccion "Conectar un SMTP real").

## Pendientes (nuevas, de esta vuelta)

### Simbologia de capas (Ciclo 4 / Ciclo 9)

Ismael propuso, y se valida como buen punto de partida: **5 rampas de color
graduadas (secuenciales) preconfiguradas**, ancladas en los colores
institucionales (guinda/"4T"), para que quien suba una capa elija una en
vez de configurar simbologia desde cero. Confirmado que por ahora NO hace
falta simbologia categorica/cualitativa (para variables no numericas) --
solo las 5 graduadas.

Dos cosas a tener en cuenta cuando se construya esto (Ciclo 4, tabla
`core.simbologia` del bloque geoespacial):

- Una rampa secuencial de un solo tono (variaciones de guinda) es lo mas
  fiel a la identidad institucional, pero para datos que necesiten
  distinguir muchos niveles conviene revisar que los tonos sigan siendo
  legibles para personas con dificultad para distinguir colores (daltonismo)
  -- por ejemplo, variando tambien la luminosidad y no solo la saturacion
  del guinda, no solo el matiz.
- Guardar la rampa como una lista de colores (no un solo color base +
  "calculalo tu"), para que sea trivial de version/ajustar sin tocar
  codigo.

No implementado todavia: es alcance de Ciclo 4 (o antes, si se decide
adelantar), no de Ciclo 1.

### Teselas vectoriales (Ciclo 9)

Confirmado como requisito a no perder de vista: las capas van a necesitar
transformarse a teselas vectoriales (vector tiles) para que el front las
pinte con buen desempeño. Supabase autoalojado NO trae esto de fabrica --
hay que sumar un servicio aparte al stack (candidatos tipicos: Martin o
pg_tileserv, ambos leen directo de PostGIS). Se deja anotado aqui para que
no se pierda, pero es trabajo de Ciclo 9, no de Ciclo 1.

### Subida de capas por perfiles no tecnicos (Ciclo 9)

Pregunta de Ismael: como sube una capa alguien sin perfil tecnico, si la
conexion real es con PostGIS? Respuesta (a implementar en Ciclo 9, no
ahora): esa persona nunca toca PostGIS ni SQL. Sube un archivo comun
(GeoJSON/Shapefile/GPKG) por un formulario del front; ese archivo llega a
`servicio-procesos`, que valida proyeccion/geometria/cantidad de registros
y, si todo esta bien, es quien inserta en PostGIS por su cuenta (con
privilegios de servicio, no con los de quien subio el archivo). Quien sube
la capa solo ve "se subio bien" o "hay un error en la fila 40, columna X".

### Catalogo de dependencias/areas

Sigue igual que antes: `core.perfil.dependencia` existe como columna pero
se deja en NULL en toda la semilla, porque todavia no hay catalogo real de
areas/dependencias. Cuando exista, es un `UPDATE` sobre las filas
existentes, no una migracion.

### Primera corrida real de Docker

Este repo se armo y probo en un entorno donde Docker Hub esta bloqueado por
politica de red. Se valido toda la logica (migraciones, RLS, el candado de
administrador_vip, la idempotencia de la semilla) contra un Postgres real
con un remedo del esquema de Supabase -- ver README.md, seccion "Que se
probo, y que falta por probar en una maquina con Docker", para el detalle
completo de que quedo cubierto y que falta confirmar en tu maquina.

**Bug real encontrado en la primera corrida de Ismael (ya corregido):**
`docker compose up` fallaba al montar
`infra/supabase/volumes/api/envoy/docker-entrypoint.sh` porque buscaba ese
archivo en la raiz del repo en vez de dentro de `infra/supabase/`. Causa:
al pasar dos archivos con `-f archivoA -f archivoB`, docker compose fija
UN SOLO directorio de proyecto para resolver las rutas relativas de AMBOS
archivos -- no hay forma de que las rutas relativas de
`infra/supabase/docker-compose.yml` (pensadas para resolverse dentro de
`infra/supabase/`) y las de `docker-compose.sesim.yml` (pensadas para la
raiz del repo) queden bien al mismo tiempo con ese mecanismo. Se corrigio
usando el campo `include:` de docker-compose.sesim.yml (que si resuelve
cada archivo incluido contra su propia carpeta) en vez de un segundo `-f`
-- ver el comentario al inicio de `docker-compose.sesim.yml` y de
`infra/VENDOR.md`. Validado con `docker compose config` (misma version que
la de Ismael, v5.1.3): ahora los volumenes de `infra/supabase/` y los
`build` propios de SESIM resuelven correctamente al mismo tiempo.

### Repositorio remoto

Ismael menciono que ya tiene un repositorio remoto listo para este backend.
Con el diagnostico aprobado, el repo se dejo listo localmente (`git init` +
commits); falta la URL para agregarla como remoto y subirlo.
