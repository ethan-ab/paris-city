#!/usr/bin/env python3
"""Discover independent Paris food venues at scale, with a registry source for each one.

1. Enumerate named food places in Paris from OpenStreetMap (Photon reverse search on an adaptive grid).
2. Fetch their OSM tags (cuisine, brand) from the OSM API.
3. Drop anything tagged as a brand/chain or already covered by data/research/*.json.
4. Match each remaining place to its operating company in the French business register
   (recherche-entreprises.api.gouv.fr = annuaire-entreprises.data.gouv.fr): same name/sign, establishment within ~120 m,
   food-service activity code.
5. Keep it as "independent" only when the register shows an owner-managed business: the company runs at most 3 sites and
   its president/gérant is a person, or a small holding that is itself run by a person. Anything led by a group is skipped.

Output: data/research/auto_ind.json (same record format as the hand-researched files, with "ll"/"pc" so no geocoding is needed).
Intermediate results are cached in data/cache/discover_*.json so reruns are incremental.
Usage: python3 scripts/discover.py [--max N]
"""
import json, math, os, re, sys, time, threading, urllib.parse, urllib.request, glob
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build import fold, ROOT, BBOX, UA, arr_from_postcode  # noqa: E402

CACHE = os.path.join(ROOT, 'data', 'cache')
TAGS = ['amenity:restaurant', 'amenity:cafe', 'amenity:fast_food', 'amenity:bar', 'amenity:pub', 'amenity:ice_cream',
        'shop:bakery', 'shop:pastry', 'shop:chocolate']
FOOD_NAF = ('56.', '10.71', '10.72', '10.82', '47.24', '47.81')


def load(name, default):
    p = os.path.join(CACHE, f'discover_{name}.json')
    if os.path.exists(p):
        with open(p) as f:
            return json.load(f)
    return default


def save(name, obj):
    with open(os.path.join(CACHE, f'discover_{name}.json'), 'w') as f:
        json.dump(obj, f, ensure_ascii=False, separators=(',', ':'))


_lock = threading.Lock()
_last = {}


def get(url, host_gap=0.15, tries=5):
    host = urllib.parse.urlparse(url).netloc
    for attempt in range(tries):
        with _lock:
            wait = _last.get(host, 0) + host_gap - time.time()
            _last[host] = max(time.time(), _last.get(host, 0) + host_gap)
        if wait > 0:
            time.sleep(wait)
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=40) as r:
                return json.load(r)
        except Exception as e:  # noqa: BLE001
            code = getattr(e, 'code', None)
            if code == 404:
                return None
            time.sleep(2 * (attempt + 1) + (5 if code == 429 else 0))
    print('  gave up', url[:120], file=sys.stderr)
    return None


# ---------------------------------------------------------------- 1. enumerate OSM food places
def reverse(lat, lon, radius_km):
    q = [('lat', f'{lat:.5f}'), ('lon', f'{lon:.5f}'), ('limit', 50), ('radius', radius_km)] + [('osm_tag', t) for t in TAGS]
    d = get('https://photon.komoot.io/reverse?' + urllib.parse.urlencode(q), host_gap=0.12)
    return (d or {}).get('features') or []


def enumerate_osm():
    places = load('osm', {})
    done = set(load('cells', []))
    km_lat, km_lon = 1 / 111.2, 1 / (111.2 * math.cos(math.radians(48.86)))
    step = 0.34  # km between centres; radius 0.25 km circles cover the grid

    def cell(args):
        lat, lon, r = args
        key = f'{lat:.5f},{lon:.5f},{r}'
        if key in done:
            return []
        feats = reverse(lat, lon, r)
        out = [(key, feats)]
        if len(feats) >= 50 and r > 0.06:  # saturated: split into 4 smaller circles
            d = r * 0.7
            for dy in (-1, 1):
                for dx in (-1, 1):
                    out += cell((lat + dy * d * km_lat, lon + dx * d * km_lon, round(r / 2, 4)))
        return out

    pts = []
    lat = BBOX[1]
    while lat <= BBOX[3]:
        lon = BBOX[0]
        while lon <= BBOX[2]:
            pts.append((round(lat, 5), round(lon, 5), 0.25))
            lon += step * km_lon
        lat += step * km_lat
    print(f'grid: {len(pts)} cells, {len(done)} already done, {len(places)} places cached')
    n = 0
    with ThreadPoolExecutor(4) as ex:
        for res in ex.map(cell, pts):
            for key, feats in res:
                done.add(key)
                for f in feats:
                    p = f['properties']
                    if not p.get('name') or not str(p.get('postcode', '')).startswith('75'):
                        continue
                    lon2, lat2 = f['geometry']['coordinates']
                    places[f"{p['osm_type']}{p['osm_id']}"] = {
                        'name': p['name'], 'kind': f"{p['osm_key']}:{p['osm_value']}", 'hn': p.get('housenumber'),
                        'street': p.get('street'), 'pc': p.get('postcode'), 'll': [round(lat2, 6), round(lon2, 6)]}
            n += 1
            if n % 100 == 0:
                print(f'  {n}/{len(pts)} cells, {len(places)} places')
                save('osm', places)
                save('cells', sorted(done))
    save('osm', places)
    save('cells', sorted(done))
    print(f'OSM food places in Paris: {len(places)}')
    return places


# ---------------------------------------------------------------- 2. OSM tags
def fetch_tags(places):
    tags = load('tags', {})
    todo = [k for k in places if k not in tags]
    groups = {'N': 'nodes', 'W': 'ways', 'R': 'relations'}
    for t, endpoint in groups.items():
        ids = [k[1:] for k in todo if k[0] == t]
        for i in range(0, len(ids), 150):
            chunk = ids[i:i + 150]
            d = get(f'https://api.openstreetmap.org/api/0.6/{endpoint}.json?{endpoint}={",".join(chunk)}', host_gap=0.5)
            for el in (d or {}).get('elements', []):
                tags[f"{t}{el['id']}"] = el.get('tags', {})
            for c in chunk:
                tags.setdefault(f'{t}{c}', {})
            if (i // 150) % 10 == 0:
                save('tags', tags)
    save('tags', tags)
    return tags


# ---------------------------------------------------------------- 3. register lookup
def dist_m(a, b):
    dy = (a[0] - b[0]) * 111200
    dx = (a[1] - b[1]) * 111200 * math.cos(math.radians(48.86))
    return math.hypot(dx, dy)


STOP = {'le', 'la', 'les', 'l', 'de', 'du', 'des', 'd', 'et', 'and', 'au', 'aux', 'a', 'chez', 'the', 'restaurant', 'cafe',
        'bar', 'paris', 'sas', 'sarl', 'eurl', 'sasu', 'snc', 'boulangerie', 'patisserie', 'bistrot', 'bistro', 'brasserie'}


def words(s):
    return {w for w in fold(s).split() if w not in STOP and len(w) > 1}


def name_match(osm_name, labels):
    a = words(osm_name)
    if not a:
        a = set(fold(osm_name).split())
    for lab in labels:
        b = words(lab)
        if not b:
            continue
        if fold(lab) == fold(osm_name) or a <= b or (len(a & b) >= max(1, min(len(a), len(b)) * 0.67) and len(a & b) >= 1 and (len(a) <= 3)):
            return True
    return False


def search_register(name, pc):
    q = urllib.parse.urlencode({'q': name, 'code_postal': pc, 'per_page': 10, 'etat_administratif': 'A'})
    return get('https://recherche-entreprises.api.gouv.fr/search?' + q, host_gap=0.16)


def holding_info(siren, reg):
    if siren in reg['h']:
        return reg['h'][siren]
    d = get(f'https://recherche-entreprises.api.gouv.fr/search?q={siren}&per_page=1', host_gap=0.16)
    res = ((d or {}).get('results') or [None])[0]
    info = None
    if res and res.get('siren') == siren:
        info = {'name': res.get('nom_raison_sociale') or res.get('nom_complet'), 'sites': res.get('nombre_etablissements_ouverts') or 0,
                'naf': res.get('activite_principale'), 'dirs': res.get('dirigeants') or []}
    reg['h'][siren] = info
    return info


def judge(osm, res, reg):
    """Return (owner, note) when the register shows an owner-managed company, else None."""
    sites = res.get('nombre_etablissements_ouverts') or 0
    if sites > 3:
        return None
    dirs = [d for d in res.get('dirigeants') or [] if 'commissaire' not in (d.get('qualite') or '').lower()]
    if not dirs:
        return None
    lead = [d for d in dirs if re.search(r'pr[ée]sident|g[ée]rant', d.get('qualite') or '', re.I) and 'directeur' not in (d.get('qualite') or '').lower()] or dirs
    siren = res['siren']
    site_txt = 'its only site' if sites <= 1 else f'one of its {sites} sites'
    if not res.get('nom_raison_sociale'):  # sole trader (entreprise individuelle): the legal name is a person's name
        return 'Sole trader', (f"Run by a sole trader (entreprise individuelle, SIREN {siren}), the most independent form a "
                               f"French business can take; no group or investor is involved, and this is {site_txt}.")
    legal = res['nom_raison_sociale'].title()
    surnames = {w for d in res.get('dirigeants') or [] for w in fold(d.get('nom') or '').split() if len(w) > 2}
    if surnames & set(fold(legal).split()):  # company named after its owner: don't print a person's name
        legal = 'an owner-managed company'
    if all(d.get('type_dirigeant') == 'personne physique' for d in lead):
        owner = 'Owner-managed company' if legal.startswith('an ') else legal
        return owner, (f"Run by {legal} (SIREN {siren}){'' if legal.startswith('an ') else ', an owner-managed company'}: the business register lists private "
                       f"individuals as its managers, with no group or investor at the helm, and this is {site_txt}.")
    if len(lead) == 1 and lead[0].get('type_dirigeant') == 'personne morale' and lead[0].get('siren'):
        h = holding_info(lead[0]['siren'], reg)
        if not h or h['sites'] > 3 or not str(h.get('naf') or '').startswith(('64.2', '70.10', '56.', '68.2')):
            return None
        hd = [d for d in h['dirs'] if 'commissaire' not in (d.get('qualite') or '').lower()]
        if not hd or not all(d.get('type_dirigeant') == 'personne physique' for d in hd):
            return None
        hn = (h['name'] or '').title()
        if surnames & set(fold(hn).split()) or {w for d in hd for w in fold(d.get('nom') or '').split() if len(w) > 2} & set(fold(hn).split()):
            hn = 'a family holding'
        owner = 'Owner-managed company' if legal.startswith('an ') else legal
        return f'{owner} (via {hn})', (f"Run by {legal} (SIREN {siren}), whose president is {hn if hn.startswith('a ') else 'the small holding ' + hn}, itself managed by "
                                       f"private individuals; no group or investor appears in the business register, and this is {site_txt}.")
    return None


KIND_BY_TAG = {'shop:bakery': 'Bakery & pastry', 'shop:pastry': 'Bakery & pastry', 'shop:chocolate': 'Bakery & pastry',
               'amenity:cafe': 'Café', 'amenity:bar': 'Wine & cocktail bar', 'amenity:pub': 'Wine & cocktail bar',
               'amenity:ice_cream': 'Other'}
CUISINE_KIND = [
    ('Pizza', r'pizza'), ('Japanese', r'japanese|sushi|ramen|udon|izakaya'), ('Crêperie', r'cr[eê]pe|galette|breton'),
    ('Italian', r'italian|pasta'), ('Middle Eastern', r'lebanese|libanais|middle_eastern|turkish|kebab|syrian|israeli|falafel|greek|persian|iranian|moroccan|maghreb|tunisian|algerian|couscous'),
    ('Mexican & Latin', r'mexican|tacos?|latin|peruvian|brazilian|argentin|colombian'),
    ('Asian', r'chinese|thai|vietnamese|korean|asian|indian|pakistani|nepal|cambodian|laotian|indonesian|malaysian|filipino|sri_lankan|tibetan|dumpling|pho|bao'),
    ('Burgers & chicken', r'burger|chicken|wings'), ('Seafood', r'seafood|fish|oyster'), ('Steak & grill', r'steak|grill|barbecue|bbq|meat'),
    ('Healthy & veggie', r'vegan|vegetarian|salad|healthy|poke|juice'), ('Sandwiches & salads', r'sandwich|bagel|deli'),
    ('Coffee', r'coffee'), ('Bakery & pastry', r'bakery|pastry|cake|chocolate'), ('Brasserie', r'brasserie'),
    ('Wine & cocktail bar', r'wine|cocktail'), ('French bistro', r'french|regional|bistro|auvergne|savoy|alsatian|basque|corsican|lyonnais|southwest'),
]
CU_LABEL = {'french': 'French', 'italian': 'Italian', 'pizza': 'Pizza', 'japanese': 'Japanese', 'sushi': 'Sushi', 'chinese': 'Chinese',
            'thai': 'Thai', 'vietnamese': 'Vietnamese', 'korean': 'Korean', 'indian': 'Indian', 'lebanese': 'Lebanese', 'burger': 'Burgers',
            'crepe': 'Crêpes', 'regional': 'French regional', 'mexican': 'Mexican', 'greek': 'Greek', 'turkish': 'Turkish', 'kebab': 'Kebab',
            'seafood': 'Seafood', 'coffee_shop': 'Coffee', 'vegan': 'Vegan', 'vegetarian': 'Vegetarian', 'ramen': 'Ramen', 'asian': 'Asian'}


def kind_for(kind_tag, tags, name):
    cu = (tags.get('cuisine') or '').lower()
    hay = cu + ' ' + fold(name)
    if kind_tag in ('shop:bakery', 'shop:pastry', 'shop:chocolate'):
        k = 'Bakery & pastry'
    elif re.search(r'\bbouillon\b', fold(name)):
        k = 'Bouillon'
    else:
        k = next((k for k, rx in CUISINE_KIND if re.search(rx, hay)), None) or KIND_BY_TAG.get(kind_tag)
        if not k:
            k = 'Sandwiches & salads' if kind_tag == 'amenity:fast_food' else ('French bistro' if 'french' in cu else 'Other')
    first = cu.split(';')[0].strip()
    label = CU_LABEL.get(first) or (first.replace('_', ' ').capitalize() if first else
                                   {'shop:bakery': 'Bakery', 'shop:pastry': 'Pâtisserie', 'shop:chocolate': 'Chocolatier',
                                    'amenity:cafe': 'Café', 'amenity:bar': 'Bar', 'amenity:pub': 'Pub', 'amenity:ice_cream': 'Ice cream',
                                    'amenity:fast_food': 'Quick bites'}.get(kind_tag, 'Restaurant'))
    price = 1 if kind_tag in ('shop:bakery', 'shop:pastry', 'amenity:fast_food', 'amenity:ice_cream') else 2
    return k, label, price


def main():
    places = enumerate_osm()
    tags = fetch_tags(places)

    covered = set()
    for path in glob.glob(os.path.join(ROOT, 'data', 'research', '*.json')):
        if path.endswith('auto_ind.json'):
            continue
        with open(path) as f:
            for r in json.load(f):
                for n in [r.get('n'), r.get('osm'), *(r.get('osm_alt') or [])]:
                    if n:
                        covered.add(fold(re.sub(r'\(.*?\)', '', n)))
    # names that appear 3+ times in Paris are chains even when OSM lacks a brand tag
    freq = {}
    for p in places.values():
        freq[fold(p['name'])] = freq.get(fold(p['name']), 0) + 1

    cands = []
    for k, p in places.items():
        t = tags.get(k, {})
        fn = fold(p['name'])
        if t.get('brand') or t.get('brand:wikidata') or freq[fn] >= 3 or fn in covered or len(fn) < 3:
            continue
        if t.get('disused:amenity') or t.get('was:amenity') or 'vacant' in fn:
            continue
        if not arr_from_postcode(p['pc']):
            continue
        cands.append((k, p))
    print(f'candidates after removing chains/covered: {len(cands)}')
    if '--max' in sys.argv:
        cands = cands[:int(sys.argv[sys.argv.index('--max') + 1])]

    reg = load('register', {'q': {}, 'h': {}})

    def lookup(kp):
        k, p = kp
        if k in reg['q']:
            return
        d = search_register(p['name'], p['pc'])
        hits = []
        for res in (d or {}).get('results') or []:
            for e in res.get('matching_etablissements') or []:
                if e.get('etat_administratif') != 'A' or not e.get('latitude'):
                    continue
                naf = e.get('activite_principale') or res.get('activite_principale') or ''
                if not naf.startswith(FOOD_NAF):
                    continue
                dm = dist_m(p['ll'], (float(e['latitude']), float(e['longitude'])))
                labels = [*(e.get('liste_enseignes') or []), e.get('nom_commercial') or '', res.get('nom_raison_sociale') or '',
                          res.get('sigle') or '', res.get('nom_complet') or '']
                if dm <= 120 and name_match(p['name'], labels):
                    hits.append({'siren': res['siren'], 'siret': e['siret'], 'dm': round(dm), 'naf': naf,
                                 'res': {x: res.get(x) for x in ('siren', 'nom_raison_sociale', 'nom_complet', 'nombre_etablissements_ouverts', 'dirigeants', 'date_creation')},
                                 'created': e.get('date_creation')})
        reg['q'][k] = sorted(hits, key=lambda h: h['dm'])[:1]

    t0 = time.time()
    todo = [c for c in cands if c[0] not in reg['q']]
    print(f'register lookups to do: {len(todo)}')
    with ThreadPoolExecutor(6) as ex:
        for i, _ in enumerate(ex.map(lookup, todo)):
            if i and i % 200 == 0:
                save('register', reg)
                print(f'  {i}/{len(todo)} looked up ({time.time() - t0:.0f}s)')
    save('register', reg)

    out, seen_siret = [], set()
    for k, p in cands:
        hit = (reg['q'].get(k) or [None])[0]
        if not hit or hit['siret'] in seen_siret:  # one pin per registered establishment
            continue
        seen_siret.add(hit['siret'])
        j = judge(p, hit['res'], reg)
        if not j:
            continue
        owner, note = j
        kd, label, price = kind_for(p['kind'], tags.get(k, {}), p['name'])
        street = ' '.join(x for x in (p.get('hn'), p.get('street')) if x)
        y = (hit.get('created') or '')[:4]
        rec = {'type': 'venue', 'n': p['name'], 'addr': f"{street}, {p['pc']} Paris" if street else f"{p['pc']} Paris",
               'll': p['ll'], 'pc': p['pc'], 'cu': label, 'k': kd, 'pr': price, 'c': 'ind', 'o': owner}
        if y.isdigit() and int(y) > 1900:
            rec['y'] = y
        rec['note'] = note
        rec['src'] = f"https://annuaire-entreprises.data.gouv.fr/entreprise/{hit['siren']}"
        rec['auto'] = 1
        out.append(rec)
    save('register', reg)
    holdings = sum(1 for r in out if '(via ' in r['o'])
    print(f'independent venues confirmed in the register: {len(out)} ({holdings} via a family holding)')
    with open(os.path.join(ROOT, 'data', 'research', 'auto_ind.json'), 'w') as f:
        json.dump(out, f, ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
