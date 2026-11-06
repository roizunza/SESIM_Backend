# Recorrido en navegador del Ciclo 4 (arnés de verificación)

Prueba el front contra la base REAL sin levantar todo el stack: `vite.e2e.config.js` simula GoTrue, PostgREST y el canje de
servicio-procesos con `psql` sobre una base de pruebas (usuarios `tit@`, `adm@`, `adm2@`, `cap@`, `aud@e2e.mx`).
No sustituye la corrida en el stack real: es para repetir el recorrido de 20 pasos de `e2e_c4.mjs` (Playwright).

Requiere: base `sesim_e2e` con las migraciones aplicadas y esos usuarios, y los datos de `PSQL` en la parte superior del config.
`VITE_PROCESOS_URL=/procesos npx vite --config vite.e2e.config.js --port 5298` y luego `node e2e_c4.mjs`.
