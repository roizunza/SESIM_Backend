import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useEsMovil } from '../../lib/sesim/usePanelLateral';
import './RecorridoGeovisor.css';

/**
 * Recorrido del geovisor: bienvenida + pasos con foco (spotlight) sobre cada zona real de la pantalla.
 *
 * Cada paso trae `sel` (selector CSS de lo que se resalta; con `selMovil` en pantallas angostas), `titulo`, `texto`
 * y `items` opcionales [{ marca, texto }]. Si el elemento no existe o no está a la vista el paso se omite, así que
 * funciona con el panel abierto o cerrado y con cualquier perfil. Sin `sel` el paso no resalta nada (p. ej. los gestos del mapa).
 *
 * La bienvenida (paso 0) muestra `cifras` [{ valor, etiqueta }] si se pasan; «Omitir» y Esc cierran en cualquier momento.
 */
const MARGEN = 8;

function rectDe(selector) {
  if (!selector) return null;
  const nodos = [...document.querySelectorAll(selector)].filter((n) => {
    const r = n.getBoundingClientRect();
    return r.width > 4 && r.height > 4 && r.bottom > 0 && r.right > 0 && r.top < window.innerHeight && r.left < window.innerWidth;
  });
  if (!nodos.length) return null;
  const rs = nodos.map((n) => n.getBoundingClientRect());
  const top = Math.min(...rs.map((r) => r.top)); const left = Math.min(...rs.map((r) => r.left));
  const right = Math.max(...rs.map((r) => r.right)); const bottom = Math.max(...rs.map((r) => r.bottom));
  return { top: Math.max(0, top), left: Math.max(0, left), width: Math.min(window.innerWidth, right) - Math.max(0, left), height: Math.min(window.innerHeight, bottom) - Math.max(0, top) };
}

export function recorridoVisto(clave) {
  try { return window.localStorage.getItem(clave) === '1'; } catch { return false; }
}
export function marcarRecorrido(clave) {
  try { window.localStorage.setItem(clave, '1'); } catch { /* sin almacenamiento: se mostrará de nuevo, sin consecuencias */ }
}

export default function RecorridoGeovisor({ abierto, onCerrar, pasos, cifras = [], titulo = 'Recorrido del geovisor', nota = '' }) {
  const esMovil = useEsMovil();
  const [indice, setIndice] = useState(-1); // -1 = bienvenida
  const [rect, setRect] = useState(null);
  const [vigentes, setVigentes] = useState(pasos);
  const tarjeta = useRef(null);
  const [alto, setAlto] = useState(260);

  // Pasos cuyo elemento está a la vista ahora.
  const calcular = useCallback(() => {
    const ok = pasos.filter((p) => !(p.sel || p.selMovil) || rectDe(esMovil ? (p.selMovil ?? p.sel) : p.sel));
    setVigentes((prev) => (prev.length === ok.length && prev.every((p, i) => p === ok[i]) ? prev : ok));
  }, [pasos, esMovil]);

  useEffect(() => { if (abierto) setIndice(-1); }, [abierto]);
  useLayoutEffect(() => {
    if (!abierto) return undefined;
    calcular();
    const t = setInterval(calcular, 500);
    window.addEventListener('resize', calcular);
    return () => { clearInterval(t); window.removeEventListener('resize', calcular); };
  }, [abierto, calcular]);

  const paso = indice >= 0 ? vigentes[indice] : null;
  const total = vigentes.length;

  // Posición del foco: se mide al cambiar de paso y mientras la pantalla se acomoda.
  useLayoutEffect(() => {
    if (!abierto) return undefined;
    const medir = () => setRect(paso ? rectDe(esMovil ? (paso.selMovil ?? paso.sel) : paso.sel) : null);
    medir();
    const t = setInterval(medir, 300);
    window.addEventListener('resize', medir);
    return () => { clearInterval(t); window.removeEventListener('resize', medir); };
  }, [abierto, paso, esMovil]);

  useLayoutEffect(() => { if (tarjeta.current) setAlto(tarjeta.current.offsetHeight); });
  useEffect(() => { if (abierto) tarjeta.current?.focus(); }, [abierto, indice]);

  const siguiente = useCallback(() => (indice + 1 >= total ? onCerrar() : setIndice(indice + 1)), [indice, total, onCerrar]);
  const anterior = useCallback(() => setIndice((i) => Math.max(-1, i - 1)), []);
  useEffect(() => {
    if (!abierto) return undefined;
    const tecla = (e) => {
      if (e.key === 'Escape') onCerrar();
      else if (e.key === 'ArrowRight') siguiente();
      else if (e.key === 'ArrowLeft') anterior();
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [abierto, onCerrar, siguiente, anterior]);

  const estiloTarjeta = useMemo(() => {
    const W = Math.min(360, window.innerWidth - 24);
    if (esMovil || !paso) return undefined;
    if (!rect) return { left: Math.max(12, window.innerWidth / 2 - W / 2), top: Math.max(80, window.innerHeight - alto - 70), width: W };
    const libreDer = window.innerWidth - (rect.left + rect.width);
    const grande = rect.width > window.innerWidth * 0.5;
    let left = libreDer > W + 36 ? rect.left + rect.width + 20 : rect.left - W - 20;
    if (grande || left < 12) left = Math.min(Math.max(12, rect.left + 24), window.innerWidth - W - 12);
    const top = Math.min(Math.max(76, rect.top + (grande ? 24 : 0)), window.innerHeight - alto - 16);
    return { left, top, width: W };
  }, [esMovil, paso, rect, alto]);

  if (!abierto) return null;
  const cierre = (e) => { e?.stopPropagation(); onCerrar(); };

  return createPortal(
    <div className="recorrido" role="dialog" aria-modal="true" aria-label={titulo}>
      {!paso && <div className="recorrido__velo" onClick={cierre} />}
      {paso && !rect && <div className="recorrido__velo recorrido__velo--suave" onClick={cierre} />}
      {paso && rect && (
        <div className="recorrido__foco" onClick={cierre} style={{ top: rect.top - MARGEN, left: rect.left - MARGEN, width: rect.width + MARGEN * 2, height: rect.height + MARGEN * 2 }} aria-hidden="true" />
      )}

      {!paso ? (
        <div className="recorrido__tarjeta recorrido__tarjeta--bienvenida" ref={tarjeta} tabIndex={-1}>
          <span className="recorrido__etq">Geovisor SESIM</span>
          <h2>Explora el territorio capa por capa</h2>
          <p>Enciende capas de diagnóstico y estrategias, filtra por municipio y consulta la ficha de cada una. Te mostramos cómo en {total} pasos de menos de un minuto.</p>
          {cifras.length > 0 && (
            <ul className="recorrido__cifras">{cifras.map((c) => <li key={c.etiqueta}><b>{c.valor}</b><span>{c.etiqueta}</span></li>)}</ul>
          )}
          <div className="recorrido__pie">
            <button type="button" className="recorrido__omitir" onClick={cierre}>Omitir y explorar</button>
            <button type="button" className="recorrido__boton" onClick={() => setIndice(0)}>Empezar recorrido →</button>
          </div>
          <p className="recorrido__nota">Siempre podrás volver con el botón <b>?</b> del mapa.{nota ? ` ${nota}` : ''}</p>
        </div>
      ) : (
        <div className={`recorrido__tarjeta${esMovil ? ' recorrido__tarjeta--hoja' : ''}`} style={estiloTarjeta} ref={tarjeta} tabIndex={-1}>
          <div className="recorrido__progreso" aria-hidden="true"><i style={{ width: `${((indice + 1) / total) * 100}%` }} /></div>
          <span className="recorrido__etq" aria-live="polite">Paso {indice + 1} de {total}</span>
          <h2>{paso.titulo}</h2>
          <p>{paso.texto}</p>
          {paso.items?.length > 0 && (
            <ul className="recorrido__items">{paso.items.map((it) => <li key={it.texto}><b aria-hidden="true">{it.marca}</b><span>{it.texto}</span></li>)}</ul>
          )}
          <div className="recorrido__pie">
            <div className="recorrido__puntos" aria-hidden="true">{vigentes.map((p, i) => <i key={p.id} className={i === indice ? 'on' : i < indice ? 'ok' : ''} />)}</div>
            <div className="recorrido__nav">
              <button type="button" className="recorrido__sec" onClick={anterior}>{esMovil ? 'Atrás' : 'Anterior'}</button>
              <button type="button" className="recorrido__boton" onClick={siguiente}>{indice + 1 >= total ? 'Terminar ✓' : 'Siguiente'}</button>
            </div>
          </div>
          <p className="recorrido__teclas">{esMovil ? '' : <><kbd>←</kbd><kbd>→</kbd> navegar · <kbd>Esc</kbd> salir · </>}<button type="button" className="recorrido__omitir" onClick={cierre}>{esMovil ? 'Omitir recorrido' : 'Omitir'}</button></p>
        </div>
      )}
    </div>,
    document.body,
  );
}
