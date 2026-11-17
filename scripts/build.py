#!/usr/bin/env python3
"""Build the Paris Food Money Matrix.

Reads the sourced research files in data/research/*.json, places every record on the map, and writes:
  data/places.json   - the final dataset (one row per pin)
  public/index.html  - the static site (template + inlined data)
  public/app.js      - the app script

Two kinds of research records (see data/README.md):
  {"type":"brand", "osm":"Burger King", ...}  -> every Paris branch is found on OpenStreetMap (via Photon)
  {"type":"venue", "addr":"7 rue ..., 75009 Paris", ...} -> geocoded with the French national address API (BAN)

Network lookups are cached in data/cache/ so rebuilds are fast and reproducible.
Usage: python3 scripts/build.py [--offline]
"""
import json, re, sys, time, unicodedata, urllib.parse, urllib.request, glob, os, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, 'data', 'cache')
OFFLINE = '--offline' in sys.argv
BBOX = (2.2241, 48.8156, 2.4699, 48.9022)  # Paris intra-muros (lon/lat)
UA = 'paris-food-money-matrix/1.0 (static map build)'
CATS = {'pe', 'vc', 'corp', 'ind'}
KINDS = ["Bakery & pastry", "Coffee", "Café", "Burgers & chicken", "Pizza", "Italian", "Japanese", "Asian", "French bistro",
         "Brasserie", "Bouillon", "Fine dining", "Wine & cocktail bar", "Sandwiches & salads", "Healthy & veggie", "Middle Eastern",
         "Mexican & Latin", "Steak & grill", "Seafood", "Crêperie", "Other"]
ARR = {1: 'Louvre & Les Halles', 2: 'Bourse & Sentier', 3: 'Haut-Marais', 4: 'Marais & the islands', 5: 'Latin Quarter',
       6: 'Saint-Germain', 7: 'Invalides & Eiffel', 8: 'Champs-Élysées', 9: 'Opéra & SoPi', 10: 'Canal Saint-Martin',
       11: 'Oberkampf & Bastille', 12: 'Bercy & Nation', 13: 'Butte-aux-Cailles', 14: 'Montparnasse', 15: 'Vaugirard',
       16: 'Passy & Trocadéro', 17: 'Batignolles', 18: 'Montmartre', 19: 'Buttes-Chaumont', 20: 'Belleville & Ménilmontant'}


def area_label(n):
    return f"{n}{'er' if n == 1 else 'e'} · {ARR[n]}"


def fold(s):
    s = unicodedata.normalize('NFD', str(s or '').lower())
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    s = s.replace('’', "'").replace('&', ' and ')
    return re.sub(r'[^a-z0-9]+', ' ', s).strip()


def fetch_json(url, key):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, re.sub(r'[^a-zA-Z0-9_.-]+', '_', key)[:180] + '.json')
    if os.path.exists(path):
        with open(path) as f:
            return json.load(f)
    if OFFLINE:
        return None
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=30) as r:
                data = json.load(r)
            with open(path, 'w') as f:
                json.dump(data, f, ensure_ascii=False)
            time.sleep(0.4)
            return data
        except Exception as e:  # noqa: BLE001
            print(f'  retry {attempt+1} {key}: {e}', file=sys.stderr)
            time.sleep(2 * (attempt + 1))
    return None


def arr_from_postcode(pc):
    m = re.match(r'^75(\d{3})$', str(pc or ''))
    if not m:
        return None
    n = int(m.group(1))
    if n == 116:
        n = 16
    return n if 1 <= n <= 20 else None


def in_paris(lon, lat):
    return BBOX[0] <= lon <= BBOX[2] and BBOX[1] <= lat <= BBOX[3]


def geocode_venue(addr):
    """French national address base (BAN). Returns (lat, lon, postcode, label) or None."""
    q = urllib.parse.quote(addr)
    data = fetch_json(f'https://api-adresse.data.gouv.fr/search/?q={q}&limit=1', 'ban_' + fold(addr))
    feats = (data or {}).get('features') or []
    if not feats:
        return None
    f = feats[0]
    p = f['properties']
    lon, lat = f['geometry']['coordinates']
    if p.get('score', 0) < 0.45 or not in_paris(lon, lat):
        return None
    street = p.get('name') or ''
    return lat, lon, p.get('postcode'), street


# Photon (OpenStreetMap search). Several biased queries so big chains are not capped at one page.
BIAS = [(48.8566, 2.3522), (48.8800, 2.3000), (48.8800, 2.3800), (48.8350, 2.3000), (48.8350, 2.3800), (48.8650, 2.2700), (48.8400, 2.4000), (48.8950, 2.3450)]
OK_KEYS = {'amenity', 'shop', 'leisure', 'tourism', 'craft'}


def brand_branches(osm_name, extra_names=()):
    names = [osm_name, *extra_names]
    want = [fold(n) for n in names]
    found = {}
    for qn in names:
        for lat, lon in BIAS:
            url = ('https://photon.komoot.io/api/?' + urllib.parse.urlencode({'q': qn, 'limit': 50, 'lat': lat, 'lon': lon,
                   'bbox': ','.join(map(str, BBOX))}))
            data = fetch_json(url, f'photon_{fold(qn)}_{lat}_{lon}')
            for f in (data or {}).get('features') or []:
                p = f['properties']
                if p.get('osm_key') not in OK_KEYS:
                    continue
                nm = fold(p.get('name'))
                if not any(nm == w or nm.startswith(w + ' ') for w in want):
                    continue
                lon2, lat2 = f['geometry']['coordinates']
                if not in_paris(lon2, lat2):
                    continue
                found[(p.get('osm_type'), p.get('osm_id'))] = p | {'lat': lat2, 'lon': lon2}
    # collapse duplicates mapped twice (node + building) within 25 m
    out = []
    for p in sorted(found.values(), key=lambda p: (p['lat'], p['lon'])):
        if any(abs(p['lat'] - q['lat']) < 0.00025 and abs(p['lon'] - q['lon']) < 0.00035 for q in out):
            continue
        out.append(p)
    return out


def clean(rec):
    r = {k: rec.get(k) for k in ('n', 'cu', 'k', 'pr', 'c', 'o', 'y', 'note', 'src') if rec.get(k) not in (None, '')}
    if r.get('k') not in KINDS:
        r['k'] = 'Other'
    if 'y' in r:
        r['y'] = str(r['y'])
    try:
        r['pr'] = max(1, min(4, int(r.get('pr', 2))))
    except (TypeError, ValueError):
        r['pr'] = 2
    return r


def main():
    records = []
    for path in sorted(glob.glob(os.path.join(ROOT, 'data', 'research', '*.json'))):
        with open(path) as f:
            rows = json.load(f)
        for r in rows:
            r['_file'] = os.path.basename(path)
        records += rows
    print(f'{len(records)} research records')

    # A venue or brand researched twice: keep the first, but let a non-independent finding win over "ind".
    seen = {}
    for r in records:
        key = (r.get('type'), fold(r.get('osm') or r.get('n')))
        if r.get('c') not in CATS or not r.get('src') or not r.get('n'):
            print('  skip (missing c/src/n):', r.get('n'), r.get('_file'))
            continue
        if key in seen:
            if seen[key].get('c') == 'ind' and r.get('c') != 'ind':
                seen[key] = r
            continue
        seen[key] = r

    places, misses = [], []
    for r in seen.values():
        base = clean(r)
        if r.get('type') == 'brand':
            br = brand_branches(r.get('osm') or r['n'], r.get('osm_alt') or [])
            if not br and r.get('addr'):
                r['type'] = 'venue'
            for p in br:
                n = arr_from_postcode(p.get('postcode'))
                if not n:
                    continue
                street = ' '.join(x for x in (p.get('housenumber'), p.get('street')) if x)
                place = dict(base)
                place['n'] = f"{base['n']} · {street}" if street else base['n']
                place['a'] = street or p.get('locality') or ''
                place['area'] = area_label(n)
                place['ll'] = [round(p['lat'], 5), round(p['lon'], 5)]
                places.append(place)
            if not br and r.get('type') == 'brand':
                misses.append(f"brand with no Paris branch on OSM: {r['n']}")
            if r.get('type') == 'brand':
                continue
        g = geocode_venue(r.get('addr') or '')
        if not g:
            misses.append(f"could not geocode: {r['n']} | {r.get('addr')}")
            continue
        lat, lon, pc, street = g
        n = arr_from_postcode(pc)
        if not n:
            misses.append(f"outside Paris: {r['n']} | {r.get('addr')}")
            continue
        place = dict(base)
        place['a'] = street
        place['area'] = area_label(n)
        place['ll'] = [round(lat, 5), round(lon, 5)]
        places.append(place)

    # A venue pin that sits on top of a chain branch pin of the same brand wins (it carries the specific note).
    places.sort(key=lambda p: ({'pe': 0, 'vc': 1, 'corp': 2, 'ind': 3}[p['c']], p['n']))
    counts = {c: sum(p['c'] == c for p in places) for c in ('pe', 'vc', 'corp', 'ind')}
    print('places:', len(places), counts)
    for m in misses:
        print('  !', m)

    with open(os.path.join(ROOT, 'data', 'places.json'), 'w') as f:
        json.dump(places, f, ensure_ascii=False, indent=0)
    with open(os.path.join(ROOT, 'src', 'index.template.html')) as f:
        html = f.read()
    checked = datetime.date.today().strftime('%b %Y')
    data = json.dumps(places, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
    html = html.replace('/*__PLACES__*/[]', data).replace('/*__CHECKED__*/""', json.dumps(checked))
    sugg = os.path.join(ROOT, 'data', 'suggest.json')
    if os.path.exists(sugg):
        with open(sugg) as f:
            html = re.sub(r'/\*__SUGGEST__\*/\{[^\n]*\}', lambda _: json.dumps(json.load(f)), html)
    else:
        html = html.replace('/*__SUGGEST__*/', '')
    os.makedirs(os.path.join(ROOT, 'public'), exist_ok=True)
    with open(os.path.join(ROOT, 'public', 'index.html'), 'w') as f:
        f.write(html)
    with open(os.path.join(ROOT, 'src', 'app.js')) as f, open(os.path.join(ROOT, 'public', 'app.js'), 'w') as g:
        g.write(f.read())
    print('wrote public/index.html', len(html) // 1024, 'KB')


if __name__ == '__main__':
    main()
