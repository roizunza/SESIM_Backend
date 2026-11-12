import { f } from '../../lib/sesim/tableroTextos';

/** Una fila: la pregunta en lenguaje llano, la cifra, qué tan distinta es del estado y los 13 municipios en una regla. */
function Fila({ m, T, M, municipios, municipio, ctxDe }) {
  const [clave, pregunta, u, d, mejor, tipo, frase] = m;
  const { VAL, ST } = M;
  const sel = municipios.find((x) => x.cve === municipio);
  const vs = municipios.map((x) => VAL[clave](x.cve));
  const mn = Math.min(...vs); const mx = Math.max(...vs); const span = mx - mn || 1;
  const pos = (v) => 5 + ((v - mn) / span) * 90;
  const est = ST[clave]();
  const val = sel ? VAL[clave](municipio) : est;
  const N = sel ? sel.nombre : 'el estado';
  let chip = null;
  if (sel) {
    if (tipo === 'pct') {
      const dif = val - est;
      if (Math.abs(dif) < 2 || mejor === 0) chip = { c: 'n', t: Math.abs(dif) < 2 ? 'Parecido al estado' : `${f(Math.abs(dif))} puntos ${dif > 0 ? 'más' : 'menos'} que el estado` };
      else { const bien = dif * mejor > 0; chip = { c: bien ? 'b' : 'm', t: `${bien ? 'Mejor' : 'Peor'} que el estado · ${f(Math.abs(dif))} puntos ${dif > 0 ? 'más' : 'menos'}` }; }
    } else if (tipo === 'prog') chip = { c: val >= 4 ? 'b' : 'n', t: val >= 4 ? 'Llegan todos' : `Faltan ${4 - val}` };
    else { const sh = est ? (val / est) * 100 : 0; chip = { c: 'n', t: val === 0 ? 'Ninguno aquí' : `Es el ${f(sh, sh < 10 ? 1 : 0)} % del total del estado` }; }
  } else chip = { c: 'n', t: `Entre municipios va de ${f(mn, d)} a ${f(mx, d)}${u === '%' ? ' %' : ''}` };
  const estTxt = tipo === 'prog' ? '4 de 4' : `${f(est, d)}${u === '%' ? ' %' : u ? ` ${u}` : ''}`;
  return (
    <div className="tv__cmp">
      <div className="tv__cmp-t">{pregunta}</div>
      <div className="tv__cmp-v"><b>{f(val, d)}<small>{u}</small></b><span className={`tv__chip tv__chip--${chip.c}`}>{chip.t}</span></div>
      <div className="tv__cmp-f">{frase(val, N, ctxDe(sel?.cve))}</div>
      <div className="tv__regla" role="img" aria-label={`Los 13 municipios van de ${f(mn, d)} a ${f(mx, d)}${u === '%' ? ' %' : ` ${u}`}`}>
        <i className="tv__eje-x" />
        {municipios.map((x) => <u key={x.cve} className={`tv__pt${x.cve === municipio ? ' sel' : ''}`} style={{ left: `${pos(VAL[clave](x.cve))}%` }} title={`${x.nombre}: ${f(VAL[clave](x.cve), d)}`} />)}
        {tipo !== 'cuenta' && <em className={`tv__est${pos(est) > 70 ? ' der' : ''}`} style={{ left: `${pos(est)}%` }}><span>Estado {estTxt}</span></em>}
        <span className="tv__lo">menos</span><span className="tv__hi">más</span>
      </div>
    </div>
  );
}

export default function ComparacionTerritorial({ metricas, M, T, municipios, municipio }) {
  const sel = municipios.find((x) => x.cve === municipio);
  const ctxDe = (cve) => ({
    loc: cve ? municipios.find((x) => x.cve === cve).loc : municipios.reduce((s, x) => s + x.loc, 0),
    fedKm: cve ? T[cve].fed : municipios.reduce((s, x) => s + T[x.cve].fed, 0),
  });
  return (
    <>
      <h2 className="tv__h2">{sel ? `${sel.nombre} frente al estado` : 'El estado y sus 13 municipios'}</h2>
      <p className="tv__how">Cada punto es un municipio. La marca verde es el valor de todo el estado (cuando se puede comparar).{sel ? ` El punto claro y grande es ${sel.nombre}.` : ''}</p>
      <div className="tv__cmps">{metricas.map((m) => <Fila key={`${m[0]}`} m={m} T={T} M={M} municipios={municipios} municipio={municipio} ctxDe={ctxDe} />)}</div>
    </>
  );
}
