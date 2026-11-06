import React, { useEffect, useMemo, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { FileSpreadsheet, Gauge, Layers, MapPin } from 'lucide-react';
import { useCatalogo } from '../lib/sesim/useCatalogo';
import { useRevelar, prefiereMenosMovimiento } from '../lib/useRevelar';
import StreetLinesBackground from '../components/plataforma/StreetLinesBackground';
import Contador from '../components/plataforma/Contador';
import SeccionVision from '../components/inicio/SeccionVision';
import SeccionMarcoJuridico from '../components/inicio/SeccionMarcoJuridico';
import SeccionEstrategias from '../components/inicio/SeccionEstrategias';
import IndiceSecciones from '../components/inicio/IndiceSecciones';
import Capitulo from '../components/inicio/Capitulo';
import FlechasPantallas from '../components/inicio/FlechasPantallas';
import { SECCIONES_INICIO } from '../lib/rutas';
import './Inicio.css';

const OBJETIVOS = [
  { numero: '01', tono: 'guinda', titulo: 'Organizar y territorializar', texto: 'Organizar, homologar y territorializar indicadores derivados de la legislación aplicable, la ENAMOV y estrategias estatales.' },
  { numero: '02', tono: 'marfil', titulo: 'Visualizar para decidir', texto: 'Visualizar el comportamiento de los indicadores, su estatus de cumplimiento y sus patrones territoriales para la toma de decisiones.' },
  { numero: '03', tono: 'verde', titulo: 'Preservar la trazabilidad', texto: 'Preservar la trazabilidad de origen, asociando cada indicador con su instrumento normativo, metas y medios de verificación.' },
];

const SECCIONES = [
  { id: 'introduccion', titulo: 'Introducción' },
  { id: SECCIONES_INICIO.vision, titulo: 'Visión' },
  { id: SECCIONES_INICIO.marco, titulo: 'Marco jurídico' },
  { id: 'estrategias', titulo: 'Estrategias e indicadores' },
];

/*
 * Página de inicio con animaciones al desplazarse:
 *  · barra de progreso de lectura y desvanecimiento del título (parallax);
 *  · cada bloque con `data-revelar` aparece al entrar en pantalla (useRevelar);
 *  · cifras del catálogo que cuentan hasta su valor real (indicador, capa,
 *    instrumento_origen, unidad_territorial);
 *  · «Estrategias y sus indicadores» (SeccionEstrategias): indicadores por Estrategia y por
 *    nivel MIR, leídos del catálogo.
 */
const Inicio = () => {
  const pagina = useRef(null);
  const hero = useRef(null);
  const barra = useRef(null);
  const { hash } = useLocation();
  const { datos } = useCatalogo(['indicador', 'capa', 'instrumento_origen', 'unidad_territorial']);

  const cifras = useMemo(() => {
    if (!datos) return null;
    const publicas = datos.capa.filter((c) => c.estatus === 'vigente_publico');
    return {
      indicadores: datos.indicador.length,
      capas: publicas.length,
      instrumentos: datos.instrumento_origen.length,
      municipios: datos.unidad_territorial.filter((u) => u.nivel === 'municipio').length,
    };
  }, [datos]);

  // Revelado al desplazarse (se vuelve a enlazar cuando llegan las cifras).
  useRevelar(pagina, [cifras]);

  // La página se lee como una historia por capítulos (Capitulo.jsx): ajuste suave al inicio de cada uno.
  useEffect(() => {
    document.documentElement.classList.add('inicio-historia');
    return () => document.documentElement.classList.remove('inicio-historia');
  }, []);

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

  // Enlaces con ancla (/#marco-juridico): se lleva a la sección y se corrige mientras las
  // secciones de arriba terminan de cargar sus datos, salvo que la persona ya se haya desplazado.
  useEffect(() => {
    if (!hash) return undefined;
    let tocado = false;
    const marcar = () => { tocado = true; };
    const ir = () => {
      const nodo = document.getElementById(hash.slice(1));
      if (!tocado) (nodo?.closest('.capitulo') ?? nodo)?.scrollIntoView({ block: 'start' });
    };
    const tiempos = [120, 700, 1500, 2600].map((ms) => setTimeout(ir, ms));
    window.addEventListener('wheel', marcar, { passive: true });
    window.addEventListener('touchmove', marcar, { passive: true });
    window.addEventListener('keydown', marcar);
    return () => {
      tiempos.forEach(clearTimeout);
      window.removeEventListener('wheel', marcar);
      window.removeEventListener('touchmove', marcar);
      window.removeEventListener('keydown', marcar);
    };
  }, [hash]);

  const retardo = (i, paso = 110) => ({ '--retardo': `${i * paso}ms` });

  return (
    <div className="inicio-page" ref={pagina}>
      <div className="progreso-lectura" ref={barra} aria-hidden="true" />

      <IndiceSecciones secciones={SECCIONES} etiqueta="Secciones de Inicio" />
      <FlechasPantallas />

      <section className="portada" id="introduccion" ref={hero} aria-labelledby="portada-titulo">
        <div className="portada__claro">
          <div className="portada__marco portada__arriba">
            <div className="portada__texto">
              <h1 id="portada-titulo" className="hero-titulo-animado" aria-label="Sistema Estatal de Seguimiento a Indicadores de Movilidad y Seguridad Vial">
                <span className="portada__linea" aria-hidden="true">
                  Sistema Estatal
                </span>
                <span className="portada__linea" aria-hidden="true">de Seguimiento a Indicadores</span>
                <span className="portada__linea" aria-hidden="true">de Movilidad y Seguridad Vial</span>
              </h1>
              <p className="portada__sr">SESIM del Estado de Campeche</p>
              <div className="portada__intro" data-revelar style={retardo(1)}>
                <p>
                  El SESIM es un mecanismo que vincula información normativa, estratégica y estadística para operar en tres niveles: estatal, municipal y por instrumento de planeación.
                </p>
                <p>
                  Contribuye a consolidar un modelo de gestión pública eficiente, orientado al cumplimiento de los objetivos en materia de movilidad y seguridad vial, así como de los Planes Integrales de Movilidad Urbana Sustentable (PIMUS) municipales.
                </p>
              </div>
            </div>

            <div className="portada__mapa" aria-hidden="true">
              <StreetLinesBackground factorZoom={1.12} colorBase={[122, 84, 98]} colorPulso={[159, 34, 65]} alphaBase={0.34} grosor={1.25} />
            </div>

            <div className="portada__kpis" aria-label="Cifras del sistema">
              <span className="portada__pastilla portada__pastilla--cifras">SESIM del Estado de Campeche</span>
              {[
                [Gauge, 'Indicadores', cifras?.indicadores, false],
                [Layers, 'Capas publicadas', cifras?.capas, true],
                [FileSpreadsheet, 'Instrumentos de planeación', cifras?.instrumentos, true],
                [MapPin, 'Municipios', cifras?.municipios, false],
              ].map(([Icono, etiqueta, valor, provisional], i) => (
                <div key={etiqueta} className="kpi" data-revelar style={retardo(i + 2, 120)}>
                  <Icono size={18} className="kpi__icono" aria-hidden="true" />
                  <Contador valor={valor ?? null} className="kpi__numero" />
                  <span className="kpi__etiqueta">{etiqueta}{provisional && <span aria-label="cifra provisional">*</span>}</span>
                </div>
              ))}
              <p className="portada__nota-cifras">* Cifra provisional; se actualizará al conectar con la fuente única.</p>
            </div>
          </div>
        </div>

        <div className="portada__banda">
          <div className="portada__marco">
            <h2 className="portada__banda-titulo">Objetivos</h2>
            <div className="objetivos">
              {OBJETIVOS.map((o, i) => (
                <article key={o.numero} className="objetivo" data-revelar style={retardo(i + 1, 140)} tabIndex={0}>
                  <div className="objetivo__cab">
                    <span className="objetivo__numero">{o.numero}</span>
                    <h3 className="objetivo__titulo">{o.titulo}</h3>
                  </div>
                  <p className="objetivo__texto">{o.texto}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <Capitulo titulo="Visión" tono="tinta" pantalla>
<SeccionVision id={SECCIONES_INICIO.vision} />

      </Capitulo>

      <Capitulo titulo="Marco jurídico" tono="tinta" pantalla>
<SeccionMarcoJuridico id={SECCIONES_INICIO.marco} />

      </Capitulo>

      <Capitulo titulo="Estrategias e indicadores" tono="tinta" pantalla>
<SeccionEstrategias id="estrategias" />

      </Capitulo>
    </div>
  );
};

export default Inicio;
