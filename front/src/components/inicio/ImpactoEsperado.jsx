import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import EnlaceInstitucional from '../plataforma/EnlaceInstitucional';
import { Layers, FileText, BarChart3, MapPin, ArrowRight, Users } from 'lucide-react';
import { useCatalogo } from '../../lib/sesim/useCatalogo';
import { useFiltros } from '../../lib/sesim/filtrosGlobales';
import { RUTAS, enlace } from '../../lib/rutas';
import { publicables } from '../../lib/sesim/normativo';
import EstadoCarga, { Esqueleto } from '../plataforma/EstadoCarga';
import { fmtNumero } from '../tablero/formato';
import './SeccionVision.css';

const TABLAS = ['medicion_publica', 'unidad_territorial', 'v_capa_por_municipio', 'instrumento_normativo'];

function impactoTerritorial(datos, idMunicipio) {
  const municipios = datos.unidad_territorial.filter((u) => u.nivel === 'municipio');
  const delCorte = (id) => !idMunicipio || id === idMunicipio;
  const mediciones = datos.medicion_publica.filter((m) => delCorte(String(m.id_unidad).slice(0, 5)));
  const normativo = publicables(datos.instrumento_normativo);
  return {
    poblacion: municipios.filter((m) => delCorte(m.id)).reduce((s, m) => s + (Number(m.pob_tot) || 0), 0),
    indicadores: new Set(mediciones.map((m) => m.id_indicador)).size,
    mediciones: mediciones.length,
    capas: new Set(datos.v_capa_por_municipio.filter((r) => r.id_unidad && delCorte(r.id_unidad)).map((r) => r.id_capa)).size,
    instrumentos: normativo.filter((d) => !idMunicipio || d.escala !== 'M' || d.id_unidad === idMunicipio).length,
    locales: normativo.filter((d) => d.escala === 'M' && delCorte(d.id_unidad)),
  };
}

/** Cobertura del sistema por municipio: bloque «Impacto esperado» (antes en Visión), con su filtro, cifras e instrumentos locales. */
export default function ImpactoEsperado() {
  const { filtros, fijar } = useFiltros();
  const { datos, error } = useCatalogo(TABLAS);

  const impacto = useMemo(() => (datos ? impactoTerritorial(datos, filtros.municipio) : null), [datos, filtros.municipio]);
  const municipios = useMemo(() => (datos ? datos.unidad_territorial.filter((u) => u.nivel === 'municipio').sort((a, b) => a.nom_mun.localeCompare(b.nom_mun, 'es')) : []), [datos]);

  const fallo = error;
  const nombreCorte = filtros.municipio ? municipios.find((m) => m.id === filtros.municipio)?.nom_mun : 'Estado de Campeche';

  return (
      <div className="vision__bloque" data-revelar>
        <div className="vision__impacto-cabecera">
          <div className="vision__bloque-cabecera">
            <h3>Impacto esperado · {nombreCorte}</h3>
            <p>Cobertura del sistema por municipio. El municipio que elija aquí se conserva en el catálogo y en el seguimiento.</p>
          </div>
          <label className="vision__selector">
            Municipio
            <select value={filtros.municipio} onChange={(e) => fijar('municipio', e.target.value)} disabled={!municipios.length}>
              <option value="">Todo el estado</option>
              {municipios.map((m) => <option key={m.id} value={m.id}>{m.nom_mun}</option>)}
            </select>
          </label>
        </div>

        {!fallo && !impacto && <Esqueleto alto={130} etiqueta="Cargando resumen territorial" />}
        {impacto && (
          <>
            <div className="impacto">
              {[
                { icono: Users, valor: impacto.poblacion, texto: 'habitantes en el territorio' },
                { icono: BarChart3, valor: impacto.indicadores, texto: 'indicadores con mediciones publicadas' },
                { icono: Layers, valor: impacto.capas, texto: 'capas geográficas con elementos' },
                { icono: FileText, valor: impacto.instrumentos, texto: 'instrumentos normativos aplicables' },
              ].map(({ icono: Icono, valor, texto }) => (
                <div key={texto} className="impacto__dato">
                  <Icono size={18} aria-hidden="true" />
                  <strong>{fmtNumero(valor)}</strong>
                  <span>{texto}</span>
                </div>
              ))}
            </div>
            {impacto.mediciones === 0 && <EstadoCarga estado="vacio" mensaje={`Aún no hay mediciones publicadas para ${nombreCorte}.`} compacto />}
            <div className="impacto__pie">
              {impacto.locales.length > 0 && (
                <div>
                  <h4><MapPin size={14} aria-hidden="true" /> Instrumentos municipales</h4>
                  <ul className="impacto__chips">
                    {impacto.locales.map((d) => (
                      <li key={d.id}><Link to={enlace.fichaInstrumento(d.id)}>{d.nombre}</Link></li>
                    ))}
                  </ul>
                </div>
              )}
              <EnlaceInstitucional to={RUTAS.tablero} sinAcceso="ocultar" className="impacto__cta">
                Ver indicadores de {nombreCorte} <ArrowRight size={16} aria-hidden="true" />
              </EnlaceInstitucional>
            </div>
          </>
        )}
      </div>
  );
}
