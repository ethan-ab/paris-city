#!/usr/bin/env python3
"""Find every Paris address of each researched chain with Exa (called through Treg), to fill gaps in OpenStreetMap.

For each brand in data/research/*.json:
  1. one Exa search for the brand's own list of Paris restaurants/shops (page text attached);
  2. if the brand's own website shows up, a second search restricted to that domain, which surfaces
     the per-location pages of store locators.
Addresses ("13 rue Rambuteau, 75004 Paris") are pulled from the page text with a regex. Only pages on the brand's
own domain, or pages whose title names the brand, count; legal notices / head-office mentions are ignored.

Writes data/exa_branches.json: {brand: [{"addr": ..., "url": ...}, ...]}. scripts/build.py geocodes them (BAN)
and adds those not already on the map from OpenStreetMap.

Raw responses are cached in data/cache/exa/ (gitignored), so re-runs are free.
Needs TREG_TOKEN. Usage: python3 scripts/exa_branches.py [--max-usd 6] [--only "Bioburger,Volfoni"]
"""
import json, os, re, sys, glob, urllib.request, urllib.parse, threading
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'scripts'))
from build import fold  # noqa: E402

CACHE = os.path.join(ROOT, 'data', 'cache', 'exa')
OUT = os.path.join(ROOT, 'data', 'exa_branches.json')
TREG = 'https://treg.to/call/exa.web.search'
MAX_USD = float(sys.argv[sys.argv.index('--max-usd') + 1]) if '--max-usd' in sys.argv else 6.0
ONLY = set(fold(x) for x in sys.argv[sys.argv.index('--only') + 1].split(',')) if '--only' in sys.argv else None

spent = 0.0
lock = threading.Lock()

STREET = (r"(?:rue|boulevard|bd|avenue|av\.|place|quai|passage|cours|galerie|all[ée]e|square|impasse|chauss[ée]e|"
          r"faubourg|rond-point|parvis|cit[ée]|villa|esplanade|carrefour|port|pont|promenade|forum|centre)")
ADDR = re.compile(r"(?<![\d])(\d{1,3}(?:\s?(?:bis|ter|b))?(?:\s?[-/]\s?\d{1,3})?[\s,]+" + STREET + r"\b[^\n|,;()]{2,60}?)"
                  r"[\s,\-–]*\b(75\d{3})\s*,?\s*Paris\b", re.I)
SKIP_CTX = re.compile(r"si[èe]ge|head ?office|bureaux|\brcs\b|siret|capital social|mentions l[ée]gales|immatricul|"
                      r"\bsas\b|\bsarl\b|recrut|postuler|candidat|ferm[ée] d[ée]finitivement|permanently closed", re.I)
# company registries, review sites and directories give head-office or stale addresses
SKIP_HOSTS = ('pappers.fr', 'societe.com', 'data.gouv.fr', 'infogreffe.fr', 'verif.com', 'manageo.fr', 'linkedin.com',
              'pagesjaunes.fr', 'tripadvisor', 'facebook.com', 'instagram.com', 'bodacc.fr', 'lefigaro.fr', 'kompass.com')
SKIP_URL = re.compile(r"mentions|legal|cgv|cgu|privacy|confidential|recrut|jobs?|career|carriere|franchis|presse|press|blog", re.I)


def search(body, key):
    global spent
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, re.sub(r'[^a-z0-9_.-]+', '_', key.lower())[:150] + '.json')
    if os.path.exists(path):
        with open(path) as f:
            return json.load(f)
    with lock:
        if spent >= MAX_USD:
            print(f'  budget reached (${spent:.3f}), skipping {key}', file=sys.stderr)
            return None
    req = urllib.request.Request(TREG, data=json.dumps(body).encode(), method='POST', headers={
        'x-treg-token': os.environ['TREG_TOKEN'], 'content-type': 'application/json'})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                data = json.load(r)
                cost = int(r.headers.get('x-treg-cost-micro') or 0) / 1e6
            break
        except Exception as e:  # noqa: BLE001
            print(f'  retry {attempt + 1} {key}: {e}', file=sys.stderr)
    else:
        return None
    with lock:
        spent += cost
    with open(path, 'w') as f:
        json.dump(data, f, ensure_ascii=False)
    return data


def host(url):
    h = urllib.parse.urlparse(url).netloc.lower()
    return h[4:] if h.startswith('www.') else h


def root_domain(h):
    parts = h.split('.')
    return '.'.join(parts[-3:]) if len(parts) > 2 and parts[-2] in ('co', 'com') else '.'.join(parts[-2:])


def brand_domains(brand, results):
    token = fold(brand).replace(' ', '')
    token = token.replace('and', '') if len(token) > 8 else token
    out = []
    for r in results:
        rd = root_domain(host(r['url']))
        label = re.sub(r'[^a-z0-9]', '', rd.split('.')[0])
        if len(token) >= 3 and (label.startswith(token) or (len(label) >= 4 and token.startswith(label))) and rd not in out:
            out.append(rd)
    return out


# short or ambiguous brand names: match page titles on the full trading name, and the brand's own site
ALIASES = {'Léon': ['Léon de Bruxelles', 'restaurant leon']}
EXTRA_DOMAINS = {'Léon': ['restaurantleon.fr', 'leon-de-bruxelles.fr']}


def extract(brand, results, domains):
    names = [fold(x) for x in ALIASES.get(brand, [brand])]
    title_re = re.compile(r'\b(?:' + '|'.join(map(re.escape, names)) + r')\b')
    found = {}
    for r in results or []:
        url, text, title = r.get('url', ''), r.get('text') or '', fold(r.get('title') or '')
        on_brand_site = root_domain(host(url)) in domains
        if any(h in host(url) for h in SKIP_HOSTS):
            continue
        if not (on_brand_site or title_re.search(title)) or SKIP_URL.search(urllib.parse.urlparse(url).path):
            continue
        for m in ADDR.finditer(text):
            ctx = text[max(0, m.start() - 160): m.end() + 60]
            if SKIP_CTX.search(ctx):
                continue
            street = re.sub(r'\s+', ' ', m.group(1)).strip(' ,-')
            addr = f'{street}, {m.group(2)} Paris'
            found.setdefault(fold(addr), {'addr': addr, 'url': url, 'own': on_brand_site})
    rows = list(found.values())
    # directories and listings go stale: use them only when the brand's own site gave nothing
    own = [r for r in rows if r['own']]
    return [{'addr': r['addr'], 'url': r['url']} for r in (own or rows)]


def run_brand(brand):
    q1 = f'{brand} official website: list of all our restaurants and shops in Paris with their street addresses'
    d1 = search({'query': q1, 'numResults': 10, 'userLocation': 'FR', 'contents': {'text': {'maxCharacters': 12000}}},
                f'p1_{fold(brand)}')
    res = (d1 or {}).get('results') or []
    domains = brand_domains(brand, res) + EXTRA_DOMAINS.get(brand, [])
    if domains:
        d2 = search({'query': f'{brand} Paris restaurant boutique adresse 750', 'numResults': 40, 'includeDomains': domains,
                     'contents': {'text': {'maxCharacters': 5000}}}, f'p2_40_{fold(brand)}')
        res = res + ((d2 or {}).get('results') or [])
    return brand, domains, extract(brand, res, domains)


def main():
    brands = []
    for path in sorted(glob.glob(os.path.join(ROOT, 'data', 'research', '*.json'))):
        with open(path) as f:
            for r in json.load(f):
                if r.get('type') == 'brand' and r['n'] not in brands and (not ONLY or fold(r['n']) in ONLY):
                    brands.append(r['n'])
    print(len(brands), 'brands')
    out = {}
    if os.path.exists(OUT) and ONLY:
        with open(OUT) as f:
            out = json.load(f)
    with ThreadPoolExecutor(6) as ex:
        for brand, domains, addrs in ex.map(run_brand, brands):
            out[brand] = addrs
            print(f'  {brand:32s} {len(addrs):3d} addresses  {",".join(domains)}')
    with open(OUT, 'w') as f:
        json.dump(dict(sorted(out.items())), f, ensure_ascii=False, indent=1)
    print(f'wrote {OUT}: {sum(map(len, out.values()))} addresses; spent this run ${spent:.3f}')


if __name__ == '__main__':
    main()
