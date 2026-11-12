/**
 * Descargas del tablero público sin dependencias nuevas:
 *  · PDF de una sola página con la vista tal cual se ve (captura con html2canvas, incrustada como JPEG).
 *  · Excel (.xlsx) con varias hojas (ZIP sin compresión + XML mínimo de SpreadsheetML).
 */
import html2canvas from 'html2canvas';

const enc = new TextEncoder();
const guardar = (blob, nombre) => {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: nombre });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
};

/* ───────── PDF ───────── */
function pdfDeJpeg(jpeg, px, py) {
  const ancho = 842; const alto = Math.round((ancho * py) / px); // A4 apaisado en puntos (ancho fijo)
  const partes = []; const offs = []; let largo = 0;
  const poner = (x) => { const b = typeof x === 'string' ? enc.encode(x) : x; partes.push(b); largo += b.length; };
  const obj = (n, cuerpo) => { offs[n] = largo; poner(`${n} 0 obj\n`); poner(cuerpo); poner('\nendobj\n'); };
  poner('%PDF-1.4\n');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${ancho} ${alto}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
  offs[4] = largo;
  poner(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${px} /Height ${py} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);
  poner(jpeg); poner('\nendstream\nendobj\n');
  const cont = `q ${ancho} 0 0 ${alto} 0 0 cm /Im0 Do Q`;
  obj(5, `<< /Length ${cont.length} >>\nstream\n${cont}\nendstream`);
  const xref = largo;
  poner(`xref\n0 6\n0000000000 65535 f \n${[1, 2, 3, 4, 5].map((n) => `${String(offs[n]).padStart(10, '0')} 00000 n \n`).join('')}`);
  poner(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(partes, { type: 'application/pdf' });
}

/* html2canvas no entiende color(srgb …) (lo que devuelve el navegador para color-mix): se pasa a rgba() en la copia. */
const RE_COLOR = /color\(srgb\s+([-\d.e]+)\s+([-\d.e]+)\s+([-\d.e]+)(?:\s*\/\s*([-\d.e%]+))?\)/g;
function aRgba(doc) {
  const win = doc.defaultView;
  const c = (x) => Math.round(Math.min(1, Math.max(0, parseFloat(x))) * 255);
  for (const el of doc.querySelectorAll('*')) {
    const cs = win.getComputedStyle(el);
    for (let i = 0; i < cs.length; i += 1) {
      const p = cs[i]; const v = cs.getPropertyValue(p);
      if (v && v.includes('color(')) {
        el.style.setProperty(p, v.replace(RE_COLOR, (_, r, g, b, a) => `rgba(${c(r)}, ${c(g)}, ${c(b)}, ${a === undefined ? 1 : (String(a).endsWith('%') ? parseFloat(a) / 100 : parseFloat(a))})`), 'important');
      }
    }
  }
}

export async function descargarPdf(elemento, nombre) {
  const lienzo = await html2canvas(elemento, { logging: false, scale: 2, useCORS: true, backgroundColor: null, onclone: (d) => { const st = d.createElement('style'); st.textContent = '.tv-pagina > .___html2canvas___pseudoelement_before, .tv-pagina > .___html2canvas___pseudoelement_after { display: none !important; }'; d.head.appendChild(st); aRgba(d); }, ignoreElements: (e) => e.hasAttribute?.('data-html2canvas-ignore') });
  const jpg = lienzo.toDataURL('image/jpeg', 0.92).split(',')[1];
  const bin = atob(jpg); const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  guardar(pdfDeJpeg(bytes, lienzo.width, lienzo.height), nombre);
}

/* ───────── XLSX ───────── */
const TABLA_CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n += 1) { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i += 1) c = TABLA_CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

function zip(archivos) {
  const loc = []; const cen = []; let pos = 0;
  const u16 = (n) => [n & 255, (n >> 8) & 255]; const u32 = (n) => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255];
  for (const [nombre, texto] of archivos) {
    const n = enc.encode(nombre); const d = enc.encode(texto); const c = crc32(d);
    const cab = Uint8Array.from([0x50, 0x4b, 3, 4, ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(c), ...u32(d.length), ...u32(d.length), ...u16(n.length), ...u16(0)]);
    loc.push(cab, n, d);
    cen.push(Uint8Array.from([0x50, 0x4b, 1, 2, ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(c), ...u32(d.length), ...u32(d.length), ...u16(n.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(pos)]), n);
    pos += cab.length + n.length + d.length;
  }
  const tamCen = cen.reduce((s, x) => s + x.length, 0);
  const fin = Uint8Array.from([0x50, 0x4b, 5, 6, 0, 0, 0, 0, ...u16(archivos.length), ...u16(archivos.length), ...u32(tamCen), ...u32(pos), 0, 0]);
  return new Blob([...loc, ...cen, fin], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

const esc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
const col = (i) => { let s = ''; let n = i; do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0); return s; };

function hoja(filas) {
  const xs = filas.map((f, r) => `<row r="${r + 1}">${f.map((v, c) => {
    const ref = `${col(c)}${r + 1}`;
    if (v === null || v === undefined || v === '') return '';
    if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"><v>${v}</v></c>`;
    return `<c r="${ref}" t="inlineStr"${r === 0 ? ' s="1"' : ''}><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
  }).join('')}</row>`).join('');
  const anchos = (filas[0] ?? []).map((_, c) => `<col min="${c + 1}" max="${c + 1}" width="${Math.min(60, Math.max(12, ...filas.slice(0, 60).map((f) => String(f[c] ?? '').length + 2)))}" customWidth="1"/>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${anchos}</cols><sheetData>${xs}</sheetData></worksheet>`;
}

/** hojas = [{ nombre, filas: [[encabezados], [fila], …] }] */
export function descargarXlsx(hojas, nombre) {
  const H = 'http://schemas.openxmlformats.org/';
  const archivos = [
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="${H}package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${hojas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${H}package/2006/relationships"><Relationship Id="rId1" Type="${H}officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="${H}spreadsheetml/2006/main" xmlns:r="${H}officeDocument/2006/relationships"><sheets>${hojas.map((h, i) => `<sheet name="${esc(h.nombre).slice(0, 31)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${H}package/2006/relationships">${hojas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${H}officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${hojas.length + 1}" Type="${H}officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="${H}spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`],
    ...hojas.map((h, i) => [`xl/worksheets/sheet${i + 1}.xml`, hoja(h.filas)]),
  ];
  guardar(zip(archivos), nombre);
}
