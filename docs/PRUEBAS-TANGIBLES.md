# Levantar el backend y probarlo de verdad (Windows + Docker)

Objetivo: que el Ciclo 1 y el Ciclo 2 se vean funcionando en tu máquina, con
evidencia que puedas enseñar (salida de la terminal, Studio y el buzón de
correo), no en teoría.

Tiempo: la primera vez ~30–45 min (casi todo es esperar descargas).

## 0. Qué necesitas

- Windows 10/11 con virtualización activada (Administrador de tareas →
  Rendimiento → CPU → "Virtualización: habilitado").
- ~15 GB libres en disco y 8 GB de RAM (mejor 16).
- Internet para la primera descarga de imágenes.

## 1. Instalar lo que falta (solo la primera vez)

1. **WSL con Ubuntu.** PowerShell como administrador:
   `wsl --install -d Ubuntu` → reinicia → abre "Ubuntu" del menú Inicio y crea
   usuario y contraseña de Linux.
2. **Docker Desktop** (docker.com/products/docker-desktop). Al instalar deja
   marcada la opción de WSL 2. Después: Settings → General → "Use the WSL 2
   based engine" y Settings → Resources → WSL integration → activa **Ubuntu**.
3. Abre Docker Desktop y espera a que abajo a la izquierda diga **Engine
   running** (verde).

Comprobación: abre **Ubuntu** y escribe

```bash
docker version
docker compose version
```

Los dos deben mostrar versiones (sin error). Si dicen "Cannot connect to the
Docker daemon": Docker Desktop no está corriendo o falta activar Ubuntu en
WSL integration.

> Todos los comandos de aquí en adelante se escriben en la terminal de
> **Ubuntu**, no en PowerShell.

## 2. Entrar a la carpeta del backend

```bash
cd /mnt/d/SESIM.OCT2026/Back
```

(D:\SESIM.OCT2026\Back visto desde Ubuntu.) Prepara los scripts:

```bash
sed -i 's/\r$//' scripts/*.sh db/*.sh      # por si Windows les puso saltos de línea de Windows
chmod +x scripts/*.sh
```

## 3. Limpiar lo anterior (como borraste y reiniciaste, esto es importante)

Restos de una corrida vieja (otra contraseña de Postgres guardada en disco)
son la causa número uno de fallos. Una sola vez:

```bash
docker compose -f docker-compose.sesim.yml --env-file .env down -v 2>/dev/null
docker ps -a                                   # no debe quedar ningún contenedor "supabase-..."
rm -rf infra/supabase/volumes/db/data          # datos viejos de Postgres
[ -f .env ] && mv .env .env.viejo              # claves viejas
```

Si `docker ps -a` aún muestra contenedores supabase-*:
`docker rm -f $(docker ps -aq --filter name=supabase)`.

## 4. Claves y arranque

```bash
./scripts/generar-claves.sh desarrollo    # crea .env con claves nuevas
./scripts/levantar.sh                     # construye y levanta (la 1.ª vez tarda: descarga imágenes)
```

Al terminar debe decir `==> migraciones: 23 aplicada(s)` (o "nada pendiente")
y `==> arriba (ambiente: desarrollo)`. Avisos de "variable is not set"
(realtime, storage…) son normales.

Comprueba que todo esté sano:

```bash
docker ps --format "table {{.Names}}\t{{.Status}}"
```

Deben verse `supabase-db (healthy)`, `supabase-auth`, `supabase-rest`,
`supabase-envoy`, `supabase-studio`, `supabase-meta` y los de SESIM
(servicio-procesos, mailpit) con estado `Up`.

```bash
./scripts/verificar.sh                    # prueba de humo
```

Cada línea debe decir `ok`; el final, `==> todo bien.`

## 5. Cuentas de prueba y las pruebas tangibles

```bash
./scripts/sembrar.sh                      # crea las 6 cuentas de prueba (contraseña SesimDev2026!)
./scripts/pruebas-tangibles.sh            # corre los casos de la demo contra la API real
```

La salida imprime lo que respondió el servidor en cada caso y termina en
`PASA` o `FALLA`. Casos: (1) tres perfiles inician sesión y su pase trae el
rol; (2) cada perfil ve cantidades distintas de perfiles; (3) un capturista y
un administrador normal no pueden dar de alta; (4) un pase con firma alterada
o con rol falsificado se rechaza; (5) el Titular da de alta una cuenta, esa
cuenta entra, y el alta y la baja quedan en bitácora.

**Guarda la salida completa** (copiar y pegar en un archivo, o captura): es la
evidencia del Ciclo 1 y 2. Y mándamela si algo falla.

## 6. Verlo con tus ojos

- **Studio** — http://localhost:8000 (usuario `admin`, contraseña
  `DASHBOARD_PASSWORD` de tu `.env`). Table Editor → esquema `core` → tablas
  `perfil`, `bitacora` y `schema_migraciones`.
- **Correo de prueba** — http://localhost:8025. Pide un restablecimiento:

  ```bash
  curl -s -X POST "http://localhost:8000/auth/v1/recover" -H "apikey: $(grep ^ANON_KEY .env | cut -d= -f2-)" \
    -H "Content-Type: application/json" -d '{"email":"sesimcapturista1@gmail.com"}'
  ```

  y mira que llegue el correo.
- **Servicio de procesos** — http://127.0.0.1:8001/health debe decir
  `"ambiente":"desarrollo"`.

## Si algo falla

| Síntoma | Causa probable | Qué hacer |
| --- | --- | --- |
| `Cannot connect to the Docker daemon` | Docker Desktop apagado o Ubuntu sin integración | Abre Docker Desktop; Settings → Resources → WSL integration → Ubuntu |
| `port is already allocated` (5432, 8000, 8001…) | Otro programa usa ese puerto (por ejemplo un Postgres instalado en Windows) | Cambia `POSTGRES_PORT`, `API_GW_HTTP_PORT` o `PROCESOS_PORT` en `.env` y vuelve a `./scripts/levantar.sh` |
| `supabase-db` se reinicia en bucle; el log dice `permissions`/`ownership` de `/var/lib/postgresql/data` | Postgres no puede guardar datos en una carpeta de Windows (`/mnt/d`) | Copia el backend al disco de Linux y córrelo desde ahí: `mkdir -p ~/sesim && cp -r /mnt/d/SESIM.OCT2026/Back ~/sesim/ && cd ~/sesim/Back` y repite desde el paso 3 |
| `password authentication failed` en auth/rest | Quedó `volumes/db/data` de una corrida anterior | Paso 3 completo, luego `generar-claves` y `levantar` de nuevo |
| `bash\r: No such file` o `$'\r': command not found` | Saltos de línea de Windows | `sed -i 's/\r$//' scripts/*.sh db/*.sh` |
| El paso [1] de las pruebas no obtiene token | No se corrió `sembrar.sh`, o falló `auth` | `./scripts/sembrar.sh`; `docker logs supabase-auth --tail 50` |
| `verificar.sh` marca falla en "sin migraciones pendientes" | La base se creó antes del Ciclo 2 | `./scripts/migrar.sh --adoptar-hasta 120` |

Para ver los registros de un servicio:
`docker logs supabase-db --tail 80` (o `supabase-auth`, `supabase-rest`,
y `docker compose -f docker-compose.sesim.yml --env-file .env logs servicio-procesos --tail 80`).

Para apagar sin perder datos: `docker compose -f docker-compose.sesim.yml --env-file .env down`.
Para borrar todo y empezar de cero: paso 3.
