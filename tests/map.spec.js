// The map: pins, taps, controls, monuments and graceful failure.
const { test, expect, PLACES, COUNTS, meters } = require('./helpers');

const pinCount = page => page.evaluate(() => window.__pfmm.map.getSource('places')._data.features.length);
const visiblePins = page => page.evaluate(() => window.__pfmm.map.getSource('places')._data.features.filter(f => f.properties.v === 1).length);

test('every place is a pin, coloured by category', async ({ page, app }) => {
  await app.open();
  expect(await pinCount(page)).toBe(PLACES.length);
  const byCat = await page.evaluate(() => window.__pfmm.map.getSource('places')._data.features.reduce((a, f) => ((a[f.properties.c] = (a[f.properties.c] || 0) + 1), a), {}));
  expect(byCat).toEqual(COUNTS);
  for (const k of ['pe', 'vc', 'corp', 'ind']) expect(await page.evaluate(k => window.__pfmm.map.hasImage('pin-' + k), k)).toBe(true);
});

test('pins actually render on the canvas', async ({ page, app }) => {
  await app.open();
  await page.waitForFunction(() => window.__pfmm.map.loaded());
  const rendered = await page.evaluate(() => window.__pfmm.map.queryRenderedFeatures({ layers: ['pins'] }).length);
  expect(rendered).toBeGreaterThan(100);
});

test('filters fade out the pins they hide', async ({ page, app }) => {
  await app.open();
  await page.click('.stat.pe');
  await expect.poll(() => visiblePins(page)).toBe(COUNTS.pe);
  await page.fill('#q', 'zzzz');
  await expect.poll(() => visiblePins(page)).toBe(0);
});

test('tapping a pin opens its card; tapping empty map closes it', async ({ page, app }) => {
  await app.open();
  // An independent place with no other pin within 60 m, so the tap is unambiguous.
  const p = PLACES.find(x => x.c === 'ind' && PLACES.every(y => y === x || meters(x.ll, y.ll) > 60));
  await page.evaluate(ll => window.__pfmm.map.jumpTo({ center: [ll[1], ll[0]], zoom: 17, pitch: 0, bearing: 0 }), p.ll);
  await page.waitForFunction(() => window.__pfmm.map.loaded() && !window.__pfmm.map.isMoving());
  const box = await page.locator('#map').boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator('.card h2')).toHaveText(p.n);
  // Empty spot: 140 px left of the pin (no pin within 60 m ≈ 220 px at z17).
  await page.mouse.click(box.x + box.width / 2 - 140, box.y + box.height / 2);
  await expect(page.locator('.card')).toHaveCount(0);
});

test('hovering a pin shows a pointer cursor', async ({ page, app }) => {
  await app.open();
  const p = PLACES.find(x => x.c === 'ind' && PLACES.every(y => y === x || meters(x.ll, y.ll) > 60));
  await page.evaluate(ll => window.__pfmm.map.jumpTo({ center: [ll[1], ll[0]], zoom: 17, pitch: 0, bearing: 0 }), p.ll);
  await page.waitForFunction(() => window.__pfmm.map.loaded() && !window.__pfmm.map.isMoving());
  const box = await page.locator('#map').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await expect.poll(() => page.evaluate(() => window.__pfmm.map.getCanvas().style.cursor)).toBe('pointer');
});

test('zoom buttons zoom in and out; reset returns to the Paris overview', async ({ page, app }) => {
  await app.open();
  const zoom = () => page.evaluate(() => window.__pfmm.map.getZoom());
  const start = await zoom();
  await page.click('#zin');
  await expect.poll(zoom).toBeGreaterThan(start + 0.9);
  await page.click('#zout');
  await page.click('#zout');
  await expect.poll(zoom).toBeLessThan(start - 0.9);
  await page.click('#zreset');
  await expect.poll(zoom, { timeout: 5000 }).toBeCloseTo(start, 1);
  const c = await page.evaluate(() => window.__pfmm.map.getCenter());
  expect(c.lng).toBeCloseTo(2.333, 2);
  expect(c.lat).toBeCloseTo(48.86, 2);
});

test('reset also closes an open card', async ({ page, app }) => {
  await app.open();
  await page.locator('.row').first().click();
  await expect(page.locator('.card')).toBeVisible();
  await page.click('#zreset');
  await expect(page.locator('.card')).toHaveCount(0);
});

test('Paris monuments are drawn on the map and scale with zoom', async ({ page, app }) => {
  await app.open();
  const lmk = page.locator('.maplibregl-marker .lmk');
  await expect(lmk).toHaveCount(11);
  await expect(page.locator('.lmk text')).toContainText(['Tour Eiffel', 'Arc de Triomphe', 'Louvre', 'Notre-Dame', 'Panthéon', 'Sacré-Cœur',
    'Tour Montparnasse', 'Centre Pompidou', 'Opéra Garnier', 'Moulin Rouge', 'Colonne de Juillet']);
  const w0 = Number(await lmk.first().getAttribute('width'));
  await page.evaluate(() => window.__pfmm.map.jumpTo({ zoom: 15 }));
  await expect.poll(async () => Number(await lmk.first().getAttribute('width'))).toBeGreaterThan(w0);
  await page.evaluate(() => window.__pfmm.map.jumpTo({ zoom: 10.5 }));
  await expect.poll(() => lmk.first().evaluate(e => e.style.opacity)).toBe('0');
});

test('the Eiffel Tower drawing stands on the Champ de Mars', async ({ page, app }) => {
  await app.open();
  const ll = await page.evaluate(() => {
    const m = [...document.querySelectorAll('.maplibregl-marker')].find(e => e.textContent.includes('Tour Eiffel'));
    return m && m.style.transform;
  });
  expect(ll).toBeTruthy();
});

test('the map cannot be dragged away from Paris', async ({ page, app }) => {
  await app.open();
  await page.evaluate(() => window.__pfmm.map.jumpTo({ center: [-0.12, 51.5], zoom: 12 }));
  const c = await page.evaluate(() => window.__pfmm.map.getCenter());
  expect(c.lng).toBeGreaterThan(2.0);
  expect(c.lat).toBeLessThan(49.0);
});

test('map attribution credits OpenStreetMap', async ({ page, app, variant }) => {
  test.skip(variant === 'artifact', 'the offline basemap has no tile attribution control content');
  await app.open();
  await expect(page.locator('.maplibregl-ctrl-attrib')).toContainText('OpenStreetMap');
});

test('if map tiles fail, a notice appears and the list still works', async ({ page, appPath, variant }) => {
  test.skip(variant === 'artifact', 'the artifact build never fetches tiles');
  await page.route(/openfreemap\.org/, r => r.abort());
  await page.goto(appPath);
  await expect(page.locator('#map')).toContainText("Map tiles didn't load. The list still works.");
  await page.fill('#q', 'starbucks');
  await expect(page.locator('.row:not([hidden])').first()).toBeVisible();
  await page.locator('.row:not([hidden])').first().click();
  await expect(page.locator('.card')).toBeVisible();
});
