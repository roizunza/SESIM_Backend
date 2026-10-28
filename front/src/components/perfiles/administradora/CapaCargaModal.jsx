import React, { useMemo, useState } from 'react';
import { X, UploadCloud, FileText, Database, ArrowLeft, ArrowRight, CheckCircle, AlertTriangle } from 'lucide-react';
import '../comun/Comun.css';

/**
 * Carga / actualización de una capa (MICRO · capa + capa_vector). Por la
 * Tabla 3 del documento, escribir en `capa` es atribución del
 * Administrador (antes estaba en el perfil Capturista).
 *
 *  1. Archivo GeoJSON (EPSG:4326) + ficha técnica PDF (+ estilo .qml opcional).
 *  2. Ficha de la capa con los campos de la tabla `capa`; el ID se propone
 *     con la regla de la sección 4 (prefijo de la nomenclatura + número de 2
 *     dígitos, siguiente libre).
 *  3. Validación real del archivo contra el diccionario de capa_vector
 *     (FeatureCollection, una sola familia de geometría, coordenadas
 *     geográficas, atributos nombre/clasif).
 *
 * Termina en `onVerificar({ capa, geojson })`: la capa se previsualiza en el
 * mapa como borrador. Con backend, «Registrar» hará el INSERT en core.capa
 * (estatus = borrador) y la carga de capa_vector por el servicio de procesos.
 */
const GEOM = { Point: 'Punto', MultiPoint: 'Punto', LineString: 'Línea', MultiLineString: 'Línea', Polygon: 'Polígono', MultiPolygon: 'Polígono' };

function validarGeojson(gj) {
  const r = [];
  const ok = (campo, esperado, detectado, bien) => r.push({ campo, esperado, detectado, bien });
  ok('type', 'FeatureCollection', gj?.type ?? '—', gj?.type === 'FeatureCollection');
  const feats = Array.isArray(gj?.features) ? gj.features : [];
  ok('n_elementos', '≥ 1', String(feats.length), feats.length > 0);
  const familias = new Set(feats.map((f) => GEOM[f?.geometry?.type]).filter(Boolean));
  ok('tipo_geometria', 'Una sola (Punto | Línea | Polígono)', Array.from(familias).join(', ') || '—', familias.size === 1);
  let fuera = 0;
  const revisar = (c) => {
    if (typeof c[0] === 'number') {
      if (Math.abs(c[0]) > 180 || Math.abs(c[1]) > 90) fuera++;
    } else c.forEach(revisar);
  };
  feats.slice(0, 2000).forEach((f) => f?.geometry?.coordinates && revisar(f.geometry.coordinates));
  ok('SRC', 'EPSG:4326 (grados)', fuera ? `${fuera} coordenadas fuera de rango (¿proyectado?)` : 'Grados geográficos', fuera === 0);
  const props = new Set(feats.slice(0, 500).flatMap((f) => Object.keys(f?.properties ?? {})));
  ok('nombre', 'Texto', props.has('nombre') ? 'presente' : 'ausente (se usará el título)', true);
  ok('clasif', 'Texto (clase de simbología)', props.has('clasif') ? 'presente' : 'ausente (clase única = título)', true);
  ok('cve_mun', 'Texto (3)', props.has('cve_mun') ? 'presente' : 'ausente (se asigna por intersección en el servidor)', true);
  return { filas: r, valido: r.every((x) => x.bien), familia: Array.from(familias)[0] ?? null, n: feats.length };
}

export default function CapaCargaModal({ isOpen, onClose, onVerificar, catalogo }) {
  const [paso, setPaso] = useState(1);
  const [archivo, setArchivo] = useState(null);
  const [geojson, setGeojson] = useState(null);
  const [documento, setDocumento] = useState(null);
  const [estilo, setEstilo] = useState(null);
  const [errorArchivo, setErrorArchivo] = useState('');
  const [ficha, setFicha] = useState({ nomenclatura: '', titulo: '', categoria: '', grupo: '', id_instrumento: '', conjunto_datos: '', responsable: '', periodicidad: '', restriccion_uso: 'pública', fecha_corte: '' });

  const nomenclaturas = useMemo(() => {
    const m = new Map();
    for (const c of catalogo?.capa ?? []) {
      const prefijo = c.id.replace(/\d+$/, '');
      const num = Number(c.id.match(/(\d+)$/)?.[1] ?? 0);
      const prev = m.get(c.nomenclatura) ?? { prefijo, max: 0, categoria: c.categoria, grupos: new Set() };
      prev.max = Math.max(prev.max, num);
      (c.grupos_lista ?? []).forEach((g) => g.grupo && prev.grupos.add(g.grupo));
      m.set(c.nomenclatura, prev);
    }
    return m;
  }, [catalogo]);

  if (!isOpen) return null;

  const nom = nomenclaturas.get(ficha.nomenclatura);
  const idPropuesto = nom ? `${nom.prefijo}${String(nom.max + 1).padStart(2, '0')}` : '—';
  const validacion = geojson ? validarGeojson(geojson) : null;

  const leerArchivo = async (f) => {
    setErrorArchivo('');
    setGeojson(null);
    if (!f) return;
    if (!/\.(geo)?json$/i.test(f.name)) {
      setArchivo(null);
      setErrorArchivo('Por ahora la carga desde el navegador acepta GeoJSON (.geojson / .json) en EPSG:4326. Shapefile y GeoPackage los convertirá el servicio de procesos.');
      return;
    }
    try {
      const gj = JSON.parse(await f.text());
      setArchivo(f);
      setGeojson(gj);
      if (!ficha.titulo) setFicha((x) => ({ ...x, titulo: gj.titulo ?? gj.name ?? f.name.replace(/\.(geo)?json$/i, '') }));
    } catch {
      setArchivo(null);
      setErrorArchivo('El archivo no es un JSON válido.');
    }
  };

  const set = (k) => (e) => setFicha((x) => ({ ...x, [k]: e.target.value }));
  const fichaCompleta = ficha.nomenclatura && ficha.titulo && ficha.responsable;

  const cerrar = () => {
    setPaso(1);
    setArchivo(null);
    setGeojson(null);
    setDocumento(null);
    setEstilo(null);
    onClose();
  };

  const verificar = () => {
    const capa = {
      id: idPropuesto,
      titulo: ficha.titulo,
      categoria: nom?.categoria ?? ficha.categoria,
      nomenclatura: ficha.nomenclatura,
      grupos_lista: ficha.grupo ? [{ grupo: ficha.grupo }] : [],
      tipo_geometria: validacion?.familia,
      geom: { Punto: 'point', Línea: 'line', Polígono: 'polygon' }[validacion?.familia] ?? 'polygon',
      estatus: 'borrador',
      id_instrumento: ficha.id_instrumento || null,
      responsable: ficha.responsable,
      conjunto_datos: ficha.conjunto_datos,
      n_elementos: validacion?.n ?? 0,
      archivo: archivo?.name,
      metadatos_extra: { periodicidad: ficha.periodicidad, restriccion_uso: ficha.restriccion_uso, fecha_corte: ficha.fecha_corte, documento: documento?.name, estilo_qml: estilo?.name },
    };
    onVerificar({ capa, geojson });
    cerrar();
  };

  return (
    <>
      <div className="modal-drawer-overlay" onClick={cerrar}></div>
      <div className="modal-drawer" style={{ width: 540 }}>
        <div className="modal-drawer-header">
          <div>
            <h3 style={{ margin: 0, color: 'var(--c-guinda)', fontFamily: 'var(--font-heading)' }}>Cargar o actualizar capa</h3>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Paso {paso} de 3 · catálogo `capa`</span>
          </div>
          <button className="btn-close-drawer" onClick={cerrar}><X size={20} /></button>
        </div>

        <div className="modal-drawer-content" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {paso === 1 && (
            <>
              <h4 style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--c-guinda-dk)' }}><UploadCloud size={18} /> 1. Archivos</h4>
              <div className="form-group">
                <label>A. Capa espacial (GeoJSON, EPSG:4326) <span style={{ color: '#EF4444' }}>*</span></label>
                <input type="file" accept=".geojson,.json" className="form-input" onChange={(e) => leerArchivo(e.target.files?.[0])} />
                {archivo && <small>{archivo.name} · {validacion?.n ?? 0} elementos</small>}
              </div>
              <div className="form-group">
                <label>B. Estilo QGIS (.qml, opcional)</label>
                <input type="file" accept=".qml" className="form-input" onChange={(e) => setEstilo(e.target.files?.[0] ?? null)} />
              </div>
              <div className="form-group">
                <label>C. Ficha técnica ISO 19115 (PDF) <span style={{ color: '#EF4444' }}>*</span></label>
                <input type="file" accept=".pdf" className="form-input" onChange={(e) => setDocumento(e.target.files?.[0] ?? null)} />
              </div>
              {errorArchivo && <div className="aviso aviso-error"><AlertTriangle size={14} style={{ verticalAlign: -2 }} /> {errorArchivo}</div>}
            </>
          )}

          {paso === 2 && (
            <>
              <h4 style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--c-guinda-dk)' }}><FileText size={18} /> 2. Ficha de la capa</h4>
              <div className="form-group" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label>Nomenclatura <span style={{ color: '#EF4444' }}>*</span></label>
                  <select className="form-input" value={ficha.nomenclatura} onChange={set('nomenclatura')}>
                    <option value="">Seleccione…</option>
                    {Array.from(nomenclaturas.keys()).sort().map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <div>
                  <label>ID propuesto (sección 4)</label>
                  <input className="form-input" value={idPropuesto} readOnly style={{ fontWeight: 700, color: 'var(--c-guinda)' }} />
                </div>
              </div>
              <div className="form-group">
                <label>Título <span style={{ color: '#EF4444' }}>*</span></label>
                <input className="form-input" value={ficha.titulo} onChange={set('titulo')} />
              </div>
              {nom && nom.grupos.size > 0 && (
                <div className="form-group">
                  <label>Grupo del visor</label>
                  <select className="form-input" value={ficha.grupo} onChange={set('grupo')}>
                    <option value="">Seleccione…</option>
                    {Array.from(nom.grupos).map((g) => <option key={g}>{g}</option>)}
                  </select>
                </div>
              )}
              <div className="form-group" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label>Instrumento de origen</label>
                  <select className="form-input" value={ficha.id_instrumento} onChange={set('id_instrumento')}>
                    <option value="">Ninguno (Mapa Base)</option>
                    {(catalogo?.instrumento_origen ?? []).map((i) => <option key={i.id} value={i.id}>{i.clave} ({i.id})</option>)}
                  </select>
                </div>
                <div>
                  <label>Responsable (custodio) <span style={{ color: '#EF4444' }}>*</span></label>
                  <input className="form-input" value={ficha.responsable} onChange={set('responsable')} placeholder="INEGI, SEDUMOP…" />
                </div>
              </div>
              <div className="form-group">
                <label>Conjunto de datos de origen</label>
                <input className="form-input" value={ficha.conjunto_datos} onChange={set('conjunto_datos')} placeholder="DENUE, Red Nacional de Caminos…" />
              </div>
              <div className="form-group" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <div>
                  <label>Periodicidad</label>
                  <select className="form-input" value={ficha.periodicidad} onChange={set('periodicidad')}>
                    <option value="">—</option>
                    {['Anual', 'Bienal', 'Quinquenal', 'Decenal', 'Irregular', 'No planeada'].map((p) => <option key={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label>Restricción de uso</label>
                  <select className="form-input" value={ficha.restriccion_uso} onChange={set('restriccion_uso')}>
                    <option value="pública">Pública</option>
                    <option value="interna">Interna</option>
                  </select>
                </div>
                <div>
                  <label>Fecha de corte</label>
                  <input type="date" className="form-input" value={ficha.fecha_corte} onChange={set('fecha_corte')} />
                </div>
              </div>
            </>
          )}

          {paso === 3 && validacion && (
            <>
              <h4 style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--c-guinda-dk)' }}><Database size={18} /> 3. Validación contra el diccionario</h4>
              <table className="tabla-sesim">
                <thead><tr><th>Campo</th><th>Esperado</th><th>Detectado</th><th></th></tr></thead>
                <tbody>
                  {validacion.filas.map((f) => (
                    <tr key={f.campo} style={{ background: f.bien ? undefined : '#FEF2F2' }}>
                      <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{f.campo}</td>
                      <td>{f.esperado}</td>
                      <td>{f.detectado}</td>
                      <td>{f.bien ? '✅' : '❌'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {validacion.valido
                ? <div className="aviso aviso-ok">La estructura es compatible. Se registrará como <strong>{idPropuesto}</strong> en estatus <strong>borrador</strong>.</div>
                : <div className="aviso aviso-error">Corrija el archivo y vuelva a cargarlo.</div>}
            </>
          )}
        </div>

        <div className="modal-drawer-footer">
          {paso > 1 ? <button className="btn-base btn-secondary" style={{ width: 'auto' }} onClick={() => setPaso(paso - 1)}><ArrowLeft size={16} /> Atrás</button> : <div />}
          {paso < 3 ? (
            <button className="btn-base btn-primary" style={{ width: 'auto' }} disabled={(paso === 1 && (!geojson || !documento)) || (paso === 2 && !fichaCompleta)} onClick={() => setPaso(paso + 1)}>
              Siguiente <ArrowRight size={16} />
            </button>
          ) : (
            <button className="btn-base btn-primary" style={{ width: 'auto', background: 'var(--status-aprobado)' }} disabled={!validacion?.valido} onClick={verificar}>
              <CheckCircle size={16} /> Ver en el mapa como borrador
            </button>
          )}
        </div>
      </div>
    </>
  );
}
