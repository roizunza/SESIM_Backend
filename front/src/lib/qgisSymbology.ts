/**
 * Traducción del volcado de simbología de QGIS a un modelo normalizado.
 *
 * Módulo puro: no importa Leaflet ni React. La cartografía se va a migrar a
 * Supabase, así que esta traducción debe poder correr también del lado del
 * servidor (o alimentar un estilo MapLibre) sin arrastrar el visor consigo.
 * El adaptador a Leaflet vive en `leafletSymbology.ts`.
 */

// QGIS expresa las medidas en milímetros o puntos; el canvas web trabaja en
// píxeles a 96 dpi.
const MM_TO_PX = 96 / 25.4
const PT_TO_PX = 96 / 72

export interface Rgba {
  css: string
  alpha: number
}

export interface Offset {
  x: number
  y: number
}

export interface Stroke {
  color: Rgba
  width: number
  dashArray: string | null
}

export type MarkerShape =
  | 'circle'
  | 'square'
  | 'diamond'
  | 'triangle'
  | 'pentagon'
  | 'hexagon'
  | 'octagon'
  | 'star'

export type SymbolLayer =
  | { kind: 'fill'; color: Rgba | null; outline: Stroke | null }
  | { kind: 'patternFill'; color: Rgba; angle: number; distance: number; width: number }
  | { kind: 'rasterFill'; image: string; width: number; alpha: number }
  | { kind: 'line'; stroke: Stroke }
  | { kind: 'markerLine'; interval: number }
  | {
      kind: 'shapeMarker'
      shape: MarkerShape
      color: Rgba | null
      outline: Stroke | null
      size: number
      angle: number
      offset: Offset
    }
  | {
      kind: 'svgMarker'
      svg: string
      /** SVG embebido en el propio `.qml` (`name: "base64:…"`), decodificado
       * a marcado real — a diferencia de `svg` (nombre de archivo), que solo
       * sirve para buscar en `QGIS_SVG_LIBRARY`. Cuando existe, tiene
       * prioridad: es el arte original, no una reconstrucción a mano. */
      svgInline: string | null
      color: Rgba | null
      outline: Stroke | null
      size: number
      angle: number
      offset: Offset
    }
  | {
      kind: 'glyphMarker'
      /** `null` cuando el volcado no trae el carácter: se dibuja solo el disco. */
      char: string | null
      font: string
      color: Rgba | null
      outline: Stroke | null
      size: number
      angle: number
      offset: Offset
    }
  | {
      kind: 'rasterMarker'
      image: string
      size: number
      angle: number
      alpha: number
      offset: Offset
    }

export type GeometryKind = 'point' | 'line' | 'polygon' | 'unknown'

export interface ResolvedSymbol {
  geometry: GeometryKind
  /** Opacidad del símbolo QGIS (`opacidad`), independiente de la del usuario. */
  opacity: number
  /** Pila completa de capas de símbolo, en orden de dibujo (0 = al fondo). */
  layers: SymbolLayer[]
}

/** `'125,139,143,0,rgb:0.49,0.54,0.56,0'` → `{ css:'rgb(125,139,143)', alpha:0 }`. */
export function parseQgisColor(raw: unknown): Rgba | null {
  if (typeof raw !== 'string') return null
  const match = raw.match(/^(\d+),(\d+),(\d+)(?:,(\d+))?/)
  if (!match) return null
  const alpha = match[4] !== undefined ? Number(match[4]) / 255 : 1
  return { css: `rgb(${match[1]},${match[2]},${match[3]})`, alpha }
}

function toPx(value: unknown, unit: unknown): number {
  const n = parseFloat(String(value ?? ''))
  if (!Number.isFinite(n)) return 0
  switch (unit) {
    case 'Point':
      return n * PT_TO_PX
    case 'Pixel':
      return n
    // 'MapUnit' y 'RenderMetersInMapUnits' dependen de la escala del mapa y no
    // se pueden resolver estáticamente; se tratan como mm para no perder el
    // símbolo. Hoy los estilos solo usan 'MM' y 'Point'.
    default:
      return n * MM_TO_PX
  }
}

const DASH_PATTERNS: Record<string, string> = {
  dash: '8,4',
  dot: '1,3',
  'dash dot': '8,4,1,4',
  'dash dot dot': '8,4,1,4,1,4',
}

type Props = Record<string, unknown>

function readDashArray(props: Props, styleKey: string): string | null {
  if (String(props.use_custom_dash) === '1' && props.customdash) {
    const segments = String(props.customdash)
      .split(';')
      .map((part) => toPx(part, props.customdash_unit))
      .filter((n) => n > 0)
    if (segments.length) return segments.join(',')
  }
  return DASH_PATTERNS[String(props[styleKey] ?? 'solid')] ?? null
}

/**
 * Unidad de una medida. El volcado nuevo dejó de exportar casi todos los
 * `*_unit` y solo conserva `size_unit`, así que cuando falta se asume la del
 * tamaño: dentro de una misma capa de símbolo QGIS se suele autorizar todo en
 * la misma unidad. Es una suposición, no un dato — sin ella los trazos de una
 * capa en puntos salen 2.8× más gruesos, que es la razón entre mm y punto.
 * Se puede quitar en cuanto el exportador vuelva a incluir los `*_unit`.
 */
function unitFor(props: Props, key: string): unknown {
  return props[`${key}_unit`] ?? props.size_unit
}

/** Devuelve `null` cuando QGIS tiene el trazo apagado (`*_style: 'no'`). */
function readStroke(
  props: Props,
  colorKey: string,
  widthKey: string,
  styleKey: string
): Stroke | null {
  if (String(props[styleKey] ?? 'solid') === 'no') return null
  const color = parseQgisColor(props[colorKey])
  if (!color || color.alpha === 0) return null
  const width = toPx(props[widthKey], unitFor(props, widthKey))
  return {
    color,
    // Ancho 0 en QGIS es una línea de un píxel, no la ausencia de línea.
    width: width > 0 ? width : 1,
    dashArray: readDashArray(props, styleKey),
  }
}

function readOffset(props: Props): Offset {
  const [rawX, rawY] = String(props.offset ?? '0,0').split(',')
  return {
    x: toPx(rawX, unitFor(props, 'offset')),
    y: toPx(rawY, unitFor(props, 'offset')),
  }
}

function readAngle(props: Props): number {
  const n = parseFloat(String(props.angle ?? '0'))
  return Number.isFinite(n) ? n : 0
}

const SHAPE_ALIASES: Record<string, MarkerShape> = {
  circle: 'circle',
  square: 'square',
  rectangle: 'square',
  diamond: 'diamond',
  triangle: 'triangle',
  equilateral_triangle: 'triangle',
  pentagon: 'pentagon',
  hexagon: 'hexagon',
  octagon: 'octagon',
  star: 'star',
  regular_star: 'star',
}

function readShape(raw: unknown): MarkerShape {
  return SHAPE_ALIASES[String(raw ?? '').toLowerCase()] ?? 'circle'
}

/**
 * QGIS embebe rásteres como `'base64:iVBORw0…'`. Cuando en cambio guarda una
 * ruta del disco del autor no hay nada que podamos cargar desde el navegador.
 */
function readEmbeddedImage(raw: unknown): string | null {
  const value = String(raw ?? '')
  if (!value.startsWith('base64:')) return null
  const payload = value.slice('base64:'.length)
  const mime = payload.startsWith('iVBOR') ? 'image/png' : 'image/jpeg'
  return `data:${mime};base64,${payload}`
}

/** Se queda con el nombre de archivo: las rutas son absolutas del equipo autor. */
function basename(raw: unknown): string {
  return String(raw ?? '').split(/[\\/]/).pop() ?? ''
}

/**
 * SVG embebido de un `QgsSvgMarkerSymbolLayer` (`name: "base64:…"`), a
 * diferencia de `readEmbeddedImage` que asume PNG/JPEG: aquí el payload es
 * el propio marcado SVG en texto, no una imagen rasterizada.
 */
function readEmbeddedSvg(raw: unknown): string | null {
  const value = String(raw ?? '')
  if (!value.startsWith('base64:')) return null
  try {
    const binario = atob(value.slice('base64:'.length))
    const bytes = Uint8Array.from(binario, (c) => c.charCodeAt(0))
    return new TextDecoder('utf-8').decode(bytes)
  } catch {
    return null
  }
}

/**
 * Color de trazo del propio símbolo, para las tramas que no traen el suyo.
 *
 * `QgsLinePatternFillSymbolLayer` delega su color a un sub-símbolo de línea que
 * el volcado no exporta, y escribe `color: 'NULL'`. Sin esto la trama se
 * descarta y el polígono se queda sin rayado. En la cartografía de origen la
 * trama y el trazo del símbolo son del mismo color, así que se reutiliza.
 */
function strokeColorOfStack(capas: any[]): Rgba | null {
  for (const capa of capas) {
    const props: Props = capa?.props ?? capa?.propiedades ?? {}
    const color = parseQgisColor(props.line_color) ?? parseQgisColor(props.outline_color)
    if (color) return color
  }
  return null
}

function translateSymbolLayer(capa: any, patternFallback: Rgba | null = null): SymbolLayer | null {
  // El volcado nuevo renombró `tipo`→`clase` y `propiedades`→`props`, y añadió
  // `enabled`. Se aceptan ambos esquemas mientras la cartografía termina de
  // migrarse módulo por módulo; cuando los seis estén en el formato nuevo, los
  // nombres viejos se pueden borrar.
  if (capa?.enabled === false) return null
  const props: Props = capa?.props ?? capa?.propiedades ?? {}

  switch (capa?.clase ?? capa?.tipo) {
    case 'QgsSimpleFillSymbolLayer': {
      const noBrush = String(props.style ?? 'solid') === 'no'
      const color = noBrush ? null : parseQgisColor(props.color)
      return {
        kind: 'fill',
        color: color && color.alpha > 0 ? color : null,
        outline: readStroke(props, 'outline_color', 'outline_width', 'outline_style'),
      }
    }

    case 'QgsSimpleLineSymbolLayer': {
      const stroke = readStroke(props, 'line_color', 'line_width', 'line_style')
      return stroke ? { kind: 'line', stroke } : null
    }

    case 'QgsLinePatternFillSymbolLayer': {
      const color = parseQgisColor(props.color) ?? patternFallback
      if (!color) return null
      return {
        kind: 'patternFill',
        color,
        angle: parseFloat(String(props.angle ?? '45')) || 0,
        distance: toPx(props.distance, props.distance_unit) || 6,
        width: Math.max(toPx(props.line_width, props.line_width_unit), 0.5),
      }
    }

    case 'QgsRasterFillSymbolLayer': {
      const image = readEmbeddedImage(props.imageFile)
      if (!image) return null
      return {
        kind: 'rasterFill',
        image,
        width: toPx(props.width, props.width_unit) || 32,
        alpha: parseFloat(String(props.alpha ?? '1')) || 1,
      }
    }

    // QGIS dibuja un sub-símbolo repetido a lo largo de la línea, pero el
    // volcado no lo incluye: solo conservamos la cadencia para insinuarlo.
    case 'QgsMarkerLineSymbolLayer':
      return {
        kind: 'markerLine',
        interval: toPx(props.interval, props.interval_unit) || 8,
      }

    // El marcador relleno aplana su sub-símbolo en `color`, así que se comporta
    // igual que el marcador simple.
    case 'QgsSimpleMarkerSymbolLayer':
    case 'QgsFilledMarkerSymbolLayer':
      return {
        kind: 'shapeMarker',
        shape: readShape(props.name),
        color: parseQgisColor(props.color),
        outline: readStroke(props, 'outline_color', 'outline_width', 'outline_style'),
        size: toPx(props.size, props.size_unit) || 8,
        angle: readAngle(props),
        offset: readOffset(props),
      }

    case 'QgsSvgMarkerSymbolLayer':
      return {
        kind: 'svgMarker',
        svg: basename(props.name),
        svgInline: readEmbeddedSvg(props.name),
        color: parseQgisColor(props.color),
        outline: readStroke(props, 'outline_color', 'outline_width', 'outline_style'),
        size: toPx(props.size, props.size_unit) || 8,
        angle: readAngle(props),
        offset: readOffset(props),
      }

    case 'QgsFontMarkerSymbolLayer':
      return {
        kind: 'glyphMarker',
        // El volcado nuevo dejó de exportar `chr`. Sin carácter no se dibuja
        // texto: un '?' literal ensucia el mapa más que el disco solo.
        char: props.chr != null ? String(props.chr) : null,
        font: String(props.font ?? 'sans-serif'),
        color: parseQgisColor(props.color),
        outline: readStroke(props, 'outline_color', 'outline_width', 'outline_style'),
        size: toPx(props.size, props.size_unit) || 12,
        angle: readAngle(props),
        offset: readOffset(props),
      }

    case 'QgsRasterMarkerSymbolLayer': {
      const image = readEmbeddedImage(props.imageFile)
      if (!image) return null
      return {
        kind: 'rasterMarker',
        image,
        size: toPx(props.size, props.size_unit) || 16,
        angle: readAngle(props),
        alpha: parseFloat(String(props.alpha ?? '1')) || 1,
        offset: readOffset(props),
      }
    }

    default:
      return null
  }
}

const GEOMETRY_BY_CODE: Record<string, GeometryKind> = {
  '0': 'point',
  '1': 'line',
  '2': 'polygon',
}

function buildSymbol(simbolo: any): ResolvedSymbol | null {
  if (!simbolo) return null
  const capas: any[] = simbolo.capas_simbolo ?? []
  const patternFallback = strokeColorOfStack(capas)
  const layers = capas
    .map((capa) => translateSymbolLayer(capa, patternFallback))
    .filter((layer: SymbolLayer | null): layer is SymbolLayer => layer !== null)
  if (!layers.length) return null
  return {
    geometry: GEOMETRY_BY_CODE[String(simbolo.tipo_geometria)] ?? 'unknown',
    opacity: typeof simbolo.opacidad === 'number' ? simbolo.opacidad : 1,
    layers,
  }
}

/** El volcado viejo entrecomilla el campo (`'"POL_OT"'`); el nuevo no. */
function unquote(raw: unknown): string {
  return String(raw ?? '').replace(/^["'](.*)["']$/, '$1')
}

// El volcado nuevo renombró varias claves respecto al viejo. Estos tres
// ayudantes concentran la equivalencia para que el resto del módulo no tenga
// que saber de qué formato viene la capa; cuando los seis módulos estén
// migrados, se pueden reducir a la clave nueva.

/** `campo` (nuevo) o `campo_clasificacion` (viejo). */
function classificationField(simbologia: any): string {
  return unquote(simbologia?.campo ?? simbologia?.campo_clasificacion)
}

/** `simbolo_unico` (nuevo) o `simbolo` (viejo). */
function singleSymbolOf(simbologia: any): any {
  return simbologia?.simbolo_unico ?? simbologia?.simbolo
}

/** Una clase apagada en la leyenda de QGIS no se dibuja: `activo` / `renderizado`. */
function classIsDrawn(clase: any): boolean {
  return clase?.activo !== false && clase?.renderizado !== false
}

function sameValue(a: unknown, b: unknown): boolean {
  const left = String(a ?? '')
  const right = String(b ?? '')
  if (left === right) return true
  // Un campo numérico puede llegar como 1 desde el GeoJSON y como '1.0' desde
  // el volcado de QGIS, que serializa los valores con `str()` de Python.
  const nl = Number(left)
  const nr = Number(right)
  return left !== '' && right !== '' && Number.isFinite(nl) && Number.isFinite(nr) && nl === nr
}

/** En QGIS la clase «todos los otros valores» es la que no tiene etiqueta. */
function isCatchAll(categoria: any): boolean {
  return String(categoria?.etiqueta ?? '').trim() === ''
}

function pickCategory(simbologia: any, properties: Record<string, unknown>): any {
  const value = valorDeCampo(properties, classificationField(simbologia))
  const categorias: any[] = simbologia.categorias ?? []
  const chosen =
    categorias.find((categoria) => !isCatchAll(categoria) && sameValue(categoria.valor, value)) ??
    categorias.find(isCatchAll)
  if (!chosen || !classIsDrawn(chosen)) return null
  return chosen.simbolo
}

// Claves institucionales que `sim_core.py` reserva en el GeoJSON exportado
// (ver el esquema de propiedades de las capas de Estrategias). Cuando el
// campo original del shapefile choca con una de estas — típicamente
// "nombre", que casi todas las capas traían de origen —, el exportador lo
// renombra a `<campo>_orig` para no perder el dato. Las reglas de
// `RuleRenderer` de los `.qml` todavía filtran por el nombre ORIGINAL
// (`"NOMBRE"`), así que hay que aplicar el mismo renombre antes de buscarlo
// en las properties del GeoJSON.
const CAMPOS_INSTITUCIONALES = new Set([
  'nombre', 'proposito', 'descripcion', 'fuente', 'categoria', 'categoria_estrategia',
  'tema_subgrupo', 'cobertura', 'fecha', 'instrumento', 'horizonte_planeacion',
  'eje_evaluacion', 'periodicidad', 'responsable', 'restricciones', 'proyeccion',
  'estatus', 'tipo_dato', 'geometria', 'dominio_valores',
])

function resolverCampoOriginal(campo: string): string {
  const minuscula = campo.toLowerCase()
  return CAMPOS_INSTITUCIONALES.has(minuscula) ? `${minuscula}_orig` : minuscula
}

/**
 * Busca el valor de un campo del `.qml` en las properties del GeoJSON,
 * probando primero el nombre **tal cual** (Mapa Base conserva sus campos de
 * negocio en MAYÚSCULAS sin renombrar, p. ej. `NOMBRE` en ANP — ahí no hay
 * colisión ninguna) y, si no existe, el nombre con el cruce de
 * `resolverCampoOriginal` (el caso de Estrategias, donde `sim_core.py` sí
 * renombra). Un solo camino no sirve para los dos esquemas a la vez.
 */
function valorDeCampo(properties: Record<string, unknown>, campo: string): unknown {
  if (campo in properties) return properties[campo]
  return properties?.[resolverCampoOriginal(campo)]
}

/**
 * Elige la regla de un `RuleRenderer` que dibuja un elemento: primera regla
 * cuyo `campo = valor` coincide (con el cruce de nombre de `resolverCampoOriginal`),
 * o la regla "todos los otros valores" si ninguna coincide.
 */
function pickRule(simbologia: any, properties: Record<string, unknown>): any {
  const reglas: any[] = simbologia.reglas ?? []
  let catchAll: any = null
  for (const regla of reglas) {
    if (regla.catch_all) {
      catchAll = regla
      continue
    }
    if (!regla.campo) continue
    const valor = valorDeCampo(properties, regla.campo)
    if (sameValue(regla.valor, valor)) return regla.simbolo
  }
  // La regla catch-all de QGIS puede venir desactivada (`checkstate="0"` en
  // el .qml, no capturado aquí porque estos datos no lo usan); si algún día
  // aparece, tratarla como "no dibuja" es lo seguro.
  return catchAll?.simbolo ?? null
}

function pickRange(simbologia: any, properties: Record<string, unknown>): any {
  const value = Number(valorDeCampo(properties, classificationField(simbologia)))
  if (!Number.isFinite(value)) return null
  const rangos: any[] = simbologia.rangos ?? []
  for (let i = 0; i < rangos.length; i++) {
    const min = Number(rangos[i].valor_min)
    const max = Number(rangos[i].valor_max)
    // QGIS incluye la cota inferior solo en la primera clase; en las demás el
    // intervalo es (min, max], para que las fronteras no se solapen.
    const aboveMin = i === 0 ? value >= min : value > min
    if (aboveMin && value <= max) return rangos[i].simbolo
  }
  // Fuera de todos los rangos QGIS no dibuja el elemento.
  return null
}

/** Una fila de la leyenda: una clase de la capa con el símbolo que la dibuja. */
export interface LegendEntry {
  /**
   * Etiqueta de la clase. `null` en simbología de símbolo único, donde la capa
   * no se subdivide y su propio nombre es la etiqueta.
   */
  label: string | null
  symbol: ResolvedSymbol
}

/** Etiqueta visible de una categoría; cae al valor cuando QGIS no le puso una. */
function categoryLabel(categoria: any): string {
  const etiqueta = String(categoria?.etiqueta ?? '').trim()
  if (etiqueta) return etiqueta
  const valor = String(categoria?.valor ?? '').trim()
  // Sin etiqueta ni valor es la clase «todos los otros valores» de QGIS, que en
  // su leyenda aparece en blanco. En blanco aquí no comunicaría nada.
  return valor || 'Otros valores'
}

function rangeLabel(rango: any): string {
  const etiqueta = String(rango?.etiqueta ?? '').trim()
  if (etiqueta) return etiqueta
  return `${rango?.valor_min} – ${rango?.valor_max}`
}

/**
 * Enumera las clases que la capa dibuja, para construir su leyenda.
 *
 * Es la contraparte de `resolveSymbol`: aquella resuelve el símbolo de *un*
 * elemento; esta lista *todas* las clases sin necesidad de los datos. Aplica los
 * mismos descartes, así que una clase que el mapa no pinta tampoco aparece aquí.
 *
 * Devuelve `[]` cuando la capa no dibuja nada.
 */
export function resolveLegend(simbologia: any): LegendEntry[] {
  if (!simbologia) return []

  switch (simbologia.tipo) {
    case 'categorizedSymbol': {
      const categorias: any[] = simbologia.categorias ?? []
      return categorias.flatMap((categoria) => {
        if (!classIsDrawn(categoria)) return []
        const symbol = buildSymbol(categoria?.simbolo)
        return symbol ? [{ label: categoryLabel(categoria), symbol }] : []
      })
    }

    case 'graduatedSymbol': {
      const rangos: any[] = simbologia.rangos ?? []
      return rangos.flatMap((rango) => {
        const symbol = buildSymbol(rango?.simbolo)
        return symbol ? [{ label: rangeLabel(rango), symbol }] : []
      })
    }

    case 'ruleRenderer': {
      const reglas: any[] = simbologia.reglas ?? []
      return reglas.flatMap((regla) => {
        const symbol = buildSymbol(regla?.simbolo)
        return symbol ? [{ label: regla.etiqueta ?? null, symbol }] : []
      })
    }

    default: {
      const symbol = buildSymbol(singleSymbolOf(simbologia))
      return symbol ? [{ label: null, symbol }] : []
    }
  }
}

/**
 * Resuelve el símbolo que corresponde a un elemento.
 *
 * Devuelve `null` cuando QGIS no lo dibujaría: clase apagada, valor sin
 * categoría, o valor fuera de los rangos graduados.
 */
/**
 * Devuelve un resolvedor de símbolo **con memoria** para una capa.
 *
 * `resolveSymbol` es puro pero caro, y quien dibuja lo llama una vez por
 * elemento *y por cada gancho de Leaflet* (`filter`, `style`, `pointToLayer`).
 * En una capa de 76 897 tramos eso son ~154 000 resoluciones para producir 7
 * símbolos distintos, porque el resultado solo depende del valor del campo de
 * clasificación, no del elemento.
 *
 * La caché vive en el cierre que se devuelve, no en el módulo: cada capa tiene
 * la suya y se va con ella. Así esto sigue siendo código puro y sin estado
 * global, apto para correr en el servidor cuando las capas migren a Supabase.
 *
 * Usar esto en vez de `resolveSymbol` siempre que se recorra una capa entera.
 */
export function createSymbolResolver(
  simbologia: any
): (properties?: Record<string, unknown>) => ResolvedSymbol | null {
  if (!simbologia) return () => null

  // Un RuleRenderer no tiene un único `campo` (cada regla puede filtrar el
  // suyo, aunque en estos datos todas las reglas de una capa comparten uno),
  // así que se cachea por la combinación de valores de todos los campos que
  // sus reglas realmente usan, no por uno solo.
  if (simbologia.tipo === 'ruleRenderer') {
    const campos = Array.from(
      new Set(((simbologia.reglas ?? []) as any[]).map((r) => r.campo).filter(Boolean))
    )
    const cacheReglas = new Map<string, ResolvedSymbol | null>()
    return (properties = {}) => {
      const clave = campos.map((c) => String(valorDeCampo(properties, c) ?? '')).join(' ')
      if (cacheReglas.has(clave)) return cacheReglas.get(clave) ?? null
      const symbol = resolveSymbol(simbologia, properties)
      cacheReglas.set(clave, symbol)
      return symbol
    }
  }

  // Sin campo de clasificación el símbolo es el mismo para toda la capa, así
  // que se resuelve una sola vez. `classificationField` devuelve '' si no hay.
  const campo = classificationField(simbologia)
  if (!campo) {
    const unico = resolveSymbol(simbologia)
    return () => unico
  }

  const cache = new Map<unknown, ResolvedSymbol | null>()
  return (properties = {}) => {
    const valor = valorDeCampo(properties, campo)
    if (cache.has(valor)) return cache.get(valor) ?? null
    const symbol = resolveSymbol(simbologia, properties)
    cache.set(valor, symbol)
    return symbol
  }
}

export function resolveSymbol(
  simbologia: any,
  properties: Record<string, unknown> = {}
): ResolvedSymbol | null {
  if (!simbologia) return null

  switch (simbologia.tipo) {
    case 'singleSymbol':
      return buildSymbol(singleSymbolOf(simbologia))
    case 'categorizedSymbol':
      return buildSymbol(pickCategory(simbologia, properties))
    case 'graduatedSymbol':
      return buildSymbol(pickRange(simbologia, properties))
    case 'ruleRenderer':
      return buildSymbol(pickRule(simbologia, properties))
    // 'raster' y cualquier tipo desconocido no traen pila de símbolos.
    default:
      return buildSymbol(singleSymbolOf(simbologia))
  }
}
