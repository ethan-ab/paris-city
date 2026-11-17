#!/usr/bin/env python3
"""Bake a small offline basemap of Paris (water, parks, woods, main roads, rail) from OpenFreeMap vector tiles.

Used only by the self-contained artifact build (scripts/build.py --artifact), where the page cannot fetch map tiles
at runtime. Output: data/basemap.json, a dict of GeoJSON FeatureCollections keyed by layer.
Requires: pip install mapbox-vector-tile
"""
import json, math, os, urllib.request
import mapbox_vector_tile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
Z = 13
BBOX = (2.215, 48.812, 2.475, 48.905)
UA = 'paris-food-money-matrix/1.0 (basemap build)'


def tile_xy(lon, lat, z):
    n = 2 ** z
    x = int((lon + 180) / 360 * n)
    y = int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n)
    return x, y


def to_lonlat(x, y, tx, ty, z, extent):
    n = 2 ** z
    lon = (tx + x / extent) / n * 360 - 180
    lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * (ty + 1 - y / extent) / n))))
    return [round(lon, 5), round(lat, 5)]


def conv(geom, tx, ty, extent):
    t = geom['type']
    c = geom['coordinates']
    f = lambda pt: to_lonlat(pt[0], pt[1], tx, ty, Z, extent)
    if t == 'Point':
        return {'type': t, 'coordinates': f(c)}
    if t in ('LineString', 'MultiPoint'):
        return {'type': t, 'coordinates': [f(p) for p in c]}
    if t in ('Polygon', 'MultiLineString'):
        return {'type': t, 'coordinates': [[f(p) for p in r] for r in c]}
    if t == 'MultiPolygon':
        return {'type': t, 'coordinates': [[[f(p) for p in r] for r in poly] for poly in c]}
    return None


ROADS = {'motorway', 'trunk', 'primary', 'secondary', 'tertiary'}


def main():
    with urllib.request.urlopen(urllib.request.Request('https://tiles.openfreemap.org/planet', headers={'User-Agent': UA})) as r:
        tmpl = json.load(r)['tiles'][0]
    x0, y1 = tile_xy(BBOX[0], BBOX[1], Z)
    x1, y0 = tile_xy(BBOX[2], BBOX[3], Z)
    out = {k: [] for k in ('water', 'park', 'wood', 'road', 'rail')}
    for tx in range(x0, x1 + 1):
        for ty in range(y0, y1 + 1):
            url = tmpl.replace('{z}', str(Z)).replace('{x}', str(tx)).replace('{y}', str(ty))
            for attempt in range(4):
                try:
                    with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=60) as r:
                        raw = r.read()
                    break
                except Exception as e:  # noqa: BLE001
                    print('retry', tx, ty, e)
            tile = mapbox_vector_tile.decode(raw, default_options={'y_coord_down': True})
            for lname, layer in tile.items():
                ext = layer.get('extent', 4096)
                for feat in layer['features']:
                    p = feat['properties']
                    g = None
                    if lname == 'water':
                        key, props = 'water', {}
                    elif lname == 'park':
                        key, props = 'park', {}
                    elif lname == 'landcover' and p.get('class') in ('wood', 'grass'):
                        key, props = 'wood', {}
                    elif lname == 'transportation' and p.get('class') in ROADS and feat['geometry']['type'].endswith('LineString'):
                        key, props = 'road', {'r': p.get('class')}
                    elif lname == 'transportation' and p.get('class') == 'rail' and not p.get('brunnel') == 'tunnel' and feat['geometry']['type'].endswith('LineString'):
                        key, props = 'rail', {}
                    else:
                        continue
                    if p.get('brunnel') == 'tunnel':
                        continue
                    g = conv(feat['geometry'], tx, ty, ext)
                    if g:
                        out[key].append({'type': 'Feature', 'properties': props, 'geometry': g})
            print('tile', tx, ty, {k: len(v) for k, v in out.items()})
    fc = {k: {'type': 'FeatureCollection', 'features': v} for k, v in out.items()}
    path = os.path.join(ROOT, 'data', 'basemap.json')
    with open(path, 'w') as f:
        json.dump(fc, f, separators=(',', ':'))
    print('wrote', path, os.path.getsize(path) // 1024, 'KB')


if __name__ == '__main__':
    main()
