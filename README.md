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
