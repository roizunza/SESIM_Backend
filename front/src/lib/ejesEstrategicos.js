/**
 * Las 5 Estrategias (ejes) de la EEMSV de Campeche 2024-2040 — contenido
 * editorial (título corto, color, ícono). `numero` coincide con
 * `eje_tematico.numero_eje` y con el grupo «Estrategia › Eje N» de la tabla
 * `capa`; las capas de cada eje ya NO se listan aquí: salen del catálogo
 * (ver src/lib/sesim/capas.js).
 *
 * Lo usan Inicio.jsx (tarjetas con deep-link `/geovisor?estrategia=ejeN`) y
 * el geovisor (encabezado de cada grupo de Estrategias).
 */
export const EJES_ESTRATEGICOS = [
  {
    id: 'eje1',
    numero: 1,
    tituloCorto: '1. Desarrollo Económico Territorial',
    descripcionCorta: 'Redes logísticas y territorio.',
    nombreAtajo: 'Desarrollo económico',
    icono: 'TrendingUp',
    label: 'Estrategia 1 · Desarrollo Económico Territorial',
    color: '#E6DCC6', // espejo de --pal-est-1 (styles/paleta.css)
    colorVar: 'var(--pal-est-1)',
    colorRgbVar: 'var(--pal-est-1-rgb)',
    colorMapa: '#B08D4F', // versión más oscura para fondos claros (geovisor)
  },
  {
    id: 'eje2',
    numero: 2,
    tituloCorto: '2. Transporte Público de Personas',
    descripcionCorta: 'Calidad, eficiencia y tecnología.',
    nombreAtajo: 'Transporte público',
    icono: 'Bus',
    label: 'Estrategia 2 · Transporte Público de Personas',
    color: '#B0385A', // espejo de --pal-est-2 (styles/paleta.css)
    colorVar: 'var(--pal-est-2)',
    colorRgbVar: 'var(--pal-est-2-rgb)',
    colorMapa: '#0A8F8A', // versión más oscura para fondos claros (geovisor)
  },
  {
    id: 'eje3',
    numero: 3,
    tituloCorto: '3. Movilidad Activa',
    descripcionCorta: 'Infraestructura ciclista y peatonal.',
    nombreAtajo: 'Movilidad activa',
    icono: 'Bike',
    label: 'Estrategia 3 · Movilidad Activa',
    color: '#98989A', // espejo de --pal-est-3 (styles/paleta.css)
    colorVar: 'var(--pal-est-3)',
    colorRgbVar: 'var(--pal-est-3-rgb)',
    colorMapa: '#2F6FE0', // versión más oscura para fondos claros (geovisor)
  },
  {
    id: 'eje4',
    numero: 4,
    tituloCorto: '4. Seguridad Vial',
    descripcionCorta: 'Enfoque de Sistema Seguro.',
    nombreAtajo: 'Seguridad vial',
    icono: 'ShieldAlert',
    label: 'Estrategia 4 · Seguridad Vial',
    color: '#3AA68B', // espejo de --pal-est-4 (styles/paleta.css)
    colorVar: 'var(--pal-est-4)',
    colorRgbVar: 'var(--pal-est-4-rgb)',
    colorMapa: '#7A9A2B', // versión más oscura para fondos claros (geovisor)
  },
  {
    id: 'eje5',
    numero: 5,
    tituloCorto: '5. Género e Inclusión',
    descripcionCorta: 'Equidad y accesibilidad universal.',
    nombreAtajo: 'Género e inclusión',
    icono: 'Users',
    label: 'Estrategia 5 · Género e Inclusión',
    color: '#7B5BA6', // espejo de --pal-est-5 (styles/paleta.css)
    colorVar: 'var(--pal-est-5)',
    colorRgbVar: 'var(--pal-est-5-rgb)',
    colorMapa: '#D94F7A', // versión más oscura para fondos claros (geovisor)
  },
];
