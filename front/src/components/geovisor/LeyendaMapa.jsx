import { useMemo, useState } from 'react';
import { ChevronDown, Eye, EyeOff, Info } from 'lucide-react';
import { toSwatchSvg } from '../../lib/leafletSymbology';
import { useDatosCapa } from '../../lib/sesim/useDatosCapa';
import { CONFIG_INICIAL, resolverEstilo } from '../../lib/sesim/estiloCapa';
import { CATEGORIAS, CAPAS_MASCARA, CAPAS_POBLACION } from '../../lib/sesim/capas';
import { COLOR_POBLACION, RANGOS_POBLACION, SIN_POBLACION } from '../../lib/sesim/poblacion';

const MAX_CLASES = 14;
const ETIQUETAS_QGIS = { '<all other values>': 'Otros valores' };
const etiqueta = (t) => ETIQUETAS_QGIS[t] ?? t;

const LEYENDA_POBLACION = [...RANGOS_POBLACION, SIN_POBLACION].map((r) => ({ etiqueta: r.etiqueta, circulo: r }));

function Muestra({ entrada, colorBase }) {
  if (entrada.circulo) {
    return (
      <svg className="capa-legend-swatch" width="22" height="18" viewBox="0 0 22 18" aria-hidden="true">
        <circle cx="11" cy="9" r={entrada.circulo.radio} fill={COLOR_POBLACION} fillOpacity={entrada.circulo.opacidad} stroke="#fff" strokeWidth="0.5" />
      </svg>
    );
  }
  if (entrada.simbolo) return <span className="capa-legend-swatch" dangerouslySetInnerHTML={{ __html: toSwatchSvg(entrada.simbolo) ?? '' }} />;
  return <span className="capa-legend-swatch-plano" style={{ backgroundColor: entrada.color ?? colorBase }} />;
}

function LeyendaCapa({ capa, config, onAlternar, onFicha }) {
  const porCampo = config.simbologia && config.estilo.modo !== 'original';
  const { datos } = useDatosCapa(capa, porCampo);
  const estilo = useMemo(
    () =>
      CAPAS_MASCARA.has(capa.id)
        ? { leyenda: [{ etiqueta: 'Otras entidades federativas (atenuadas)', color: '#ffffff' }] }
        : CAPAS_POBLACION.has(capa.id)
          ? { leyenda: LEYENDA_POBLACION }
          : resolverEstilo(capa, config, porCampo ? datos?.features : null),
    [capa, config, porCampo, datos],
  );
  const Icono = config.simbologia ? Eye : EyeOff;
  return (
    <div className={`leyenda-flotante-capa${config.simbologia ? '' : ' leyenda-flotante-capa--oculta'}`}>
      <div className="leyenda-flotante-fila">
        <button type="button" className="leyenda-ojo" onClick={onAlternar} aria-pressed={config.simbologia} aria-label={`${config.simbologia ? 'Ocultar' : 'Mostrar'} simbología de ${capa.titulo}`} title={config.simbologia ? 'Ocultar simbología (la capa sigue encendida)' : 'Mostrar simbología'}>
          <Icono size={14} />
        </button>
        <span className="leyenda-flotante-nombre">{capa.titulo} <span className="capa-id-chip">{capa.id}</span></span>
        {onFicha && (
          <button type="button" className="leyenda-ojo leyenda-info" onClick={onFicha} aria-label={`Ver ficha técnica y metadatos de ${capa.titulo}`} title="Ver ficha técnica y metadatos">
            <Info size={14} aria-hidden="true" />
          </button>
        )}
      </div>
      {config.simbologia && (
        <div className="capa-legend-muestras">
          {estilo.leyenda.slice(0, MAX_CLASES).map((m, i) => (
            <div key={i} className="capa-legend-muestra">
              <Muestra entrada={m} colorBase={capa.colorBase} />
              <span className="capa-legend-muestra-label">{etiqueta(m.etiqueta)}</span>
            </div>
          ))}
          {estilo.leyenda.length > MAX_CLASES && <span className="capa-legend-muestra-label">… {estilo.leyenda.length - MAX_CLASES} clases más</span>}
        </div>
      )}
    </div>
  );
}

/**
 * Leyenda de las capas encendidas. La simbología de cada capa —o de toda una categoría— se puede
 * ocultar sin apagar la capa: la capa queda en el mapa con trazo neutro de referencia. Con `onFicha`,
 * cada capa lleva el botón de su ficha técnica.
 */
export default function LeyendaMapa({ capas, configDe, onAlternarCapa, onAlternarCategoria, onFicha }) {
  const [abierta, setAbierta] = useState(true);
  const categorias = CATEGORIAS.map((c) => ({ ...c, capas: capas.filter((x) => x.categoria === c.id) })).filter((c) => c.capas.length);

  return (
    <div className={`leyenda-flotante${abierta ? '' : ' leyenda-flotante--cerrada'}`}>
      <button type="button" className="leyenda-flotante-header" onClick={() => setAbierta((v) => !v)} aria-expanded={abierta}>
        Simbología <ChevronDown size={14} aria-hidden="true" style={{ transform: abierta ? 'none' : 'rotate(-90deg)' }} />
      </button>
      {abierta && (
        <div className="leyenda-flotante-scroll">
          {categorias.map((cat) => {
            const visible = cat.capas.some((c) => (configDe(c.id) ?? CONFIG_INICIAL).simbologia);
            return (
              <div key={cat.id} className="leyenda-categoria">
                <div className="leyenda-categoria-cabecera">
                  <span>{cat.etiqueta}</span>
                  <button type="button" className="leyenda-ojo" onClick={() => onAlternarCategoria(cat.id, !visible)} aria-pressed={visible} aria-label={`${visible ? 'Ocultar' : 'Mostrar'} simbología de ${cat.etiqueta}`} title={`${visible ? 'Ocultar' : 'Mostrar'} simbología de ${cat.etiqueta}`}>
                    {visible ? <Eye size={13} aria-hidden="true" /> : <EyeOff size={13} aria-hidden="true" />}
                  </button>
                </div>
                {cat.capas.map((capa) => (
                  <LeyendaCapa key={capa.id} capa={capa} config={configDe(capa.id) ?? CONFIG_INICIAL} onAlternar={() => onAlternarCapa(capa.id)} onFicha={onFicha ? () => onFicha(capa) : undefined} />
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
