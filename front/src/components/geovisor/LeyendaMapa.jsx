import { useMemo, useRef, useState } from 'react';
import { ChevronDown, GripHorizontal } from 'lucide-react';
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

/** Interruptor accesible reutilizado en la leyenda. */
export function Interruptor({ activo, onCambio, etiqueta: texto, disabled = false }) {
  return (
    <label className="gv-sw" title={texto}>
      <input type="checkbox" checked={activo} disabled={disabled} onChange={(e) => onCambio(e.target.checked)} aria-label={texto} />
      <span className="gv-sw__pista" aria-hidden="true" />
    </label>
  );
}

/** Muestras de la leyenda de una capa (según su configuración de simbología). */
export function MuestrasCapa({ capa, config }) {
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
  if (!config.simbologia) return null;
  return (
    <div className="capa-legend-muestras">
      {estilo.leyenda.slice(0, MAX_CLASES).map((m, i) => (
        <div key={i} className="capa-legend-muestra">
          <Muestra entrada={m} colorBase={capa.colorBase} />
          <span className="capa-legend-muestra-label">{etiqueta(m.etiqueta)}</span>
        </div>
      ))}
      {estilo.leyenda.length > MAX_CLASES && <span className="capa-legend-muestra-label">… {estilo.leyenda.length - MAX_CLASES} clases más</span>}
    </div>
  );
}

/** Fila de leyenda compacta (infografía): si la capa tiene una sola clase, nombre y muestra van en una línea. */
export function FilaLeyenda({ capa, config }) {
  const porCampo = config.simbologia && config.estilo.modo !== 'original';
  const { datos } = useDatosCapa(capa, porCampo);
  const leyenda = useMemo(
    () =>
      CAPAS_MASCARA.has(capa.id)
        ? [{ etiqueta: 'Otras entidades federativas (atenuadas)', color: '#ffffff' }]
        : CAPAS_POBLACION.has(capa.id)
          ? LEYENDA_POBLACION
          : resolverEstilo(capa, config, porCampo ? datos?.features : null).leyenda,
    [capa, config, porCampo, datos],
  );
  const una = leyenda.length === 1;
  return (
    <div className="ig-simb">
      <div className="ig-simb__t">
        {una && <Muestra entrada={leyenda[0]} colorBase={capa.colorBase} />}
        <b>{capa.titulo}</b> <code>{capa.id}</code>
      </div>
      {!una && (
        <div className="ig-simb__l">
          {leyenda.slice(0, MAX_CLASES).map((m, i) => (
            <div key={i} className="capa-legend-muestra"><Muestra entrada={m} colorBase={capa.colorBase} /><span>{etiqueta(m.etiqueta)}</span></div>
          ))}
          {leyenda.length > MAX_CLASES && <span className="capa-legend-muestra-label">… {leyenda.length - MAX_CLASES} clases más</span>}
        </div>
      )}
    </div>
  );
}

function LeyendaCapa({ capa, config, onAlternar, estatica }) {
  return (
    <div className={`leyenda-flotante-capa${config.simbologia ? '' : ' leyenda-flotante-capa--oculta'}`}>
      <div className="leyenda-flotante-fila">
        {!estatica && <Interruptor activo={config.simbologia} onCambio={onAlternar} etiqueta={`${config.simbologia ? 'Ocultar' : 'Mostrar'} simbología de ${capa.titulo}`} />}
        <span className="leyenda-flotante-nombre">{capa.titulo} <span className="capa-id-chip">{capa.id}</span></span>
      </div>
      <MuestrasCapa capa={capa} config={config} />
    </div>
  );
}

/**
 * Leyenda de las capas encendidas, en cristal translúcido. Categorías en el orden Mapa base,
 * Diagnóstico y Estrategias; cada categoría y cada capa tienen su interruptor de simbología y cada
 * capa su control de transparencia. Mapa base va contraído. Con `estatica` es solo lectura (infografía).
 */
export default function LeyendaMapa({ capas, configDe, onAlternarCapa, onAlternarCategoria, estatica = false, conDetalle = false, panelAbierto = false, agrupada = false }) {
  const [abierta, setAbierta] = useState(true);
  const [pos, setPos] = useState(null);
  const caja = useRef(null);

  const colocar = (x, y) => {
    const el = caja.current;
    const padre = el?.offsetParent;
    if (!el || !padre) return;
    setPos({ x: Math.min(Math.max(0, x), Math.max(0, padre.clientWidth - el.offsetWidth)), y: Math.min(Math.max(0, y), Math.max(0, padre.clientHeight - 48)) });
  };
  const iniciarArrastre = (e) => {
    if (estatica || agrupada || (e.button !== undefined && e.button > 0)) return;
    const el = caja.current;
    const padre = el.offsetParent.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const dx = e.clientX - r.left;
    const dy = e.clientY - r.top;
    const mover = (ev) => colocar(ev.clientX - padre.left - dx, ev.clientY - padre.top - dy);
    const soltar = () => { window.removeEventListener('pointermove', mover); window.removeEventListener('pointerup', soltar); };
    window.addEventListener('pointermove', mover);
    window.addEventListener('pointerup', soltar);
    e.preventDefault();
  };
  const teclado = (e) => {
    const paso = { ArrowLeft: [-24, 0], ArrowRight: [24, 0], ArrowUp: [0, -24], ArrowDown: [0, 24] }[e.key];
    if (!paso) return;
    e.preventDefault();
    const el = caja.current;
    colocar((pos?.x ?? el.offsetLeft) + paso[0], (pos?.y ?? el.offsetTop) + paso[1]);
  };
  const [mapaBaseAbierto, setMapaBaseAbierto] = useState(false);
  const categorias = CATEGORIAS.map((c) => ({ ...c, capas: capas.filter((x) => x.categoria === c.id) })).filter((c) => c.capas.length);

  return (
    <div
      ref={caja}
      className={`leyenda-flotante gl${agrupada ? ' leyenda-flotante--agrupada' : ''}${panelAbierto ? ' leyenda-flotante--panel' : ''}${abierta ? '' : ' leyenda-flotante--cerrada'}${conDetalle && !pos ? ' leyenda-flotante--con-detalle' : ''}`}
      style={pos && !agrupada ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto' } : undefined}
    >
      <div className="leyenda-flotante-header">
        {estatica ? <span>Simbología</span> : (
          <span className="leyenda-asa" role="button" tabIndex={0} onPointerDown={iniciarArrastre} onKeyDown={teclado} aria-label="Mover la simbología (arrastra o usa las flechas del teclado)" title="Arrastra para mover la simbología">
            <GripHorizontal size={16} aria-hidden="true" /> Simbología
          </span>
        )}
        <button type="button" className="leyenda-pliegue" onClick={() => setAbierta((v) => !v)} aria-expanded={abierta} aria-label={abierta ? 'Contraer la simbología' : 'Desplegar la simbología'}>
          <ChevronDown size={16} aria-hidden="true" style={{ transform: abierta ? 'none' : 'rotate(-90deg)' }} />
        </button>
      </div>
      {abierta && (
        <div className="leyenda-flotante-scroll">
          {categorias.map((cat) => {
            const visible = cat.capas.some((c) => (configDe(c.id) ?? CONFIG_INICIAL).simbologia);
            const plegable = cat.id === 'mapa_base' && !estatica;
            const abiertaCat = !plegable || mapaBaseAbierto;
            return (
              <div key={cat.id} className="leyenda-categoria">
                <div className="leyenda-categoria-cabecera">
                  {plegable ? (
                    <button type="button" className="leyenda-categoria-titulo" onClick={() => setMapaBaseAbierto((v) => !v)} aria-expanded={mapaBaseAbierto}>
                      {cat.etiqueta} <ChevronDown size={13} aria-hidden="true" style={{ transform: mapaBaseAbierto ? 'none' : 'rotate(-90deg)' }} />
                    </button>
                  ) : <span>{cat.etiqueta}</span>}
                  {!estatica && <Interruptor activo={visible} onCambio={(v) => onAlternarCategoria(cat.id, v)} etiqueta={`${visible ? 'Ocultar' : 'Mostrar'} simbología de ${cat.etiqueta}`} />}
                </div>
                {abiertaCat && cat.capas.map((capa) => (
                  <LeyendaCapa
                    key={capa.id}
                    capa={capa}
                    config={configDe(capa.id) ?? CONFIG_INICIAL}
                    onAlternar={() => onAlternarCapa(capa.id)}
                    estatica={estatica}
                  />
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
