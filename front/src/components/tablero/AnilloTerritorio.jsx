import { suma } from '../../lib/sesim/tableroTerritorio';
import { f } from '../../lib/sesim/tableroTextos';

const W = 700; const H = 500; const CX = W / 2; const CY = H / 2;

/** Anillo del tablero: afuera los municipios (tamaño = habitantes); adentro un punto por indicador de cada estrategia. */
export default function AnilloTerritorio({ municipios, indicadores, ejes, municipio, eje, alMunicipio, alEje }) {
  const maxPob = Math.max(...municipios.map((m) => m.pob), 1);
  const lista = [];
  ejes.forEach((e, i) => indicadores.filter((x) => x.ejes.includes(e.numero)).sort((a, b) => (b.meta === 'num') - (a.meta === 'num')).forEach((x) => lista.push([i, x])));
  const gap = 0.15; const total = Math.max(lista.length, 1); const arco = 2 * Math.PI - ejes.length * gap;
  let k = 0; let a0 = -Math.PI / 2;
  const puntos = []; const rotulos = [];
  ejes.forEach((e, i) => {
    const n = lista.filter((x) => x[0] === i).length;
    const activo = !eje || eje === e.numero;
    for (let j = 0; j < n; j += 1) {
      const an = a0 + ((j + 0.5) * arco) / total;
      const num = lista[k][1].meta === 'num';
      puntos.push(<circle key={`p${i}-${j}`} className="tv__eje" onClick={() => alEje(e.numero)} cx={CX + Math.cos(an) * 150} cy={CY + Math.sin(an) * 150} r={num ? 4.4 : 3.2} fill={`var(--tv-e${e.numero})`} opacity={activo ? (num ? 1 : 0.45) : 0.12} />);
      k += 1;
    }
    const am = a0 + ((n / 2) * arco) / total;
    rotulos.push(
      <g key={`r${i}`} className="tv__eje" role="button" tabIndex={0} aria-label={`Estrategia ${e.numero}`} aria-pressed={eje === e.numero} onClick={() => alEje(e.numero)} onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); alEje(e.numero); } }}>
        <circle cx={CX + Math.cos(am) * 118} cy={CY + Math.sin(am) * 118} r="14" fill={`var(--tv-e${e.numero})`} opacity={activo ? 1 : 0.3} />
        <text x={CX + Math.cos(am) * 118} y={CY + Math.sin(am) * 118 + 4} textAnchor="middle" className="tv__eje-n">{e.numero}</text>
      </g>,
    );
    a0 += (n * arco) / total + gap;
  });
  const sel = municipios.find((m) => m.cve === municipio);
  const pob = sel ? sel.pob : suma(municipios.map((m) => m.pob));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" role="group" aria-label="Municipios y estrategias">
      {[96, 150, 206].map((r) => <circle key={r} cx={CX} cy={CY} r={r} className="tv__guia" />)}
      {puntos}{rotulos}
      {municipios.map((m, i) => {
        const an = -Math.PI / 2 + (i * 2 * Math.PI) / municipios.length;
        const r = 6 + Math.sqrt(m.pob / maxPob) * 11; const on = sel?.cve === m.cve;
        const x = CX + Math.cos(an) * 206; const y = CY + Math.sin(an) * 206;
        const lx = CX + Math.cos(an) * (206 + r + 10); const ly = CY + Math.sin(an) * (206 + r + 10);
        const anc = Math.abs(Math.cos(an)) < 0.2 ? 'middle' : Math.cos(an) > 0 ? 'start' : 'end';
        return (
          <g key={m.cve} className={`tv__mun${on ? ' on' : ''}`} role="button" tabIndex={0} aria-pressed={on} aria-label={`${m.nombre}, ${f(m.pob)} habitantes`}
            opacity={sel ? (on ? 1 : 0.35) : 0.92} onClick={() => alMunicipio(on ? '' : m.cve)} onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); alMunicipio(on ? '' : m.cve); } }}>
            <circle cx={x} cy={y} r={r} />
            <text x={lx} y={ly + 4} textAnchor={anc} fontSize={on ? 17 : 15}>{m.nombre}</text>
          </g>
        );
      })}
      <text x={CX} y={CY - 4} textAnchor="middle" className="tv__centro">{f(pob)}</text>
      <text x={CX} y={CY + 26} textAnchor="middle" className="tv__centro-t">HABITANTES · {sel ? sel.nombre.toUpperCase() : 'ESTADO'}</text>
    </svg>
  );
}
