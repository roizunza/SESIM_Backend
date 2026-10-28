# SESIM · Frontend

Sistema Estatal de Seguimiento a Indicadores de Movilidad y Seguridad Vial (SEDUMOP Campeche). React 19 + Vite + Leaflet.

- **Arquitectura de datos en el front, contrato con el backend y cambios del 20 oct 2026:** [`docs/FRONT_ARQUITECTURA_DATOS_V2.md`](docs/FRONT_ARQUITECTURA_DATOS_V2.md)
- Datos estáticos: `public/sesim/catalogo/` (tablas del modelo) y `public/sesim/capas/<id_capa>.geojson` (capas ligeras).
- Regenerar datos: `scripts/datos/02_aligerar_capas.py` y luego `scripts/datos/01_exportar_catalogos.py`.

```bash
npm install
npm run dev
```

Inicio de sesión de prueba en `/admin`: contraseña `administrador`, `titular` o `auditor`; cualquier otra entra como Capturista.
