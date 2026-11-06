import { useId } from 'react';
import { useFiltros, filtrosActivos } from '../../lib/sesim/filtrosGlobales';
import { useEsMovil } from '../../lib/sesim/usePanelLateral';

function Selector({ etiqueta, valor, onCambio, opciones, todos = 'Todos', deshabilitado, ayuda }) {
  const id = useId();
  const idAyuda = `${id}-ayuda`;
  return (
    <div className="filtro">
      <label htmlFor={id}>{etiqueta}</label>
      <select id={id} value={valor} onChange={(e) => onCambio(e.target.value)} disabled={deshabilitado} aria-describedby={ayuda ? idAyuda : undefined}>
        <option value="">{todos}</option>
        {opciones.map((o) => (
          <option key={o.valor} value={o.valor}>{o.texto}</option>
        ))}
      </select>
      {ayuda && <small id={idAyuda}>{ayuda}</small>}
    </div>
  );
}

/**
 * Filtros globales (fecha, municipio, tipo de usuario y jerarquía vial). Escribe directo
 * en el estado compartido; el mapa, las tarjetas, las gráficas y la tabla leen de ahí.
 */
export default function BarraFiltros({ catalogo }) {
  const { filtros, fijar, comparar } = useFiltros();
  const movil = useEsMovil();
  const periodos = catalogo.periodosConDato.map((p) => ({ valor: String(p.id), texto: p.etiqueta }));
  const municipios = catalogo.municipios.map((m) => ({ valor: m.id, texto: m.nom_mun }));
  const usuarios = catalogo.tiposUsuario.map((n) => ({ valor: n.id, texto: n.nombre }));
  const viales = catalogo.jerarquiasViales.map((v) => ({ valor: v, texto: v }));
  const sinPeriodos = periodos.length === 0;

  return (
    <section className="barra-filtros" aria-label="Filtros del tablero">
      <details className="barra-filtros__plegable" open={!movil}>
        <summary>Filtros{filtrosActivos(filtros) ? ` · ${filtrosActivos(filtros)} activos` : ''}</summary>
      <div className="barra-filtros__fila">
        <Selector etiqueta="Periodo desde" valor={filtros.periodoDesde} onCambio={(v) => fijar('periodoDesde', v)} opciones={periodos} todos="Primer periodo" deshabilitado={sinPeriodos} />
        <Selector etiqueta="Periodo hasta" valor={filtros.periodoHasta} onCambio={(v) => fijar('periodoHasta', v)} opciones={periodos} todos="Último periodo" deshabilitado={sinPeriodos} />
        <Selector etiqueta="Municipio" valor={filtros.municipio} onCambio={(v) => fijar('municipio', v)} opciones={municipios} todos="Todo el estado" />
        <Selector
          etiqueta="Tipo de usuario"
          valor={filtros.tipoUsuario}
          onCambio={(v) => fijar('tipoUsuario', v)}
          opciones={usuarios}
          todos="Todos los usuarios"
          deshabilitado={!usuarios.length}
          ayuda={usuarios.length ? undefined : 'Disponible cuando las mediciones publicadas se desagreguen por tipo de usuario.'}
        />
        <Selector
          etiqueta="Jerarquía vial"
          valor={filtros.jerarquiaVial}
          onCambio={(v) => fijar('jerarquiaVial', v)}
          opciones={viales}
          todos="Todas las vías"
          deshabilitado={!viales.length}
          ayuda={viales.length ? undefined : 'Disponible cuando las mediciones publicadas se desagreguen por jerarquía vial.'}
        />
      </div>
      </details>

      {filtros.comparar.activo && (
        <div className="barra-filtros__fila barra-filtros__comparar" role="group" aria-label="Corte de comparación">
          <fieldset className="filtro filtro--modo">
            <legend>Comparar contra</legend>
            {[
              ['periodo', 'Otro rango de periodos'],
              ['municipio', 'Otro municipio'],
            ].map(([v, t]) => (
              <label key={v}>
                <input type="radio" name="modo-comparar" value={v} checked={filtros.comparar.modo === v} onChange={() => comparar({ modo: v })} /> {t}
              </label>
            ))}
          </fieldset>
          {filtros.comparar.modo === 'periodo' ? (
            <>
              <Selector etiqueta="Comparar desde" valor={filtros.comparar.periodoDesde} onCambio={(v) => comparar({ periodoDesde: v })} opciones={periodos} todos="Primer periodo" deshabilitado={sinPeriodos} />
              <Selector etiqueta="Comparar hasta" valor={filtros.comparar.periodoHasta} onCambio={(v) => comparar({ periodoHasta: v })} opciones={periodos} todos="Último periodo" deshabilitado={sinPeriodos} />
            </>
          ) : (
            <Selector etiqueta="Municipio a comparar" valor={filtros.comparar.municipio} onCambio={(v) => comparar({ municipio: v })} opciones={municipios} todos="Todo el estado" />
          )}
        </div>
      )}
    </section>
  );
}
