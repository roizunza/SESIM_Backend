import { useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { HelpCircle } from 'lucide-react';
import RecorridoGeovisor, { recorridoVisto, marcarRecorrido } from '../geovisor/RecorridoGeovisor';

const TEXTOS = {
  instrumentos: { titulo: 'Catálogo de instrumentos', sinopsis: 'Consulte las leyes, reglamentos, programas, planes y normas técnicas que sustentan la movilidad y la seguridad vial en el Estado de Campeche y sus municipios.' },
  consulta: { titulo: 'Fuentes de información', sinopsis: 'Consulte las fuentes estadísticas y geoespaciales oficiales que alimentan los indicadores y las capas del SESIM, con su uso, cobertura y limitaciones.' },
};

/*
 * Guía de Normativa: el mismo recorrido con foco que el geovisor (RecorridoGeovisor), con pasos propios por vista.
 * Cada `sel` es una zona real de la pantalla; si no está a la vista el paso se omite (por eso un solo arreglo sirve a las dos vistas).
 */
const CLAVE_GUIA = 'sesim.normativa.recorrido.v1';
const PASOS = {
  instrumentos: [
    { id: 'vistas', sel: '.catalogo__vistas', selMovil: '.catalogo__vistas', titulo: 'Dos vistas', texto: 'Normativa reúne lo que rige y lo que alimenta al SESIM. Cambia de una a otra con las pestañas.', items: [
      { marca: '1', texto: 'Instrumentos normativos: leyes, reglamentos, programas, planes y normas técnicas.' }, { marca: '2', texto: 'Consulta oficial: las fuentes estadísticas y geoespaciales de donde salen los datos.' }] },
    { id: 'escalas', sel: '.catalogo__escalas', selMovil: '.catalogo__escalas', titulo: 'Instrumentos por escala', texto: 'Los tres contadores muestran cuántos instrumentos hay en el ámbito federal, estatal y municipal con los filtros que llevas.' },
    { id: 'busqueda', sel: '.catalogo__busqueda', selMovil: '.catalogo__busqueda', titulo: 'Búsqueda y municipio', texto: 'Escribe parte de la denominación o la clave (por ejemplo «PMDU» o «DOC-E008»). Con el selector de municipio ves los instrumentos que le aplican. Abajo verás cuántos resultados hay y los filtros activos.' },
    { id: 'parametros', sel: '.catalogo__facetas', selMovil: '.catalogo__filtros-btn', titulo: 'Parámetros de búsqueda', texto: 'Cada grupo se despliega para marcar una o varias opciones; los resultados se ajustan al instante y «Limpiar» los restablece.', items: [
      { marca: '☑', texto: 'Escala, tipo de instrumento, medio de publicación y año de publicación.' }, { marca: '↗', texto: 'Los filtros quedan en la dirección de la página: puedes copiarla y compartirla.' }] },
    { id: 'lista', sel: '.catalogo__lista', selMovil: '.catalogo__lista', titulo: 'Resultados', texto: 'Cada renglón lleva una franja de color según su escala. Desplázate dentro de la caja para recorrer todos.', items: [
      { marca: '📄', texto: '«Documentación en PDF» abre el documento oficial en otra pestaña.' }, { marca: '›', texto: '«Ver ficha técnica» muestra la sinopsis, la fuente oficial y los instrumentos relacionados.' }] },
  ],
  consulta: [
    { id: 'vistas', sel: '.catalogo__vistas', selMovil: '.catalogo__vistas', titulo: 'Consulta oficial', texto: 'Esta vista reúne las fuentes oficiales que alimentan los indicadores y las capas del SESIM. Para volver al catálogo normativo usa la otra pestaña.' },
    { id: 'tipos', sel: '.catalogo__escalas', selMovil: '.catalogo__escalas', titulo: 'Tipo de información', texto: 'Los contadores separan las fuentes estadísticas de las geoespaciales y respetan la búsqueda y los filtros activos.' },
    { id: 'busqueda', sel: '.catalogo__busqueda', selMovil: '.catalogo__busqueda', titulo: 'Búsqueda', texto: 'Escribe parte del nombre, la clave o el uso (por ejemplo «ATUS» o «DAT-F001»).' },
    { id: 'parametros', sel: '.catalogo__facetas', selMovil: '.catalogo__filtros-btn', titulo: 'Parámetros de búsqueda', texto: 'Marca el tipo de información para acotar la lista. «Limpiar» restablece los filtros, que también quedan en la dirección de la página.' },
    { id: 'lista', sel: '.catalogo__lista', selMovil: '.catalogo__lista', titulo: 'Fuentes y botones «Consultar»', texto: 'Cada fuente indica para qué se usa en el SESIM, su cobertura y sus limitaciones. Los botones abren el sitio oficial en otra pestaña.', items: [
      { marca: '↗', texto: '«Consultar en el sitio oficial» cuando la fuente tiene una sola liga.' }, { marca: '↗↗', texto: 'Cuando tiene varias, cada botón dice qué abre: por ejemplo «Consultar metadatos» o «Consultar programa».' }] },
  ],
};

export const VISTAS = [
  { id: 'instrumentos', titulo: 'Instrumentos normativos' },
  { id: 'consulta', titulo: 'Consulta oficial' },
];

/** Encabezado común del catálogo: título, selector de vista (pestañas) y, a la derecha, los contadores de la vista activa. */
export default function CabeceraCatalogo({ vista, children }) {
  const [, setParams] = useSearchParams();
  const botones = useRef({});
  const [guia, setGuia] = useState(() => !recorridoVisto(CLAVE_GUIA));
  const cerrarGuia = () => { marcarRecorrido(CLAVE_GUIA); setGuia(false); };
  const ir = (id) => setParams(id === 'instrumentos' ? {} : { vista: id });
  const alTeclear = (e) => {
    const k = VISTAS.findIndex((v) => v.id === vista);
    const destino = e.key === 'ArrowRight' ? (k + 1) % VISTAS.length : e.key === 'ArrowLeft' ? (k - 1 + VISTAS.length) % VISTAS.length : null;
    if (destino === null) return;
    e.preventDefault();
    ir(VISTAS[destino].id);
    botones.current[VISTAS[destino].id]?.focus();
  };
  return (
    <header className="catalogo__cabecera">
      <div className="catalogo__titulos">
        <span className="catalogo__etq">Normativa</span>
        <h1>{TEXTOS[vista].titulo}</h1>
        <p>{TEXTOS[vista].sinopsis}</p>
        <div className="catalogo__vistas-fila">
        <div className="catalogo__vistas" role="tablist" aria-label="Vista del catálogo" onKeyDown={alTeclear}>
          {VISTAS.map((v) => (
            <button
              key={v.id}
              ref={(n) => { botones.current[v.id] = n; }}
              type="button"
              role="tab"
              id={`catalogo-tab-${v.id}`}
              aria-selected={vista === v.id}
              aria-controls="catalogo-panel"
              tabIndex={vista === v.id ? 0 : -1}
              onClick={() => ir(v.id)}
            >
              {v.titulo}
            </button>
          ))}
        </div>
        <button type="button" className="catalogo__guia" onClick={() => setGuia(true)} aria-label="Abrir la guía de uso de Normativa" title="Guía de uso" data-guia="boton">
          <HelpCircle size={18} aria-hidden="true" /> Guía
        </button>
        </div>
      </div>
      {children}
      <RecorridoGeovisor
        abierto={guia}
        onCerrar={cerrarGuia}
        pasos={PASOS[vista]}
        titulo="Guía de Normativa"
        etiqueta="Normativa SESIM"
        encabezado={vista === 'instrumentos' ? 'Encuentra el marco que rige la movilidad' : 'Conoce de dónde salen los datos'}
        intro={vista === 'instrumentos'
          ? 'Busca leyes, reglamentos, programas y normas técnicas, filtra por escala y abre su documento oficial. Te mostramos cómo en menos de un minuto.'
          : 'Consulta las fuentes estadísticas y geoespaciales oficiales del SESIM y abre su sitio oficial. Te mostramos cómo en menos de un minuto.'}
        recordatorio={<>Siempre podrás volver con el botón <b>Guía</b> de esta página.</>}
      />
    </header>
  );
}
