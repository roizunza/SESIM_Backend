import { Globe2, Layers, ChartColumn } from 'lucide-react';

/**
 * Las tres categorías de capas (la misma lista en el Catálogo del panel y en los modales de subir/actualizar).
 * Una capa nunca se inventa: siempre pertenece a una de ellas.
 */
export const CATEGORIAS = [
  { id: 'mapa_base', titulo: 'Mapa base', Icono: Globe2, texto: 'Límites, localidades, red de transporte y medio físico que sirven de referencia.', ayuda: 'Referencias: límites, localidades, red de transporte y medio físico.', cuando: 'un grupo' },
  { id: 'diagnostico', titulo: 'Diagnóstico', Icono: Layers, texto: 'Capas del diagnóstico territorial agrupadas por tema.', ayuda: 'Capas del diagnóstico territorial, por tema.', cuando: 'un grupo' },
  { id: 'estrategia', titulo: 'Indicadores', Icono: ChartColumn, texto: 'La capa que alimenta la medición de un indicador aprobado.', ayuda: 'Capas que alimentan la medición de los indicadores, por eje.', cuando: 'un indicador' },
];
