import React from 'react';
import { PencilLine, ShieldCheck, Eye } from 'lucide-react';
import { PERFILES } from '../../lib/sesim/sesion';

/**
 * Franja de contexto bajo el encabezado de las rutas internas: dice quién es
 * la persona, hasta dónde llega (ámbito), en qué tramo del flujo de una
 * medición actúa y qué acciones tiene a la mano. Refleja la matriz de
 * permisos (Tabla 3) para que la interfaz sea congruente con el perfil; la
 * autorización real sigue siendo de RLS y de las funciones del backend.
 */
const ETAPAS = [
  { clave: 'borrador', nombre: 'Borrador', duenos: ['capturista'] },
  { clave: 'revision', nombre: 'Revisión', duenos: ['administrador', 'administrador_titular'] },
  { clave: 'vigente_admin', nombre: 'Vigente interno', duenos: ['administrador', 'administrador_titular'] },
  { clave: 'vigente_publico', nombre: 'Público', duenos: ['administrador', 'administrador_titular'] },
];

const FICHA = {
  capturista: { icono: PencilLine, acciones: ['Capturar medición', 'Subir evidencia', 'Enviar a revisión'], alcance: 'Ves solo tus mediciones' },
  administrador: { icono: ShieldCheck, acciones: ['Validar', 'Rechazar con comentario', 'Publicar', 'Gestionar capas'], alcance: 'Ves todas las mediciones' },
  administrador_titular: { icono: ShieldCheck, acciones: ['Validar y publicar', 'Instrumentos y umbrales', 'Invitar y dar de baja'], alcance: 'Control total del catálogo' },
  auditor: { icono: Eye, acciones: ['Verificar evidencia (SHA-256)', 'Registrar hallazgos'], alcance: 'Solo lectura' },
};

const RolBar = ({ sesion }) => {
  const perfil = sesion?.perfil;
  const ficha = FICHA[perfil];
  if (!ficha) return null;
  const Icono = ficha.icono;
  const ambito = sesion.id_unidad ? `Municipal · ${sesion.id_unidad}` : 'Estatal';

  return (
    <div className="rolbar" role="region" aria-label="Perfil y permisos">
      <span className="rolbar__badge"><Icono size={16} />{PERFILES[perfil]?.nombre}</span>
      <span className="rolbar__scope">{ambito}</span>
      {perfil === 'auditor' && <span className="rolbar__ro">Solo lectura</span>}
      <span className="rolbar__sep" />
      <ol className="rolbar__flujo" aria-label="Flujo de una medición">
        {ETAPAS.map((e) => (
          <li key={e.clave} className={e.duenos.includes(perfil) ? 'es-mio' : ''} title={e.duenos.includes(perfil) ? 'Tramo en el que actúas' : 'Tramo de otro perfil'}>
            {e.nombre}
          </li>
        ))}
      </ol>
      <span className="rolbar__sep" />
      <span className="rolbar__can">
        <span className="rolbar__k">Puedes</span>
        <b>{ficha.acciones.join(' · ')}</b>
      </span>
      <span className="rolbar__can" style={{ opacity: 0.8 }}>· {ficha.alcance}</span>
    </div>
  );
};

export default RolBar;
