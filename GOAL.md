# /goal — Paris Food Money Matrix

**Goal:** copy the [London Food Money Matrix](https://london-food-money-matrix.vercel.app) (by [@therosieum](https://x.com/therosieum/status/2121968498976977174))
feature-for-feature, tailored to Paris, and ship it on Vercel.

> "a map of ~600 London restaurants, cafés and pubs and who owns them, whether that's private equity, big corporates, or independent.
> look up a place before you go, and if it's PE-owned it'll show you an indie spot nearby."

## Reverse-engineered stack (London original)
| Layer | What they use |
|---|---|
| Page | One static `index.html`, no framework, vanilla JS, data inlined as a JSON array (~1.4 MB) |
| Map | MapLibre GL JS 4.7.1 (unpkg) + OpenFreeMap `positron` vector tiles, restyled client-side to a "paper" palette, 3D building extrusions, pitch 42° |
| Pins | Canvas-drawn symbol icons per category (PE square, VC diamond, Corporate ring, Independent dot) in a GeoJSON symbol layer |
| Landmarks | Hand-drawn inline SVG monuments as MapLibre markers + a torn-paper skyline header |
| Fonts | Google Fonts: Lora (serif headlines) + Figtree (UI) |
| Data | Per place: name, street, area, lat/lng, cuisine, food type, price 1–4, category, owner, since, note, source URL. Chain branches placed from OpenStreetMap |
| "Suggest a place" | Form → Supabase REST insert-only `submissions` table (publishable key, honeypot field) |
| Hosting | Vercel static deployment |

## Features to match (all done)
- [x] Rail: skyline, title, dek, 3 stat buttons (PE / Independent / Corp & VC) that filter, proportional bar
- [x] Search (name, owner, street), area filter, food-type filter, grouped ledger list with sticky headers, price ladder
- [x] Map with paper style, 3D buildings, monument drawings, category pins, forgiving taps, zoom/reset controls, legend
- [x] Detail card: category tag, owner, since, note, source link, **"Independent nearby"** (same food type first, walking time)
- [x] Deep links `#slug`, Escape to close, mobile layout (map then list, bottom sheet card)
- [x] Suggest-a-place modal (Supabase if configured, otherwise a pre-filled GitHub issue)

## Paris tailoring
- Monuments: Tour Eiffel, Arc de Triomphe, Louvre, Notre-Dame, Panthéon, Sacré-Cœur, Tour Montparnasse, Centre Pompidou, Opéra Garnier, Moulin Rouge, Colonne de Juillet
- Areas = the 20 arrondissements with their neighbourhood names; prices in €
- Food types: bouillons, brasseries, bistros, crêperies, bakeries & pâtisseries…
- Ownership research from French sources (LSA, Les Echos, CFNEWS, Snacking, annuaire-entreprises.data.gouv.fr, Pappers, Le Fooding…)
- Addresses geocoded with the French national address base (BAN); chain branches from OpenStreetMap via Photon
