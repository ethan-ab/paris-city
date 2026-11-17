# Paris Food Money Matrix

Who's really behind Paris's restaurants, cafés, bistros and bakeries: private equity, big corporates, VC, or independent.
A Paris take on the [London Food Money Matrix](https://london-food-money-matrix.vercel.app). See [GOAL.md](GOAL.md) for the stack breakdown.

- `src/` – page template and app script (vanilla JS + MapLibre GL + OpenFreeMap tiles)
- `data/research/*.json` – sourced ownership research (brands and single venues)
- `scripts/discover.py` – finds independents at scale: every named food place in Paris on OpenStreetMap (~18k), minus chains, matched to its company in the French business register (recherche-entreprises / annuaire-entreprises); kept as independent only when the register shows an owner-managed business (≤3 sites, run by individuals or a small family holding). Writes `data/research/auto_ind.json`
- `scripts/build.py` – places brands' Paris branches from OpenStreetMap, geocodes venues (BAN), writes `public/`
- `public/` – the deployed static site (Vercel, `vercel.json`)
- `supabase/schema.sql` – optional insert-only table for "Suggest a place"

```bash
python3 scripts/discover.py   # slow first run (~1h of register lookups), cached afterwards
python3 scripts/build.py --artifact
```
