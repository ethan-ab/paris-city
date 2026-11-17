#!/usr/bin/env python3
"""Apply sourced ownership corrections (data/research/corrections.json) to the research files in place.

Each item: {"file", "n", "set": {...fields}, "why", "src"} or {"file", "n", "remove": true, "why", "src"}.
A correction's "src" replaces the record's source unless "set" gives one. Applied items are reported; misses are listed.
"""
import json, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build import ROOT, fold  # noqa: E402

FIELDS = {'c', 'o', 'y', 'note', 'src', 'n', 'osm', 'osm_alt', 'cu', 'k', 'pr', 'addr'}


def main():
    path = os.path.join(ROOT, 'data', 'research', 'corrections.json')
    with open(path) as f:
        items = json.load(f)
    files, done, misses = {}, 0, []
    for it in items:
        fn = os.path.basename(it.get('file', ''))
        fp = os.path.join(ROOT, 'data', 'research', fn)
        if not os.path.exists(fp):
            misses.append(f"no file {fn}: {it.get('n')}")
            continue
        if fn not in files:
            with open(fp) as f:
                files[fn] = json.load(f)
        rows = files[fn]
        key = 'group_name' if fn == 'groups_classified.json' else 'n'
        hit = [r for r in rows if fold(r.get(key)) == fold(it.get('n'))]
        if not hit:
            misses.append(f"not found in {fn}: {it.get('n')}")
            continue
        if it.get('remove'):
            files[fn] = [r for r in rows if r not in hit]
        else:
            for r in hit:
                upd = {k: v for k, v in (it.get('set') or {}).items() if k in FIELDS}
                if it.get('src') and 'src' not in upd:
                    upd['src'] = it['src']
                r.update(upd)
        done += 1
    for fn, rows in files.items():
        with open(os.path.join(ROOT, 'data', 'research', fn), 'w') as f:
            json.dump(rows, f, ensure_ascii=False, indent=1)
    print(f'applied {done}/{len(items)} corrections')
    for m in misses:
        print('  !', m)


if __name__ == '__main__':
    main()
