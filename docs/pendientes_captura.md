# Pendientes de captura y justificación de columnas derivadas (28-oct-2026)

**Proyecto:** SESIM (SEDUMOP Campeche) · **Para:** equipo de captura de Tejedores del territorio
**Fuente revisada:** `SESIM_Interno.xlsx` (original, intacto), hojas `indicador` y `capa`.
**Propósito:** que el equipo sepa exactamente qué llenar para que el front consuma datos completos desde SQL, sin parches ni valores inventados.

Estado de las decisiones: **D-18 (los 7 indicadores) está en pausa**. Este documento no aplica ninguna tendencia ni cifra; solo lista lo que falta. Nada de lo sugerido aquí se ha cargado.

---

## A. Los 7 indicadores sin tendencia ni meta numérica (hoja `indicador`)

### A.1 Qué pasa hoy

Los 7 están marcados `estatus_aprobado = TRUE` en el Excel, pero la base de datos tiene una compuerta (CHECK `indicador_compuerta_aprobacion`): un indicador solo puede estar aprobado si tiene `tendencia` **o** `valor_meta`. Como los 7 no traen ninguno, **se cargan como no aprobados** y el público no los ve. Im29 e Im30 sí están aprobados porque traen `tendencia = Ascendente`.

### A.2 Dónde están y qué hay que llenar

Columnas de la hoja `indicador`: F clave · G nombre · H variable · I meta (texto) · J `tendencia` · K `valor_meta` · L `linea_base` · M `anio_linea_base` · N `nivel_mir`.

| Fila | Clave | Indicador | Meta hoy (col. I, texto) | Nivel MIR | Lectura del texto (**sugerencia, no aplicada**) |
|---|---|---|---|---|---|
| 20 | Ee07 | Número de pasajeros anuales (aeroportuario) | Aumento 20% del número de pasajeros | Componentes | Ascendente |
| 21 | Ee08 | Número de pasajeros anuales (ferroviario) | Aumento 30% del número de pasajeros anuales | Componentes | Ascendente |
| 22 | Ee09 | Toneladas transportadas anuales (ferroviario) | 20% del transporte de bienes y mercancías | Propósito | Ascendente, pero el texto no dice el sentido: **confirmar** |
| 43 | Ee30 | Número anual de operativos de alcoholimetría | 12 operativos anuales | Actividades | Ascendente |
| 44 | Ee31 | Tasa de fallecimientos causados por siniestros de tránsito | Reducción 50% de la tasa anual | Fin | Descendente |
| 45 | Ee32 | Número de lesionados por siniestros de tránsito | Reducción 50% de la tasa anual | Componentes | Descendente; el texto parece copiado de Ee31, **confirmar** |
| 56 | Ga01 | Inversión total en proyectos de transporte público | Aumento del presupuesto actual | Actividades | Ascendente, sin cifra |

### A.3 Qué debe capturar el equipo, por indicador

Los tres niveles son acumulativos:

1. **Obligatorio para aprobar:** `tendencia` (col. J: Ascendente o Descendente) **o** `valor_meta` (col. K, número). Con uno basta para que el indicador pase la compuerta.
2. **Necesario para el semáforo (D-01/D-15):** `valor_meta` (col. K, número, en la misma unidad que la variable), `linea_base` (col. L) y `anio_linea_base` (col. M). Sin estos tres el semáforo de color no se puede calcular y el tablero mostrará "sin dato".
3. **Recomendado:** `unidad` de medida y `responsable` (ver sección C.5), para que la ficha pública quede completa.

Cifras que ya están en el texto de la meta y solo faltaría pasar a número en `valor_meta`: Ee07 = 20 (%), Ee08 = 30 (%), Ee09 = 20 (%), Ee30 = 12 (operativos), Ee31 = 50 (% de reducción), Ee32 = 50 (% de reducción). Ga01 no trae cifra: hay que definirla. Si la meta es relativa (aumento o reducción de %), también hace falta la `linea_base`, porque sin ella el porcentaje no tiene contra qué calcularse.

---

## B. Las 12 capas en borrador (hoja `capa`)

### B.1 Por qué están en borrador

La base de datos tiene dos compuertas (migración 216) que impiden publicar o validar una capa sin su metadato mínimo: **custodio** (responsable), **fuente de origen**, **linaje** y **sistema de coordenadas**. A las 12 les falta el **linaje**. Además, para que una capa pueda ser pública debe declarar `restriccion_uso = pública`. Mientras falten estos datos se quedan en `borrador` y no aparecen en el geovisor público.

### B.2 Qué falta, capa por capa

Columnas de la hoja `capa`: G responsable · I Contacto_custodio · J Fuente · K Linaje · O fecha_corte · P periodicidad · Q metadatos_uso (restricción de uso).

| Fila | Id | Título | Elementos | Falta (además de Linaje, col. K, y restricción de uso, col. Q) |
|---|---|---|---|---|
| 11 | DTts01 | Localidades rurales | 2,729 | `fecha_corte`, `periodicidad`; `escala_nominal` vacía (el denominador 250000 sí está) |
| 57 | Inf01 | 00_EstacionesTM_ND_2025 | 23 | `Fuente`, `Contacto_custodio`, `fecha_corte`, `periodicidad` |
| 59 | Lim01 | Límite internacional | 2 | `Fuente`, `Contacto_custodio`, `fecha_corte`, `periodicidad` |
| 64 | Inf04 | C00_emisor-senal_IMT_INEGI_2024 | 86 | `Fuente`, `Contacto_custodio`, `fecha_corte`, `periodicidad` |
| 65 | Inf05 | C04002_paraderos-tren-ligero_SEDUMOP_2025 | 15 | `Fuente`, `Contacto_custodio`, `fecha_corte`, `periodicidad` |
| 66 | Inf06 | Tren Ligero | 1 | `Contacto_custodio`, `fecha_corte`, `periodicidad` (la Fuente "INFOCAM, 2025" sí está) |
| 82 | Inf12 | C04_acueductos_IMT_INEGI_2024 | 391 | `Fuente`, `Contacto_custodio`, `fecha_corte`, `periodicidad` |
| 83 | Inf13 | C04_ductos_Champoton_2023 | 119 | `Fuente`, `Contacto_custodio`, `fecha_corte`, `periodicidad` |
| 84 | Inf14 | C04_eje-calle_IMT_INEGI_2024 | 17,751 | `Fuente`, `Contacto_custodio`, `fecha_corte`, `periodicidad` |
| 85 | Inf15 | C04_linea-transmision_IMT_INEGI_2024 | 103 | `Fuente`, `Contacto_custodio`, `fecha_corte`, `periodicidad` |
| 86 | Loc05 | C04_manzanas_IMT_INEGI_2024 | 23,165 | `Fuente`, `Contacto_custodio`, `fecha_corte`, `periodicidad` |
| 88 | Lim05 | C04_zonas_estudio_PIMUS_2025 | 24 | `Fuente`, `Contacto_custodio`, `fecha_corte`, `periodicidad` |

Resumen de brechas en las 12: **Linaje** 12 de 12 · **restricción de uso** 12 de 12 · **fecha_corte** 12 de 12 · **periodicidad** 12 de 12 · **Fuente** 10 de 12 · **Contacto_custodio** 11 de 12 · **propósito** 12 de 12 (no existe como columna en el Interno, ver C.1).

Ya presentes en las 12 y que **no** hay que tocar: `responsable`, `sistema_coordenadas` (6372 o 32615), `categoria`, `tipo_geometria` y escala.

### B.3 Cómo llenar cada campo

| Campo | Qué escribir | Ejemplo |
|---|---|---|
| Linaje | De dónde viene el dato y qué transformaciones tuvo (descarga, recorte, reproyección, depuración) | "Descargada del Marco Geoestadístico 2024 de INEGI; recortada a Campeche y reproyectada a EPSG:6372." |
| Fuente | Institución y año de la fuente original | "INEGI. Red Nacional de Caminos, 2024" |
| Contacto_custodio | Área o persona que resguarda el dato y a quien se le puede preguntar | "SEDUMOP, Dirección de Planeación" |
| Restricción de uso | Exactamente una de: `pública`, `interna`, `reservada` | `pública` |
| fecha_corte | Fecha a la que están vigentes los datos | 2024-12-31 |
| periodicidad | Cada cuánto se actualiza | Anual, Sexenal, Única |

Aviso: si se captura `pública`, la capa podrá publicarse al ciudadano; si es `interna`, quedará `vigente_admin` (solo personal con cuenta). Hay que elegir con cuidado: una vez publicada, el geovisor la sirve sin autenticación. Una nota adicional: el linaje de **Nat02** dice "No aplica: Los criterios…"; pasa la validación pero es débil y el equipo ya quedó de robustecerlo.

---

## C. Columnas derivadas: por qué existen y por qué el backend las deduce

Estas columnas **no vienen de origen** en la hoja `capa` del Interno, pero la tabla `core.capa` del modelo v2.2 las exige. **No se agregaron al Excel.** Esta sección justifica su existencia; si el equipo prefiere capturarlas a mano en el Excel, basta con pedirlo.

Fuentes de la justificación: el modelo Entidad-Relación v2.2 (`Arquitectura_Datos_SESIM.docx`, §2.12 Tabla 16 y regla R05), los Alcances del SESIM (derivados del TDR, metadatos ISO 19115) y el plan por ciclos (cláusula TDR 6.2.2 b, "base de datos estructurada y documentada"). El PDF original de los TDR es un escaneo sin texto extraíble, por lo que las cláusulas se citan a través del plan y los Alcances; conviene que alguien confirme la numeración contra el documento físico.

### C.1 `proposito`

- **Qué es:** para qué sirve la capa en el sistema.
- **ER v2.2, Tabla 16:** `proposito` text, nullable, "Propósito declarado en la ficha ISO".
- **Alcances (ISO 19115):** es uno de los metadatos **obligatorios** ("para qué sirve esta capa en el sistema"), junto con título, responsable, fuente, escala, fecha de corte, periodicidad, CRS, cobertura y restricción de uso.
- **Por qué el backend no lo deduce:** no es deducible. Hoy queda en `NULL` en las 87 capas. El modelo lo deja nullable precisamente porque el Excel no lo trae.
- **Qué debe hacer el equipo:** redactarlo por capa (una frase). Es el único campo derivado de esta sección que **requiere captura humana**.

### C.2 `srid_origen`

- **Qué es:** el código EPSG del sistema de coordenadas original de la capa.
- **ER v2.2, Tabla 16:** integer, NOT NULL, "EPSG de origen (6372, 4326, 32615, 6365)".
- **Alcances:** el CRS de origen es metadato obligatorio, y las validaciones de carga rechazan la capa si "Falta el .prj o no se puede determinar el SRID".
- **Por qué lo deduce el backend:** el Excel ya trae el CRS como texto en `sistema_coordenadas`. Pedirle al equipo que además capture el número sería duplicar el mismo dato y abrir la puerta a que ambos se contradigan. El cargador lo extrae de esa cadena; si no puede, **rechaza la carga**, no adivina. En la carga actual se derivó correctamente para las 87 capas.

### C.3 `id_instrumento`

- **Qué es:** el instrumento de origen (por ejemplo EEMSV) que sustenta la capa.
- **ER v2.2, Tabla 16 y regla R05:** FK a `instrumento_origen`; un instrumento sustenta 0..N capas y cada capa tiene 0 o 1 instrumento. Regla de la tabla: "Eemsv01 para capas de Diagnóstico y Estrategia; vacío en Mapa Base".
- **Por qué lo deduce el backend:** la regla está escrita en el modelo y depende solo de la `categoria`, que sí viene en el Excel. Se derivó para 55 capas; las 32 de Mapa Base quedan vacías por diseño.
- **Qué debe hacer el equipo:** nada, salvo avisar si alguna capa de Mapa Base sí proviene de un instrumento específico.

### C.4 `estatus`

- **Qué es:** el punto del ciclo de vida de la capa (`borrador`, `revision`, `vigente_admin`, `vigente_publico`).
- **ER v2.2:** CHECK en `capa.estatus`. El ER lista dos valores; el backend usa cuatro tras la decisión D-17, y el ER debe actualizarse para reflejarlo.
- **Por qué lo deduce el backend:** el estatus no es un dato del documento fuente, es una conclusión: depende de la restricción de uso (`metadatos_uso`) y de si el metadato mínimo está completo. La migración 216 lo calcula así y **además lo impone con dos CHECK** (`capa_compuerta_publicacion` y `capa_compuerta_validacion`), de modo que nadie pueda publicar una capa incompleta o interna por error. Capturarlo a mano en el Excel permitiría inconsistencias que la base de datos luego tendría que rechazar.
- **Resultado actual:** 66 `vigente_publico`, 9 `vigente_admin`, 12 `borrador`.

### C.5 `responsable` por indicador y ejes adicionales (indicadores)

- **`responsable`:** la hoja `indicador` del Interno no lo trae. En el Excel de indicadores original corresponde a la columna "Competencia" (18 valores libres, no normalizados contra el catálogo de dependencias). Se necesita para saber a quién pedir cada medición; conviene que el equipo lo capture o confirme.
- **Ejes adicionales:** 14 indicadores pertenecen a más de un eje (127 vínculos en total). En el Interno solo viven en la nota `qa_nota_transformacion`, no hay hoja `indicador_eje`. La tabla puente `indicador_eje` existe en el backend (decisión D-06) y se llena desde esa nota. Su documentación quedó en el diccionario de la versión v2.3 (ver abajo).

---

## D. Orden sugerido de trabajo para el equipo

1. Definir **restricción de uso** y **linaje** de las 12 capas (desbloquea su publicación).
2. Completar **Fuente**, **Contacto_custodio**, **fecha_corte** y **periodicidad**.
3. Redactar el **propósito** de las 87 capas (o al menos de las 66 públicas).
4. Cuando se retome D-18: capturar `tendencia` y `valor_meta`, `linea_base` y `anio_linea_base` de los 7 indicadores, y el `responsable` de todos.

Cuando el equipo devuelva el Excel, se recarga y la base de datos aplica sola las compuertas: lo que quede completo pasa de estatus, lo incompleto se queda en borrador.
