// The detail card: ownership facts, source link, independent alternatives, deep links and keyboard use.
const { test, expect, PLACES, slug, expectedAlternatives } = require('./helpers');

const rowFor = (page, name) => page.locator('.row', { has: page.locator('b', { hasText: name }) }).filter({ visible: true }).first();
const firstOf = c => PLACES.findIndex(p => p.c === c);

test('clicking a PE row opens its card with backer, year, note and source', async ({ page, app }) => {
  await app.open();
  const p = PLACES.find(x => x.c === 'pe' && x.y);
  await page.fill('#q', p.n);
  await rowFor(page, p.n).click();
  const card = page.locator('.card');
  await expect(card.locator('h2')).toHaveText(p.n);
  await expect(card.locator('.tag')).toHaveText('PE-backed');
  await expect(card.locator('dt').first()).toHaveText('Backer');
  await expect(card.locator('dd').first()).toHaveText(p.o);
  await expect(card.locator('dd').nth(1)).toHaveText(p.y);
  await expect(card.locator('p').first()).toHaveText(p.note);
  const src = card.locator('a.src');
  await expect(src).toHaveAttribute('href', p.src);
  await expect(src).toHaveAttribute('target', '_blank');
  await expect(src).toContainText(new URL(p.src).hostname.replace(/^www\./, ''));
  await expect(rowFor(page, p.n)).toHaveClass(/on/);
});

test('a PE card suggests up to three independents nearby, same food first, nearest first', async ({ page, app }) => {
  await app.open();
  const i = firstOf('pe'), p = PLACES[i];
  await page.fill('#q', p.n);
  await rowFor(page, p.n).click();
  const alts = page.locator('.card .alt');
  const want = expectedAlternatives(i);
  await expect(alts).toHaveCount(want.length);
  expect(want.length).toBe(3);
  await expect(page.locator('.alts h3')).toHaveText('Independent nearby');
  await expect(alts.locator('b')).toHaveText(want.map(j => PLACES[j].n));
  expect(await page.evaluate(() => window.__pfmm.nearIds())).toEqual(want);
  for (const t of await alts.locator('i').allTextContents()) expect(t).toMatch(/^(\d+ min walk|\d+\.\d km)$/);
});

test('clicking an alternative jumps to that independent place', async ({ page, app }) => {
  await app.open();
  const i = firstOf('corp');
  await page.fill('#q', PLACES[i].n);
  await rowFor(page, PLACES[i].n).click();
  const target = PLACES[expectedAlternatives(i)[0]];
  await page.locator('.card .alt').first().click();
  await expect(page.locator('.card h2')).toHaveText(target.n);
  await expect(page.locator('.card .tag')).toHaveText('Independent');
  await expect(page).toHaveURL(new RegExp('#' + slug(target.n) + '$'));
});

test('an independent card says "Owned by" and offers no alternatives', async ({ page, app }) => {
  await app.open();
  const p = PLACES[firstOf('ind')];
  await page.fill('#q', p.n);
  await rowFor(page, p.n).click();
  await expect(page.locator('.card dt').first()).toHaveText('Owned by');
  await expect(page.locator('.card .alts')).toHaveCount(0);
  expect(await page.evaluate(() => window.__pfmm.nearIds())).toEqual([]);
});

test('VC and Corporate cards use their own tag', async ({ page, app }) => {
  await app.open();
  for (const [c, label] of [['vc', 'VC-backed'], ['corp', 'Corporate']]) {
    const p = PLACES[firstOf(c)];
    await page.fill('#q', p.n);
    await rowFor(page, p.n).click();
    await expect(page.locator('.card .tag')).toHaveText(label);
  }
});

test('selecting a place writes a shareable #slug; closing clears it', async ({ page, app }) => {
  await app.open();
  const p = PLACES[firstOf('ind')];
  await page.fill('#q', p.n);
  await rowFor(page, p.n).click();
  await expect(page).toHaveURL(new RegExp('#' + slug(p.n) + '$'));
  await page.click('.card .x');
  await expect(page.locator('.card')).toHaveCount(0);
  await expect(page).not.toHaveURL(/#/);
  expect(await page.evaluate(() => window.__pfmm.selected())).toBeNull();
});

test('opening a #slug link shows that place straight away', async ({ page, app }) => {
  const p = PLACES.find(x => x.c === 'pe' && x.n.includes(' · '));
  await app.open('#' + slug(p.n));
  await expect(page.locator('.card h2')).toHaveText(p.n);
  await expect(rowFor(page, p.n)).toHaveClass(/on/);
});

test('an unknown #slug opens nothing and breaks nothing', async ({ page, app, errors }) => {
  await app.open('#this-place-does-not-exist');
  await expect(page.locator('.card')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('Escape closes the card', async ({ page, app }) => {
  await app.open();
  await rowFor(page, PLACES[0].n).click();
  await expect(page.locator('.card')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.card')).toHaveCount(0);
});

test('rows are keyboard operable (Tab to a row, Enter or Space opens it)', async ({ page, app }) => {
  await app.open();
  const rows = page.locator('.row');
  await rows.nth(2).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.card h2')).toHaveText(await rows.nth(2).locator('b').textContent());
  await rows.nth(3).focus();
  await page.keyboard.press(' ');
  await expect(page.locator('.card h2')).toHaveText(await rows.nth(3).locator('b').textContent());
});

test('selecting from the list flies the map to the place', async ({ page, app }) => {
  await app.open();
  const p = PLACES[firstOf('ind')];
  await page.fill('#q', p.n);
  await rowFor(page, p.n).click();
  await page.waitForFunction(() => !window.__pfmm.map.isMoving(), null, { timeout: 10_000 });
  const z = await page.evaluate(() => window.__pfmm.map.getZoom());
  expect(z).toBeGreaterThanOrEqual(15.5);
  // The place is on screen, to the left of the card.
  const pt = await page.evaluate(ll => { const q = window.__pfmm.map.project([ll[1], ll[0]]); return { x: q.x, y: q.y }; }, p.ll);
  const map = await page.locator('#map').boundingBox();
  const card = await page.locator('.card').boundingBox();
  expect(pt.x).toBeGreaterThan(0);
  expect(pt.y).toBeGreaterThan(0);
  expect(pt.y).toBeLessThan(map.height);
  expect(map.x + pt.x).toBeLessThan(card.x);
});

test('filtering away the selected place closes its card', async ({ page, app }) => {
  await app.open();
  const p = PLACES[firstOf('ind')];
  await page.fill('#q', p.n);
  await rowFor(page, p.n).click();
  await expect(page.locator('.card')).toBeVisible();
  await page.click('.stat.pe');
  await expect(page.locator('.card')).toHaveCount(0);
});

test('the halo highlights the selected pin and its alternatives on the map', async ({ page, app }) => {
  await app.open();
  const i = firstOf('pe');
  await page.fill('#q', PLACES[i].n);
  await rowFor(page, PLACES[i].n).click();
  const f = await page.evaluate(() => ({ on: window.__pfmm.map.getFilter('halo-on'), near: window.__pfmm.map.getFilter('halo-near') }));
  expect(f.on).toEqual(['==', ['get', 'i'], i]);
  expect(f.near[2]).toEqual(['literal', expectedAlternatives(i)]);
});
