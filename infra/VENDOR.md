# infra/supabase — vendorizado desde el repo oficial

Todo lo que hay dentro de `infra/supabase/` es una copia **sin modificar** de la
carpeta `docker/` del repositorio oficial `supabase/supabase`
(https://github.com/supabase/supabase), tomada el 2026-09-11 en el commit:

```
86f3a9839920de917bbf5fc2a48d43f3af1851d9
```

## Por que se vendoriza en vez de usarlo como submodulo

Para que el repo de SESIM sea autocontenido (clonar y listo, sin depender de
que el repo de Supabase siga existiendo o accesible desde donde se despliegue)
y para poder ver en el propio historial de git de SESIM exactamente que
version de la infraestructura de Supabase se esta usando.

## Regla de oro

**Nunca edites nada dentro de `infra/supabase/` a mano.** Si algo de ahi no
sirve para SESIM, se resuelve en una capa aparte:

- `db/Dockerfile` (raiz del repo) extiende la imagen `supabase/postgres` que
  usa `infra/supabase/docker-compose.yml` y le agrega las migraciones propias
  de SESIM.
- `docker-compose.sesim.yml` (raiz del repo) es un overlay que INCLUYE a
  `infra/supabase/docker-compose.yml` (con el campo `include:`, no con
  `-f infra/supabase/docker-compose.yml -f docker-compose.sesim.yml` --
  ver el comentario al inicio de ese archivo sobre por que: con `-f` las
  rutas relativas de ambos archivos no se pueden resolver bien al mismo
  tiempo) y agrega: `servicio-procesos`, `mailpit` (correo de prueba) y
  apunta el `build` del servicio `db` a nuestro Dockerfile. Es el UNICO
  archivo que hay que pasarle a `docker compose -f` (ver README.md,
  seccion "Como levantar el entorno").

## Como actualizar esta copia

Cuando convenga traer una version mas nueva de Supabase (por ejemplo, para
tomar un parche de seguridad):

```bash
rm -rf infra/supabase
git clone --depth 1 --filter=blob:none --sparse https://github.com/supabase/supabase.git /tmp/supabase-vendor
cd /tmp/supabase-vendor && git sparse-checkout set docker
cp -r /tmp/supabase-vendor/docker /ruta/al/repo/sesim-backend/infra/supabase
```

Y actualizar el hash de commit en este archivo. Despues de actualizar, revisar
`infra/supabase/CHANGELOG.md` por cambios que puedan afectar `db/Dockerfile`
o `docker-compose.sesim.yml` (por ejemplo, si cambia el nombre del servicio
`db`, o la ruta donde se montan los scripts de inicializacion de Postgres).

## Nota sobre el gateway (Envoy vs Kong)

El plan de trabajo original (`Alcances SESIM 2.pdf`) menciona Kong como
gateway. La version vendorizada aqui usa **Envoy** como gateway por defecto
(`api-gw`, servicio en `docker-compose.yml`) porque Supabase cambio su
default de Kong a Envoy. El propio repo trae un overlay
(`docker-compose.kong.yml`) para volver a Kong si se prefiere seguir el plan
al pie de la letra; no se aplico ese overlay aqui porque, de cara al front y
al servicio de procesos, es indistinto (ambos exponen la misma API en el
mismo puerto) -- pero es una decision reversible en un minuto si Ismael
prefiere Kong.
