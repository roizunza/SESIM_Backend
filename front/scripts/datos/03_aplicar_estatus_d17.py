#!/usr/bin/env python3
"""
SESIM · Aplica la regla D-17 al catálogo estático de capas (public/sesim/catalogo/capa.json).

Misma regla que la migración 216 del backend (fuente de verdad: core.capa):
  metadato mínimo completo (responsable/custodio, fuente_origen, linaje, sistema_coordenadas)
    + restricción de uso pública            -> vigente_publico
    + restricción interna o reservada       -> vigente_admin (validada, solo uso interno)
  metadato incompleto                       -> borrador

Uso:  python3 scripts/datos/03_aplicar_estatus_d17.py          (reescribe capa.json y resume)
"""
import json, pathlib, collections

RUTA = pathlib.Path(__file__).resolve().parents[2] / 'public' / 'sesim' / 'catalogo' / 'capa.json'


def estatus_d17(c):
    m = c.get('metadatos_extra') or {}
    completo = all(str(v or '').strip() for v in (c.get('responsable'), m.get('fuente_origen'), m.get('linaje'), m.get('sistema_coordenadas')))
    if not completo:
        return 'borrador'
    return 'vigente_publico' if str(m.get('restriccion_uso') or '').strip().lower() in ('pública', 'publica') else 'vigente_admin'


capas = json.loads(RUTA.read_text(encoding='utf-8'))
antes = collections.Counter(c.get('estatus') for c in capas)
cambios = []
for c in capas:
    nuevo = estatus_d17(c)
    if c.get('estatus') != nuevo:
        cambios.append((c['id'], c.get('estatus'), nuevo))
        c['estatus'] = nuevo
RUTA.write_text(json.dumps(capas, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
print('antes  :', dict(antes))
print('después:', dict(collections.Counter(c['estatus'] for c in capas)))
for i, a, b in sorted(cambios):
    print(f'  {i:8s} {a} -> {b}')
print('no públicas:', ' '.join(sorted(c['id'] for c in capas if c['estatus'] != 'vigente_publico')))
