const base = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PLACES = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'places.json'), 'utf8'));
const COUNTS = PLACES.reduce((a, p) => ((a[p.c] = (a[p.c] || 0) + 1), a), {});

const fold = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const slug = n => fold(n).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const meters = (a, b) => {
  const R = 6371000, r = Math.PI / 180, dl = (b[0] - a[0]) * r, dg = (b[1] - a[1]) * r;
  const h = Math.sin(dl / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dg / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
/** Reference implementation of "Independent nearby", used to check the app's choice. */
function expectedAlternatives(i) {
  const p = PLACES[i];
  const pool = PLACES.map((q, j) => ({ j, q })).filter(x => x.q.c === 'ind' && x.j !== i).map(x => ({ ...x, m: meters(p.ll, x.q.ll) }));
  const same = pool.filter(x => x.q.k === p.k && x.m < 2500).sort((a, b) => a.m - b.m);
  const any = [...pool].sort((a, b) => a.m - b.m);
  const out = same.slice(0, 2);
  for (const x of any) { if (out.length >= 3) break; if (!out.includes(x)) out.push(x); }
  return out.sort((a, b) => a.m - b.m).map(x => x.j);
}

const test = base.test.extend({
  appPath: ['/public/index.html', { option: true }],
  variant: ['site', { option: true }],
  /** Console errors and page errors collected during the test (WebGL performance chatter excluded). */
  errors: async ({ page }, use) => {
    const errs = [];
    page.on('pageerror', e => errs.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/GL Driver|WebGL|GPU stall/i.test(m.text())) errs.push('console: ' + m.text()); });
    await use(errs);
  },
  /** Every network host the page contacted. */
  hosts: async ({ page }, use) => {
    const set = new Set();
    page.on('request', r => { try { set.add(new URL(r.url()).host); } catch {} });
    await use(set);
  },
  /** Open the app and wait until the map has its pins. The artifact build runs with tile hosts blocked. */
  app: async ({ page, appPath, variant }, use) => {
    if (variant === 'artifact') await page.route(/openfreemap\.org/, r => r.abort());
    const open = async (hash = '', opts = {}) => {
      await page.goto(appPath + hash);
      if (opts.waitMap !== false) await page.waitForFunction(() => window.__pfmm && window.__pfmm.isReady(), null, { timeout: 30_000 });
    };
    await use({ open, appPath, variant });
  },
});

/** Rows currently shown in the list. */
const visibleRows = page => page.locator('.row:not([hidden])');
const countText = page => page.locator('#count');

module.exports = { test, expect: base.expect, PLACES, COUNTS, fold, slug, meters, expectedAlternatives, visibleRows, countText, ROOT };
