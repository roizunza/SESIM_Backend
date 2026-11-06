import { useMemo, useState } from 'react';
import { ArrowDownUp } from 'lucide-react';
import { COLORES_SEMAFORO } from '../../lib/sesim/semaforo';
import { fmtNumero } from './formato';

const COLUMNAS = [
  { campo: 'id_indicador', titulo: 'ID' },
  { campo: 'indicador', titulo: 'Indicador' },
  { campo: 'municipio', titulo: 'Municipio' },
  { campo: 'localidad', titulo: 'Localidad' },
  { campo: 'periodo', titulo: 'Periodo' },
  { campo: 'valor', titulo: 'Valor', numerica: true },
  { campo: 'semaforo', titulo: 'Semáforo' },
];
const POR_PAGINA = 50;

/** Matriz de datos del corte actual: misma información que la vista gráfica, ordenable y paginada. */
export default function VistaTabular({ filas, titulo }) {
  const [orden, setOrden] = useState({ campo: 'id_indicador', asc: true });
  const [pagina, setPagina] = useState(0);

  const ordenadas = useMemo(() => {
    const col = COLUMNAS.find((c) => c.campo === orden.campo);
    const s = orden.asc ? 1 : -1;
    return [...filas].sort((a, b) => (col.numerica ? (Number(a[col.campo]) - Number(b[col.campo])) * s : String(a[col.campo]).localeCompare(String(b[col.campo]), 'es') * s));
  }, [filas, orden]);

  const paginas = Math.max(1, Math.ceil(ordenadas.length / POR_PAGINA));
  const actual = Math.min(pagina, paginas - 1);
  const visibles = ordenadas.slice(actual * POR_PAGINA, (actual + 1) * POR_PAGINA);

  const ordenar = (campo) => setOrden((o) => ({ campo, asc: o.campo === campo ? !o.asc : true }));

  return (
    <div className="vista-tabular">
      <div className="vista-tabular__scroll" tabIndex={0} role="region" aria-label={titulo}>
        <table className="tabla-tablero">
          <caption className="sr-only">{titulo}</caption>
          <thead>
            <tr>
              {COLUMNAS.map((c) => (
                <th key={c.campo} scope="col" aria-sort={orden.campo === c.campo ? (orden.asc ? 'ascending' : 'descending') : 'none'} className={c.numerica ? 'num' : undefined}>
                  <button type="button" onClick={() => ordenar(c.campo)}>
                    {c.titulo} <ArrowDownUp size={12} aria-hidden="true" />
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibles.map((f) => (
              <tr key={f.id_medicion}>
                <td><code>{f.id_indicador}</code></td>
                <td>{f.indicador}</td>
                <td>{f.municipio}</td>
                <td>{f.localidad || '—'}</td>
                <td>{f.periodo}</td>
                <td className="num">{f.valor != null ? fmtNumero(f.valor) : f.valor_texto || '—'}</td>
                <td><span className="chip-semaforo" style={{ '--sem': COLORES_SEMAFORO[f.semaforo] }}><i aria-hidden="true" />{f.semaforo}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {paginas > 1 && (
        <nav className="vista-tabular__paginas" aria-label="Paginación de la tabla">
          <button type="button" onClick={() => setPagina(actual - 1)} disabled={actual === 0}>Anterior</button>
          <span aria-live="polite">Página {actual + 1} de {paginas} · {filas.length} registros</span>
          <button type="button" onClick={() => setPagina(actual + 1)} disabled={actual >= paginas - 1}>Siguiente</button>
        </nav>
      )}
    </div>
  );
}
