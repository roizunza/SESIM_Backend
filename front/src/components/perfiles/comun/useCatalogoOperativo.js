import { useMemo } from 'react';
import { useCatalogo } from '../../../lib/sesim/useCatalogo';
import { indexar } from '../../../lib/sesim/api';

/**
 * Catálogos que usan las pantallas de operación (captura, dictamen,
 * auditoría), ya indexados. `null` mientras cargan.
 */
export function useCatalogoOperativo() {
  const { datos, error } = useCatalogo([
    'indicador', 'unidad_territorial', 'eje_tematico', 'instrumento_origen', 'indicador_instrumento', 'capa', 'perfil',
  ]);
  const catalogo = useMemo(() => {
    if (!datos) return null;
    const municipios = datos.unidad_territorial.filter((u) => u.nivel === 'municipio').sort((a, b) => a.id.localeCompare(b.id));
    return {
      ...datos,
      indicadores: indexar(datos.indicador),
      unidades: indexar(datos.unidad_territorial),
      instrumentos: indexar(datos.instrumento_origen),
      ejes: indexar(datos.eje_tematico),
      municipios,
    };
  }, [datos]);
  return { catalogo, error };
}
