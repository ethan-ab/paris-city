// The self-contained build must work with nothing but the MapLibre script and Google Fonts (the claude.ai sandbox).
const { test, expect, PLACES, shown } = require('./helpers');

test.skip(({ variant }) => variant !== 'artifact', 'artifact-only checks');

const ALLOWED = new Set(['localhost:4173', 'unpkg.com', 'fonts.googleapis.com', 'fonts.gstatic.com']);

test('only contacts hosts the sandbox allows', async ({ page, app, hosts }) => {
  await app.open();
  await page.waitForTimeout(1000);
  expect([...hosts].filter(h => !ALLOWED.has(h))).toEqual([]);
});

test('draws the baked basemap: Seine, parks and roads', async ({ page, app }) => {
  await app.open();
  const counts = await page.evaluate(() => {
    const s = window.__pfmm.map.getStyle();
    return Object.fromEntries(['water', 'park', 'wood', 'road', 'rail'].map(k => [k, s.sources[k] && s.sources[k].data.features.length]));
  });
  expect(counts.water).toBeGreaterThan(10);
  expect(counts.road).toBeGreaterThan(1000);
  await page.waitForFunction(() => window.__pfmm.map.loaded());
  const water = await page.evaluate(() => window.__pfmm.map.queryRenderedFeatures({ layers: ['water'] }).length);
  expect(water).toBeGreaterThan(0);
});

test('all places and the full app work offline', async ({ page, app, errors }) => {
  await app.open();
  await expect.poll(() => shown(page)).toBe(PLACES.length);
  await page.locator('.row').first().click();
  await expect(page.locator('.card .alts .alt')).toHaveCount(3);
  expect(errors).toEqual([]);
});
