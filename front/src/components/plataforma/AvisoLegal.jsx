import { useId } from 'react';
import { Scale } from 'lucide-react';
import { AVISOS } from '../../lib/avisosLegales';
import './AvisoLegal.css';

/** Aviso legal reutilizable. `compacto` para paneles y fichas; `discreto` para pies de página. */
export default function AvisoLegal({ tipo = 'general', compacto = false, discreto = false }) {
  const aviso = AVISOS[tipo] ?? AVISOS.general;
  const id = useId();
  return (
    <aside className={`aviso-legal${compacto ? ' aviso-legal--compacto' : ''}${discreto ? ' aviso-legal--discreto' : ''}`} aria-labelledby={id}>
      {!discreto && <Scale size={compacto ? 14 : 16} aria-hidden="true" />}
      <p>
        <strong id={id}>{aviso.titulo}.</strong> {aviso.texto}
      </p>
    </aside>
  );
}
