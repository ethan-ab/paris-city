# Paris Food Money Matrix

Who's really behind Paris's restaurants, cafés, bistros and bakeries: private equity, big corporates, VC, or independent.
A Paris take on the [London Food Money Matrix](https://london-food-money-matrix.vercel.app). See [GOAL.md](GOAL.md) for the stack breakdown.

- `src/` – page template and app script (vanilla JS + MapLibre GL + OpenFreeMap tiles)
- `data/research/*.json` – sourced ownership research (brands and single venues)
- `scripts/build.py` – places brands' Paris branches from OpenStreetMap, geocodes venues (BAN), writes `public/`
- `public/` – the deployed static site (Vercel, `vercel.json`)
- `supabase/schema.sql` – optional insert-only table for "Suggest a place"

```bash
python3 scripts/build.py
```

## Tests

```bash
npm install
npm run build   # python3 scripts/build.py --offline --artifact
npm test        # Playwright: data integrity + end-to-end on both builds
```

`tests/` covers the dataset (fields, sources, Paris bounds, unique deep links), the rail (stats, search, filters, grouping),
the detail card (owner, source, "Independent nearby", deep links, keyboard), the map (pins, taps, zoom, monuments, tile failure),
"Suggest a place" (validation, GitHub fallback, Supabase path mocked), the phone layout, the offline artifact build and HTML escaping.
Every browser spec runs twice: against `public/` (live tiles) and against the self-contained artifact (tile hosts blocked).
