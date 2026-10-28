# Decisiones D-14, D-16, D-17 e indicadores retenidos (27-oct-2026)

> **Actualización 28-oct-2026:** D-17 quedó resuelto y aplicado (migración 216): las 9 capas internas pasan a `vigente_admin`; DTts02 y Nat02 siguen públicas; las 12 sin linaje siguen en borrador (el equipo captura el linaje). Los apartados de D-17 de abajo son la propuesta original; el estado vigente está en `docs/modelo-datos-v22.md`.


## 1. Los siete indicadores retenidos: dónde están y qué campo falta

Fuente: `SESIM_Interno.xlsx`, hoja **`indicador`** (la fila 1 es el encabezado). La compuerta de aprobación exige que el indicador tenga `tendencia` **o** `valor_meta` con cifra (CHECK `indicador_compuerta_aprobacion`). Los siete están marcados `estatus_aprobado = TRUE` en el Excel pero llegan sin ninguno de los dos.

| Fila | Clave | `meta` (texto, sí trae) | `tendencia` | `valor_meta` | `linea_base` | Tendencia que sugiere el texto (propuesta, no aplicada) |
|---|---|---|---|---|---|---|
| 20 | Ee07 | Aumento 20% del número de pasajeros | vacío | vacío | vacío | Ascendente |
| 21 | Ee08 | Aumento 30% del número de pasajeros anuales | vacío | vacío | vacío | Ascendente |
| 22 | Ee09 | 20% del transporte de bienes y mercancías | vacío | vacío | vacío | Ascendente (el texto no dice el sentido; confirmar) |
| 43 | Ee30 | 12 operativos anuales | vacío | vacío | vacío | Ascendente |
| 44 | Ee31 | Reducción 50% de la tasa anual | vacío | vacío | vacío | Descendente |
| 45 | Ee32 | Reducción 50% de la tasa anual | vacío | vacío | vacío | Descendente |
| 56 | Ga01 | Aumento del presupuesto actual | vacío | vacío | vacío | Ascendente (sin cifra) |

Para contraste, Im29 (fila 100) e Im30 (fila 101) sí están aprobados porque traen `tendencia = Ascendente`.

Lectura: el campo que dejaron vacío es **`tendencia`** (columna J) y **`valor_meta`** (columna K); la meta existe sólo como texto libre en `meta` (columna I). En seis casos el texto ya trae la cifra (20 %, 30 %, 20 %, 12, 50 %, 50 %), pero no está en `valor_meta`, que es numérico. Ga01 trae dirección ("Aumento") sin cifra.

Para aprobarlos basta con una de dos cosas por indicador: llenar `tendencia` (la última columna de la tabla es mi lectura del texto; no la apliqué porque no invento datos) o capturar la cifra en `valor_meta`. Decide tú y lo cargo.

## 2. Lectura pública (D-14): resuelto

Confirmado: el ciudadano sin cuenta ve el dashboard público; el ingreso con usuario es otro portal. Migración **215**.

El rol `anon` lee sólo lo ya decidido como público:

- Territorio, ejes, sectores, fuentes, periodos.
- Instrumentos **publicados** y su matriz.
- Indicadores **aprobados y activos**, con sus ejes e instrumentos (hoy son 2 de 113; sube conforme se aprueben).
- Umbrales (`api.umbral_publico`) y mediciones **publicadas** (`api.medicion_publica`), sin capturista ni validador.
- Capas **vigente_publico** y sus vínculos con indicadores (hoy 66 de 87).

`anon` no lee perfil, bitácora, invitaciones, evidencia, dictámenes, hallazgos, versiones de capa, diccionario, borradores ni ninguna columna de usuario, y nunca escribe. Decisión de diseño que puedes revertir: sólo los indicadores aprobados son públicos; si prefieres exponer los 113, cambia la política `indicador_select_publico`.

## 3. D-16 (umbrales e instrumentos sólo del Titular): aplicado

Migración **214**. Se agregó `instrumento_origen.publicado` y el trigger `core.exigir_titular()`: con sesión, sólo el Administrador Titular puede crear, editar o borrar umbrales y publicar o despublicar instrumentos; cualquier otro perfil recibe error 42501. El trigger usa `auth.uid()`, así que también frena a las funciones del Ciclo 4 si algún día se equivocan. Los 6 instrumentos oficiales cargados quedaron publicados (supuesto mío: son documentos normativos oficiales; el Titular puede despublicar).

## 4. D-17: cómo clasificar el estatus de las capas

### Qué encontré

1. **Backend** (`core.capa.estatus`, 4 valores): `borrador`, `revision`, `vigente_admin`, `vigente_publico`. La carga actual usa sólo dos: **66 `vigente_publico`** (restricción de uso "pública") y **21 `borrador`**.
2. **Front** (`public/sesim/catalogo/capa.json`, 87 capas): **73 publicadas y 14 borrador**. Ese estatus viene de otro Excel anterior (`SESIM_tablas.xlsx`, hoja `capa`), no del Interno.
3. Los dos no coinciden en **11 capas**:

| Capas | Backend | Front | Por qué |
|---|---|---|---|
| DIt01, DIt02, DIt03, DIt04, DTc03, DTc04, DTp01, DTp02, Nat03 (9) | borrador | publicada | Su metadato dice restricción de uso **interna**; el front las muestra al público |
| DTts02 Sistema de ciudades, Nat02 Regiones Prioritarias Terrestres (2) | publicada | borrador | En el Interno son públicas y con metadato completo; el front las tenía como borrador |

Las otras 12 borrador coinciden en ambos (DTts01, Inf01, Inf04, Inf05, Inf06, Inf12, Inf13, Inf14, Inf15, Lim01, Lim05, Loc05): les falta el linaje, y la compuerta de publicación (custodio, fuente, linaje y sistema de coordenadas) no las deja publicarse.

### El problema de fondo

Hoy un sólo campo (`estatus`) mezcla **dos preguntas distintas**: ¿en qué punto del proceso va la capa? y ¿a quién se le puede mostrar? Los Alcances las separan: la restricción de uso (pública, interna o reservada) es un metadato obligatorio de la capa.

### Propuesta: dos ejes

**Eje 1, estatus (ciclo de vida)**, igual que las mediciones: `borrador` → `revision` → `vigente_admin` → `vigente_publico`.

**Eje 2, restricción de uso** (ya existe en `metadatos_extra.restriccion_uso`): `pública` | `interna` | `reservada`.

**Regla de visibilidad:**

| Quién | Ve |
|---|---|
| Ciudadano (`anon`) | `vigente_publico` **y** restricción pública |
| Capturista | Lo anterior + `vigente_admin` (uso interno) |
| Administrador y Titular | Todo menos borradores ajenos |
| Auditor | Todo |

**Mapeo de las 87 capas con esa regla:**

| Condición | Estatus | Capas hoy |
|---|---|---|
| Metadato completo y restricción **pública** | `vigente_publico` | 66 (sin cambio) |
| Metadato completo y restricción **interna** | `vigente_admin` (validada, sólo uso interno) | 9 (hoy `borrador`) |
| Falta metadato mínimo (linaje, etc.) | `borrador` | 12 (sin cambio) |
| En dictamen del Administrador | `revision` | 0 hoy |

**Cambios técnicos que implicaría (no aplicados; esperan tu visto bueno):**

1. Migración: pasar las 9 capas internas de `borrador` a `vigente_admin`, con su versión en `capa_version`.
2. Endurecer la compuerta: `vigente_publico` exige además `restriccion_uso = 'pública'` (una capa interna no puede publicarse por error).
3. Política `anon` de capa: ya exige `vigente_publico`; con el punto 2 queda garantizado que además sea pública.
4. Front: `capas.js` hoy decide por `estatus`; pasaría a la tabla de visibilidad de arriba, y el catálogo estático se regenera desde la base (se acaba la discrepancia de 11).

### Para que decidas

- Las 9 capas internas: el front hoy las muestra al público. ¿Se retiran del público (mi propuesta) o su restricción de uso estaba mal y deben ser públicas?
- DTts02 y Nat02: el front las tenía en borrador y el Interno las trae públicas con metadato. Ojo: el linaje de Nat02 dice "No aplica: Los criterios…", que pasa la validación pero es débil; conviene revisarlo.
- Los 12 sin linaje: ¿quién del equipo lo captura?

## 5. Pruebas

`./scripts/pruebas-ciclo3.sh`: **55 casos, 55 pasan, 0 fallan** en Postgres 16 con PostGIS (el C22 se reescribió: antes decía "anon no lee nada"; ahora verifica que no lee lo privado). Casos nuevos C39–C56: lectura pública, columnas de usuario cerradas, anon sin escritura, instrumentos publicados y D-16 (el Administrador, el Auditor y el Capturista rechazados por el trigger; el Titular aceptado). Falta tu corrida contra el Supabase real.
