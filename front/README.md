# SESIM Campeche · Frontend · Versión entregable 1.0 (4 de noviembre de 2026)

Portal público e institucional del Sistema Estatal de Seguimiento de Indicadores de Movilidad y Seguridad Vial: inicio, geovisor, catálogo de instrumentos, tablero de indicadores y perfiles institucionales. Está hecho con React 19, Vite 8 y Leaflet.

## Qué contiene

Solo los archivos necesarios para instalar, ejecutar y publicar el portal.

- `index.html` y `vite.config.js`: punto de entrada y configuración de Vite.
- `package.json` y `package-lock.json`: dependencias con versiones fijas.
- `.env.example`: plantilla de variables de entorno, sin llaves.
- `src/`: código del portal.
- `public/`: logotipos, imágenes, catálogos y capas GeoJSON publicadas.
- `scripts/demo/`: backend en memoria para el modo demostración (lo usa `vite.config.js`).

`node_modules/` y `dist/` no se incluyen: se generan con `npm ci` y `npm run build`.

## Requisitos

- Node.js 20.19 o más reciente (recomendado 22 LTS) y npm.
- El backend SESIM (Supabase) en ejecución para usar datos reales. Sin backend, el portal funciona en modo demostración.

## Instalación

1. Descomprima el archivo en una carpeta nueva.
2. Abra una terminal dentro de la carpeta `SESIM_front`.
3. Instale las dependencias:

   ```
   npm ci
   ```

4. Copie `.env.example` como `.env.local` y llene `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` y `VITE_PROCESOS_URL` con los datos del backend.
5. Inicie el servidor de desarrollo:

   ```
   npm run dev
   ```

   Abra la dirección que muestra la terminal, normalmente http://localhost:5173.

## Modo demostración y publicación

Para usarlo sin backend, con datos de demostración:

```
npm run demo
```

Para generar la versión de publicación:

```
npm run build
```

El resultado queda en `dist/` y se publica en cualquier servidor web estático.

## Notas

- La información cartográfica es de referencia y no tiene validez jurídica. El aviso se muestra en el portal.
- Las descargas de capas solo incluyen `titulo` y, por elemento, `nombre`, `clasif`, `cve_mun` e `id_unidad`.
