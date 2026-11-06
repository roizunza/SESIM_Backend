import { useEffect, useMemo, useState } from 'react';
import { recursoOpcional } from '../../lib/sesim/api';
import EstadoCarga, { Esqueleto } from '../plataforma/EstadoCarga';
import { fmtNumero } from '../tablero/formato';

/**
 * Cartera de proyectos (metas, avance físico, cumplimiento y responsables). El modelo v2.2
 * no incluye la tabla: se lee del recurso configurado en VITE_SESIM_RECURSO_PROYECTOS
 * con las columnas documentadas en docs/FRONT_MODULOS_PUBLICOS.md.
 */
export default function CarteraProyectos({ municipio, nombreMunicipio }) {
  const [estado, setEstado] = useState({ datos: null, error: null, codigo: null });

  useEffect(() => {
    let vivo = true;
    recursoOpcional('proyectos', 'select=*&order=id')
      .then((datos) => vivo && setEstado({ datos, error: null, codigo: null }))
      .catch((e) => vivo && setEstado({ datos: null, error: e.message, codigo: e.codigo ?? null }));
    return () => {
      vivo = false;
    };
  }, []);

  const filas = useMemo(() => (estado.datos ?? []).filter((p) => !municipio || String(p.id_unidad ?? '').startsWith(municipio)), [estado.datos, municipio]);

  if (estado.codigo === 'sin_servicio') {
    return (
      <EstadoCarga
        estado="vacio"
        titulo="La cartera de proyectos aún no está publicada"
        mensaje="El modelo de datos vigente (v2.2) no incluye proyectos. En cuanto el backend publique la vista acordada, esta sección mostrará metas, avance físico, cumplimiento y responsables sin cambios en la interfaz."
      />
    );
  }
  if (estado.error) return <EstadoCarga estado="error" titulo="No se pudo leer la cartera de proyectos" mensaje={estado.error} accion={{ etiqueta: 'Reintentar', onClick: () => window.location.reload() }} />;
  if (!estado.datos) return <Esqueleto alto={260} etiqueta="Cargando cartera de proyectos" />;
  if (!filas.length) return <EstadoCarga estado="vacio" mensaje={`No hay proyectos registrados para ${nombreMunicipio}.`} />;

  const avances = filas.map((p) => Number(p.avance_fisico)).filter((v) => !Number.isNaN(v));
  const concluidos = filas.filter((p) => Number(p.avance_fisico) >= 100).length;

  return (
    <div className="cartera">
      <div className="cartera__resumen">
        <div><strong>{fmtNumero(filas.length)}</strong><span>proyectos en cartera</span></div>
        <div><strong>{avances.length ? `${fmtNumero(avances.reduce((a, b) => a + b, 0) / avances.length)} %` : '—'}</strong><span>avance físico promedio</span></div>
        <div><strong>{fmtNumero(concluidos)}</strong><span>concluidos ({filas.length ? fmtNumero((concluidos / filas.length) * 100) : 0} % de cumplimiento)</span></div>
      </div>
      <div className="vista-tabular__scroll" tabIndex={0} role="region" aria-label="Cartera de proyectos">
        <table className="tabla-tablero">
          <caption className="sr-only">Cartera de proyectos de {nombreMunicipio}</caption>
          <thead>
            <tr><th scope="col">Proyecto</th><th scope="col">Responsable</th><th scope="col">Meta</th><th scope="col">Avance físico</th><th scope="col">Estatus</th><th scope="col">Periodo</th></tr>
          </thead>
          <tbody>
            {filas.map((p) => {
              const avance = Math.max(0, Math.min(100, Number(p.avance_fisico) || 0));
              return (
                <tr key={p.id}>
                  <td><strong>{p.nombre}</strong>{p.id_instrumento && <><br /><small>{p.id_instrumento}</small></>}</td>
                  <td>{p.responsable ?? '—'}</td>
                  <td>{p.meta ?? '—'}</td>
                  <td>
                    <div className="scorecard__barra" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={avance} aria-label={`Avance físico de ${p.nombre}`}>
                      <i style={{ width: `${avance}%`, background: 'var(--c-verde)' }} />
                    </div>
                    <small>{fmtNumero(p.avance_fisico)} %</small>
                  </td>
                  <td>{p.estatus ?? '—'}</td>
                  <td>{[p.fecha_inicio, p.fecha_fin].filter(Boolean).join(' – ') || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
