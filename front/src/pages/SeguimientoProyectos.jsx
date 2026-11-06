import { useMemo, useRef, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useCatalogo, useContenido } from '../lib/sesim/useCatalogo';
import { useFiltrosEnUrl } from '../lib/sesim/useFiltrosEnUrl';
import { useFiltros } from '../lib/sesim/filtrosGlobales';
import { prepararCatalogo } from '../lib/sesim/tablero';
import CarteraProyectos from '../components/proyectos/CarteraProyectos';
import ConsultaSeries from '../components/proyectos/ConsultaSeries';
import BarraFiltros from '../components/tablero/BarraFiltros';
import EstadoCarga, { Esqueleto } from '../components/plataforma/EstadoCarga';
import { fmtNumero } from '../components/tablero/formato';
import '../components/tablero/Tablero.css';
import './SeguimientoProyectos.css';

const TABLAS = ['indicador', 'eje_tematico', 'indicador_eje', 'fuente_informacion', 'periodo', 'medicion_publica', 'unidad_territorial', 'capa', 'instrumento_origen', 'instrumento_normativo', 'fuente_documental'];
const PESTANAS = [
  { id: 'cartera', titulo: 'Cartera de proyectos' },
  { id: 'reportes', titulo: 'Reportes y series históricas' },
  { id: 'datos', titulo: 'Datos integrados' },
];

function DatosIntegrados({ datos }) {
  const conjuntos = [
    { nombre: 'Indicadores activos', tabla: 'indicador', n: datos.indicador.filter((i) => i.activo !== false).length },
    { nombre: 'Mediciones publicadas', tabla: 'medicion_publica', n: datos.medicion_publica.length },
    { nombre: 'Periodos registrados', tabla: 'periodo', n: datos.periodo.length },
    { nombre: 'Capas geográficas publicadas', tabla: 'capa', n: datos.capa.filter((c) => c.estatus === 'vigente_publico').length },
    { nombre: 'Instrumentos con matriz de indicadores', tabla: 'instrumento_origen', n: datos.instrumento_origen.length },
    { nombre: 'Instrumentos normativos', tabla: 'instrumento_normativo', n: datos.instrumento_normativo.filter((d) => d.publicable !== false).length },
  ];
  return (
    <div className="integrados">
      <div className="integrados__conteos">
        {conjuntos.map((c) => (
          <div key={c.tabla}><strong>{fmtNumero(c.n)}</strong><span>{c.nombre}</span><code>{c.tabla}</code></div>
        ))}
      </div>
      <h3>Fuentes oficiales de información</h3>
      <ul className="integrados__fuentes">
        {datos.fuente_documental.map((f) => (
          <li key={f.id}>
            <div>
              <code>{f.clave}</code> <strong>{f.nombre}</strong>
              {f.uso_sesim && <p>{f.uso_sesim}</p>}
              {f.limitaciones && <p className="integrados__limite">{f.limitaciones}</p>}
            </div>
            {f.url_oficial && (
              <a href={f.url_oficial} target="_blank" rel="noopener noreferrer" className="instrumento__doc">
                <ExternalLink size={14} aria-hidden="true" /> Consultar<span className="sr-only"> {f.nombre} (se abre en una pestaña nueva)</span>
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function SeguimientoProyectos() {
  const { datos, error } = useCatalogo(TABLAS);
  const jerarquia = useContenido('jerarquia_movilidad');
  const { filtros } = useFiltros();
  useFiltrosEnUrl();
  const [params] = useSearchParams();
  const [pestana, setPestana] = useState(() => (PESTANAS.some((p) => p.id === params.get('pestana')) ? params.get('pestana') : 'cartera'));
  const botones = useRef({});

  const cat = useMemo(() => (datos && jerarquia.datos ? prepararCatalogo(datos, jerarquia.datos) : null), [datos, jerarquia.datos]);
  const nombreMunicipio = filtros.municipio ? cat?.unidades.get(filtros.municipio)?.nom_mun ?? '' : 'el Estado de Campeche';

  const alTeclear = (e) => {
    const k = PESTANAS.findIndex((p) => p.id === pestana);
    const destino = e.key === 'ArrowRight' ? (k + 1) % PESTANAS.length : e.key === 'ArrowLeft' ? (k - 1 + PESTANAS.length) % PESTANAS.length : null;
    if (destino === null) return;
    e.preventDefault();
    setPestana(PESTANAS[destino].id);
    botones.current[PESTANAS[destino].id]?.focus();
  };

  const fallo = error || jerarquia.error;

  return (
    <div className="tablero proyectos">
      <h2 className="sr-only">Proyectos y reportes</h2>

      {fallo && <EstadoCarga estado="error" titulo="No se pudo cargar la información" mensaje={fallo} accion={{ etiqueta: 'Reintentar', onClick: () => window.location.reload() }} />}
      {!fallo && !cat && <Esqueleto alto={360} etiqueta="Cargando seguimiento" />}

      {cat && (
        <>
          <BarraFiltros catalogo={cat} />
          <div role="tablist" aria-label="Secciones de seguimiento" className="tablero__ejes" onKeyDown={alTeclear}>
            {PESTANAS.map((p) => (
              <button
                key={p.id}
                ref={(n) => { botones.current[p.id] = n; }}
                type="button"
                role="tab"
                id={`tab-${p.id}`}
                aria-selected={pestana === p.id}
                aria-controls={`panel-${p.id}`}
                tabIndex={pestana === p.id ? 0 : -1}
                className={`tablero__eje${pestana === p.id ? ' tablero__eje--activo' : ''}`}
                onClick={() => setPestana(p.id)}
              >
                {p.titulo}
              </button>
            ))}
          </div>

          <section role="tabpanel" id={`panel-${pestana}`} aria-labelledby={`tab-${pestana}`} className="panel">
            {pestana === 'cartera' && <CarteraProyectos municipio={filtros.municipio} nombreMunicipio={nombreMunicipio} />}
            {pestana === 'reportes' && <ConsultaSeries catalogo={cat} filtros={filtros} />}
            {pestana === 'datos' && <DatosIntegrados datos={datos} />}
          </section>
        </>
      )}
    </div>
  );
}
