import { Fragment, useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, History, Search, Layers, FileText, ChartColumn, Globe2, Lock, FilePlus2, Send, ShieldCheck, CornerUpLeft, Trash2,
  RefreshCw, PencilLine, Link2, Check, Quote, ArrowRight, Route, Loader2,
} from 'lucide-react';
import { useSesion } from '../../lib/sesim/sesion';
import { fechaCorta } from '../perfiles/comun/formato';
import { cargarTrazabilidad, estadoDe, recorridoDe, vinculosDe, ESTACIONES } from './datos';
import '../perfiles/capturista/MiHistorial.css';
import '../perfiles/administradora/BitacoraAdmin.css';
import './Trazabilidad.css';

/**
 * Trazabilidad (solo Auditor y Administrador Titular): la vida de UN elemento, de principio a fin.
 * La Bitácora cuenta todo lo que pasa en el sistema, día por día; aquí se elige una capa, un instrumento o un
 * indicador y se ve su recorrido (subió → revisión → rechazo → reenvío → validada → pública…) y a qué está vinculado.
 * Todo viene del servidor; nada se guarda aquí. Solo consulta.
 */
const TIPOS = [
  { id: 'capa', titulo: 'Capas', uno: 'Capa', Icono: Layers },
  { id: 'instrumento', titulo: 'Instrumentos', uno: 'Instrumento', Icono: FileText },
  { id: 'indicador', titulo: 'Indicadores', uno: 'Indicador', Icono: ChartColumn },
];
const ICONO_PASO = {
  nuevo: FilePlus2, envio: Send, aprobacion: ShieldCheck, publicacion: Globe2, devuelta: CornerUpLeft, despublicacion: Lock, baja: Trash2,
  propuesta: RefreshCw, actualizada: ShieldCheck, edicion: PencilLine, vinculo: Link2, desvinculo: Link2, desaprobado: CornerUpLeft, reactivado: Check,
};
const DIA = 864e5;
const dias = (a, b) => Math.max(0, Math.round((new Date(b) - new Date(a)) / DIA));
const textoDias = (n) => (n === 0 ? 'el mismo día' : n === 1 ? '1 día después' : `${n} días después`);

function Estado({ e }) {
  if (!e) return null;
  return <span className={`trz-estado ${e.publico ? 'trz-estado--pub' : 'trz-estado--int'}`}>{e.publico ? <Globe2 size={12} aria-hidden="true" /> : <Lock size={12} aria-hidden="true" />} {e.publico ? 'Público' : 'Uso interno'} · {e.etiqueta}</span>;
}

function Estaciones({ tipo, estado }) {
  const lista = ESTACIONES[tipo];
  return (
    <ol className="trz-estaciones" aria-label="Dónde va hoy">
      {lista.map((nombre, i) => {
        const hecha = i < estado.estacion; const actual = i === estado.estacion;
        return (
          <li key={nombre} className={`trz-est${hecha ? ' trz-est--hecha' : ''}${actual ? ' trz-est--actual' : ''}`} aria-current={actual ? 'step' : undefined}>
            <span className="trz-est__punto">{hecha ? <Check size={15} aria-hidden="true" /> : i + 1}</span>
            <span className="trz-est__nombre">{nombre}</span>
            {actual && <span className="trz-est__aqui">Está aquí</span>}
          </li>
        );
      })}
    </ol>
  );
}

function Recorrido({ pasos, verMenores }) {
  const lista = pasos.filter((p) => verMenores || !p.menor);
  if (!lista.length) return <p className="trz-vacio">Aún no hay movimientos registrados para este elemento.</p>;
  return (
    <div className="trz-riel" role="list" aria-label="Recorrido">
      {lista.map((p, i) => {
        const Icono = ICONO_PASO[p.clave] ?? PencilLine;
        const antes = lista[i - 1];
        return (
          <Fragment key={p.id}>
            {antes && <span className="trz-lazo" aria-hidden="true">{textoDias(dias(antes.cuando, p.cuando))}<i /></span>}
            <article role="listitem" className={`trz-paso trz-paso--${p.tono}${p.retorno ? ' trz-paso--retorno' : ''}${p.menor ? ' trz-paso--menor' : ''}`}>
              <span className="trz-paso__ico"><Icono size={p.menor ? 14 : 18} aria-hidden="true" /></span>
              <h4>{p.titulo}</h4>
              {p.detalle && <p className="trz-paso__det">{p.detalle}</p>}
              <p className="trz-paso__meta">{fechaCorta(p.cuando)}<br />{p.quien.nombre}{p.quien.rol ? ` · ${p.quien.rol}` : ''}</p>
              {p.nota && <blockquote><Quote size={12} aria-hidden="true" /> <span><b>{p.notaDe}:</b> {p.nota}</span></blockquote>}
              {p.retorno && <span className="trz-paso__vuelta"><CornerUpLeft size={12} aria-hidden="true" /> Regresa a quien lo envió</span>}
            </article>
          </Fragment>
        );
      })}
    </div>
  );
}

function Columna({ titulo, Icono, items, tipo, actual, onIr, vacio }) {
  return (
    <section className="trz-col" aria-label={titulo}>
      <h4><Icono size={15} aria-hidden="true" /> {titulo} <span>{items.length}</span></h4>
      {items.length === 0 && <p className="trz-vacio trz-vacio--chico">{vacio}</p>}
      {items.map((x) => {
        const es = actual === x.id;
        return (
          <button type="button" key={x.id} className={`trz-nodo${es ? ' trz-nodo--actual' : ''}`} disabled={es} onClick={() => onIr(tipo, x.id)}>
            <strong>{x.clave ?? x.id}</strong>
            <span>{x.titulo}</span>
            {x.ejes?.length > 0 && <small>Eje: {x.ejes.join(', ')}</small>}
            <Estado e={x.estado} />
            {!es && <ArrowRight size={14} className="trz-nodo__ir" aria-hidden="true" />}
          </button>
        );
      })}
    </section>
  );
}

export default function Trazabilidad() {
  const sesion = useSesion();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [verMenores, setVerMenores] = useState(true);
  const tipo = TIPOS.some((t) => t.id === params.get('tipo')) ? params.get('tipo') : 'capa';
  const id = params.get('id');

  useEffect(() => {
    let vivo = true;
    cargarTrazabilidad().then((r) => { if (vivo) setD(r); }).catch((e) => { if (vivo) setError(e.message); });
    return () => { vivo = false; };
  }, []);

  const elementos = useMemo(() => {
    if (!d) return [];
    const fuente = tipo === 'capa' ? d.capas : tipo === 'instrumento' ? d.instrumentos : d.indicadores;
    const t = q.trim().toLowerCase();
    return fuente
      .map((e) => ({ id: e.id, clave: tipo === 'instrumento' ? e.clave : null, titulo: tipo === 'capa' ? e.titulo : e.nombre, estado: estadoDe(tipo, e) }))
      .filter((e) => !t || `${e.id} ${e.clave ?? ''} ${e.titulo}`.toLowerCase().includes(t))
      .sort((a, b) => String(a.id).localeCompare(String(b.id), 'es', { numeric: true }));
  }, [d, tipo, q]);

  const elegido = useMemo(() => (d && id ? elementos.find((e) => e.id === id) ?? null : null), [d, id, elementos]);
  const crudo = useMemo(() => {
    if (!d || !id) return null;
    return (tipo === 'capa' ? d.capas : tipo === 'instrumento' ? d.instrumentos : d.indicadores).find((e) => e.id === id) ?? null;
  }, [d, tipo, id]);
  const pasos = useMemo(() => (d && id ? recorridoDe(tipo, id, d) : []), [d, tipo, id]);
  const vinculos = useMemo(() => (d && id ? vinculosDe(tipo, id, d) : null), [d, tipo, id]);

  if (!sesion) return <Navigate to="/admin" replace />;
  if (!['auditor', 'administrador_titular'].includes(sesion.perfil)) return <Navigate to="/bitacora" replace />;

  const ir = (t, i) => setParams({ tipo: t, id: i });
  const cambiarTipo = (t) => { setQ(''); setParams({ tipo: t }); };
  const estado = crudo ? estadoDe(tipo, crudo) : null;
  const principales = pasos.filter((p) => !p.menor);
  const primero = principales[0]?.cuando ?? pasos[0]?.cuando;
  const ultimo = pasos[pasos.length - 1]?.cuando;
  const devoluciones = pasos.filter((p) => p.clave === 'devuelta' || p.clave === 'desaprobado').length;
  const meta = TIPOS.find((t) => t.id === tipo);

  return (
    <div className="mh mh--verde trz">
      <header className="mh-cab">
        <button type="button" className="mh-volver" onClick={() => navigate('/admin-visor')}><ArrowLeft size={16} /> Regresar al mapa</button>
        <div className="mh-tit">
          <h2><Route size={22} aria-hidden="true" /> Trazabilidad</h2>
          <p>La vida de una capa, un instrumento o un indicador: quién lo subió, quién lo revisó, qué se devolvió y a qué está vinculado.</p>
        </div>
        <button type="button" className="mh-volver" onClick={() => navigate('/bitacora')}><History size={16} /> Ver la bitácora</button>
      </header>

      <div className="trz-cuerpo">
        <aside className="trz-lado" aria-label="Elegir elemento">
          <div className="trz-seg" role="tablist" aria-label="Qué trazar">
            {TIPOS.map((t) => (
              <button key={t.id} type="button" role="tab" aria-selected={tipo === t.id} className={tipo === t.id ? 'trz-seg--act' : ''} onClick={() => cambiarTipo(t.id)}>
                <t.Icono size={15} aria-hidden="true" /> {t.titulo}
              </button>
            ))}
          </div>
          <label className="mh-buscar"><Search size={16} aria-hidden="true" /><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Buscar ${meta.titulo.toLowerCase()}…`} aria-label="Buscar" /></label>
          <ul className="trz-lista">
            {!d && !error && <li className="trz-vacio"><Loader2 size={14} className="gira" aria-hidden="true" /> Cargando…</li>}
            {d && elementos.length === 0 && <li className="trz-vacio">Nada coincide.</li>}
            {elementos.map((e) => (
              <li key={e.id}>
                <button type="button" className={`trz-item${e.id === id ? ' trz-item--act' : ''}`} onClick={() => ir(tipo, e.id)} aria-current={e.id === id ? 'true' : undefined}>
                  <strong>{e.clave ?? e.id}</strong>
                  <span>{e.titulo}</span>
                  <em className={e.estado.publico ? 'trz-pill trz-pill--pub' : 'trz-pill'}>{e.estado.publico ? 'Público' : 'Uso interno'} · {e.estado.etiqueta}</em>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <main className="trz-main">
          {error && <div className="aviso aviso-error" role="alert">No se pudo leer del servidor: {error}</div>}
          {d?.fallas?.length > 0 && <div className="aviso aviso-error" role="alert">Parte de los datos no se pudo leer: {d.fallas.join('; ')}.</div>}

          {!elegido && d && (
            <div className="trz-inicio">
              <Route size={34} aria-hidden="true" />
              <h3>Elige un elemento para ver su recorrido</h3>
              <p>Toma una capa, un instrumento o un indicador de la lista. Verás en qué punto va, cada paso que ha dado (con quién y cuándo), lo que se le devolvió y con qué está vinculado.</p>
            </div>
          )}

          {elegido && estado && (
            <>
              <section className="trz-carta trz-ficha">
                <p className="trz-rotulo">{meta.uno}</p>
                <h3><code>{tipo === 'instrumento' ? (crudo.clave || id) : id}</code> {elegido.titulo}</h3>
                <Estado e={estado} />
                <dl className="trz-kpis">
                  <div><dt>Días desde que se subió</dt><dd>{primero ? dias(primero, new Date().toISOString()) : '—'}</dd></div>
                  <div><dt>Devoluciones</dt><dd>{devoluciones}</dd></div>
                  <div><dt>Pasos registrados</dt><dd>{principales.length}</dd></div>
                  <div><dt>Última actividad</dt><dd className="trz-kpis__fecha">{ultimo ? new Date(ultimo).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</dd></div>
                </dl>
              </section>

              <section className="trz-carta">
                <h4 className="trz-tit">Dónde va hoy</h4>
                <Estaciones tipo={tipo} estado={estado} />
                {estado.baja && <p className="aviso aviso-alerta">Este elemento está dado de baja.</p>}
              </section>

              <section className="trz-carta">
                <div className="trz-tit-fila">
                  <h4 className="trz-tit">Recorrido</h4>
                  <label className="trz-check"><input type="checkbox" checked={verMenores} onChange={(e) => setVerMenores(e.target.checked)} /> Mostrar ediciones y vínculos</label>
                </div>
                <Recorrido pasos={pasos} verMenores={verMenores} />
              </section>

              <section className="trz-carta">
                <h4 className="trz-tit">Vinculado a</h4>
                <p className="trz-ayuda">Así se conecta con el resto del sistema: del instrumento de donde nace, al indicador que lo mide, a la capa que lo muestra. Toca un elemento para ver su trazabilidad.</p>
                <div className="trz-cols">
                  <Columna titulo="Instrumentos" Icono={FileText} items={vinculos.instrumentos} tipo="instrumento" actual={tipo === 'instrumento' ? id : null} onIr={ir} vacio="Sin instrumento vinculado." />
                  <span className="trz-flecha" aria-hidden="true"><ArrowRight size={20} /></span>
                  <Columna titulo="Indicadores" Icono={ChartColumn} items={vinculos.indicadores} tipo="indicador" actual={tipo === 'indicador' ? id : null} onIr={ir} vacio="Sin indicador vinculado." />
                  <span className="trz-flecha" aria-hidden="true"><ArrowRight size={20} /></span>
                  <Columna titulo="Capas" Icono={Layers} items={vinculos.capas} tipo="capa" actual={tipo === 'capa' ? id : null} onIr={ir} vacio="Sin capa vinculada." />
                </div>
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
