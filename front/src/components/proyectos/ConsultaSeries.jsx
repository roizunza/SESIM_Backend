import { useId, useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { medicionesFiltradas, serieDe } from '../../lib/sesim/tablero';
import { aCsv, descargar, sufijoFecha } from '../../lib/sesim/descargas';
import EstadoCarga from '../plataforma/EstadoCarga';
import { fmtNumero } from '../tablero/formato';

/**
 * Consultas y series históricas con cortes territoriales: matriz unidad × periodo del
 * indicador elegido, respetando el rango de periodos y el municipio del estado global.
 */
export default function ConsultaSeries({ catalogo, filtros }) {
  const ids = { ind: useId(), corte: useId() };
  const conDato = useMemo(() => {
    const presentes = new Set(catalogo.mediciones.map((m) => m.id_indicador));
    return catalogo.indicadores.filter((i) => presentes.has(i.id));
  }, [catalogo]);
  const [idIndicador, setIdIndicador] = useState('');
  const [corte, setCorte] = useState('municipal');
  const ind = catalogo.indicadorPorId.get(idIndicador || filtros.indicador) ?? conDato[0];

  const matriz = useMemo(() => {
    if (!ind) return null;
    const mediciones = medicionesFiltradas(catalogo, filtros, { ids: new Set([ind.id]) });
    const periodos = [...new Map(mediciones.map((m) => [m.id_periodo, m.periodo])).values()].sort((a, b) => String(a.fecha_inicio).localeCompare(String(b.fecha_inicio)));
    if (corte === 'estatal') {
      const serie = serieDe(ind.id, mediciones);
      return { periodos, filas: [{ unidad: filtros.municipio ? catalogo.unidades.get(filtros.municipio)?.nom_mun : 'Estado de Campeche (promedio municipal)', valores: new Map(serie.map((p) => [p.periodo.id, p.valor])) }] };
    }
    const porUnidad = new Map();
    for (const m of mediciones) {
      const clave = corte === 'municipal' ? m.id_municipio : m.id_unidad;
      if (corte === 'municipal' && String(m.id_unidad).length !== 5) continue;
      if (corte === 'localidad' && String(m.id_unidad).length === 5) continue;
      if (!porUnidad.has(clave)) porUnidad.set(clave, new Map());
      porUnidad.get(clave).set(m.id_periodo, Number(m.valor));
    }
    const nombre = (id) => {
      const u = catalogo.unidades.get(id);
      return u?.nivel === 'localidad' ? `${u.nom_loc} (${u.nom_mun})` : u?.nom_mun ?? id;
    };
    return { periodos, filas: [...porUnidad].map(([id, valores]) => ({ unidad: nombre(id), valores })).sort((a, b) => a.unidad.localeCompare(b.unidad, 'es')) };
  }, [ind, catalogo, filtros, corte]);

  if (!conDato.length) return <EstadoCarga estado="vacio" titulo="Sin series publicadas" mensaje="Aún no hay mediciones en estado vigente_publico para construir series históricas." />;

  const exportar = () => {
    const filas = matriz.filas.map((f) => ({ unidad: f.unidad, ...Object.fromEntries(matriz.periodos.map((p) => [p.etiqueta, f.valores.get(p.id) ?? ''])) }));
    descargar(`sesim_serie_${ind.id}_${corte}_${sufijoFecha()}.csv`, aCsv(filas, ['unidad', ...matriz.periodos.map((p) => p.etiqueta)]), 'text/csv;charset=utf-8');
  };

  return (
    <div className="consulta">
      <div className="consulta__controles">
        <div className="filtro">
          <label htmlFor={ids.ind}>Indicador</label>
          <select id={ids.ind} value={ind.id} onChange={(e) => setIdIndicador(e.target.value)}>
            {conDato.map((i) => <option key={i.id} value={i.id}>{i.id} · {i.nombre}</option>)}
          </select>
        </div>
        <div className="filtro">
          <label htmlFor={ids.corte}>Corte territorial</label>
          <select id={ids.corte} value={corte} onChange={(e) => setCorte(e.target.value)}>
            <option value="estatal">Estatal (agregado)</option>
            <option value="municipal">Por municipio</option>
            <option value="localidad">Por localidad</option>
          </select>
        </div>
        <button type="button" className="ab-btn" onClick={exportar} disabled={!matriz.filas.length}>
          <Download size={16} aria-hidden="true" /> Exportar serie (CSV)
        </button>
      </div>

      {matriz.filas.length === 0 ? (
        <EstadoCarga estado="vacio" mensaje="No hay mediciones para este indicador con el corte y los filtros elegidos." compacto />
      ) : (
        <div className="vista-tabular__scroll" tabIndex={0} role="region" aria-label={`Serie histórica de ${ind.nombre}`}>
          <table className="tabla-tablero">
            <caption className="sr-only">Serie histórica de {ind.nombre} por {corte}</caption>
            <thead>
              <tr>
                <th scope="col"><span className="th-txt">Unidad territorial</span></th>
                {matriz.periodos.map((p) => <th key={p.id} scope="col" className="num"><span className="th-txt">{p.etiqueta}</span></th>)}
              </tr>
            </thead>
            <tbody>
              {matriz.filas.map((f) => (
                <tr key={f.unidad}>
                  <th scope="row">{f.unidad}</th>
                  {matriz.periodos.map((p) => <td key={p.id} className="num">{f.valores.has(p.id) ? fmtNumero(f.valores.get(p.id)) : '—'}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
