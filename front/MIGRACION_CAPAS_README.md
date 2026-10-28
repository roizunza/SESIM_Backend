> **Documento histórico.** La migración de capas que describe quedó sustituida el 20 de octubre de 2026 por las capas del dataset oficial v4 identificadas por `id_capa`. Ver [`docs/FRONT_ARQUITECTURA_DATOS_V2.md`](docs/FRONT_ARQUITECTURA_DATOS_V2.md).

# SESIM — instructivo de esta entrega (para subir a GitHub)

Este documento reemplaza al `MIGRACION_CAPAS_README.md` anterior. Es un
instructivo: para cada archivo o carpeta te dice si hay que **agregarlo**,
**sustituirlo** (ya existe en el repo, se reemplaza tal cual) o **eliminarlo**
(quedó huérfano, ya no lo usa ningún código). Está pensado para que tu
compañera lo siga sin tener que adivinar nada.

## 0. Qué carpeta comprimir

Comprime **toda la carpeta del proyecto**:

```
F:\Encaje\Campeche\SIM\SESIM_Frontend
```

**Excepto** la carpeta `node_modules` — no la incluyas en el zip (pesa ~124 MB,
se regenera sola). Tu compañera, después de descomprimir sobre su copia del
repo, solo necesita correr:

```bash
npm install
```

y las dependencias nuevas (`d3-geo`, `esri-leaflet`, `html2canvas`, `papaparse`)
quedan instaladas — ya están declaradas en `package.json`/`package-lock.json`,
que sí van dentro del zip.

**Antes de comprimir**, borra a mano esta carpeta si sigue apareciendo en tu
copia (no pude borrarla yo: Windows la reportó "en uso" por algún proceso —
reintenta tú, o revisa qué la tiene abierta):

```
F:\Encaje\Campeche\SIM\SESIM_Frontend\Datos\   ← huérfana, no la sirve la app (ver sección 4)
```

## 1. ⚠️ Antes de hacer `git push`: 5 archivos superan el límite de GitHub

GitHub rechaza cualquier archivo de más de 100 MB en un push normal. Por
pedido explícito, las capas se migraron **sin recortar ni simplificar**, así
que estos 5 archivos siguen superando ese límite:

| Archivo | Tamaño |
|---|---|
| `public/Datos/Diagnostico/c04_red_federal_imt_inegi_2024.geojson` | 462 MB |
| `public/Datos/Diagnostico/c04_inv_fm_campeche_inegi_2020.geojson` | 343 MB |
| `public/Datos/MapaBase/c04_red_regional_imt_inegi_2024.geojson` | 338 MB |
| `public/Datos/Diagnostico/c04_red_campeche_imt_inegi_2024.geojson` | 212 MB |
| `public/Datos/MapaBase/c04_red_campeche_imt_inegi_2024.geojson` | 210 MB |

**Opciones** (no elegí ninguna por ti):
1. Subir el repo con [Git LFS](https://git-lfs.com/) (`git lfs track "*.geojson"` antes del primer commit de estos archivos).
2. Excluir estos 5 archivos puntuales del repo (`.gitignore` uno por uno) y distribuirlos aparte (un enlace de descarga, por ejemplo).
3. Aceptar que el `git push` falle para estos 5 y resolverlo cuando lo intentes.

Ningún otro archivo del proyecto supera los 100 MB.

## 2. Qué trae esta entrega (resumen)

- **Geovisualizador**: Mapa Base reagrupado en tu árbol real de 4 categorías
  (Límites Administrativos, Localidades y Asentamientos, Red de Transportes e
  Infraestructura, Medio Físico y Conservación — 24 capas), sección
  **Diagnóstico** nueva (17 capas / 19 agrupaciones), Estrategias refrescadas.
  Simbología real de QGIS donde existe `.qml`. Carga perezosa (una capa
  gigante solo se descarga cuando el usuario la activa — antes colgaba el
  navegador). Simbología en un cuadro flotante con scroll en la esquina
  inferior derecha del mapa. Ficha de metadatos con botón "Consultar todos
  los metadatos". Botón de captura de pantalla del mapa (`html2canvas`).
  Límites Administrativos permanentemente encendidos.
- **Inicio**: fondo animado (`StreetLinesBackground`) con la traza real de
  calles de Ciudad del Carmen, animada como una expansión de Dijkstra real
  (no hardcodeada). Tarjetas de Estrategias EEMSV con deep-link al Geovisor.
- **Monitoreo de Indicadores**: tabla real desde CSV (`papaparse`), antes era
  un placeholder.
- **Perfiles institucionales (Capturista/Auditor/Administrador)**: se
  reincorporó y reconstruyó el flujo completo de **Bitácora e Instrumentos
  Normativos** (historial de actividad por rol, wizard de registro de
  instrumento, dictamen con estatus), conservando el mapa Esri vía
  `react-leaflet` + `esri-leaflet` (sin API key) que ya traían estos 3
  visores — la versión anterior de este flujo en el repo remoto usaba el SDK
  de ArcGIS (`@arcgis/core`) sin Bitácora/Instrumentos; esta entrega tiene
  ambas cosas a la vez.

## 3. Archivos y carpetas — qué hacer con cada uno

Leyenda: 🆕 agregar (no existe en el repo) · ♻️ sustituir (ya existe, se
reemplaza) · 🗑️ eliminar (huérfano, ningún código lo usa ya).

```
SESIM_Frontend/
├── package.json                                    ♻️ sustituir (4 dependencias nuevas)
├── package-lock.json                               ♻️ sustituir
├── MIGRACION_CAPAS_README.md                        ♻️ sustituir (este archivo)
├── MAPA-BASE-TRASPASO.md                            🗑️ eliminar (describía el sistema de 13 capas legado, ya retirado)
├── Datos/                                           🗑️ eliminar (huérfana — ver nota de la sección 0)
│
├── src/
│   ├── App.jsx                                      ♻️ sustituir (rutas de Bitácora por rol)
│   ├── main.jsx                                      ♻️ sustituir (envuelto en React.StrictMode)
│   │
│   ├── components/
│   │   ├── Bitacora/BitacoraLogs.jsx                 ♻️ sustituir (flujo completo: feed/tabla Capturista + tabla global Auditor/Admin)
│   │   │
│   │   ├── plataforma/
│   │   │   ├── Header.jsx                            ♻️ sustituir (botón de bitácora enruta por rol)
│   │   │   └── StreetLinesBackground.jsx              🆕 agregar
│   │   │
│   │   ├── geovisor/
│   │   │   ├── MapViewer.jsx                          ♻️ sustituir
│   │   │   ├── MapViewer.css                          ♻️ sustituir
│   │   │   ├── CapaMetadataModal.jsx                   🆕 agregar
│   │   │   └── EsriBasemap.jsx                         🆕 agregar
│   │   │
│   │   └── perfiles/
│   │       ├── administradora/
│   │       │   ├── AdministradorLayout.jsx             ♻️ sustituir (mapa Esri + Instrumentos)
│   │       │   └── AdministradorSidebar.jsx            ♻️ sustituir (acordeón Cartografía/Instrumentos)
│   │       ├── auditora/
│   │       │   ├── AuditorLayout.jsx                   ♻️ sustituir (mapa Esri)
│   │       │   ├── AuditorSidebar.jsx                  ♻️ sustituir (historial dual + filtro de fechas)
│   │       │   └── Auditor.css                         ♻️ sustituir (+ diseño responsivo)
│   │       └── capturista/
│   │           ├── CapturistaLayout.jsx                ♻️ sustituir (mapa Esri + modal de Instrumentos)
│   │           ├── CapturistaSidebar.jsx               ♻️ sustituir (botón Instrumentos + Bitácora)
│   │           └── InstrumentoModal.jsx                 🆕 agregar
│   │
│   ├── lib/
│   │   ├── loaderCapas.js                              🆕 agregar (loader genérico + carga perezosa)
│   │   ├── diagnostico.js                              🆕 agregar
│   │   ├── mapaBase.js                                 ♻️ sustituir (24 capas / 4 grupos reales)
│   │   ├── ejesEstrategicos.js                         ♻️ sustituir (data-driven)
│   │   ├── qgisSymbology.ts                            ♻️ sustituir (RuleRenderer, SVG embebido, cruce de campo)
│   │   └── leafletSymbology.ts                         ♻️ sustituir (SVG embebido, fix de CanvasPattern)
│   │
│   └── pages/
│       ├── Inicio.jsx                                  ♻️ sustituir
│       ├── Inicio.css                                  ♻️ sustituir
│       ├── MonitoreoIndicadores.jsx                     ♻️ sustituir (antes placeholder)
│       └── MonitoreoIndicadores.css                     🆕 agregar
│
└── public/
    ├── assets/carmen-streets.json                       🆕 agregar (traza real para el fondo animado)
    └── Datos/
        ├── MapaBase/
        │   ├── <24 .geojson vigentes>                   ♻️ sustituir la carpeta completa
        │   ├── estilos/manifest.json                     ♻️ sustituir
        │   ├── estilos/simbologia.json                   ♻️ sustituir
        │   ├── <23 .geojson del export viejo o del legado> 🗑️ eliminar (ver lista abajo)
        │   └── estilos/00_Mapa_Base_simbologia.json,
        │       estilos/Mapa_Base.json                    🗑️ eliminar (simbología del sistema legado)
        ├── Diagnostico/                                   🆕 agregar carpeta completa (17 .geojson + estilos/)
        ├── EjesEstrategicos/                              ♻️ sustituir carpeta completa (76 .geojson refrescados + estilos/)
        ├── Tablas/Indicadores.csv                         🆕 agregar
        ├── Aptitud/                                        🗑️ eliminar (huérfana)
        ├── Infraestructura/                                 🗑️ eliminar (huérfana)
        ├── Sociedad/                                        🗑️ eliminar (huérfana)
        ├── Crec_Urb_1980_2020.geojson                       🗑️ eliminar (huérfana)
        ├── Lim_Est_Base.json                                 🗑️ eliminar (huérfana)
        └── Lim_Mun_Base.json                                 🗑️ eliminar (huérfana)
```

Como el paquete es "comprime todo `SESIM_Frontend` menos `node_modules`", los
🗑️ **ya están borrados de tu copia local** — no van a aparecer en el zip. Esta
lista sirve para que, si alguno de ellos **ya está subido a GitHub** de antes,
tu compañera sepa que debe borrarlo también allá (`git rm`), y para que
nadie se pregunte por qué ya no están.

### Los 23 `.geojson` eliminados de `public/Datos/MapaBase/`

Ninguno aparece en tu árbol de 24 capas ni lo usa ya ningún código —
liberaron 276 MB: `estatal.geojson`, `C04_Municipios.geojson`,
`C04_ANP_2024.geojson`, `C04_Aeropuertos_2012.geojson`,
`C04_BUFER_ESTATAL.geojson`, `C04_Loc_rur.geojson`, `C04_Loc_urb.geojson`,
`C04_Puertos_reg.geojson`, `C04_RFN_2024.geojson`,
`C04_ZonasMetropolitanas.geojson`, `C04_corr_agua_2003.geojson`,
`C04_estaciones_RFN25.geojson`, `RNC_2025_SURESTE.geojson`,
`C01_00_control_mapas_pimus_2025_sesim_2026.geojson`,
`C02_00_estacionestm_nd_2025_sesim_2026.geojson`,
`c04_corrientesagua_inegi_2024.geojson`, `c04_direccion_carreteras.geojson`,
`c04_eje_calle_imt_inegi_2024.geojson`,
`c04_etiquetasrnc_imt_inegi_2024.geojson`,
`c04_localidades_urbanas_inegi_2024.geojson`,
`c04_localidades_urbanas_inegi_ai_2024.geojson`,
`c04_red_federal_imt_inegi_2024.geojson`, `c04_zonas_estudio_pimus_2025.geojson`.

## 4. Sobre la carpeta `Datos/` (sin `public/`) en la raíz del proyecto

Encontré una carpeta `Datos/` suelta en `SESIM_Frontend/Datos/` (2.4 GB,
separada de la real `public/Datos/`). Confirmé que **ningún fetch del código
la usa** — Vite solo sirve archivos estáticos desde `public/`, y todos los
`fetch('/Datos/...')` del código resuelven contra `public/Datos/`, nunca
contra esa carpeta suelta. Es un residuo (probablemente de un paso intermedio
de una migración anterior) y no aporta nada. La borré, salvo un archivo que
Windows reportó "en uso" por algún proceso — bórralo tú a mano si sigue
apareciendo (ver sección 0).

## 5. Verificación hecha

- Consola del navegador sin errores en `/`, `/geovisor`, `/monitoreo`,
  `/admin-control` (Administrador), `/admin-visor` con rol `capturista` y
  `auditora` (`localStorage.sim_role`), y en las 3 rutas de Bitácora
  (`/logs/administradora/:id`, `/logs/capturista/:id`, `/logs/auditora/:id`).
- Flujo de dictamen probado en vivo: aprobar una capa en el panel de
  Administrador le cambia el punto de estatus a verde en el sidebar, sin
  recargar la página.
- Wizard de "Registrar Instrumento Normativo" (Capturista) probado: abre,
  navega sus 3 pasos, no choca con el wizard de Cartografía existente.
- Activar una capa de 353 MB (Red Regional) desde el sidebar del Geovisor:
  descarga y dibuja sin colgar la pestaña (carga perezosa).
- Los 3 visores de perfil (Capturista/Auditor/Administrador) siguen usando
  el mapa base de Esri "Gray"/"Imagery" vía `esri-leaflet` — sin API key,
  tal como se decidió esta sesión (los estilos vectoriales "Light"/"Dark"
  modernos de Esri sí requieren una API key propia; se dejaron fuera a
  propósito).
