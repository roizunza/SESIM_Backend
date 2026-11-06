import { useId, useMemo } from 'react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';
import { ArrowDownRight, ArrowUpRight, CalendarClock, ChartColumn, ChartPie, Gauge, MapPinned, Minus, Radar, Thermometer, TrafficCone, TrendingUp } from 'lucide-react';
import { COLORES_SEMAFORO } from '../../lib/sesim/semaforo';
import { fmtNumero, fmtVariacion, tokenCss } from './formato';
import { GraficaSerie } from './Graficas';
import MapCanvas from './MapCanvas';
import EstadoCarga from '../plataforma/EstadoCarga';

ChartJS.register(ArcElement, Tooltip, Legend);

const ORDEN_SEMAFORO = ['verde', 'amarillo', 'rojo', 'mejora', 'estable', 'retrocede', 'sin línea base'];
const RAMPA = ['#F3E3E7', '#D99AAA', '#B54A66', '#691C32'];
const mayuscula = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const fmtPct = (v) => (v === null || v === undefined ? '—' : `${Math.round(v)} %`);

function Panel({ icono: Icono, titulo, nota, className = '', children }) {
  const id = useId();
  return (
    <section className={`resumen__panel ${className}`} aria-labelledby={id}>
      <h3 id={id} className="resumen__titulo">
        <Icono size={17} aria-hidden="true" /> {titulo}
      </h3>
      {nota && <p className="resumen__nota">{nota}</p>}
      {children}
    </section>
  );
}

function Sparkline({ serie, etiqueta }) {
  if (serie.length < 2) return <span className="resumen__spark resumen__spark--vacia">Un solo periodo publicado</span>;
  const valores = serie.map((p) => p.valor);
  const min = Math.min(...valores);
  const rango = Math.max(...valores) - min || 1;
  const puntos = valores.map((v, k) => `${(k / (valores.length - 1)) * 100},${28 - ((v - min) / rango) * 24}`).join(' ');
  return (
    <svg className="resumen__spark" viewBox="0 0 100 30" preserveAspectRatio="none" role="img" aria-label={`Serie de ${etiqueta}: ${serie.map((p) => `${p.periodo.etiqueta} ${fmtNumero(p.valor)}`).join(', ')}`}>
      <polyline points={puntos} />
    </svg>
  );
}

function Destacado({ resumen, activo, onEnfocar }) {
  const { indicador: ind, ultimo, variacion, favorable, semaforo } = resumen;
  const Icono = variacion > 0 ? ArrowUpRight : variacion < 0 ? ArrowDownRight : Minus;
  const clase = favorable === null || favorable === undefined ? 'neutra' : favorable ? 'avance' : 'retroceso';
  return (
    <button type="button" className={`resumen__kpi${activo ? ' resumen__kpi--activo' : ''}`} aria-pressed={activo} onClick={onEnfocar}>
      <span className="resumen__kpi-cabecera">
        <code>{ind.id}</code>
        <span className="resumen__kpi-nivel">{ind.nivel_mir}</span>
      </span>
      <span className="resumen__kpi-nombre">{ind.nombre}</span>
      <span className="resumen__kpi-valor">
        <strong>{fmtNumero(ultimo.valor)}</strong>
        {variacion !== null && variacion !== undefined && (
          <span className={`resumen__var resumen__var--${clase}`}>
            <Icono size={13} aria-hidden="true" /> {fmtVariacion(variacion)}
          </span>
        )}
      </span>
      <span className="resumen__kpi-pie">
        <i style={{ background: COLORES_SEMAFORO[semaforo] }} aria-hidden="true" /> {mayuscula(semaforo)} · {ultimo.periodo.etiqueta}
      </span>
      <Sparkline serie={resumen.serie} etiqueta={ind.nombre} />
    </button>
  );
}

function Medidor({ valor, etiqueta }) {
  const r = 70;
  const largo = Math.PI * r;
  const lleno = valor === null ? 0 : (Math.max(0, Math.min(100, valor)) / 100) * largo;
  return (
    <svg viewBox="0 0 180 104" className="resumen__medidor" role="img" aria-label={`${etiqueta}: ${fmtPct(valor)}`}>
      <path d="M20 94 A70 70 0 0 1 160 94" className="resumen__medidor-fondo" />
      <path d="M20 94 A70 70 0 0 1 160 94" className="resumen__medidor-valor" strokeDasharray={`${lleno} ${largo}`} />
      <text x="90" y="82" textAnchor="middle" className="resumen__medidor-cifra">{valor === null ? '—' : `${Math.round(valor)} %`}</text>
    </svg>
  );
}

function Termometro({ valor }) {
  const alto = valor === null ? 0 : (Math.max(0, Math.min(100, valor)) / 100) * 96;
  return (
    <svg viewBox="0 0 44 140" className="resumen__termometro" aria-hidden="true">
      <rect x="15" y="8" width="14" height="100" rx="7" className="resumen__termometro-tubo" />
      <rect x="18" y={104 - alto} width="8" height={alto + 6} rx="4" className="resumen__termometro-nivel" />
      <circle cx="22" cy="118" r="14" className="resumen__termometro-bulbo" />
    </svg>
  );
}

function Distribucion({ semaforos }) {
  const presentes = ORDEN_SEMAFORO.filter((s) => semaforos.get(s));
  const total = presentes.reduce((n, s) => n + semaforos.get(s), 0);
  const data = {
    labels: presentes.map(mayuscula),
    datasets: [{ data: presentes.map((s) => semaforos.get(s)), backgroundColor: presentes.map((s) => COLORES_SEMAFORO[s]), borderColor: '#fff', borderWidth: 2 }],
  };
  const opciones = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '62%',
    animation: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? false : { duration: 300 },
    plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${c.label}: ${c.parsed} indicadores` } } },
  };
  const dominante = presentes.reduce((a, s) => (!a || semaforos.get(s) > semaforos.get(a) ? s : a), null);
  return (
    <div className="resumen__dona">
      <div className="resumen__dona-grafica">
        <Doughnut data={data} options={opciones} role="img" aria-label={`Distribución del semáforo: ${presentes.map((s) => `${s} ${semaforos.get(s)}`).join(', ')}`} />
        <span className="resumen__dona-centro">
          <strong>{Math.round((semaforos.get(dominante) / total) * 100)} %</strong>
          <small>{mayuscula(dominante)}</small>
        </span>
      </div>
      <ul className="resumen__leyenda">
        {presentes.map((s) => (
          <li key={s}>
            <i style={{ background: COLORES_SEMAFORO[s] }} aria-hidden="true" />
            <span>{mayuscula(s)}</span>
            <strong>{semaforos.get(s)}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Vista «Resumen» del tablero de seguimiento (pestaña sin eje). Todo sale de las mediciones
 * vigente_publico del corte activo; cuando un bloque no tiene datos muestra su estado vacío.
 */
export default function ResumenEjecutivo({ modelo, geojson, mapaError, enfocado, onEnfocar, seleccionado, onSeleccionarMunicipio }) {
  const rampa = useMemo(() => {
    const max = Math.max(1, ...modelo.porMunicipio.map((m) => m.indicadores));
    const cortes = RAMPA.map((_, k) => Math.ceil(((k + 1) * max) / RAMPA.length));
    return { cortes, color: (n) => RAMPA[cortes.findIndex((c) => n <= c)] ?? RAMPA.at(-1) };
  }, [modelo.porMunicipio]);
  const valores = useMemo(() => new Map(modelo.porMunicipio.map((m) => [m.id, { valor: m.indicadores, mediciones: m.mediciones }])), [modelo.porMunicipio]);
  const leyenda = rampa.cortes
    .map((c, k) => ({ desde: k ? rampa.cortes[k - 1] + 1 : 1, hasta: c, color: RAMPA[k] }))
    .filter((t, k, a) => t.desde <= t.hasta && a.findIndex((x) => x.desde === t.desde) === k)
    .map((t) => ({ etiqueta: t.desde === t.hasta ? `${t.desde}` : `${t.desde}–${t.hasta}`, color: t.color }));
  const barras = modelo.porMunicipio.slice(0, 6);
  const maxBarra = Math.max(1, ...barras.map((b) => b.indicadores));
  const rojo = tokenCss('--c-guinda', '#9F2241');

  return (
    <section className="resumen" aria-label="Resumen del corte">
      <div className="resumen__fila resumen__fila--kpi">
        {modelo.destacados.map((r) => (
          <Destacado key={r.indicador.id} resumen={r} activo={enfocado === r.indicador.id} onEnfocar={() => onEnfocar(r.indicador.id)} />
        ))}
        <Panel icono={Gauge} titulo="Cumplimiento de metas" className="resumen__panel--medidor">
          {modelo.conMeta ? (
            <>
              <Medidor valor={modelo.cumplimiento} etiqueta="Indicadores en verde entre los que tienen meta" />
              <p className="resumen__nota resumen__nota--centro">En verde, de {modelo.conMeta} indicadores con meta numérica</p>
            </>
          ) : (
            <EstadoCarga estado="vacio" mensaje="Ningún indicador del corte tiene meta numérica y línea base." compacto />
          )}
        </Panel>
      </div>

      <div className="resumen__fila resumen__fila--analisis">
        <Panel icono={MapPinned} titulo="Indicadores con dato por municipio" className="resumen__panel--mapa">
          <MapCanvas
            geojson={geojson}
            valores={valores}
            seleccionado={seleccionado}
            onSeleccionar={onSeleccionarMunicipio}
            cargando={!geojson && !mapaError}
            error={mapaError}
            alto={260}
            titulo="Número de indicadores con mediciones publicadas por municipio"
            colorear={(d) => rampa.color(d.valor)}
            describir={(d) => `${d.valor} indicadores · ${d.mediciones} mediciones`}
            leyenda={leyenda}
          />
        </Panel>

        <Panel icono={TrendingUp} titulo="Evolución de indicadores clave" nota="Índice: primer periodo publicado = 100." className="resumen__panel--evolucion">
          {modelo.evolucion.length ? (
            <GraficaSerie titulo="Evolución de los indicadores destacados, índice base 100" series={modelo.evolucion.map((e) => ({ etiqueta: e.indicador.id, puntos: e.puntos }))} alto={240} />
          ) : (
            <EstadoCarga estado="vacio" mensaje="Se necesitan al menos dos periodos publicados de un indicador." compacto />
          )}
        </Panel>

        <Panel icono={ChartPie} titulo="Distribución del semáforo">
          <Distribucion semaforos={modelo.semaforos} />
        </Panel>

        <Panel icono={TrafficCone} titulo="Semáforo por eje" className="resumen__panel--ejes">
          <ul className="resumen__ejes">
            {modelo.porEje.map((e) => (
              <li key={e.eje.id}>
                <span className="resumen__eje-nombre">
                  <b>{e.eje.numero_eje}.</b> {e.eje.nombre}
                </span>
                <span className="resumen__eje-dato">
                  {e.conDato}/{e.total} con dato{e.conMeta ? ` · ${fmtPct(e.cumplimiento)} en verde` : ''}
                </span>
                <span className="resumen__eje-barra" role="img" aria-label={`${e.eje.nombre}: ${ORDEN_SEMAFORO.filter((s) => e.semaforos.get(s)).map((s) => `${s} ${e.semaforos.get(s)}`).join(', ') || 'sin mediciones'}`}>
                  {ORDEN_SEMAFORO.filter((s) => e.semaforos.get(s)).map((s) => (
                    <i key={s} style={{ flexGrow: e.semaforos.get(s), background: COLORES_SEMAFORO[s] }} />
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <div className="resumen__fila resumen__fila--pie">
        <Panel icono={ChartColumn} titulo="Municipios con más indicadores medidos">
          <ol className="resumen__barras">
            {barras.map((b) => (
              <li key={b.id}>
                <button type="button" onClick={() => onSeleccionarMunicipio(seleccionado === b.id ? '' : b.id)} aria-pressed={seleccionado === b.id}>
                  <span className="resumen__barra-valor">{b.indicadores}</span>
                  <span className="resumen__barra" style={{ height: `${(b.indicadores / maxBarra) * 100}%`, background: seleccionado && seleccionado !== b.id ? '#D9C9CE' : rojo }} />
                  <span className="resumen__barra-nombre">{b.nombre}</span>
                </button>
              </li>
            ))}
          </ol>
        </Panel>

        <Panel icono={Thermometer} titulo="Avance promedio a meta" className="resumen__panel--termometro">
          {modelo.avancePromedio === null ? (
            <EstadoCarga estado="vacio" mensaje="Sin indicadores con avance calculable." compacto />
          ) : (
            <div className="resumen__termo">
              <Termometro valor={modelo.avancePromedio} />
              <div>
                <strong className="resumen__cifra">{fmtNumero(modelo.avancePromedio)}<small> / 100</small></strong>
                <p className="resumen__nota">Promedio de {modelo.nAvances} indicadores; cada avance se acota entre 0 y 100.</p>
              </div>
            </div>
          )}
        </Panel>

        <Panel icono={CalendarClock} titulo="Periodo más reciente">
          <strong className="resumen__cifra">{modelo.ultimoPeriodo?.etiqueta ?? '—'}</strong>
          <p className="resumen__nota">{modelo.periodos} periodos con mediciones publicadas en el corte.</p>
        </Panel>

        <Panel icono={Radar} titulo="Cobertura de monitoreo">
          <div className="resumen__cobertura">
            <span>Indicadores con dato</span>
            <strong>{fmtPct(modelo.cobertura.indicadores)}</strong>
            <span className="resumen__progreso"><i style={{ width: `${modelo.cobertura.indicadores ?? 0}%` }} /></span>
            <span>Municipios con dato</span>
            <strong>{modelo.cobertura.nMunicipios} de {modelo.cobertura.totalMunicipios}</strong>
            <span className="resumen__progreso"><i style={{ width: `${modelo.cobertura.municipios ?? 0}%` }} /></span>
          </div>
        </Panel>
      </div>
    </section>
  );
}
