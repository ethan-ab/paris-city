// Dataset integrity: every pin on the map must be well-formed, inside Paris and sourced.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { PLACES, COUNTS, slug, ROOT } = require('./helpers');

const KINDS = ['Bakery & pastry', 'Coffee', 'Café', 'Burgers & chicken', 'Pizza', 'Italian', 'Japanese', 'Asian', 'French bistro',
  'Brasserie', 'Bouillon', 'Fine dining', 'Wine & cocktail bar', 'Sandwiches & salads', 'Healthy & veggie', 'Middle Eastern',
  'Mexican & Latin', 'Steak & grill', 'Seafood', 'Crêperie', 'Other'];
const ARR = /^(1er|([2-9]|1[0-9]|20)e) · \S/;
const research = fs.readdirSync(path.join(ROOT, 'data', 'research')).filter(f => f.endsWith('.json'))
  .flatMap(f => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'research', f), 'utf8')).map(r => ({ ...r, _file: f })));

test.describe('places.json', () => {
  test('has a substantial dataset in every category', () => {
    expect(PLACES.length).toBeGreaterThan(600);
    expect(COUNTS.pe).toBeGreaterThan(100);
    expect(COUNTS.corp).toBeGreaterThan(100);
    expect(COUNTS.ind).toBeGreaterThan(200);
    expect(COUNTS.vc).toBeGreaterThan(0);
    expect(Object.keys(COUNTS).sort()).toEqual(['corp', 'ind', 'pe', 'vc']);
  });

  test('every place has the required fields with valid values', () => {
    const bad = [];
    for (const p of PLACES) {
      const why = [];
      if (!p.n || typeof p.n !== 'string') why.push('name');
      if (!['pe', 'vc', 'corp', 'ind'].includes(p.c)) why.push('category');
      if (!KINDS.includes(p.k)) why.push('kind ' + p.k);
      if (!(Number.isInteger(p.pr) && p.pr >= 1 && p.pr <= 4)) why.push('price');
      if (!ARR.test(p.area || '')) why.push('area ' + p.area);
      if (!p.o) why.push('owner');
      if (Array.isArray(p.auto)) {
        // register-matched independents ship compact: [SIREN, sites]; the app builds note + annuaire link from them
        if (!/^\d{9}$/.test(p.auto[0]) || !(p.auto[1] >= 1)) why.push('auto ' + p.auto);
      } else {
        if (!p.note || p.note.length < 15) why.push('note');
        if (!/^https:\/\/[^\s]+\.[a-z]{2,}/i.test(p.src || '')) why.push('src ' + p.src);
      }
      if (p.y !== undefined && typeof p.y !== 'string') why.push('year type');
      if (why.length) bad.push(`${p.n}: ${why.join(', ')}`);
    }
    expect(bad).toEqual([]);
  });

  test('every place sits inside Paris intra-muros', () => {
    const out = PLACES.filter(p => !(Array.isArray(p.ll) && p.ll[0] > 48.815 && p.ll[0] < 48.903 && p.ll[1] > 2.224 && p.ll[1] < 2.47));
    expect(out.map(p => p.n)).toEqual([]);
  });

  test('names and deep-link slugs are unique', () => {
    const dup = (arr) => arr.filter((x, i) => arr.indexOf(x) !== i);
    expect(dup(PLACES.map(p => p.n))).toEqual([]);
    expect(dup(PLACES.map(p => slug(p.n)))).toEqual([]);
  });

  test('no two pins of the same brand are stacked on the same spot', () => {
    const seen = new Map(), stacked = [];
    for (const p of PLACES) {
      const key = p.n.split(' · ')[0].replace(/ \(\d+\)$/, '') + '@' + p.ll.map(v => v.toFixed(4)).join(',');
      if (seen.has(key)) stacked.push(`${p.n} / ${seen.get(key)}`); else seen.set(key, p.n);
    }
    expect(stacked).toEqual([]);
  });

  test('arrondissement label matches the coordinates roughly (no pins geocoded to the wrong side of Paris)', () => {
    // Mean position per arrondissement; any pin more than 4 km from its arrondissement's mean is suspicious.
    const groups = {};
    PLACES.forEach(p => (groups[p.area] = groups[p.area] || []).push(p));
    const far = [];
    for (const [area, ps] of Object.entries(groups)) {
      const lat = ps.reduce((s, p) => s + p.ll[0], 0) / ps.length, lng = ps.reduce((s, p) => s + p.ll[1], 0) / ps.length;
      // The 12e and 16e include the Bois de Vincennes and Bois de Boulogne, so they stretch much further.
      const limit = /^1[26]e/.test(area) ? 7 : 4;
      ps.forEach(p => { const dy = (p.ll[0] - lat) * 111, dx = (p.ll[1] - lng) * 73; if (Math.hypot(dx, dy) > limit) far.push(`${p.n} (${area})`); });
    }
    expect(far).toEqual([]);
  });
});

test.describe('research files', () => {
  test('every research record is sourced and categorised', () => {
    const bad = research.filter(r => !r.n || !r.src || !['pe', 'vc', 'corp', 'ind'].includes(r.c) || !['brand', 'venue'].includes(r.type)
      || (r.type === 'venue' && !r.addr));
    expect(bad.map(r => `${r._file}: ${r.n}`)).toEqual([]);
  });

  test('every brand and venue in the research ends up on the map (or is a known OSM gap)', () => {
    // Sourced brands with no branch inside Paris intra-muros on OpenStreetMap (suburban formats or not mapped yet).
    const KNOWN_GAPS = ['Bchef', 'Boulangerie Louise', 'Puffy', 'Volfoni', 'Meatpack', 'Copper Branch', 'Del Arte', 'Marie Blachère', 'Buffalo Grill', 'Bazurto', 'Café de Luce'];
    // Compare deep-link slugs: a register match spelled "Cafe Français" merges into the researched "Café Français" on the same spot.
    const names = new Set(PLACES.map(p => slug(p.n.split(' · ')[0].replace(/ \(\d+\)$/, ''))));
    const missing = research.filter(r => !names.has(slug(r.n)) && !KNOWN_GAPS.includes(r.n)).map(r => r.n);
    expect(missing).toEqual([]);
  });
});

test.describe('built pages', () => {
  const extract = html => JSON.parse(html.match(/const PLACES = (\[.*?\]);\n/s)[1]);

  test('public/index.html embeds exactly data/places.json', () => {
    const html = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
    expect(extract(html)).toEqual(PLACES);
    expect(html).toContain('<script src="app.js"></script>');
    expect(fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8')).toBe(fs.readFileSync(path.join(ROOT, 'src', 'app.js'), 'utf8'));
  });

  test('artifact build is self-contained and embeds the same data', () => {
    const html = fs.readFileSync(path.join(ROOT, 'artifact', 'paris-food-money-matrix.html'), 'utf8');
    expect(extract(html)).toEqual(PLACES);
    expect(html).toContain('window.BASEMAP=');
    expect(html).not.toMatch(/<link rel="stylesheet" href="https:\/\/unpkg/);
    expect(html).not.toContain('<script src="app.js">');
    expect(html).not.toMatch(/<!doctype|<html|<body/i);
    expect(html.length).toBeLessThan(16 * 1024 * 1024);
  });

  test('site page stays light (under 1 MB over the wire)', () => {
    // ~8,000 places are inlined; Vercel serves the page compressed, so the gzip size is what visitors download.
    const gz = require('zlib').gzipSync(fs.readFileSync(path.join(ROOT, 'public', 'index.html'))).length;
    expect(gz).toBeLessThan(1024 * 1024);
  });

  test('vercel.json serves the public folder', () => {
    const v = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
    expect(v.outputDirectory).toBe('public');
  });
});
