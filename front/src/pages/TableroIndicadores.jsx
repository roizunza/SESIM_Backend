import { useCallback, useEffect, useMemo, useState } from 'react';
import { useCatalogo, useContenido } from '../lib/sesim/useCatalogo';
import { geojsonUnidades } from '../lib/sesim/api';
import { useFiltrosEnUrl } from '../lib/sesim/useFiltrosEnUrl';
import { useFiltros, filtrosActivos } from '../lib/sesim/filtrosGlobales';
import { umbralVigente } from '../lib/sesim/semaforo';
import { prepararCatalogo, indicadoresFiltrados, medicionesFiltradas, serieDe, resumenIndicador, valoresPorMunicipio, filasTabla, resumenEjecutivo } from '../lib/sesim/tablero';
import { aCsv, aGeojsonMunicipal, descargar, sufijoFecha } from '../lib/sesim/descargas';
import Scorecard from '../components/tablero/Scorecard';
import ResumenEjecutivo from '../components/tablero/ResumenEjecutivo';
import ActionBar from '../components/tablero/ActionBar';
import BarraFiltros from '../components/tablero/BarraFiltros';
import MapCanvas from '../components/tablero/MapCanvas';
import VistaTabular from '../components/tablero/VistaTabular';
import FichaIndicador from '../components/tablero/FichaIndicador';
import ReportarPuntoCritico from '../components/tablero/ReportarPuntoCritico';
import { GraficaMunicipios, GraficaSerie } from '../components/tablero/Graficas';
import Drawer from '../components/plataforma/Drawer';
import AvisoLegal from '../components/plataforma/AvisoLegal';
import { AVISOS } from '../lib/avisosLegales';
import EstadoCarga, { Esqueleto } from '../components/plataforma/EstadoCarga';
import '../components/tablero/Tablero.css';

const TABLAS = ['indicador', 'eje_tematico', 'indicador_eje', 'fuente_informacion', 'periodo', 'medicion_publica', 'unidad_territorial', 'fuente_documental', 'umbral_publico'];
const TARJETAS_INICIALES = 8;

function useGeojsonMunicipios() {
  const [estado, setEstado] = useState({ datos: null, error: null });
  useEffect(() => {
    let vivo = true;
    geojsonUnidades('municipios')
      .then((datos) => vivo && setEstado({ datos, error: null }))
      .catch((e) => vivo && setEstado({ datos: null, error: e.message }));
    return () => {
      vivo = false;
    };
  }, []);
  return estado;
}

const etiquetaRango = (cat, desde, hasta) => {
  const d = desde ? cat.periodos.get(Number(desde))?.etiqueta : null;
  const h = hasta ? cat.periodos.get(Number(hasta))?.etiqueta : null;
  if (!d && !h) return 'todos los periodos';
  return `${d ?? 'inicio'} – ${h ?? 'último'}`;
};

export default function TableroIndicadores() {
  const { datos, error } = useCatalogo(TABLAS);
  const jerarquia = useContenido('jerarquia_movilidad');
  const mapa = useGeojsonMunicipios();
  const { filtros, fijar, comparar, reiniciar } = useFiltros();
  useFiltrosEnUrl();
  const [ficha, setFicha] = useState(null);
  const [reportando, setReportando] = useState(false);
  const [todas, setTodas] = useState(false);

  const cat = useMemo(() => (datos && jerarquia.datos ? prepararCatalogo(datos, jerarquia.datos) : null), [datos, jerarquia.datos]);

  const modelo = useMemo(() => {
    if (!cat) return null;
    const indicadores = indicadoresFiltrados(cat, filtros);
    const ids = new Set(indicadores.map((i) => i.id));
    const mediciones = medicionesFiltradas(cat, filtros, { ids });
    const resumenes = indicadores.map((i) => resumenIndicador(i, serieDe(i.id, mediciones), umbralVigente(cat.umbrales, i.id))).filter((r) => r.ultimo);
    const c = filtros.comparar;
    const medicionesB = c.activo
      ? medicionesFiltradas(cat, filtros, c.modo === 'periodo' ? { ids, desde: c.periodoDesde, hasta: c.periodoHasta } : { ids, municipio: c.municipio })
      : null;
    const enfocado = resumenes.find((r) => r.indicador.id === filtros.indicador) ?? resumenes[0] ?? null;
    const valores = enfocado ? valoresPorMunicipio(enfocado.indicador.id, medicionesFiltradas(cat, { ...filtros, municipio: '' }, { ids, municipio: '' }), enfocado.indicador, umbralVigente(cat.umbrales, enfocado.indicador.id)) : null;
    const resumen = filtros.eje ? null : resumenEjecutivo(cat, resumenes, mediciones, indicadores);
    return { indicadores, mediciones, medicionesB, resumenes, enfocado, valores, resumen, filas: filasTabla(cat, mediciones) };
  }, [cat, filtros]);

  const nombreMunicipio = (id) => (id ? cat?.unidades.get(id)?.nom_mun : 'Estado de Campeche');
  const etiquetaA = cat ? `${nombreMunicipio(filtros.municipio)} · ${etiquetaRango(cat, filtros.periodoDesde, filtros.periodoHasta)}` : '';
  const etiquetaB =
    cat && filtros.comparar.activo
      ? filtros.comparar.modo === 'periodo'
        ? `${nombreMunicipio(filtros.municipio)} · ${etiquetaRango(cat, filtros.comparar.periodoDesde, filtros.comparar.periodoHasta)}`
        : `${nombreMunicipio(filtros.comparar.municipio)} · ${etiquetaRango(cat, filtros.periodoDesde, filtros.periodoHasta)}`
      : '';

  const seleccionarMunicipio = useCallback((id) => fijar('municipio', id), [fijar]);

  const descargarCsv = () => {
    descargar(`sesim_mediciones_${sufijoFecha()}.csv`, aCsv(modelo.filas), 'text/csv;charset=utf-8');
  };
  const descargarGeojson = () => {
    const ind = modelo.enfocado?.indicador;
    const valores = new Map([...(modelo.valores ?? [])].map(([id, v]) => [id, { id_indicador: ind.id, indicador: ind.nombre, valor: v.valor, periodo: v.periodo.etiqueta, semaforo: v.semaforo }]));
    const fc = aGeojsonMunicipal(mapa.datos, valores, { name: `sesim_${ind.id}`, generado: new Date().toISOString(), aviso_legal: `${AVISOS.cartografico.texto} ${AVISOS.estadistico.texto}` });
    descargar(`sesim_${ind.id}_municipios_${sufijoFecha()}.geojson`, JSON.stringify(fc), 'application/geo+json');
  };

  const fallo = error || jerarquia.error;
  if (fallo) {
    return (
      <div className="tablero">
        <EstadoCarga estado="error" titulo="No se pudo cargar el tablero" mensaje={fallo} accion={{ etiqueta: 'Reintentar', onClick: () => window.location.reload() }} />
      </div>
    );
  }
  if (!cat || !modelo) {
    return (
      <div className="tablero" aria-busy="true">
        <Esqueleto alto={64} etiqueta="Cargando filtros" />
        <div className="tablero__tarjetas">{[0, 1, 2, 3].map((k) => <Esqueleto key={k} alto={190} etiqueta="Cargando indicador" />)}</div>
        <Esqueleto alto={420} etiqueta="Cargando mapa" />
      </div>
    );
  }

  const { resumenes, enfocado } = modelo;
  const visibles = todas ? resumenes : resumenes.slice(0, TARJETAS_INICIALES);
  const resumenB = (ind) => (modelo.medicionesB ? resumenIndicador(ind, serieDe(ind.id, modelo.medicionesB), umbralVigente(cat.umbrales, ind.id)) : null);
  const nFiltros = filtrosActivos(filtros);
  const filasMunicipios = enfocado
    ? [...modelo.valores].map(([id, v]) => ({ id, nombre: cat.unidades.get(id)?.nom_mun ?? id, valor: v.valor })).sort((a, b) => b.valor - a.valor)
    : [];

  return (
    <div className="tablero">
      <h2 className="sr-only">Tablero de indicadores</h2>

      <div className="solo-impresion tablero__impresion">
        <strong>SESIM Campeche · Reporte ejecutivo</strong>
        <span>Corte: {etiquetaA}{filtros.comparar.activo ? ` · Comparado con: ${etiquetaB}` : ''}</span>
        <span>Generado: {new Date().toLocaleString('es-MX')}</span>
      </div>

      <nav className="tablero__ejes" aria-label="Ejes temáticos">
        {[{ id: '', numero_eje: null, nombre: 'Resumen' }, ...cat.listaEjes].map((e) => {
          const activo = String(filtros.eje) === String(e.id);
          return (
            <button key={e.id || 'todos'} type="button" className={`tablero__eje${activo ? ' tablero__eje--activo' : ''}`} aria-pressed={activo} onClick={() => fijar('eje', e.id ? String(e.id) : '')}>
              {e.numero_eje ? `${e.numero_eje}. ` : ''}{e.nombre}
            </button>
          );
        })}
      </nav>

      <BarraFiltros catalogo={cat} />

      <ActionBar
        vista={filtros.vista}
        onVista={(v) => fijar('vista', v)}
        comparando={filtros.comparar.activo}
        onComparar={() => comparar({ activo: !filtros.comparar.activo })}
        nFiltros={nFiltros}
        onReiniciar={reiniciar}
        onPdf={() => window.print()}
        onCsv={descargarCsv}
        onGeojson={descargarGeojson}
        onReportar={() => setReportando(true)}
        puedeDescargar={modelo.filas.length > 0 && !!mapa.datos}
      />

      <p className="tablero__conteo" aria-live="polite">
        <strong>{resumenes.length}</strong> de {modelo.indicadores.length} indicadores con mediciones publicadas en el corte · {modelo.filas.length} registros
      </p>

      {resumenes.length === 0 ? (
        <EstadoCarga
          estado="vacio"
          titulo="Sin mediciones publicadas para este corte"
          mensaje={cat.mediciones.length ? 'Ningún indicador tiene datos con la combinación de filtros elegida.' : 'Aún no hay mediciones en estado vigente_publico en el SESIM.'}
          accion={nFiltros ? { etiqueta: 'Borrar filtros', onClick: reiniciar } : undefined}
        />
      ) : (
        <>
          {modelo.resumen && (
            <ResumenEjecutivo
              modelo={modelo.resumen}
              geojson={mapa.datos}
              mapaError={mapa.error}
              enfocado={enfocado?.indicador.id}
              onEnfocar={(id) => fijar('indicador', id)}
              seleccionado={filtros.municipio}
              onSeleccionarMunicipio={seleccionarMunicipio}
            />
          )}
          {modelo.resumen && <h3 className="tablero__subtitulo">Todos los indicadores del corte</h3>}
          <section className="tablero__tarjetas" aria-label="Indicadores del corte">
            {visibles.map((r) => (
              <Scorecard
                key={r.indicador.id}
                resumen={r}
                comparado={resumenB(r.indicador)}
                etiquetaCorte={nombreMunicipio(filtros.municipio)}
                etiquetaComparado={etiquetaB}
                activo={enfocado?.indicador.id === r.indicador.id}
                onEnfocar={() => fijar('indicador', r.indicador.id)}
                onFicha={() => setFicha(r.indicador)}
              />
            ))}
          </section>
          {resumenes.length > TARJETAS_INICIALES && (
            <button type="button" className="tablero__mas" onClick={() => setTodas((v) => !v)} aria-expanded={todas}>
              {todas ? 'Mostrar menos' : `Mostrar los ${resumenes.length} indicadores`}
            </button>
          )}

          <section className="tablero__analisis">
            <div className="panel">
              <h2 className="panel__titulo">Mapa · {enfocado.indicador.id} {enfocado.indicador.nombre}</h2>
              <p className="panel__nota">Último valor publicado por municipio, coloreado con el semáforo F04. Haga clic en un municipio para filtrar.</p>
              <MapCanvas
                geojson={mapa.datos}
                valores={modelo.valores}
                seleccionado={filtros.municipio}
                onSeleccionar={seleccionarMunicipio}
                cargando={!mapa.datos}
                error={mapa.error}
                titulo={`Mapa municipal del indicador ${enfocado.indicador.nombre}`}
              />
              <AvisoLegal tipo="cartografico" compacto />
            </div>

            <div className="panel">
              {filtros.vista === 'tabla' ? (
                <>
                  <h2 className="panel__titulo">Matriz de datos del corte</h2>
                  <VistaTabular filas={modelo.filas} titulo="Mediciones publicadas que cumplen los filtros" />
                </>
              ) : (
                <>
                  <h2 className="panel__titulo">Serie histórica · {enfocado.indicador.nombre}</h2>
                  <GraficaSerie
                    titulo={`Serie histórica de ${enfocado.indicador.nombre}`}
                    meta={enfocado.indicador.valor_meta}
                    series={[
                      { etiqueta: etiquetaA, puntos: enfocado.serie },
                      ...(modelo.medicionesB ? [{ etiqueta: etiquetaB, puntos: serieDe(enfocado.indicador.id, modelo.medicionesB) }] : []),
                    ]}
                  />
                  <h2 className="panel__titulo panel__titulo--sep">Comparativo municipal</h2>
                  {filasMunicipios.length ? (
                    <GraficaMunicipios filas={filasMunicipios} titulo={`Último valor por municipio de ${enfocado.indicador.nombre}`} seleccionado={filtros.municipio} onSeleccionar={seleccionarMunicipio} />
                  ) : (
                    <EstadoCarga estado="vacio" mensaje="El indicador no tiene mediciones municipales en el corte." compacto />
                  )}
                </>
              )}
            </div>
          </section>
          <AvisoLegal tipo="estadistico" />
        </>
      )}

      <Drawer abierto={!!ficha} onCerrar={() => setFicha(null)} titulo={ficha?.nombre} subtitulo={ficha ? `Ficha técnica · ${[ficha.id, ficha.clave].filter((v, k, a) => v && a.findIndex((x) => String(x).toLowerCase() === String(v).toLowerCase()) === k).join(' · ')}` : ''}>
        {ficha && <FichaIndicador indicador={ficha} catalogo={cat} fuentesDocumentales={datos.fuente_documental} umbral={umbralVigente(cat.umbrales, ficha.id)} />}
      </Drawer>

      <ReportarPuntoCritico abierto={reportando} onCerrar={() => setReportando(false)} geojson={mapa.datos} />
    </div>
  );
}
