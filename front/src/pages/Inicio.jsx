import React, { useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  FileSpreadsheet,
  MapPin,
  Activity,
  Bus,
  ShieldCheck,
  TrendingUp,
  Bike,
  ShieldAlert,
  Users,
  ChevronDown,
} from 'lucide-react';
import { EJES_ESTRATEGICOS } from '../lib/ejesEstrategicos';
import { useCatalogo } from '../lib/sesim/useCatalogo';
import { useRevelar, prefiereMenosMovimiento } from '../lib/useRevelar';
import StreetLinesBackground from '../components/plataforma/StreetLinesBackground';
import Contador from '../components/plataforma/Contador';
import './Inicio.css';

// Resuelve la clave de texto `icono` de cada Eje (ver ejesEstrategicos.js,
// que no importa React) contra los componentes reales de lucide-react.
const EJE_ICONOS = { TrendingUp, Bus, Bike, ShieldAlert, Users };

const NIVELES_MIR = ['Fin', 'Propósito', 'Componentes', 'Actividades'];

/*
 * Página de inicio con animaciones al desplazarse:
 *  · barra de progreso de lectura y desvanecimiento del título (parallax);
 *  · cada bloque con `data-revelar` aparece al entrar en pantalla (useRevelar);
 *  · cifras del catálogo que cuentan hasta su valor real (indicador, capa,
 *    instrumento_origen, unidad_territorial);
 *  · número de capas publicadas por Estrategia y distribución de los
 *    indicadores por nivel MIR, leídos del catálogo (no escritos a mano).
 */
const Inicio = () => {
  const pagina = useRef(null);
  const hero = useRef(null);
  const barra = useRef(null);
  const { datos } = useCatalogo(['indicador', 'capa', 'instrumento_origen', 'unidad_territorial']);

  const cifras = useMemo(() => {
    if (!datos) return null;
    const publicas = datos.capa.filter((c) => c.estatus === 'vigente_publico');
    const capasPorEje = {};
    for (const c of publicas) {
      for (const g of c.grupos_lista ?? []) {
        const m = /Eje\s*(\d)/.exec(g.grupo || '');
        if (m) capasPorEje[m[1]] = (capasPorEje[m[1]] ?? 0) + 1;
      }
    }
    const porMir = Object.fromEntries(NIVELES_MIR.map((n) => [n, datos.indicador.filter((i) => String(i.nivel_mir).startsWith(n)).length]));
    return {
      indicadores: datos.indicador.length,
      capas: publicas.length,
      instrumentos: datos.instrumento_origen.length,
      municipios: datos.unidad_territorial.filter((u) => u.nivel === 'municipio').length,
      capasPorEje,
      porMir,
      maxMir: Math.max(...Object.values(porMir), 1),
    };
  }, [datos]);

  // Revelado al desplazarse (se vuelve a enlazar cuando llegan las cifras).
  useRevelar(pagina, [cifras]);

  // Barra de progreso + parallax del título, en un solo requestAnimationFrame.
  useEffect(() => {
    if (prefiereMenosMovimiento()) return undefined;
    let raf = null;
    const actualizar = () => {
      raf = null;
      const y = window.scrollY;
      const total = document.documentElement.scrollHeight - window.innerHeight;
      if (barra.current) barra.current.style.transform = `scaleX(${total > 0 ? Math.min(1, y / total) : 0})`;
      if (hero.current) {
        const p = Math.min(1, y / 700);
        hero.current.style.setProperty('--hero-y', `${y * 0.35}px`);
        hero.current.style.setProperty('--hero-o', String(1 - p * 0.9));
      }
    };
    const alDesplazar = () => {
      if (raf === null) raf = requestAnimationFrame(actualizar);
    };
    window.addEventListener('scroll', alDesplazar, { passive: true });
    actualizar();
    return () => {
      window.removeEventListener('scroll', alDesplazar);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const retardo = (i, paso = 110) => ({ '--retardo': `${i * paso}ms` });

  return (
    <div className="inicio-page" ref={pagina}>
      <div className="progreso-lectura" ref={barra} aria-hidden="true" />

      <div className="hero-section" ref={hero}>
        <StreetLinesBackground />
        <div className="hero-content">
          <h1 className="hero-titulo-animado">Sistema Estatal de Seguimiento a Indicadores de Movilidad y Seguridad Vial</h1>
          <p className="hero-subtitle hero-subtitulo-animado">
            SESIM del Estado de Campeche
          </p>
          <a href="#introduccion" className="hero-bajar" aria-label="Ir a la introducción">
            <ChevronDown size={26} />
          </a>
        </div>
      </div>

      <div className="intro-section no-container" id="introduccion" data-revelar="zoom">
        <h2 data-revelar>Introducción</h2>
        <div className="intro-content">
          <p data-revelar style={retardo(1)}>
            El SESIM es un mecanismo que vincula información normativa, estratégica y estadística para operar en tres niveles: estatal, municipal y por instrumento de planeación.
          </p>
          <p data-revelar style={retardo(2)}>
            Contribuye a consolidar un modelo de gestión pública eficiente, orientado al cumplimiento de los objetivos en materia de movilidad y seguridad vial, así como de los Planes Integrales de Movilidad Urbana Sustentable (PIMUS) municipales.
          </p>
        </div>
        <div className="cifras-fila">
          {[
            ['Indicadores', cifras?.indicadores],
            ['Capas publicadas', cifras?.capas],
            ['Instrumentos de planeación', cifras?.instrumentos],
            ['Municipios', cifras?.municipios],
          ].map(([etiqueta, valor], i) => (
            <div key={etiqueta} className="cifra" data-revelar style={retardo(i + 3)}>
              <Contador valor={valor ?? null} className="cifra-numero" />
              <span className="cifra-etiqueta">{etiqueta}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="objectives-section">
        <h2 data-revelar>Objetivos del Sistema</h2>
        <div className="objectives-grid">
          {[
            [Bus, 'Organizar, homologar y territorializar indicadores derivados de la legislación aplicable, la ENAMOV y estrategias estatales.'],
            [Activity, 'Visualizar el comportamiento de los indicadores, su estatus de cumplimiento y sus patrones territoriales para la toma de decisiones.'],
            [ShieldCheck, 'Preservar la trazabilidad de origen, asociando cada indicador con su instrumento normativo, metas y medios de verificación.'],
          ].map(([Icono, texto], i) => (
            <div key={i} className="objective-card" data-revelar style={retardo(i, 160)}>
              <span className="objective-numero">0{i + 1}</span>
              <Icono size={28} className="objective-icon" />
              <p>{texto}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="ejes-ee-section">
        <h2 data-revelar>Estrategias EEMSV</h2>
        <p className="ejes-ee-subtitle" data-revelar style={retardo(1)}>
          Evaluación transversal del desempeño institucional en materia de movilidad.
        </p>
        <div className="ejes-ee-grid">
          {EJES_ESTRATEGICOS.map((eje, i) => {
            const Icono = EJE_ICONOS[eje.icono];
            const n = cifras?.capasPorEje?.[eje.numero];
            return (
              <Link
                key={eje.id}
                to={`/geovisor?estrategia=${eje.id}`}
                className="eje-ee-card"
                data-revelar
                style={{ ...retardo(i, 120), '--eje-color': eje.color }}
                title={`Ver ${eje.label} en el Geovisualizador`}
              >
                <span className="eje-ee-acento" aria-hidden="true" />
                <Icono size={28} className="eje-ee-icon" />
                <h4>{eje.tituloCorto}</h4>
                <p>{eje.descripcionCorta}</p>
                {n !== undefined && <span className="eje-ee-capas"><Contador valor={n} duracion={900} /> capas en el mapa</span>}
              </Link>
            );
          })}
        </div>
      </div>

      <div className="methodology-section">
        <h2 data-revelar>Clasificación de Indicadores</h2>
        <div className="methodology-intro" data-revelar style={retardo(1)}>
          <p>
            El modelo conceptual estructura el catálogo maestro en dos vertientes principales de evaluación institucional.
          </p>
        </div>

        <div className="methodology-sub">
          <div className="methodology-cards">
            <div className="methodology-card" data-revelar="izquierda">
              <span className="card-badge"><Contador valor={34} duracion={1000} /> Indicadores</span>
              <h4>Sectoriales</h4>
              <p>
                Monitorean y evalúan los resultados de las dependencias que integran el Sistema Estatal de Movilidad y Seguridad Vial. Sectores de medición:
              </p>
              <ul className="methodology-lista">
                {['Gobierno y Administración.', 'Ambiente, Cambio Climático y Gestión Integral de Riesgos.', 'Observatorios Ciudadanos.', 'Inclusión y Género.'].map((t, i) => (
                  <li key={t} data-revelar style={retardo(i + 2, 90)}>{t}</li>
                ))}
              </ul>
            </div>

            <div className="methodology-card" data-revelar="derecha">
              <span className="card-badge"><Contador valor={39} duracion={1000} /> Indicadores</span>
              <h4>Desempeño</h4>
              <p>
                Permiten medir los logros obtenidos conforme a los objetivos planteados al final de la ejecución de la EEMSV. Horizontes de planeación:
              </p>
              <ul className="methodology-lista">
                {['Inmediato y Corto plazo.', 'Mediano plazo.', 'Largo plazo.'].map((t, i) => (
                  <li key={t} data-revelar style={retardo(i + 2, 90)}>{t}</li>
                ))}
              </ul>
            </div>
          </div>

          {cifras && (
            <div className="mir-bloque" data-revelar>
              <h3>Catálogo por nivel de la Matriz de Indicadores para Resultados</h3>
              <p className="methodology-sub-desc">{cifras.indicadores} indicadores del catálogo, según su nivel MIR.</p>
              <div className="mir-barras">
                {NIVELES_MIR.map((nivel, i) => (
                  <div key={nivel} className="mir-fila" style={retardo(i, 150)}>
                    <span className="mir-etiqueta">{nivel}</span>
                    <span className="mir-pista">
                      <span className="mir-relleno" style={{ '--ancho': `${(100 * cifras.porMir[nivel]) / cifras.maxMir}%`, ...retardo(i, 150) }} />
                    </span>
                    <Contador valor={cifras.porMir[nivel]} duracion={1100} className="mir-valor" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="modules-section">
        <h2 data-revelar>Módulos del Sistema</h2>
        <div className="module-cards">
          <div className="module-card" data-revelar="izquierda">
            <MapPin size={32} className="card-icon" />
            <h3>Geovisualizador SIG</h3>
            <p>Explora métricas globales y visualiza capas territoriales en el mapa interactivo.</p>
            <Link to="/geovisor" className="card-link">
              Ir al Geovisualizador <ArrowRight size={16} />
            </Link>
          </div>

          <div className="module-card" data-revelar="derecha" style={retardo(1, 150)}>
            <FileSpreadsheet size={32} className="card-icon" />
            <h3>Monitoreo de Indicadores</h3>
            <p>Consulta el estatus de cumplimiento y la trazabilidad normativa del Estado.</p>
            <Link to="/monitoreo" className="card-link">
              Ir al Monitoreo <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Inicio;
