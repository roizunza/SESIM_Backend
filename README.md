# SESIM - backend

Repositorio de backend del SESIM (Sistema Estatal de Seguimiento a Indicadores
de Movilidad y Seguridad Vial, SEDUMOP Campeche). Construido de forma
transversal por ciclos (ver `Alcances SESIM 2.pdf` / el plan de trabajo del
proyecto): cada ciclo atraviesa base de datos, backend, API y front antes de
darse por cerrado.

Este repo cubre la parte de **base de datos + API + servicio de procesos**.
El front vive en otro repositorio.

## Arquitectura (Supabase autoalojado)

SESIM corre sobre **Supabase autoalojado con Docker** (no una API a la medida
por encima de Postgres): Postgres + PostGIS, GoTrue (auth), PostgREST (API
REST autogenerada), un gateway (Envoy) y Studio (panel de administracion
visual), todo en contenedores. Esto reemplaza la version anterior de este
repo, que tenia un esquema `auth` propio y funciones `api.login`/
`api.alta_usuario` hechas a mano -- ver `docs/decisiones-pendientes.md` para
el porque del cambio.

```
infra/
  supabase/            Vendorizado SIN MODIFICAR desde supabase/supabase
                       (ver infra/VENDOR.md -- nunca editar a mano)
  VENDOR.md            Como se vendorizo y como actualizarlo

db/
  Dockerfile           Extiende supabase/postgres y agrega las migraciones
  migrations/          Esquema propio de SESIM (core.perfil, RLS, api.*)
                       Se aplican solas al primer arranque de Postgres
                       (docker-entrypoint-initdb.d), no hace falta correrlas
                       a mano.

servicio-procesos/     Servicio Python (FastAPI): lo unico que Postgres/
                       PostgREST no resuelven solos -- alta de credenciales
                       (Ciclo 1) y, en ciclos futuros, procesar XLSX y capas
                       geoespaciales.

docker-compose.sesim.yml   Overlay que se levanta junto con
                            infra/supabase/docker-compose.yml (ver "Como
                            levantar el entorno")
scripts/
  generar-claves.sh    Genera POSTGRES_PASSWORD/JWT_SECRET/ANON_KEY/
                       SERVICE_ROLE_KEY/etc. (usa el generador oficial de
                       Supabase)
  levantar.sh          Levanta solo los servicios que Ciclo 1 necesita
  sembrar.sh           Aplica las 6 cuentas de prueba (SOLO DESARROLLO)
docs/
  decisiones-pendientes.md   Lo que quedo pendiente de definir, no adivinado
```

## Ciclo 1: gestion de usuarios, perfiles, roles y permisos

Construido de forma transversal alrededor del perfil **capturista**. Trae:

- Credenciales en `auth.users` (Supabase/GoTrue), no en una tabla propia.
- `core.perfil`: rol, ambito, dependencia -- lo que es del NEGOCIO de SESIM,
  ligado 1 a 1 a `auth.users`.
- Catalogo de roles: `capturista`, `administrador`, `administrador_vip`,
  `auditor`. **La unica diferencia de `administrador_vip` frente a
  `administrador` es que solo `administrador_vip` puede dar de alta
  credenciales nuevas** (ver mas abajo, "Alta de usuarios"). En todo lo
  demas (ver y editar perfiles) administrador y administrador_vip se
  comportan igual.
- El manejo de la plataforma es **solo estatal** por ahora: todo perfil se
  da de alta con `ambito = 'estatal'`. La columna `ambito`/`cve_mun` de
  `core.perfil` se deja lista (con su candado de consistencia) por si el
  alcance municipal se reactiva, pero hoy no se usa ni se prueba ese
  camino. El filtrado de informacion por municipio sigue vivo, pero vive
  en los datos (Ciclo 3 en adelante, columna `cve_mun` de
  `core.observacion`/`core.capa`), no en las credenciales de acceso.
- RLS real sobre `core.perfil` (usando `auth.uid()`, no un esquema de roles
  de Postgres por perfil de negocio): cada quien ve su propia fila;
  auditor/administrador/administrador_vip ven todo; solo administrador y
  administrador_vip editan.
- Nadie se auto-registra ni hace INSERT directo sobre `core.perfil`: toda
  alta pasa por `servicio-procesos` (ver mas abajo).

## Como levantar el entorno

Requiere Docker y Docker Compose (`docker compose version`).

```bash
./scripts/generar-claves.sh   # crea .env con claves/secretos generados
./scripts/levantar.sh         # construye y levanta db, auth, rest, gateway,
                               # studio, meta, servicio-procesos y mailpit
./scripts/sembrar.sh          # crea las 6 cuentas de prueba del Ciclo 1
```

Con eso arriba:

- Gateway + Studio: `http://localhost:8000` (`/` es Studio -- panel visual
  para ver/editar tablas sin escribir SQL, protegido con
  `DASHBOARD_USERNAME`/`DASHBOARD_PASSWORD` de tu `.env`; `/rest/v1/...` y
  `/auth/v1/...` son la API real)
- Servicio de procesos (alta de usuarios): `http://localhost:8001`
- Buzon de correo de prueba (Mailpit): `http://localhost:8025`
- Postgres directo (psql/DBeaver): `localhost:5432`

Deliberadamente **no** se levantan `realtime`, `storage`, `imgproxy`,
`functions` ni `supavisor` (existen en `infra/supabase/` pero nada de Ciclo 1
los usa hoy -- ver `scripts/levantar.sh`). Sumarlos mas adelante es solo
agregar su nombre a la lista de servicios de ese script.

### Login (Supabase Auth, no codigo propio)

```bash
curl -s "http://localhost:8000/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"sesimcapturista1@gmail.com","password":"SesimDev2026!"}'
```

Devuelve `access_token`/`refresh_token` de GoTrue. Con el `access_token` como
`Authorization: Bearer ...` (ademas del header `apikey`) se consulta
`api.perfil`:

```bash
curl -s "http://localhost:8000/rest/v1/perfil" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer <access_token>"
```

### Restablecimiento de contrasena (Supabase Auth, no codigo propio)

```bash
curl -s -X POST "http://localhost:8000/auth/v1/recover" \
  -H "apikey: $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"sesimcapturista1@gmail.com"}'
```

El correo llega a Mailpit (`http://localhost:8025`) con un enlace a
`/auth/v1/verify`. El front real hace ese paso y, con la sesion que resulta,
un `PUT /auth/v1/user` con la nueva contrasena (ver la documentacion de
Supabase Auth para el detalle exacto del flujo del lado del front).

### Alta de usuarios (lo unico que SESIM resuelve por su cuenta)

Solo quien tiene perfil `administrador_vip` puede crear una cuenta nueva:

```bash
curl -s -X POST "http://localhost:8001/admin/alta-usuario" \
  -H "Authorization: Bearer <access_token-de-un-administrador_vip>" \
  -H "Content-Type: application/json" \
  -d '{
        "correo": "nueva.persona@example.com",
        "password": "ClaveTemporal123!",
        "nombre": "Nombre completo",
        "rol": "capturista"
      }'
```

Si quien llama no es `administrador_vip` (por ejemplo, un `administrador`
normal), responde `403`. Ver `servicio-procesos/main.py` para el detalle.

## Cuentas de la semilla (SOLO DESARROLLO)

`./scripts/sembrar.sh` crea, via la Admin API de Supabase (no INSERT directo
-- ver `servicio-procesos/seed_dev.py`):

| Cuenta | Correo | Rol |
|---|---|---|
| Capturista 1 | `sesimcapturista1@gmail.com` | capturista |
| Capturista 2 | `sesimcapturista2@gmail.com` | capturista |
| Administrador | `sesimadmin@gmail.com` | administrador |
| Administrador vip | `sesimadminvip@gmail.com` | administrador_vip |
| Auditor 1 | `sesimauditor1@gmail.com` | auditor |
| Auditor 2 | `sesimauditor2@gmail.com` | auditor |

Contrasena de las seis (solo desarrollo): `SesimDev2026!`.

**Nunca usar esta semilla en un ambiente que vaya a produccion.**

## Conectar un SMTP real (Gmail) mas adelante

Hoy el correo de GoTrue (restablecimiento de contrasena, confirmaciones) va
a Mailpit (ver `docker-compose.sesim.yml`, servicio `auth`). Cuando haya una
contrasena de aplicacion de Gmail, hay que:

1. Quitar el bloque `environment` de `auth` en `docker-compose.sesim.yml`
   (o sobreescribirlo) para que tome `SMTP_HOST=smtp.gmail.com`,
   `SMTP_PORT=587`, `SMTP_USER`/`SMTP_PASS` con la cuenta y la contrasena de
   aplicacion.
2. Reiniciar el servicio `auth`.

No hace falta tocar codigo propio: esto lo maneja GoTrue.

## Que se probo, y que falta por probar en una maquina con Docker

Este entorno (donde Claude armo este repo) tiene bloqueado el acceso a
Docker Hub por politica de red y no pudo correr `docker compose up` de
verdad. Para no dejar la logica sin probar, se armo un remedo del esquema de
Supabase (un `auth.users` + `auth.uid()`/`auth.role()` minimos) contra un
Postgres real instalado directo, y sobre eso se corrieron **las migraciones
de este repo tal cual**, sin cambiarles una linea:

- Las cuatro migraciones (`100_extensions.sql` a `103_schema_api.sql`)
  aplican limpio.
- RLS de `core.perfil` probado con los 4 roles de negocio: capturista solo
  ve su propia fila y no puede editar nada (ni la suya); administrador y
  administrador_vip ven y editan todas las filas; auditor ve todo pero no
  puede editar; sin sesion (anon), la vista `api.perfil` da `permission
  denied` (no hay ningun GRANT para `anon`, a proposito).
- El endpoint `POST /admin/alta-usuario` de `servicio-procesos` (con la
  llamada a la Admin API de GoTrue simulada, ya que no hay GoTrue real
  corriendo aqui): un `administrador_vip` puede dar de alta, un
  `administrador` normal o un `capturista` reciben `403`, un rol invalido o
  un `ambito=municipal` sin `cve_mun` reciben `422`.
- `servicio-procesos/seed_dev.py` probado dos veces seguidas: no duplica
  perfiles (usa `on conflict (id_usuario) do nothing`).

Lo que falta, y solo se puede probar en una maquina con Docker sin esa
restriccion (la tuya):

- La primera corrida real de `./scripts/levantar.sh` (construir
  `db/Dockerfile` sobre `supabase/postgres` de verdad, y que GoTrue/
  PostgREST/Envoy/Studio arranquen y se hablen entre si).
- Que `CREATE EXTENSION postgis` funcione tal cual en la imagen real de
  Supabase (todo indica que si viene disponible, pero no se pudo confirmar
  corriendo el contenedor -- si fallara, el ajuste es instalar el paquete
  de PostGIS en `db/Dockerfile` antes de ese paso, no afecta nada mas).
- El flujo de correo de verdad a traves de GoTrue -> Mailpit (la mecanica
  esta bien documentada por Supabase, pero no se corrio de punta a punta
  aqui).

Si algo de esto falla en tu maquina, dimelo con el mensaje de error
completo y lo ajustamos -- la parte que si quedo verificada (el esquema, la
RLS, el candado de administrador_vip) es la que mas costaba dejar mal.
