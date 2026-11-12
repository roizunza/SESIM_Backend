"""Fundido suave del contexto exterior al estado para el hero de la landing.

Genera public/sesim/hero/exterior_difuminado.png: imagen RGBA en proyección Mercator, transparente dentro de Campeche y
cada vez más opaca (color de fondo de la portada) conforme se aleja del contorno. MapLibre la monta como fuente `image`
con las esquinas ESQUINAS (lon/lat) y así no hay borde duro entre el estado y lo que lo rodea.

Requiere: pip install pillow numpy scipy
Uso (desde front/):  python scripts/datos/08_exportar_exterior_difuminado.py [public/sesim/capas/Lim03.geojson]
Parámetros: COLOR = --pal-hero-fondo (#FBF8F1); ALCANCE_KM = distancia a la que alcanza su opacidad máxima; OPACIDAD_MAX.
"""
import json, math, os, sys
import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import distance_transform_edt, gaussian_filter

LIMITE = sys.argv[1] if len(sys.argv) > 1 else os.path.join('public', 'sesim', 'capas', 'Lim03.geojson')
SALIDA = os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'sesim', 'hero', 'exterior_difuminado.png')
OESTE, ESTE, SUR, NORTE = -95.0, -87.0, 16.2, 22.6      # ESQUINAS del raster (debe coincidir con MapaHeroVivo.jsx)
ANCHO = 640
COLOR = (251, 248, 241)
ALCANCE_KM = 95.0
OPACIDAD_MAX = 0.8

merc = lambda lat: math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))
alto = round(ANCHO * (merc(NORTE) - merc(SUR)) / math.radians(ESTE - OESTE))
a_px = lambda lon, lat: ((lon - OESTE) / (ESTE - OESTE) * ANCHO, (merc(NORTE) - merc(lat)) / (merc(NORTE) - merc(SUR)) * alto)

dentro = Image.new('L', (ANCHO, alto), 0)
g = ImageDraw.Draw(dentro)
for f in json.load(open(LIMITE, encoding='utf-8'))['features']:
    geo = f['geometry']
    polis = [geo['coordinates']] if geo['type'] == 'Polygon' else geo['coordinates']
    for p in polis:
        g.polygon([a_px(x, y) for x, y in p[0]], fill=255)
dentro = np.array(dentro) > 0
km_px = (ESTE - OESTE) * 111.32 * math.cos(math.radians(19.2)) / ANCHO
d = distance_transform_edt(~dentro) * km_px
u = np.clip(d / ALCANCE_KM, 0, 1)
alfa = OPACIDAD_MAX * (u * u * u * (u * (u * 6 - 15) + 10))      # suavizado de Perlin: sin escalón
alfa = gaussian_filter(alfa, 1.5)
alfa[dentro] = 0
img = np.zeros((alto, ANCHO, 4), 'u1')
img[..., :3] = COLOR
img[..., 3] = np.round(alfa * 255)
os.makedirs(os.path.dirname(SALIDA), exist_ok=True)
Image.fromarray(img, 'RGBA').save(SALIDA, optimize=True)
print(ANCHO, 'x', alto, os.path.getsize(SALIDA) // 1024, 'KB')
