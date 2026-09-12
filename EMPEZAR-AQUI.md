# Guía de arranque — Ciclo 1 del SESIM

Esta es la guía para levantar, en tu propia máquina, lo que ya se construyó
y se validó del Ciclo 1 (gestión de usuarios, perfiles, roles y permisos)
sobre Supabase autoalojado. Sigue los pasos EN ORDEN. Cada paso dice qué
hace y qué deberías ver si salió bien.

Contexto rápido, por si retomas esto después de un rato: SESIM corre sobre
Supabase autoalojado (Postgres + PostGIS + autenticación + API REST +
panel de administración, todo en Docker), no sobre un backend a la medida.
`servicio-procesos` (Python) es lo único propio: hoy resuelve el alta de
usuarios; en ciclos futuros procesará XLSX y capas geoespaciales. El mismo
patrón que aquí se construye es el que después se replica --como
instalación aparte, con sus propios datos-- para el POT (ver
`docs/decisiones-pendientes.md` y, en el repo de `docker_pot`,
`docs/relacion-con-sesim.md`).

## 0. Antes de empezar

Necesitas, en tu maquina:

- **Docker Desktop** instalado y ABIERTO (ya lo tienes, según me
  comentaste).
- Este repo descomprimido en una carpeta (por ejemplo,
  `sesim-backend/`).

No necesitas instalar Postgres, Python, ni nada más por separado: todo
corre en contenedores.

## 1. Generar las claves y secretos

Abre una terminal DENTRO de la carpeta del repo (`cd ruta/a/sesim-backend`)
y corre:

```bash
./scripts/generar-claves.sh
```

Esto crea el archivo `.env` (a partir de `.env.example`) y le pone
contraseñas y llaves generadas de verdad (usa el generador oficial de
Supabase, no algo hecho a mano). Vas a ver en pantalla los valores
generados -- no hace falta que copies nada, ya quedan escritos en `.env`.

**Qué revisar en `.env` antes de seguir** (ábrelo con cualquier editor de
texto):
- `DASHBOARD_USERNAME` / `DASHBOARD_PASSWORD`: con esto vas a entrar al
  panel de administración (Studio) en el siguiente paso. Cámbialas si
  quieres algo que recuerdes más fácil.
- Todo lo demás puedes dejarlo tal como quedó generado.

## 2. Levantar el entorno

```bash
./scripts/levantar.sh
```

La primera vez tarda unos minutos (Docker descarga las imágenes de
Supabase y construye la nuestra). Al terminar, deberías ver un resumen con
las direcciones. Si quieres confirmar que todo esté corriendo:

```bash
docker compose -f docker-compose.sesim.yml --env-file .env ps
```

Todos los servicios listados deberían decir `running` (o `healthy`).

**Si algo falla aquí** (por ejemplo, en la construcción de `db/Dockerfile`
o al activar PostGIS): es justo el paso que no se pudo probar de punta a
punta en el entorno donde arme este repo (ahí Docker Hub estaba bloqueado
por política de red). Mándame el error completo tal cual salga en la
terminal y lo resolvemos -- toda la lógica de adentro (migraciones, RLS,
permisos) ya está probada y no debería ser la causa.

## 3. Entrar al panel de administración (Studio)

Abre en el navegador: **http://localhost:8000**

Te va a pedir usuario/contraseña -- son `DASHBOARD_USERNAME`/
`DASHBOARD_PASSWORD` de tu `.env`. Ahí puedes explorar las tablas
(`core.perfil`, en el esquema `core`) sin escribir SQL, si quieres
confirmar visualmente que todo está en su lugar.

## 4. Crear las 6 cuentas de prueba

```bash
./scripts/sembrar.sh
```

Esto crea, vía la API de administración de Supabase (no un INSERT
directo), las 6 cuentas de prueba:

| Cuenta | Correo | Rol |
|---|---|---|
| Capturista 1 | `sesimcapturista1@gmail.com` | capturista |
| Capturista 2 | `sesimcapturista2@gmail.com` | capturista |
| Administrador | `sesimadmin@gmail.com` | administrador |
| Administrador vip | `sesimadminvip@gmail.com` | administrador_vip |
| Auditor 1 | `sesimauditor1@gmail.com` | auditor |
| Auditor 2 | `sesimauditor2@gmail.com` | auditor |

Contraseña de las seis (SOLO desarrollo): `SesimDev2026!`.

Si lo corres dos veces, no duplica nada (ya está probado que es
idempotente).

## 5. Probar que el login funciona

Necesitas tu `ANON_KEY` (está en tu `.env`). Con eso:

```bash
curl -s "http://localhost:8000/auth/v1/token?grant_type=password" \
  -H "apikey: TU_ANON_KEY_AQUI" \
  -H "Content-Type: application/json" \
  -d '{"email":"sesimcapturista1@gmail.com","password":"SesimDev2026!"}'
```

Si todo salió bien, la respuesta trae un `access_token` largo (un JWT).
Guárdalo para el siguiente paso -- lo vas a necesitar.

## 6. Probar que los permisos (RLS) funcionan

Con el `access_token` del paso anterior (el de un **capturista**):

```bash
curl -s "http://localhost:8000/rest/v1/perfil" \
  -H "apikey: TU_ANON_KEY_AQUI" \
  -H "Authorization: Bearer EL_ACCESS_TOKEN_DEL_PASO_5"
```

Debe devolver **solo una fila** (la del propio capturista). Si repites el
mismo paso 5 y 6 pero con `sesimadmin@gmail.com` o
`sesimadminvip@gmail.com`, el mismo `GET /rest/v1/perfil` debe devolver
**las 6 filas** -- porque administrador y administrador_vip ven todo.

## 7. Probar el alta de usuarios (solo administrador_vip)

Primero haz login (paso 5) con `sesimadminvip@gmail.com` para obtener su
`access_token`. Con ese token:

```bash
curl -s -X POST "http://localhost:8001/admin/alta-usuario" \
  -H "Authorization: Bearer EL_ACCESS_TOKEN_DE_ADMINVIP" \
  -H "Content-Type: application/json" \
  -d '{
        "correo": "prueba.alta@example.com",
        "password": "ClaveTemporal123!",
        "nombre": "Cuenta de prueba",
        "rol": "capturista"
      }'
```

Debe responder `201` con el id de la cuenta creada. Si repites este mismo
`curl` pero con el `access_token` de `sesimadmin@gmail.com` (administrador
normal, NO vip), debe responder `403` -- esa es justo la restricción que
pediste (solo administrador_vip puede dar de alta).

## 8. Si quieres ver el correo de restablecimiento de contraseña

```bash
curl -s -X POST "http://localhost:8000/auth/v1/recover" \
  -H "apikey: TU_ANON_KEY_AQUI" \
  -H "Content-Type: application/json" \
  -d '{"email":"sesimcapturista1@gmail.com"}'
```

Y revisa **http://localhost:8025** (Mailpit) -- ahí debería aparecer el
correo con el enlace.

## Si todo lo anterior funcionó

El Ciclo 1 está funcionalmente arriba y probado en tu máquina. A partir de
aquí, lo que sigue es:

1. Avísame qué pasos fallaron (si alguno) para corregirlos.
2. Cuando esté todo verde, me pasas la URL del repositorio remoto que ya
   tienes listo, para subir esto (`git push`).
3. Seguimos con el Ciclo 2 (ambientes de prueba y producción) -- que,
   dicho sea de paso, se resuelve casi solo porque ya quedó la convención
   de `infra/supabase/` vendorizado + `docker-compose.sesim.yml` que
   puedes usar igual para un ambiente de prueba separado del de
   producción, solo cambiando el `.env`.

## Referencia rápida de comandos

```bash
# Ver logs de un servicio si algo no arranca
docker compose -f docker-compose.sesim.yml --env-file .env logs -f auth
docker compose -f docker-compose.sesim.yml --env-file .env logs -f servicio-procesos

# Apagar todo
docker compose -f docker-compose.sesim.yml --env-file .env down

# Volver a levantar (sin reconstruir, si no cambiaste codigo)
docker compose -f docker-compose.sesim.yml --env-file .env up -d db auth rest api-gw studio meta servicio-procesos mailpit
```

Para el detalle técnico completo (arquitectura, qué se probó y qué falta,
decisiones pendientes), ver `README.md` y `docs/decisiones-pendientes.md`
en este mismo repo.
