# Decisiones del Ciclo 3: estado al 28-oct-2026

| Decision | Resolucion | Donde vive |
|---|---|---|
| D-14 Lectura publica | El ciudadano sin cuenta ve el dashboard publico; el ingreso con usuario es otro portal. `anon` lee solo lo publico. | Migracion 215 |
| D-16 Permisos | Gestionar umbrales y publicar instrumentos es exclusivo del Administrador Titular. | Migracion 214 (trigger `core.exigir_titular()`) |
| D-17 Estatus de capas | Dos ejes (estatus y restriccion de uso). 9 capas internas pasan a `vigente_admin`; DTts02 y Nat02 siguen publicas; 12 sin linaje siguen en borrador (el equipo captura el linaje despues). El linaje de Nat02 sera revisado por el equipo. | Migracion 216 y catalogo del front |
| D-18 Siete indicadores retenidos | Pendiente: llenar `tendencia` o `valor_meta` (hoja `indicador`, filas 20, 21, 22, 43, 44, 45, 56). | Ver informe anterior |

Ver el detalle tecnico en `docs/decisiones-d14-d16-d17-indicadores.md` y `docs/modelo-datos-v22.md`.
