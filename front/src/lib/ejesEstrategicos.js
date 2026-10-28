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
    icono: 'TrendingUp',
    label: 'Estrategia 1 · Desarrollo Económico Territorial',
    color: '#E07A1F',
  },
  {
    id: 'eje2',
    numero: 2,
    tituloCorto: '2. Transporte Público de Personas',
    descripcionCorta: 'Calidad, eficiencia y tecnología.',
    icono: 'Bus',
    label: 'Estrategia 2 · Transporte Público de Personas',
    color: '#0E6EC5',
  },
  {
    id: 'eje3',
    numero: 3,
    tituloCorto: '3. Movilidad Activa',
    descripcionCorta: 'Infraestructura ciclista y peatonal.',
    icono: 'Bike',
    label: 'Estrategia 3 · Movilidad Activa',
    color: '#0FA37F',
  },
  {
    id: 'eje4',
    numero: 4,
    tituloCorto: '4. Seguridad Vial',
    descripcionCorta: 'Enfoque de Sistema Seguro.',
    icono: 'ShieldAlert',
    label: 'Estrategia 4 · Seguridad Vial',
    color: '#C00000',
  },
  {
    id: 'eje5',
    numero: 5,
    tituloCorto: '5. Género e Inclusión',
    descripcionCorta: 'Equidad y accesibilidad universal.',
    icono: 'Users',
    label: 'Estrategia 5 · Género e Inclusión',
    color: '#9333EA',
  },
];
