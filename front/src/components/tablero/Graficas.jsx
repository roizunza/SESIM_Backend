import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend, Filler } from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';
import { fmtNumero, tokenCss } from './formato';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend, Filler);

const base = () => ({
  responsive: true,
  maintainAspectRatio: false,
  animation: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? false : { duration: 300 },
  interaction: { mode: 'index', intersect: false },
  plugins: {
    legend: { position: 'bottom', labels: { boxWidth: 12, color: tokenCss('--text-secondary', '#53565A'), font: { family: tokenCss('--font-body', 'Inter') } } },
    tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${fmtNumero(c.parsed.y)}` } },
  },
  scales: {
    x: { grid: { display: false }, ticks: { color: tokenCss('--text-secondary', '#53565A') } },
    y: { grid: { color: tokenCss('--border-color', '#E5E7EB') }, ticks: { color: tokenCss('--text-secondary', '#53565A'), callback: (v) => fmtNumero(v) } },
  },
});

/**
 * Serie histórica de uno o dos cortes. `series` = [{ etiqueta, puntos: [{ periodo, valor }] }].
 * Las etiquetas del eje X son la unión ordenada de los periodos de todas las series.
 */
export function GraficaSerie({ series, titulo, meta, alto = 300 }) {
  const periodos = [...new Map(series.flatMap((s) => s.puntos.map((p) => [p.periodo.id, p.periodo]))).values()].sort((a, b) =>
    String(a.fecha_inicio).localeCompare(String(b.fecha_inicio)),
  );
  const colores = [tokenCss('--c-guinda', '#9F2241'), tokenCss('--c-verde', '#235B4E'), tokenCss('--c-beige-dk', '#AB9470')];
  const data = {
    labels: periodos.map((p) => p.etiqueta),
    datasets: [
      ...series.map((s, k) => ({
        label: s.etiqueta,
        data: periodos.map((p) => s.puntos.find((x) => x.periodo.id === p.id)?.valor ?? null),
        borderColor: colores[k % colores.length],
        backgroundColor: colores[k % colores.length],
        borderDash: k ? [6, 4] : undefined,
        spanGaps: true,
        tension: 0.25,
        pointRadius: 3,
      })),
      ...(meta != null
        ? [{ label: 'Meta', data: periodos.map(() => Number(meta)), borderColor: tokenCss('--c-beige-dk', '#AB9470'), borderDash: [2, 4], pointRadius: 0 }]
        : []),
    ],
  };
  const resumen = series.map((s) => `${s.etiqueta}: ${s.puntos.map((p) => `${p.periodo.etiqueta} ${fmtNumero(p.valor)}`).join(', ')}`).join('. ');
  return (
    <div className="grafica" style={{ height: alto }}>
      <Line data={data} options={base()} role="img" aria-label={`${titulo}. ${resumen}`} />
    </div>
  );
}

/** Último valor del corte por municipio (barras ordenadas). */
export function GraficaMunicipios({ filas, titulo, seleccionado, onSeleccionar }) {
  const guinda = tokenCss('--c-guinda', '#9F2241');
  const claro = tokenCss('--c-beige-lt', '#BCA986');
  const data = {
    labels: filas.map((f) => f.nombre),
    datasets: [{ label: 'Último valor del corte', data: filas.map((f) => f.valor), backgroundColor: filas.map((f) => (!seleccionado || f.id === seleccionado ? guinda : claro)), borderRadius: 4 }],
  };
  const opciones = {
    ...base(),
    plugins: { ...base().plugins, legend: { display: false } },
    onClick: (_, elementos) => {
      if (!elementos.length) return;
      const id = filas[elementos[0].index].id;
      onSeleccionar?.(seleccionado === id ? '' : id);
    },
  };
  const resumen = filas.map((f) => `${f.nombre} ${fmtNumero(f.valor)}`).join(', ');
  return (
    <div className="grafica" style={{ height: 300 }}>
      <Bar data={data} options={opciones} role="img" aria-label={`${titulo}. ${resumen}`} />
    </div>
  );
}
