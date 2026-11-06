import { useId, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Info, Paintbrush, Filter, Table2, Download, Crosshair, Plus, Trash2 } from 'lucide-react';
import { useDatosCapa } from '../../lib/sesim/useDatosCapa';
import { analizarCampos, cumpleFiltros, filtrosActivosCapa, resolverEstilo } from '../../lib/sesim/estiloCapa';
import { aCsv, descargar, sufijoFecha, geojsonPublico, ATRIBUTOS_PUBLICOS } from '../../lib/sesim/descargas';
import EstadoCarga from '../plataforma/EstadoCarga';
import './PanelCapa.css';

const POR_PAGINA = 50;
const PESTANAS = [
  { id: 'estilo', titulo: 'Simbología', icono: Paintbrush },
  { id: 'filtros', titulo: 'Filtros', icono: Filter },
  { id: 'tabla', titulo: 'Atributos', icono: Table2 },
];
const NOMBRE_CAMPO = { nombre: 'Nombre', clasif: 'Clase', cve_mun: 'Clave municipal', id_unidad: 'Unidad territorial', id: 'Identificador' };
const etiquetaCampo = (c) => NOMBRE_CAMPO[c] ?? c;

function limitesDe(geometria) {
  const lim = [Infinity, Infinity, -Infinity, -Infinity];
  const recorrer = (c) => {
    if (typeof c[0] === 'number') {
      lim[0] = Math.min(lim[0], c[0]); lim[1] = Math.min(lim[1], c[1]);
      lim[2] = Math.max(lim[2], c[0]); lim[3] = Math.max(lim[3], c[1]);
    } else c.forEach(recorrer);
  };
  if (geometria?.coordinates) recorrer(geometria.coordinates);
  return Number.isFinite(lim[0]) ? [[lim[1], lim[0]], [lim[3], lim[2]]] : null;
}

function Estilo({ capa, config, onCambio, campos, features }) {
  const ids = { modo: useId(), campo: useId(), metodo: useId(), clases: useId(), color: useId() };
  const { estilo } = config;
  const numericos = campos.filter((c) => c.tipo === 'numerico' && !c.oculto);
  const categorizables = campos.filter((c) => !c.oculto && c.categorizable);
  const fijar = (cambios) => onCambio({ ...config, estilo: { ...estilo, ...cambios } });
  const resuelto = useMemo(() => resolverEstilo(capa, config, features), [capa, config, features]);

  return (
    <div className="panel-capa__seccion">
      <label className="panel-capa__interruptor">
        <input type="checkbox" checked={config.simbologia} onChange={(e) => onCambio({ ...config, simbologia: e.target.checked })} />
        <span className="panel-capa__pista" aria-hidden="true" />
        Mostrar simbología de esta capa
      </label>
      <p className="panel-capa__nota">Al apagarla, la capa sigue en el mapa con un trazo neutro de referencia y sale de la leyenda.</p>

      <fieldset disabled={!config.simbologia} className="panel-capa__grupo">
        <label htmlFor={ids.modo}>Tipo de visualización</label>
        <select id={ids.modo} value={estilo.modo} onChange={(e) => {
          const modo = e.target.value;
          const campo = modo === 'graduado' ? numericos[0]?.campo : modo === 'categorias' ? (categorizables.find((c) => c.campo === 'clasif') ?? categorizables[0])?.campo : undefined;
          fijar({ modo, campo, metodo: estilo.metodo ?? 'cuantiles', clases: estilo.clases ?? 5, color: estilo.color ?? capa.colorBase });
        }}>
          <option value="original">Simbología oficial de la capa</option>
          <option value="categorias" disabled={!categorizables.length}>Categorías por campo</option>
          <option value="graduado" disabled={!numericos.length}>Graduada por campo numérico</option>
          <option value="unico">Color único</option>
        </select>
        {!numericos.length && <small>La capa no tiene campos numéricos para una visualización graduada.</small>}

        {(estilo.modo === 'categorias' || estilo.modo === 'graduado') && (
          <>
            <label htmlFor={ids.campo}>Campo</label>
            <select id={ids.campo} value={estilo.campo ?? ''} onChange={(e) => fijar({ campo: e.target.value })}>
              {(estilo.modo === 'graduado' ? numericos : categorizables).map((c) => (
                <option key={c.campo} value={c.campo}>{etiquetaCampo(c.campo)} ({c.distintos} valores)</option>
              ))}
            </select>
          </>
        )}
        {estilo.modo === 'graduado' && (
          <div className="panel-capa__dos">
            <div>
              <label htmlFor={ids.metodo}>Método</label>
              <select id={ids.metodo} value={estilo.metodo} onChange={(e) => fijar({ metodo: e.target.value })}>
                <option value="cuantiles">Cuantiles</option>
                <option value="intervalos">Intervalos iguales</option>
              </select>
            </div>
            <div>
              <label htmlFor={ids.clases}>Clases</label>
              <select id={ids.clases} value={estilo.clases} onChange={(e) => fijar({ clases: Number(e.target.value) })}>
                {[3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>
        )}
        {estilo.modo === 'unico' && (
          <>
            <label htmlFor={ids.color}>Color</label>
            <input id={ids.color} type="color" value={estilo.color ?? capa.colorBase} onChange={(e) => fijar({ color: e.target.value })} />
          </>
        )}
      </fieldset>

      {config.simbologia && resuelto.leyenda.length > 0 && (
        <div className="panel-capa__muestra" aria-label="Vista previa de la leyenda">
          {resuelto.leyenda.slice(0, 14).map((l, i) => (
            <span key={i}><i style={{ background: l.color ?? capa.colorBase }} aria-hidden="true" />{l.etiqueta}{l.n ? <b>{l.n.toLocaleString('es-MX')}</b> : null}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function FiltroCampo({ filtro, campo, onCambio, onQuitar }) {
  const [busca, setBusca] = useState('');
  const id = useId();
  const visibles = campo.valores.filter((v) => v.valor.toLowerCase().includes(busca.toLowerCase())).slice(0, 60);
  return (
    <div className="panel-capa__filtro">
      <div className="panel-capa__filtro-cabecera">
        <strong>{etiquetaCampo(campo.campo)}</strong>
        <button type="button" onClick={onQuitar} aria-label={`Quitar filtro de ${etiquetaCampo(campo.campo)}`}><Trash2 size={14} /></button>
      </div>
      {filtro.tipo === 'rango' && (
        <div className="panel-capa__dos">
          <div><label htmlFor={`${id}-min`}>Desde</label><input id={`${id}-min`} type="number" value={filtro.min} placeholder={String(campo.min)} onChange={(e) => onCambio({ ...filtro, min: e.target.value })} /></div>
          <div><label htmlFor={`${id}-max`}>Hasta</label><input id={`${id}-max`} type="number" value={filtro.max} placeholder={String(campo.max)} onChange={(e) => onCambio({ ...filtro, max: e.target.value })} /></div>
        </div>
      )}
      {filtro.tipo === 'texto' && (
        <><label htmlFor={`${id}-t`}>Contiene</label><input id={`${id}-t`} type="search" value={filtro.texto} onChange={(e) => onCambio({ ...filtro, texto: e.target.value })} /></>
      )}
      {filtro.tipo === 'valores' && (
        <>
          {campo.valores.length > 8 && <input type="search" aria-label={`Buscar valores de ${etiquetaCampo(campo.campo)}`} placeholder="Buscar valor…" value={busca} onChange={(e) => setBusca(e.target.value)} />}
          <div className="panel-capa__valores" role="group" aria-label={`Valores de ${etiquetaCampo(campo.campo)}`}>
            {visibles.map((v) => (
              <label key={v.valor}>
                <input
                  type="checkbox"
                  checked={filtro.valores.includes(v.valor)}
                  onChange={(e) => onCambio({ ...filtro, valores: e.target.checked ? [...filtro.valores, v.valor] : filtro.valores.filter((x) => x !== v.valor) })}
                />
                <span>{v.valor}</span><b>{v.n.toLocaleString('es-MX')}</b>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Filtros({ config, onCambio, campos, total, visibles }) {
  const id = useId();
  const [nuevo, setNuevo] = useState('');
  const disponibles = campos.filter((c) => !c.oculto && !config.filtros.some((f) => f.campo === c.campo));
  const agregar = () => {
    const c = campos.find((x) => x.campo === nuevo);
    if (!c) return;
    const filtro = c.tipo === 'numerico' ? { campo: c.campo, tipo: 'rango', min: '', max: '' } : c.categorizable ? { campo: c.campo, tipo: 'valores', valores: [] } : { campo: c.campo, tipo: 'texto', texto: '' };
    onCambio({ ...config, filtros: [...config.filtros, filtro] });
    setNuevo('');
  };
  const cambiar = (i, f) => onCambio({ ...config, filtros: config.filtros.map((x, k) => (k === i ? f : x)) });
  const quitar = (i) => onCambio({ ...config, filtros: config.filtros.filter((_, k) => k !== i) });

  return (
    <div className="panel-capa__seccion">
      <p className="panel-capa__conteo" aria-live="polite">Se muestran <strong>{visibles.toLocaleString('es-MX')}</strong> de {total.toLocaleString('es-MX')} elementos</p>
      {config.filtros.map((f, i) => {
        const campo = campos.find((c) => c.campo === f.campo);
        return campo ? <FiltroCampo key={f.campo} filtro={f} campo={campo} onCambio={(nf) => cambiar(i, nf)} onQuitar={() => quitar(i)} /> : null;
      })}
      {disponibles.length > 0 && (
        <div className="panel-capa__agregar">
          <label htmlFor={id} className="sr-only">Campo para filtrar</label>
          <select id={id} value={nuevo} onChange={(e) => setNuevo(e.target.value)}>
            <option value="">Filtrar por campo…</option>
            {disponibles.map((c) => <option key={c.campo} value={c.campo}>{etiquetaCampo(c.campo)}</option>)}
          </select>
          <button type="button" onClick={agregar} disabled={!nuevo}><Plus size={14} aria-hidden="true" /> Agregar</button>
        </div>
      )}
      {config.filtros.length > 0 && <button type="button" className="panel-capa__limpiar" onClick={() => onCambio({ ...config, filtros: [] })}>Quitar todos los filtros</button>}
    </div>
  );
}

function Tabla({ capa, campos, filtradas, onEnfocar }) {
  const [pagina, setPagina] = useState(0);
  const columnas = campos.filter((c) => !c.oculto).map((c) => c.campo);
  const paginas = Math.max(1, Math.ceil(filtradas.length / POR_PAGINA));
  const actual = Math.min(pagina, paginas - 1);
  const filas = filtradas.slice(actual * POR_PAGINA, (actual + 1) * POR_PAGINA);

  const exportar = (formato) => {
    const nombre = `${capa.id}_filtrado_${sufijoFecha()}`;
    if (formato === 'csv') {
      descargar(`${nombre}.csv`, aCsv(filtradas.map((f) => f.properties), ATRIBUTOS_PUBLICOS), 'text/csv;charset=utf-8');
    } else {
      descargar(`${nombre}.geojson`, JSON.stringify(geojsonPublico(capa.titulo, filtradas)), 'application/geo+json');
    }
  };

  return (
    <div className="panel-capa__seccion">
      <div className="panel-capa__acciones">
        <button type="button" onClick={() => exportar('csv')} disabled={!filtradas.length}><Download size={14} aria-hidden="true" /> CSV</button>
        <button type="button" onClick={() => exportar('geojson')} disabled={!filtradas.length}><Download size={14} aria-hidden="true" /> GeoJSON</button>
      </div>
      {filtradas.length === 0 ? (
        <EstadoCarga estado="vacio" mensaje="Ningún elemento cumple los filtros." compacto />
      ) : (
        <div className="panel-capa__tabla" tabIndex={0} role="region" aria-label={`Atributos de ${capa.titulo}`}>
          <table>
            <thead>
              <tr><th scope="col"><span className="sr-only">Ubicar</span></th>{columnas.map((c) => <th key={c} scope="col">{etiquetaCampo(c)}</th>)}</tr>
            </thead>
            <tbody>
              {filas.map((f, i) => (
                <tr key={f.properties?.id ?? i}>
                  <td><button type="button" onClick={() => onEnfocar(f)} aria-label={`Ubicar ${f.properties?.nombre ?? 'elemento'} en el mapa`}><Crosshair size={13} /></button></td>
                  {columnas.map((c) => <td key={c}>{f.properties?.[c] ?? '—'}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {paginas > 1 && (
        <nav className="panel-capa__paginas" aria-label="Paginación de atributos">
          <button type="button" onClick={() => setPagina(actual - 1)} disabled={actual === 0}>Anterior</button>
          <span>{actual + 1} / {paginas}</span>
          <button type="button" onClick={() => setPagina(actual + 1)} disabled={actual >= paginas - 1}>Siguiente</button>
        </nav>
      )}
    </div>
  );
}

/** Panel de una capa activa: simbología (incluido apagarla), filtros por atributo y tabla de atributos. */
export default function PanelCapa({ capa, config, onCambio, contraido = false, onAlternar, onFicha, mapa }) {
  const [pestana, setPestana] = useState('estilo');
  const { datos, error } = useDatosCapa(capa, !contraido);
  const features = datos?.features;
  const campos = useMemo(() => (features ? analizarCampos(features) : []), [features]);
  const filtradas = useMemo(() => (features ? features.filter((f) => cumpleFiltros(f.properties, config.filtros)) : []), [features, config.filtros]);
  const nFiltros = filtrosActivosCapa(config.filtros);

  const enfocar = (f) => {
    const lim = limitesDe(f.geometry);
    if (lim && mapa) mapa.fitBounds(lim, { maxZoom: 16, padding: [40, 40] });
  };

  return (
    <section className={`panel-capa${contraido ? ' panel-capa--contraido' : ''}`} aria-label={`Simbología, filtros y atributos de ${capa.titulo}`} data-capa={capa.id}>
      <header className="panel-capa__cabecera">
        <div>
          <span className="panel-capa__id">{capa.id}</span>
          <h2>{capa.titulo}</h2>
        </div>
        <span className="panel-capa__botones">
        {onFicha && (
          <button type="button" onClick={onFicha} aria-label={`Ver ficha técnica y metadatos de ${capa.titulo}`} title="Ver ficha técnica y metadatos">
            <Info size={16} aria-hidden="true" />
          </button>
        )}
        <button type="button" onClick={onAlternar} aria-expanded={!contraido} aria-label={contraido ? `Expandir el panel de ${capa.titulo}` : `Contraer el panel de ${capa.titulo}`} title={contraido ? 'Expandir' : 'Contraer'}>
          {contraido ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
        </button>
        </span>
      </header>
      {!contraido && (<>
      <div className="panel-capa__pestanas" role="tablist" aria-label="Opciones de la capa">
        {PESTANAS.map(({ id, titulo, icono: Icono }) => (
          <button key={id} type="button" role="tab" aria-selected={pestana === id} className={pestana === id ? 'activa' : undefined} onClick={() => setPestana(id)}>
            <Icono size={14} aria-hidden="true" /> {titulo}{id === 'filtros' && nFiltros ? ` (${nFiltros})` : ''}
          </button>
        ))}
      </div>
      <div className="panel-capa__cuerpo" role="tabpanel">
        {error && <EstadoCarga estado="error" titulo="No se pudo leer la capa" mensaje={error} compacto />}
        {!error && !features && <EstadoCarga estado="cargando" mensaje="Leyendo los elementos de la capa…" compacto />}
        {features && pestana === 'estilo' && <Estilo capa={capa} config={config} onCambio={onCambio} campos={campos} features={features} />}
        {features && pestana === 'filtros' && <Filtros config={config} onCambio={onCambio} campos={campos} total={features.length} visibles={filtradas.length} />}
        {features && pestana === 'tabla' && <Tabla capa={capa} campos={campos} filtradas={filtradas} onEnfocar={enfocar} />}
      </div>
      </>)}
    </section>
  );
}
