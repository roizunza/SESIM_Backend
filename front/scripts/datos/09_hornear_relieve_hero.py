#!/usr/bin/env python3
"""
Hornea el relieve de la portada (una sola vez; el navegador no calcula hillshade).

Entradas (scripts/datos/insumos_hero/ y public/sesim/capas/):
  MDT_MERIT_Sureste_80m.tif  DEM MERIT, EPSG:4326, float32, NoData -9999
  corrientes_principales_osm.geojson, cuerpos_agua_humedales_osm.geojson   hidrografía OSM
  capas/Lim01, Lim02, Lim03  países, estados, Campeche (solo como máscara: NO se dibujan límites)
  capas/Loc01, Loc02         localidades urbanas (polígonos) y rurales (puntos)

Salidas (public/sesim/hero/):
  relieve.jpg        imagen en Web Mercator (EPSG:3857) alineada con BOUNDS; mapa base de la portada
  localidades.json   puntos de localidades (u = urbana con área km², r = rural)

Requiere: numpy, scipy, shapely, Pillow, tifffile, imagecodecs.   Uso: python3 scripts/datos/09_hornear_relieve_hero.py
"""
import json, math, sys, time
import numpy as np
import tifffile
from PIL import Image, ImageDraw, ImageFilter
from scipy.ndimage import gaussian_filter, distance_transform_edt, map_coordinates
from shapely.geometry import shape, box
from shapely.ops import unary_union
from shapely.validation import make_valid

HERO = 'public/sesim/hero/'                 # salidas (y red_vial.json)
INS = 'scripts/datos/insumos_hero/'          # insumos pesados: NO van en public/, para que no entren al build
CAPAS = 'public/sesim/capas/'
L0, L1, A0, A1 = -93.25, -88.35, 17.00, 21.60     # BOUNDS (deben coincidir con MapaHeroVivo.jsx)
W = 2400
EXAGERACION = 14.0       # Campeche es casi plano: se exagera el relieve para el sombreado
CURVA, CURVA_INDICE = 5.0, 25.0   # metros
FUNDIDO_VECINOS = False   # True: apaga el relieve fuera de Campeche con un degradado (Ismael lo quitó: «se ve re feo»)
FUNDIDO_BORDE = False     # True: funde los bordes de la imagen al color de fondo (idem)
t0 = time.time()
def log(m): print(f'[{time.time()-t0:5.1f}s] {m}', flush=True)

def merc(lat): return math.log(math.tan(math.pi/4 + math.radians(lat)/2))
M0, M1 = merc(A0), merc(A1)
H = int(round(W * (M1 - M0) / math.radians(L1 - L0)))
def lonlat_px(x, y):
    lon = L0 + (x + .5) / W * (L1 - L0)
    m = M1 - (y + .5) / H * (M1 - M0)
    return lon, math.degrees(2 * math.atan(math.exp(m)) - math.pi/2)
def px(lon, lat): return ((lon - L0) / (L1 - L0) * W, (M1 - merc(lat)) / (M1 - M0) * H)
log(f'imagen {W}x{H}')

# ---- DEM remuestreado a la rejilla Mercator
dem = tifffile.imread(INS + 'MDT_MERIT_Sureste_80m.tif').astype('float32')
dem[dem <= -9000] = np.nan
PIX = 0.0007186522272956172
dem = np.nan_to_num(dem, nan=0.0)
dem = gaussian_filter(dem, 1.2)
xs = np.arange(W); ys = np.arange(H)
lon = L0 + (xs + .5) / W * (L1 - L0)
mm = M1 - (ys + .5) / H * (M1 - M0)
lat = np.degrees(2 * np.arctan(np.exp(mm)) - math.pi/2)
col = (lon - L0) / PIX - .5
row = (A1 - lat) / PIX - .5
# la rejilla del DEM parte de lat 21.6 hacia el sur
RR, CC = np.meshgrid(row, col, indexing='ij')
h = map_coordinates(dem, [RR, CC], order=1, mode='nearest').astype('float32')
del dem, RR, CC
h[h < 0] = 0
log(f'DEM remuestreado: {h.min():.1f} a {h.max():.1f} m')

# ---- máscaras
def mask_of(g):
    im = Image.new('L', (W, H), 0); d = ImageDraw.Draw(im)
    for p in ([g] if g.geom_type == 'Polygon' else list(g.geoms)):
        d.polygon([px(*c) for c in p.exterior.coords], fill=255)
        for i in p.interiors: d.polygon([px(*c) for c in i.coords], fill=0)
    return np.asarray(im) > 0
camp = unary_union([make_valid(shape(f['geometry'])) for f in json.load(open(CAPAS + 'Lim03.geojson'))['features']])
land = mask_of(camp)
fe = json.load(open(CAPAS + 'Lim02.geojson'))['features'] + json.load(open(CAPAS + 'Lim01.geojson'))['features']
allland = unary_union([make_valid(shape(f['geometry'])).intersection(box(L0-1, A0-1, L1+1, A1+1)) for f in fe])
lm = mask_of(allland)
h[~lm] = 0
log('máscaras listas')

# ---- hillshade multidireccional
mpp = (math.radians(L1 - L0) * 6378137 / W) * math.cos(math.radians((A0 + A1) / 2))  # metros por píxel aprox.
hs_h = gaussian_filter(h, 1.7)
def hs(az, alt=38):
    gy, gx = np.gradient(hs_h * (EXAGERACION / mpp))
    sl = np.arctan(np.hypot(gx, gy)); asp = np.arctan2(-gx, gy)
    a = math.radians(az); al = math.radians(alt)
    return np.clip(np.sin(al)*np.cos(sl) + np.cos(al)*np.sin(sl)*np.cos(a - asp), 0, 1)
sh = hs(315)*.6 + hs(20)*.2 + hs(270)*.2
lo, hi = np.percentile(sh[land], 2), np.percentile(sh[land], 98)
sh = np.clip((sh - lo) / (hi - lo), 0, 1)

# ---- paleta verde (aprobada en maqueta G)
d0 = np.array([36, 60, 48]); m0 = np.array([86, 120, 100]); l0 = np.array([178, 208, 185])
t = sh[..., None]
rgb = np.where(t < .5, d0 + (m0 - d0) * (t / .5), m0 + (l0 - m0) * ((t - .5) / .5))

# ---- curvas de nivel (gris verdoso fino; índice cada 5)
hc = gaussian_filter(h, 1.6)
def cont(st):
    c = np.floor(hc / st); e = (c != np.roll(c, 1, 0)) | (c != np.roll(c, 1, 1))
    return np.asarray(Image.fromarray((e * 255).astype('uint8')).filter(ImageFilter.GaussianBlur(.6)), float) / 255
cm = cont(CURVA); ci = cont(CURVA_INDICE)
gv = np.array([150, 170, 158])
rgb = rgb * (1 - cm[..., None] * .22) + gv * cm[..., None] * .22
rgb = rgb * (1 - ci[..., None] * .40) + gv * ci[..., None] * .40
log('curvas')

# ---- degradado hacia los estados vecinos (sin dibujar límite)
BG = np.array([30, 43, 52]); SEA = np.array([30, 43, 52]); LAG = np.array([34, 50, 61])  # azul del mar #1E2B34; lagunas y ríos un tono más claro
dist = distance_transform_edt(~land)
fade = gaussian_filter(np.clip(dist / 380, 0, 1) ** 1.2 * .8, 30) if FUNDIDO_VECINOS else np.zeros_like(dist)
rgb = rgb * (1 - fade[..., None]) + BG * fade[..., None]
seam = gaussian_filter((~lm).astype(float), 1.0)[..., None]
rgb = rgb * (1 - seam) + SEA * seam
img = Image.fromarray(np.clip(rgb, 0, 255).astype('uint8'))

# ---- hidrografía: un solo azul, plano
def dpoly(d, g):
    for p in ([g] if g.geom_type == 'Polygon' else list(g.geoms)):
        if len(p.exterior.coords) < 3: continue
        d.polygon([px(*c) for c in p.exterior.coords], fill=255)
        for i in p.interiors: d.polygon([px(*c) for c in i.coords], fill=0)
wm = Image.new('L', (W, H), 0); wd = ImageDraw.Draw(wm)
for f in json.load(open(INS + 'cuerpos_agua_humedales_osm.geojson'))['features']:
    if f['properties']['categoria'] != 'humedal': dpoly(wd, shape(f['geometry']))
rm = Image.new('L', (W, H), 0); rd = ImageDraw.Draw(rm)
for f in json.load(open(INS + 'corrientes_principales_osm.geojson'))['features']:
    j = f['properties']['jerarquia']
    if j > 2: continue
    g = shape(f['geometry'])
    for l in ([g] if g.geom_type == 'LineString' else list(g.geoms)):
        pts = [px(*c) for c in l.coords]
        if len(pts) > 1: rd.line(pts, fill=255, width=4 if j == 1 else 2, joint='curve')
agua = Image.new('RGB', (W, H), tuple(int(v) for v in LAG))
img = Image.composite(agua, img, rm.filter(ImageFilter.GaussianBlur(.5)))
img = Image.composite(agua, img, wm.filter(ImageFilter.GaussianBlur(.7)))
# borde fundido al color de fondo del hero (#2B3A33), para que la imagen no deje costura contra el fondo del mapa
arr = np.asarray(img, float)
yy, xx = np.mgrid[0:H, 0:W]
borde = np.clip(np.minimum.reduce([xx, W - 1 - xx, yy, H - 1 - yy]) / 260.0, 0, 1)
borde = (borde * borde * (3 - 2 * borde))[..., None] if FUNDIDO_BORDE else np.ones_like(borde)[..., None]
arr = BG + (arr - BG) * borde
Image.fromarray(np.clip(arr, 0, 255).astype('uint8')).save(HERO + 'relieve.jpg', quality=88, optimize=True, progressive=True)
log('relieve.jpg')

# ---- localidades como puntos
pts = []
for f in json.load(open(CAPAS + 'Loc01.geojson'))['features']:
    g = make_valid(shape(f['geometry'])); c = g.representative_point()
    a = g.area * 111.32 * 111.32 * math.cos(math.radians(c.y))
    pts.append({'type': 'Feature', 'properties': {'t': 'u', 'a': round(a, 2), 'n': f['properties'].get('nombre', '')},
                'geometry': {'type': 'Point', 'coordinates': [round(c.x, 5), round(c.y, 5)]}})
for f in json.load(open(CAPAS + 'Loc02.geojson'))['features']:
    x, y = f['geometry']['coordinates'][:2]
    if L0 < x < L1 and A0 < y < A1:
        pts.append({'type': 'Feature', 'properties': {'t': 'r'}, 'geometry': {'type': 'Point', 'coordinates': [round(x, 5), round(y, 5)]}})
json.dump({'type': 'FeatureCollection', 'features': pts}, open(HERO + 'localidades.json', 'w'), ensure_ascii=False, separators=(',', ':'))
log(f'localidades.json: {len(pts)} puntos')
print('BOUNDS', [[L0, A1], [L1, A1], [L1, A0], [L0, A0]])
