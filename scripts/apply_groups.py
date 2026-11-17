#!/usr/bin/env python3
"""Turn researched group ownership into map pins.

data/groups_candidates.json  (written by the register pass: venues run by a holding/group rather than individuals)
data/research/groups_classified.json  (researched: who controls each group, with a source)
-> data/research/group_venues.json: one venue record per OSM place, carrying the group's category, owner, note and source.
"""
import json, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build import ROOT, fold  # noqa: E402
from discover import kind_for, load  # noqa: E402


def main():
    with open(os.path.join(ROOT, 'data', 'groups_candidates.json')) as f:
        cands = {g['group_siren']: g for g in json.load(f)}
    with open(os.path.join(ROOT, 'data', 'research', 'groups_classified.json')) as f:
        classified = json.load(f)
    osm, tags = load('osm', {}), load('tags', {})
    out, seen, missing = [], set(), 0
    for g in classified:
        if g.get('c') not in ('pe', 'vc', 'corp', 'ind') or not g.get('src'):
            continue
        cand = cands.get(str(g.get('group_siren')))
        if not cand:
            missing += 1
            continue
        for v in cand['venues']:
            p = osm.get(v['osm_key'])
            if not p or v['osm_key'] in seen:
                continue
            seen.add(v['osm_key'])
            k, label, price = kind_for(p['kind'], tags.get(v['osm_key'], {}), p['name'])
            street = ' '.join(x for x in (p.get('hn'), p.get('street')) if x)
            brand = g.get('brand')
            rec = {'type': 'venue', 'n': p['name'], 'addr': f"{street}, {p['pc']} Paris" if street else f"{p['pc']} Paris",
                   'll': p['ll'], 'pc': p['pc'], 'cu': label, 'k': k, 'pr': price, 'c': g['c'],
                   'o': g.get('o') or g.get('group_name'), 'note': g.get('note', ''), 'src': g['src']}
            if g.get('y'):
                rec['y'] = str(g['y'])
            if brand and fold(brand) not in fold(p['name']):
                rec['note'] = f"Part of {brand}. " + rec['note']
            out.append(rec)
    with open(os.path.join(ROOT, 'data', 'research', 'group_venues.json'), 'w') as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    by = {}
    for r in out:
        by[r['c']] = by.get(r['c'], 0) + 1
    print(f'group venues: {len(out)} {by} (classified groups not found in candidates: {missing})')


if __name__ == '__main__':
    main()
