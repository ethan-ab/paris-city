// Phone layout: header, then map, then list; the card becomes a bottom sheet.
const { test, expect, PLACES } = require('./helpers');
const { devices } = require('@playwright/test');

test.use({ ...devices['Pixel 7'] });

test.beforeEach(async ({ app }) => { await app.open(); });

test('stacks header, map and list, with no sideways scroll', async ({ page }) => {
  const head = await page.locator('.head').boundingBox();
  const map = await page.locator('#mapwrap').boundingBox();
  const list = await page.locator('.listwrap').boundingBox();
  expect(head.y).toBeLessThan(map.y);
  expect(map.y).toBeLessThan(list.y);
  const vw = page.viewportSize().width;
  expect(map.width).toBeLessThanOrEqual(vw);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(vw);
  await expect(page.locator('.legend')).toBeHidden();
});

test('the three stat buttons fit on one row', async ({ page }) => {
  const boxes = await page.locator('.stat').evaluateAll(els => els.map(e => e.getBoundingClientRect().top));
  expect(new Set(boxes.map(Math.round)).size).toBe(1);
});

test('tapping a list row scrolls up to the map and shows a bottom sheet', async ({ page }) => {
  const p = PLACES.find(x => x.c === 'pe');
  await page.fill('#q', p.n);
  const row = page.locator('.row:not([hidden])').first();
  await row.scrollIntoViewIfNeeded();
  await row.tap();
  const card = page.locator('.card');
  await expect(card.locator('h2')).toHaveText(p.n);
  await expect.poll(async () => (await page.locator('#mapwrap').boundingBox()).y).toBeLessThan(50);
  const cb = await card.boundingBox(), mb = await page.locator('#mapwrap').boundingBox();
  expect(cb.y + cb.height).toBeCloseTo(mb.y + mb.height - 10, -1);
  expect(cb.width).toBeGreaterThan(page.viewportSize().width - 30);
});

test('taps on the map use a finger-sized target', async ({ page }) => {
  const p = PLACES.find(x => x.c === 'ind' && PLACES.every(y => y === x || Math.hypot((x.ll[0] - y.ll[0]) * 111000, (x.ll[1] - y.ll[1]) * 73000) > 80));
  await page.locator('#mapwrap').scrollIntoViewIfNeeded();
  await page.evaluate(ll => window.__pfmm.map.jumpTo({ center: [ll[1], ll[0]], zoom: 17, pitch: 0, bearing: 0 }), p.ll);
  await page.waitForFunction(() => window.__pfmm.map.loaded() && !window.__pfmm.map.isMoving());
  const box = await page.locator('#map').boundingBox();
  await page.touchscreen.tap(box.x + box.width / 2 + 16, box.y + box.height / 2 + 12); // 20 px off the pin
  await expect(page.locator('.card h2')).toHaveText(p.n);
});
