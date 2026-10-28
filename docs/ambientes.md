# Ambientes (Ciclo 2, cláusula k del TDR)

Hay tres ambientes. Se distinguen **solo** por el archivo `.env` de la raíz de
`Back`; el código, el `docker-compose.sesim.yml` y las migraciones son los mismos.

| | desarrollo | pruebas | producción |
| --- | --- | --- | --- |
| Dónde corre | laptop de trabajo | servidor de pruebas (demo semanal) | servidor de producción |
| Datos | de prueba | de prueba | reales |
| Cuentas semilla (`sembrar.sh`) | sí | sí | **no** (el script y `seed_dev.py` abortan) |
| Correo | Mailpit (buzón local) | Mailpit | SMTP institucional |
| Postgres escucha en | 127.0.0.1 | 127.0.0.1 | 127.0.0.1 |
| `.env` de partida | `env/desarrollo.env.example` | `env/pruebas.env.example` | `env/produccion.env.example` |
| Claves | propias | propias | propias |

## Reglas

1. **Un ambiente por máquina.** `infra/supabase` (vendorizada, no se edita) fija
   nombres de contenedor y carpeta de datos, así que dos ambientes no pueden
   convivir en el mismo equipo.
2. **Claves distintas por ambiente.** `generar-claves.sh <ambiente>` se corre en
   la máquina de cada ambiente; el `.env` nunca se copia de una a otra ni se
   sube al repositorio.
3. **`levantar.sh` se niega a arrancar** pruebas o producción si el `.env` aún
   tiene valores `cambia_esto`, y producción si Postgres se expone a toda la red.
4. **Producción no tiene Mailpit ni semillas.** `GET /health` del servicio de
   procesos devuelve el ambiente (`{"ok": true, "ambiente": "produccion"}`).
5. **Sin costos recurrentes de nube** (TDR 10.3, inciso e): todo corre en los
   servidores propios con Docker; no se usa ningún servicio gestionado.

## Cómo se usa

```bash
./scripts/generar-claves.sh pruebas     # una vez por máquina (crea .env)
# editar .env: URLs (y SMTP en producción)
./scripts/levantar.sh                   # levanta el ambiente y aplica migraciones
./scripts/verificar.sh                  # prueba de humo
./scripts/sembrar.sh                    # solo desarrollo/pruebas: 6 cuentas de prueba
```

## Migraciones

`db/migrations` se aplica solo al crear la base. Para cambios posteriores,
`./scripts/migrar.sh` aplica las pendientes y las registra en
`core.schema_migraciones` (nombre, huella SHA-256, origen, fecha):

- `./scripts/migrar.sh --estado` lista aplicadas y pendientes.
- Una migración ya aplicada **no se edita**: si su contenido cambia, el script
  se detiene. El cambio va en una migración nueva.
- Si la falla es a mitad de una migración, se revierte completa y el script se
  detiene.
- **Base creada antes del Ciclo 2** (como la de desarrollo actual): una sola vez,
  `./scripts/migrar.sh --adoptar-hasta 120` marca como aplicadas las 099–120
  y aplica el resto (121 en adelante). Aviso: las migraciones 101–119 se
  editaron en el Ciclo 1 (renombre a administrador titular), así que en una base
  vieja la 121 hace ese cambio; la adopción no compara huellas de las
  anteriores.

## Qué falta (no se pudo probar aquí)

Los scripts y el compose no se corrieron con Docker real en esta sesión; el
runner de migraciones sí se probó contra PostgreSQL 16 (base vacía, base
preexistente, migración editada, migración que falla). Primera corrida real:
`generar-claves.sh desarrollo` en una carpeta sin `.env`, `levantar.sh`,
`verificar.sh`.

## Si ya tienes un `.env` de antes del Ciclo 2

Agrega al `.env` existente (sin regenerar claves): `APP_ENV=desarrollo`,
`DB_BIND_ADDR=127.0.0.1`, `PROCESOS_BIND_ADDR=127.0.0.1` y `PROCESOS_PORT=8001`.
Después `./scripts/migrar.sh --adoptar-hasta 120`.
