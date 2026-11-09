import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, useMap } from 'react-leaflet';
import html2canvas from 'html2canvas';
import { Download, Printer, X } from 'lucide-react';
import EsriBasemap from './EsriBasemap';
import CapaSesim from './CapaSesim';
import MascaraEntidades from './MascaraEntidades';
import CapaPoblacion from './CapaPoblacion';
import EscalaMapa from './EscalaMapa';
import { FilaLeyenda } from './LeyendaMapa';
import EstadoCarga from '../plataforma/EstadoCarga';
import { CAPAS_FIJAS, CAPAS_MASCARA, CAPAS_POBLACION, CAPAS_CON_ETIQUETA, CATEGORIAS } from '../../lib/sesim/capas';
import { CONFIG_INICIAL } from '../../lib/sesim/estiloCapa';
import { EJES_ESTRATEGICOS } from '../../lib/ejesEstrategicos';
import { fnIndicadoresDeCapa, tablas } from '../../lib/sesim/api';
import { AVISOS } from '../../lib/avisosLegales';
import { ATRIBUTOS_PUBLICOS } from '../../lib/sesim/descargas';
import './Infografia.css';

const EXTENSION_CAMPECHE = [[17.8, -92.5], [20.9, -89.1]];
const CAPAS_BASE = ['Lim02', 'Lim03', 'Lim04'];
const NOMBRES_CAT = { mapa_base: 'Mapa base', diagnostico: 'Diagnóstico', estrategia: 'Estrategias' };

/** Título de la infografía según la categoría de la capa: diagnóstico y su tema, estrategia y su eje. */
function tituloInfografia(capa) {
  const grupo = capa.grupos_lista?.[0]?.grupo ?? '';
  if (capa.categoria === 'diagnostico') return { etiqueta: 'Diagnóstico', tema: grupo.replace(/^EEMSV\s+/i, '') || capa.titulo };
  if (capa.categoria === 'estrategia') {
    const numero = Number(/Eje\s*(\d+)/.exec(grupo)?.[1]);
    const eje = EJES_ESTRATEGICOS.find((e) => e.numero === numero);
    return eje ? { etiqueta: `Estrategia ${eje.numero}`, tema: eje.tituloCorto.replace(/^\d+\.\s*/, '') } : { etiqueta: 'Estrategia', tema: grupo || capa.titulo };
  }
  return { etiqueta: 'Mapa base', tema: grupo || capa.titulo };
}

function Encuadre({ limites }) {
  const mapa = useMap();
  useEffect(() => {
    const ajustar = () => { mapa.invalidateSize(); mapa.fitBounds(limites, { padding: [12, 12], animate: false }); };
    ajustar();
    const t = setTimeout(ajustar, 250);
    return () => clearTimeout(t);
  }, [mapa, limites]);
  return null;
}

function MapaFijo({ capas, limites, configDe, onMapa, satelite = false }) {
  return (
    <MapContainer bounds={limites} zoomSnap={0.25} zoomControl={false} attributionControl={false} dragging={false} scrollWheelZoom={false} doubleClickZoom={false} touchZoom={false} boxZoom={false} keyboard={false} preferCanvas className="infografia__mapa-leaflet" ref={onMapa}>
      <EsriBasemap type={satelite ? 'satelite' : 'claro'} opacity={1} />
      <Encuadre limites={limites} />
      {capas.map((capa) =>
        CAPAS_MASCARA.has(capa.id) ? (
          <MascaraEntidades key={capa.id} capa={capa} simbologia={configDe(capa.id).simbologia} oscuro={satelite} />
        ) : CAPAS_POBLACION.has(capa.id) ? (
          <CapaPoblacion key={capa.id} capa={capa} simbologia={configDe(capa.id).simbologia} interactivo={false} />
        ) : (
          <CapaSesim key={capa.id} capa={capa} config={configDe(capa.id)} conEtiqueta={CAPAS_CON_ETIQUETA.has(capa.id)} interactivo={false} />
        ),
      )}
    </MapContainer>
  );
}

function Indicadores({ capas }) {
  const [estado, setEstado] = useState({ cargando: true });
  useEffect(() => {
    let vivo = true;
    Promise.all([Promise.all(capas.map((c) => fnIndicadoresDeCapa(c.id))), tablas(['medicion_publica', 'periodo']).catch(() => null)])
      .then(([listas, med]) => {
        if (!vivo) return;
        const unicos = new Map(listas.flat().map((i) => [i.id, i]));
        const periodos = new Map((med?.periodo ?? []).map((p) => [p.id, p]));
        const resumen = new Map();
        for (const m of med?.medicion_publica ?? []) {
          if (!unicos.has(m.id_indicador)) continue;
          const r = resumen.get(m.id_indicador) ?? { n: 0, ultimo: null };
          r.n += 1;
          const p = periodos.get(m.id_periodo);
          if (p && (!r.ultimo || String(p.fecha_inicio) > String(r.ultimo.fecha_inicio))) r.ultimo = p;
          resumen.set(m.id_indicador, r);
        }
        setEstado({ indicadores: [...unicos.values()].sort((a, b) => a.id.localeCompare(b.id)), resumen, sinMediciones: !med });
      })
      .catch((e) => vivo && setEstado({ error: e.message }));
    return () => {
      vivo = false;
    };
  }, [capas]);

  if (estado.cargando) return <EstadoCarga estado="cargando" mensaje="Cargando indicadores…" compacto />;
  if (estado.error) return <EstadoCarga estado="error" titulo="No se pudieron cargar los indicadores" mensaje={estado.error} compacto />;
  if (!estado.indicadores.length) return <EstadoCarga estado="vacio" mensaje={capas.length > 1 ? 'Las capas encendidas no tienen indicadores asociados en el catálogo (capa_indicador).' : capas.length ? 'Esta capa no tiene indicadores asociados en el catálogo (capa_indicador).' : 'El mapa base no tiene indicadores asociados.'} compacto />;
  const mitad = Math.ceil(estado.indicadores.length / 2);
  const cajas = [estado.indicadores.slice(0, mitad), estado.indicadores.slice(mitad)].filter((c) => c.length);
  return (
    <div className="ig-cajas">
      {cajas.map((caja, k) => (
        <table key={k} className="ig-tabla">
          <thead><tr><th scope="col">Clave</th><th scope="col">Indicador</th><th scope="col">MIR</th></tr></thead>
          <tbody>
            {caja.map((i) => (
              <tr key={i.id}><th scope="row">{i.id}</th><td>{i.nombre}</td><td>{i.nivel_mir ?? '—'}</td></tr>
            ))}
          </tbody>
        </table>
      ))}
    </div>
  );
}

const recorta = (t, n = 340) => (t && String(t).length > n ? `${String(t).slice(0, n).trimEnd()}…` : t);

/** Agrupa las capas con los mismos metadatos para no repetir el mismo texto en cada ficha. */
function agruparFichas(capas) {
  const grupos = new Map();
  for (const capa of capas) {
    const m = capa.metadatos_extra ?? {};
    const datos = {
      Propósito: recorta(capa.proposito),
      Responsable: m.contacto_custodio ?? capa.responsable,
      Fuente: m.fuente_origen,
      'Fecha de corte': m.fecha_corte,
      Instrumento: capa.instrumento?.nombre ?? (capa.categoria === 'mapa_base' ? 'Mapa base' : null),
      Trazabilidad: recorta(m.linaje),
    };
    const clave = JSON.stringify(datos);
    if (!grupos.has(clave)) grupos.set(clave, { capas: [], datos });
    grupos.get(clave).capas.push(capa);
  }
  return [...grupos.values()];
}

function Ficha({ grupo }) {
  const filas = Object.entries(grupo.datos).filter(([, v]) => v !== null && v !== undefined && v !== '');
  return (
    <section className="infografia__ficha ig-ficha">
      <h4>{grupo.capas.map((c) => <span key={c.id}>{c.titulo} <code>{c.id}</code></span>)}</h4>
      <dl>
        {filas.map(([k, v]) => (
          <div key={k}><dt>{k}</dt><dd>{String(v)}</dd></div>
        ))}
      </dl>
    </section>
  );
}

const INCLUYE = [
  { id: 'mapa', t: 'Mapa con leyenda y escala' },
  { id: 'fichas', t: 'Ficha técnica de cada capa' },
  { id: 'fuentes', t: 'Fuentes e instituciones' },
  { id: 'seguimiento', t: 'Indicadores' },
  { id: 'aviso', t: 'Aviso' },
];

/**
 * Infografía del geovisor (cámara). Previsualiza la lámina con el mapa de lo encendido, la simbología,
 * el aviso, los indicadores, la ficha técnica y metadatos de cada capa y las fuentes e instituciones.
 * Se descarga como PNG o PDF (impresión).
 */
export default function Infografia({ activas, limitesActuales, configDe, escalaTexto, satelite = false, onCerrar }) {
  const [generando, setGenerando] = useState(false);
  const [encuadre, setEncuadre] = useState('actual');
  const [incluye, setIncluye] = useState({ mapa: true, fichas: true, fuentes: true, seguimiento: true, aviso: true });
  const [indiceTitulo, setIndiceTitulo] = useState(0);
  const lamina = useRef(null);
  const [mapaLamina, setMapaLamina] = useState(null);

  const tematicas = useMemo(() => activas.filter((c) => !CAPAS_BASE.includes(c.id) && !CAPAS_FIJAS.has(c.id)), [activas]);
  const titulos = useMemo(() => {
    const t = [...new Map(tematicas.filter((c) => c.categoria !== 'mapa_base').map((c) => { const x = tituloInfografia(c); return [`${x.etiqueta} · ${x.tema}`, `Por tema: ${x.etiqueta} · ${x.tema}`]; })).values()];
    return [...t, tematicas.length ? `Capas encendidas (${tematicas.length})` : 'Mapa base'];
  }, [tematicas]);
  const titulo = titulos[Math.min(indiceTitulo, titulos.length - 1)].replace(/^Por tema: /, '');
  const limites = encuadre === 'actual' && limitesActuales ? limitesActuales : EXTENSION_CAMPECHE;
  const capasMapa = useMemo(() => [...activas].sort((a, b) => (CAPAS_MASCARA.has(b.id) ? -1 : 0) - (CAPAS_MASCARA.has(a.id) ? -1 : 0)), [activas]);
  const porCategoria = useMemo(() => CATEGORIAS.map((c) => ({ ...c, capas: activas.filter((x) => x.categoria === c.id) })).filter((c) => c.capas.length), [activas]);
  const instrumentos = useMemo(() => [...new Map(activas.filter((c) => c.instrumento).map((c) => [c.instrumento.id, c.instrumento])).values()], [activas]);
  const instituciones = useMemo(() => [...new Set(activas.map((c) => c.instrumento?.competencia ?? c.metadatos_extra?.contacto_custodio).filter(Boolean))], [activas]);
  const fichas = useMemo(() => agruparFichas(tematicas), [tematicas]);
  const configLamina = (id) => configDe?.(id) ?? CONFIG_INICIAL;

  useEffect(() => {
    const escape = (e) => e.key === 'Escape' && onCerrar();
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [onCerrar]);

  const descargarPng = async () => {
    if (!lamina.current) return;
    setGenerando(true);
    try {
      const lienzo = await html2canvas(lamina.current, { useCORS: true, logging: false, scale: 2, backgroundColor: '#ffffff' });
      const a = document.createElement('a');
      a.href = lienzo.toDataURL('image/png');
      a.download = `SESIM_infografia_${new Date().toLocaleDateString('sv-SE')}.png`;
      a.click();
    } finally {
      setGenerando(false);
    }
  };

  const descargarPdf = () => {
    document.body.classList.add('imprimiendo-infografia');
    const quitar = () => {
      document.body.classList.remove('imprimiendo-infografia');
      window.removeEventListener('afterprint', quitar);
    };
    window.addEventListener('afterprint', quitar);
    window.print();
  };

  const hoy = new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
  const alternar = (id) => setIncluye((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="infografia-capa" role="dialog" aria-modal="true" aria-label="Infografía del geovisor">
      <div className="infografia-barra">
        <strong>Infografía del geovisor</strong>
        <span className="infografia-barra__espacio" />
        <button type="button" onClick={onCerrar} aria-label="Cerrar"><X size={18} aria-hidden="true" /></button>
      </div>

      <div className="ig-cuerpo">
        <aside className="ig-opciones">
          <p className="ig-leyenda">Previsualización del geovisor con los paneles desplegados, junto con los indicadores, la ficha técnica, los metadatos y la trazabilidad de las capas encendidas.</p>
          <label className="ig-campo" htmlFor="ig-titulo"><span>Título</span>
            <select id="ig-titulo" value={Math.min(indiceTitulo, titulos.length - 1)} onChange={(e) => setIndiceTitulo(Number(e.target.value))}>
              {titulos.map((t, i) => <option key={t} value={i}>{t}</option>)}
            </select>
          </label>
          <fieldset className="ig-campo"><legend>Encuadre</legend>
            <div className="ig-seg">
              <button type="button" aria-pressed={encuadre === 'actual'} className={encuadre === 'actual' ? 'activo' : undefined} onClick={() => setEncuadre('actual')}>Vista actual</button>
              <button type="button" aria-pressed={encuadre === 'estado'} className={encuadre === 'estado' ? 'activo' : undefined} onClick={() => setEncuadre('estado')}>Todo el estado</button>
            </div>
          </fieldset>
          <fieldset className="ig-campo"><legend>Incluye</legend>
            {INCLUYE.map((o) => (
              <label key={o.id} className="ig-check"><input type="checkbox" checked={incluye[o.id]} onChange={() => alternar(o.id)} /> {o.t}</label>
            ))}
          </fieldset>
          <div className="ig-botones">
            <button type="button" className="gv-btn gv-btn--primario" onClick={descargarPdf}><Printer size={16} aria-hidden="true" /> Descargar PDF</button>
            <button type="button" className="gv-btn" onClick={descargarPng} disabled={generando}><Download size={16} aria-hidden="true" /> {generando ? 'Generando…' : 'Descargar PNG'}</button>
          </div>
        </aside>

        <div className="infografia-vista">
          <article className="infografia" ref={lamina}>
            <header className="infografia__cabecera">
              <img src="/gobiernoparatodos.png" alt="Escudo del Estado de Campeche" />
              <img src="/logocampeche.png" alt="Gobierno de Campeche" />
              <div className="infografia__titulos">
                <span className="infografia__etiqueta">Infografía</span>
                <h2>{titulo}</h2>
                <p className="ig-capas-titulo">Capas que contiene esta infografía</p>
                <p className="ig-capas">{activas.filter((c) => !CAPAS_FIJAS.has(c.id)).map((c) => `${c.titulo} (${c.id})`).join(' · ') || 'Mapa base'}</p>
              </div>
              <div className="infografia__sello">
                <b>SESIM</b>
                <small>Sistema Estatal de Seguimiento de Indicadores de Movilidad y Seguridad Vial</small>
                <small>Escala: {escalaTexto}</small>
                <small>{hoy}</small>
              </div>
            </header>

            {incluye.mapa && (
              <>
                <div className="infografia__mapa ig-mapa">
                  <MapaFijo capas={capasMapa} limites={limites} configDe={configLamina} onMapa={setMapaLamina} satelite={satelite} />
                  {mapaLamina && <EscalaMapa mapa={mapaLamina} />}
                  <span className="infografia__norte" aria-label="Norte">N<i /></span>
                </div>
                <section className="ig-seccion">
                  <h3>Simbología</h3>
                  <div className="ig-columnas">
                    {porCategoria.map((cat) => (
                      <div key={cat.id} className="ig-cat">
                        <h4>{NOMBRES_CAT[cat.id]}</h4>
                        {cat.capas.map((c) => <FilaLeyenda key={c.id} capa={c} config={configLamina(c.id)} />)}
                      </div>
                    ))}
                  </div>
                </section>
              </>
            )}

            {incluye.aviso && (
              <section className="ig-seccion ig-aviso">
                <h3>{AVISOS.aviso.titulo}</h3>
                <p>{AVISOS.aviso.texto}</p>
              </section>
            )}

            {incluye.seguimiento && (
              <section className="ig-seccion">
                <h3>Indicadores</h3>
                <Indicadores capas={tematicas} />
              </section>
            )}

            {incluye.fichas && tematicas.length > 0 && (
              <section className="ig-seccion">
                <h3>Ficha técnica y metadatos de las capas encendidas</h3>
                <div className="ig-fichas">
                  {fichas.map((g) => <Ficha key={g.capas[0].id} grupo={g} />)}
                </div>
              </section>
            )}

            {incluye.fuentes && (
              <section className="ig-seccion">
                <h3>Fuentes e instituciones</h3>
                {instrumentos.length > 0 && <p><b>Instrumentos de origen:</b> {instrumentos.map((i) => i.nombre).join(' · ')}</p>}
                {instituciones.length > 0 && <p><b>Instituciones responsables:</b> {instituciones.join(' · ')}</p>}
                <p className="ig-nota">Mapa base: Esri · Sistema de referencia de visualización: EPSG:3857 · Atributos publicados: {ATRIBUTOS_PUBLICOS.join(', ')}.</p>
              </section>
            )}
          </article>
        </div>
      </div>
    </div>
  );
}
