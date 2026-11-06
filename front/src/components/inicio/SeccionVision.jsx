import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, Leaf, Users } from 'lucide-react';
import { useContenido } from '../../lib/sesim/useCatalogo';
import { enlace } from '../../lib/rutas';
import JerarquiaMovilidad from '../contexto/JerarquiaMovilidad';
import EstadoCarga, { Esqueleto } from '../plataforma/EstadoCarga';
import './SeccionVision.css';

const PILARES = [
  { icono: ShieldCheck, titulo: 'Visión Cero', texto: 'Ninguna muerte ni lesión grave en el tránsito es aceptable. El sistema vigila siniestros, velocidades y entornos de riesgo para corregirlos antes de que cobren vidas.' },
  { icono: Leaf, titulo: 'Movilidad sustentable', texto: 'Priorizar caminar, la bicicleta y el transporte público reduce emisiones, tiempos de traslado y costos para las familias de Campeche.' },
  { icono: Users, titulo: 'Jerarquía de la movilidad', texto: 'La Ley General de Movilidad y Seguridad Vial ordena a quién se protege primero al diseñar calles y políticas: de las personas peatonas a los vehículos particulares.' },
];

/** Los tres principios como diagrama: tres círculos dentro de una pastilla; el elegido se abre y muestra su texto completo. */
function Principios() {
  const [activo, setActivo] = useState(0);
  return (
    <div className="ejes" role="group" aria-label="Principios de la visión">
      {PILARES.map(({ icono: Icono, titulo, texto }, k) => (
        <button
          key={titulo}
          type="button"
          className={`eje${k === activo ? ' eje--activo' : ''}`}
          aria-expanded={k === activo}
          onClick={() => setActivo(k)}
          onMouseEnter={() => setActivo(k)}
          onFocus={() => setActivo(k)}
        >
          <span className="eje__icono" aria-hidden="true"><Icono size={20} /></span>
          <span className="eje__cuerpo">
            <span className="eje__titulo">{titulo}</span>
            <span className="eje__texto">{texto}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

/** Sección «Visión» de Inicio, en una sola pantalla: etiqueta y título · sinopsis y principios · jerarquía de la movilidad. */
export default function SeccionVision({ id }) {
  const jerarquia = useContenido('jerarquia_movilidad');
  const d = jerarquia.datos;

  return (
    <section id={id} className="seccion-inicio vision" aria-labelledby={`${id}-titulo`}>
      <div className="vision__fila vision__fila--titulo" data-revelar>
        <span className="vision__etiqueta">Visión</span>
        <h2 id={`${id}-titulo`} className="vision__titulo">Moverse seguro es un derecho; medirlo es cómo lo garantizamos</h2>
      </div>

      <div className="vision__fila vision__fila--ejes" data-revelar style={{ '--retardo': '120ms' }}>
        <p className="vision__sinopsis">El SESIM da seguimiento a la aplicación territorial de la política estatal de movilidad y seguridad vial: vincula compromisos normativos, objetivos de planeación y resultados observables en cada municipio.</p>
        <Principios />
      </div>

      <div className="vision__jerarquia" data-revelar style={{ '--retardo': '240ms' }}>
        {jerarquia.error && <EstadoCarga estado="error" titulo="No se pudo cargar la jerarquía de la movilidad" mensaje={jerarquia.error} compacto />}
        {!jerarquia.error && !d && <Esqueleto alto={320} etiqueta="Cargando jerarquía de la movilidad" />}
        {d && (
          <JerarquiaMovilidad
            niveles={d.niveles}
            introduccion={d.introduccion ?? 'Orden de prioridad en el uso y disposición de las vías.'}
            fundamento={d.fundamento}
            concordancia={d.concordancia}
            nota={(
              <p className="jer__nota">
                Texto tomado de la <a href={d.fuente_texto} target="_blank" rel="noopener noreferrer">publicación oficial en el Diario Oficial de la Federación<span className="sr-only"> (se abre en una pestaña nueva)</span></a>. Consulte la <Link to={enlace.fichaInstrumento(d.id_instrumento_fundamento)}>ficha del instrumento</Link>.{d.nota_texto ? ` ${d.nota_texto}` : ''}
              </p>
            )}
          />
        )}
      </div>
    </section>
  );
}
