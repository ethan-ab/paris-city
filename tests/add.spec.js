// "Add a place": the form, address autocomplete, picking the spot on the map, the new pin, saving, removing and review.
const { test, expect, PLACES, COUNTS, visibleRows, countText } = require('./helpers');

const OBERKAMPF = { ll: [48.86497, 2.36872], a: '12 Rue Oberkampf', area: '11e · Oberkampf & Bastille' };
const feature = (lng, lat, name, postcode) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [lng, lat] },
  properties: { name, label: `${name} ${postcode} Paris`, postcode } });

/** The French address service, mocked: one Paris hit and one suburb hit (which the app must drop). */
async function mockGeo(page, { search = true } = {}) {
  const calls = [];
  await page.route(/data\.geopf\.fr\/geocodage\//, route => {
    const u = new URL(route.request().url());
    calls.push(u);
    const features = u.pathname.endsWith('/reverse') ? [feature(+u.searchParams.get('lon'), +u.searchParams.get('lat'), '5 Rue de Bretagne', '75003')]
      : search ? [feature(OBERKAMPF.ll[1], OBERKAMPF.ll[0], OBERKAMPF.a, '75011'), feature(2.24, 48.835, '12 Rue Oberkampf', '92100')] : [];
    return route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ type: 'FeatureCollection', features }) });
  });
  return calls;
}
const openForm = async (page, from = '#addPlace') => { await page.click(from); await expect(page.locator('#modal')).toBeVisible(); };
const chooseAddress = async page => {
  await page.locator('#sgLoc').pressSequentially('12 rue oberk');
  await expect(page.locator('#sgHits li')).toHaveCount(1);
  await page.locator('#sgHits li').first().click();
  await expect(page.locator('#sgSpot')).toHaveText(`Pinned: ${OBERKAMPF.a} · ${OBERKAMPF.area}`);
};
const fillBasics = async (page, name = 'Le Petit Test', cat = 'ind') => {
  await page.fill('#sgName', name);
  await chooseAddress(page);
  await page.click(`#sgCats label:has(input[value=${cat}])`);
};
const mine = page => page.evaluate(() => window.__pfmm.places.filter(p => p.mine).map(({ row, ...p }) => p));
const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem('pfmm.added.v1') || '[]'));
/** Is the place drawn as a visible pin? Waits for the map to settle, then looks under its projected position. */
const pinShown = (page, i) => page.waitForFunction(i => {
  const { map, places } = window.__pfmm; if (map.isMoving() || !map.loaded()) return false;
  const p = places[i], pt = map.project([p.ll[1], p.ll[0]]);
  return map.queryRenderedFeatures([[pt.x - 4, pt.y - 4], [pt.x + 4, pt.y + 4]], { layers: ['pins'] }).some(f => f.properties.i === i && f.properties.v === 1);
}, i, { timeout: 20_000 });

test.beforeEach(async ({ app, page }) => { await mockGeo(page); await app.open(); });

test('opens from the rail and from the map, with the name field focused', async ({ page }) => {
  await openForm(page);
  await expect(page.locator('#sgTitle')).toHaveText('Add a place');
  await expect(page.locator('#sgName')).toBeFocused();
  await page.click('#sgClose');
  await openForm(page, '#addMap');
  await expect(page.locator('#sgName')).toBeFocused();
  await expect(page.locator('#sgKind option').first()).toHaveText('Not sure');
  expect(await page.locator('#sgKind option').count()).toBeGreaterThan(15);
});

test('closes with ×, a backdrop click or Escape, and returns focus', async ({ page }) => {
  await openForm(page);
  await page.click('#sgClose');
  await expect(page.locator('#modal')).toBeHidden();
  await expect(page.locator('#addPlace')).toBeFocused();
  await openForm(page);
  await page.mouse.click(5, 5);
  await expect(page.locator('#modal')).toBeHidden();
  await openForm(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('#modal')).toBeHidden();
});

test('Escape inside the form leaves an open card alone', async ({ page }) => {
  await page.locator('.row').first().click();
  await expect(page.locator('.card')).toBeVisible();
  await openForm(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('#modal')).toBeHidden();
  await expect(page.locator('.card')).toBeVisible();
});

test('checks name, location, category and source before adding', async ({ page }) => {
  await openForm(page);
  const msg = page.locator('#sgMsg');
  await page.click('#sgGo');
  await expect(msg).toHaveText('Add the name of the place.');
  await expect(msg).toHaveClass(/err/);
  await page.fill('#sgName', 'Chez Test');
  await page.click('#sgGo');
  await expect(msg).toHaveText('Add an address, or pick the spot on the map.');
  await chooseAddress(page);
  await page.click('#sgGo');
  await expect(msg).toHaveText("Pick who's behind it.");
  await page.click('#sgCats label:has(input[value=pe])');
  await page.fill('#sgSrc', 'ftp://example.com/x');
  await page.click('#sgGo');
  await expect(msg).toHaveText('Source link should start with https://');
  expect(await mine(page)).toEqual([]);
});

test('address suggestions only list Paris, work with the keyboard, and editing drops the pin', async ({ page }) => {
  await openForm(page);
  await page.locator('#sgLoc').pressSequentially('12 rue oberk');
  await expect(page.locator('#sgHits li')).toHaveCount(1);
  await expect(page.locator('#sgHits li')).toContainText('11e · Oberkampf & Bastille');
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#sgHits li').first()).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Enter');
  await expect(page.locator('#modal')).toBeVisible();
  await expect(page.locator('#sgLoc')).toHaveValue(OBERKAMPF.a);
  await expect(page.locator('#sgSpot')).toBeVisible();
  await expect(page.locator('#sgPick')).toHaveText('Move pin');
  await page.locator('#sgLoc').press('End');
  await page.locator('#sgLoc').pressSequentially('x');
  await expect(page.locator('#sgSpot')).toBeHidden();
  await expect(page.locator('#sgPick')).toHaveText('Pick on map');
});

test('a new place shows up on the map, in the list and in the counts, and opens its card', async ({ page }) => {
  await openForm(page);
  await fillBasics(page);
  await page.fill('#sgOwner', 'Marie & Paul');
  await page.selectOption('#sgKind', 'French bistro');
  await page.selectOption('#sgPrice', '2');
  await page.fill('#sgSrc', 'https://example.com/article');
  await page.fill('#sgNote', 'Tiny bistro');
  await page.click('#sgGo');

  await expect(page.locator('#modal')).toBeHidden();
  await expect(page.locator('#toast')).toHaveText('Le Petit Test is on the map');
  const card = page.locator('.card');
  await expect(card.locator('h2')).toHaveText('Le Petit Test');
  await expect(card.locator('.tag')).toHaveText('Independent');
  await expect(card.locator('dd').first()).toHaveText('Marie & Paul');
  await expect(card.locator('.area')).toContainText('French bistro · 12 Rue Oberkampf');
  await expect(card.locator('a.src')).toHaveText('Source: example.com ↗');
  await expect(card.locator('.yours')).toContainText('Added by you');

  const i = PLACES.length;
  expect(await page.evaluate(() => window.__pfmm.selected())).toBe(i);
  await expect(page).toHaveURL(/#le-petit-test$/);
  await expect(countText(page)).toHaveText(`${PLACES.length + 1} PLACES`);
  await expect(page.locator('#nInd')).toHaveText(String(COUNTS.ind + 1));
  await expect(page.locator('.grp', { hasText: 'Independent' }).locator('span')).toHaveText(String(COUNTS.ind + 1));
  const row = page.locator('.row.on');
  await expect(row.locator('b')).toHaveText('Le Petit Test');
  await expect(row.locator('.mine-tag')).toHaveText('Yours');
  await expect(row.locator('.price')).toHaveText('€€€€');
  await expect(page.locator('#fArea option', { hasText: OBERKAMPF.area })).toHaveText(new RegExp(`\\(${PLACES.filter(p => p.area === OBERKAMPF.area).length + 1}\\)`));
  await pinShown(page, i);

  const [p] = await mine(page);
  expect(p).toMatchObject({ n: 'Le Petit Test', a: OBERKAMPF.a, area: OBERKAMPF.area, ll: OBERKAMPF.ll, c: 'ind', k: 'French bistro', pr: 2,
    o: 'Marie & Paul', src: 'https://example.com/article', note: 'Tiny bistro', mine: true });
  await page.fill('#q', 'petit test');
  await expect(visibleRows(page)).toHaveCount(1);
});

test('a PE place added by a visitor gets independent alternatives nearby', async ({ page }) => {
  await openForm(page);
  await fillBasics(page, 'Chaîne Test', 'pe');
  await page.click('#sgGo');
  await expect(page.locator('.card .tag')).toHaveText('PE-backed');
  await expect(page.locator('.card .alt')).toHaveCount(3);
  await expect(page.locator('#nPe')).toHaveText(String(COUNTS.pe + 1));
});

test('filters that would hide the new place are cleared', async ({ page }) => {
  await page.click('.stat.pe');
  await page.selectOption('#fCu', 'Pizza');
  await expect(page.locator('.stat.ind')).toHaveAttribute('aria-pressed', 'false');
  await openForm(page);
  await fillBasics(page);
  await page.click('#sgGo');
  await expect(page.locator('.card h2')).toHaveText('Le Petit Test');
  await expect(page.locator('.stat.ind')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#fCu')).toHaveValue('');
  await expect(visibleRows(page)).toHaveCount(PLACES.length + 1);
  await pinShown(page, PLACES.length);
});

test('a typed address is looked up on submit; an unknown one asks for the map', async ({ page }) => {
  await openForm(page);
  await page.fill('#sgName', 'Typed Address');
  await page.fill('#sgLoc', '12 rue oberkampf');
  await page.click('#sgCats label:has(input[value=corp])');
  await page.click('#sgGo');
  await expect(page.locator('.card h2')).toHaveText('Typed Address');
  expect((await mine(page))[0]).toMatchObject({ ll: OBERKAMPF.ll, area: OBERKAMPF.area, c: 'corp' });

  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await mockGeo(page, { search: false });
  await openForm(page);
  await page.fill('#sgName', 'Nowhere');
  await page.fill('#sgLoc', 'zzz unknown street');
  await page.click('#sgCats label:has(input[value=ind])');
  await page.click('#sgGo');
  await expect(page.locator('#sgMsg')).toHaveText("Couldn't find that address in Paris. Pick a suggestion, or place it on the map.");
  expect((await mine(page)).length).toBe(1);
});

test('the spot can be picked on the map with a pin', async ({ page }) => {
  await openForm(page);
  await page.fill('#sgName', 'Pinned Spot');
  await page.click('#sgCats label:has(input[value=vc])');
  await page.fill('#sgOwner', 'Some Ventures');
  await page.click('#sgPick');
  await expect(page.locator('#modal')).toBeHidden();
  await expect(page.locator('#picker')).toBeVisible();
  await expect(page.locator('#pkName')).toHaveText('Pinned Spot');
  await expect(page.locator('.newpin')).toBeVisible();
  expect(await page.evaluate(() => window.__pfmm.picking())).toBe(true);

  const box = await page.locator('#map').boundingBox();
  const at = { x: box.width / 2 + 60, y: box.height / 2 + 40 };
  const want = await page.evaluate(({ x, y }) => window.__pfmm.map.unproject([x, y]), at);
  await page.mouse.click(box.x + at.x, box.y + at.y);
  await expect(page.locator('.card')).toHaveCount(0); // a pick never opens a pin's card
  await page.click('#pkOk');

  await expect(page.locator('#modal')).toBeVisible();
  await expect(page.locator('#picker')).toBeHidden();
  await expect(page.locator('#sgSpot')).toHaveText(/^Pinned: 5 Rue de Bretagne · 3e · Haut-Marais$/);
  await expect(page.locator('#sgLoc')).toHaveValue('5 Rue de Bretagne');
  await expect(page.locator('#sgOwner')).toHaveValue('Some Ventures');
  await page.click('#sgGo');
  await expect(page.locator('.card h2')).toHaveText('Pinned Spot');
  const [p] = await mine(page);
  expect(p.ll[0]).toBeCloseTo(want.lat, 5);
  expect(p.ll[1]).toBeCloseTo(want.lng, 5);
  expect(p).toMatchObject({ c: 'vc', a: '5 Rue de Bretagne', area: '3e · Haut-Marais' });
  await pinShown(page, PLACES.length);
});

test('picking can be cancelled with the button or Escape, keeping what was typed', async ({ page }) => {
  await openForm(page);
  await page.fill('#sgName', 'Half Done');
  await page.click('#sgPick');
  await page.click('#pkCancel');
  await expect(page.locator('#picker')).toBeHidden();
  await expect(page.locator('#modal')).toBeVisible();
  await expect(page.locator('#sgName')).toHaveValue('Half Done');
  await expect(page.locator('#sgSpot')).toBeHidden();
  await page.click('#sgPick');
  await page.keyboard.press('Escape');
  await expect(page.locator('#modal')).toBeVisible();
  await expect(page.locator('.newpin')).toHaveCount(0);
  expect(await page.evaluate(() => window.__pfmm.picking())).toBe(false);
});

test('a pin outside Paris is refused', async ({ page }) => {
  await openForm(page);
  await page.click('#sgPick');
  await page.evaluate(() => window.__pfmm.map.jumpTo({ center: [2.15, 48.80], zoom: 13 }));
  const box = await page.locator('#map').boundingBox();
  await page.mouse.click(box.x + box.width / 2 + 50, box.y + box.height / 2 + 50);
  await page.click('#pkOk');
  await expect(page.locator('#toast')).toHaveText('Move the pin inside Paris');
  await expect(page.locator('#picker')).toBeVisible();
});

test('added places are saved in the browser and can be removed', async ({ page, app }) => {
  await openForm(page);
  await fillBasics(page, 'Keep Me');
  await page.click('#sgGo');
  await openForm(page);
  await fillBasics(page, 'Drop Me', 'pe');
  await page.click('#sgGo');
  expect((await stored(page)).map(p => p.n)).toEqual(['Keep Me', 'Drop Me']);

  await app.open();
  await expect(countText(page)).toHaveText(`${PLACES.length + 2} PLACES`);
  await expect(page.locator('.row .mine-tag')).toHaveCount(2);
  await page.locator('.row', { hasText: 'Drop Me' }).click();
  await expect(page.locator('.card h2')).toHaveText('Drop Me');
  await page.click('.card .yours .rm');
  await expect(page.locator('.card')).toHaveCount(0);
  await expect(page.locator('#toast')).toHaveText('Removed Drop Me');
  await expect(countText(page)).toHaveText(`${PLACES.length + 1} PLACES`);
  await expect(page.locator('#nPe')).toHaveText(String(COUNTS.pe));
  expect((await stored(page)).map(p => p.n)).toEqual(['Keep Me']);
  expect(await page.evaluate(() => window.__pfmm.places.every((p, i) => p.i === i))).toBe(true);
  await page.locator('.row', { hasText: 'Keep Me' }).click();
  await expect(page.locator('.card h2')).toHaveText('Keep Me');
  await pinShown(page, PLACES.length);
});

test('broken or hostile saved data is ignored and shown as text', async ({ page, app }) => {
  await page.addInitScript(() => localStorage.setItem('pfmm.added.v1', JSON.stringify([
    { n: 'Zqx <img src=x onerror="window.__xss=1">', ll: [48.86, 2.35], c: 'ind', o: '<b>x</b>', src: 'javascript:window.__xss=2', pr: 99 },
    { n: 'Outside', ll: [48.7, 2.0], c: 'ind' }, { n: 'Bad cat', ll: [48.86, 2.35], c: 'evil' }, { n: 'No coords', c: 'pe' }, 'junk', null,
  ])));
  await app.open();
  await expect(countText(page)).toHaveText(`${PLACES.length + 1} PLACES`);
  await page.fill('#q', 'zqx');
  await page.locator('.row:not([hidden])').first().click();
  await expect(page.locator('.card h2')).toHaveText('Zqx <img src=x onerror="window.__xss=1">');
  await expect(page.locator('.card a.src')).toHaveCount(0);
  await expect(page.locator('.card .price')).toHaveCount(0);
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  expect(await page.locator('.card img, .row img').count()).toBe(0);
});

test('the honeypot silently drops bots', async ({ page }) => {
  await openForm(page);
  await fillBasics(page, 'Spam');
  await page.locator('input[name=website]').evaluate(e => { e.value = 'http://spam'; });
  await page.click('#sgGo');
  await page.waitForTimeout(300);
  expect(await mine(page)).toEqual([]);
});

test('without a database, "Send for review" is a pre-filled GitHub issue', async ({ page }) => {
  await openForm(page);
  await fillBasics(page, 'Chez Test & Fils', 'pe');
  await page.fill('#sgOwner', 'a fund');
  await page.fill('#sgSrc', 'https://example.com/article');
  await page.selectOption('#sgKind', 'Pizza');
  await page.click('#sgGo');
  const link = page.locator('.card .yours a.send');
  await expect(link).toHaveText('Send for review ↗');
  await expect(link).toHaveAttribute('target', '_blank');
  const href = new URL(await link.getAttribute('href'));
  expect(href.origin + href.pathname).toBe('https://github.com/ethan-ab/paris-city/issues/new');
  expect(href.searchParams.get('title')).toBe('Add: Chez Test & Fils');
  expect(href.searchParams.get('labels')).toBe('suggestion');
  const body = href.searchParams.get('body');
  expect(body).toContain('**name**: Chez Test & Fils');
  expect(body).toContain(`**location**: ${OBERKAMPF.a}, ${OBERKAMPF.area} (${OBERKAMPF.ll[0]}, ${OBERKAMPF.ll[1]})`);
  expect(body).toContain('**owner hint**: PE-backed: a fund');
  expect(body).toContain('**source url**: https://example.com/article');
  expect(body).toContain('**note**: Food: Pizza');
});

test.describe('with the Supabase backend configured', () => {
  test.beforeEach(async ({ page, appPath }) => {
    await page.route(u => u.pathname === appPath, async route => {
      const res = await route.fetch();
      const html = (await res.text()).replace(/const SUGGEST = \{url:"",key:""/, 'const SUGGEST = {url:"https://test.supabase.co",key:"pk_test"');
      await route.fulfill({ response: res, body: html });
    });
    await page.goto(appPath);
    await page.waitForFunction(() => window.__pfmm && window.__pfmm.isReady(), null, { timeout: 30_000 });
  });

  test('sends the place for review and remembers it was sent', async ({ page }) => {
    let sent;
    await page.route('https://test.supabase.co/rest/v1/submissions', async route => {
      sent = { body: route.request().postDataJSON(), headers: route.request().headers(), method: route.request().method() };
      await route.fulfill({ status: 201, body: '' });
    });
    await openForm(page);
    await fillBasics(page, 'Le Petit Test');
    await page.fill('#sgNote', 'great bistro');
    await page.click('#sgGo');
    await page.click('.card .yours button.send');
    await expect(page.locator('.card .yours .send')).toHaveText('Sent for review ✓');
    await expect(page.locator('.card .yours .send')).toBeDisabled();
    await expect(page.locator('#toast')).toHaveText('Sent for review. Merci!');
    expect(sent.method).toBe('POST');
    expect(sent.body).toEqual({ name: 'Le Petit Test', location: `${OBERKAMPF.a}, ${OBERKAMPF.area} (${OBERKAMPF.ll[0]}, ${OBERKAMPF.ll[1]})`,
      owner_hint: 'Independent', note: 'great bistro' });
    expect(sent.headers.apikey).toBe('pk_test');
    expect(sent.headers.prefer).toBe('return=minimal');
    expect((await stored(page))[0].sent).toBe(true);
  });

  test('shows a retry when the server fails', async ({ page }) => {
    await page.route('https://test.supabase.co/rest/v1/submissions', r => r.fulfill({ status: 500, body: 'x' }));
    await openForm(page);
    await fillBasics(page);
    await page.click('#sgGo');
    await page.click('.card .yours button.send');
    await expect(page.locator('.card .yours .send')).toHaveText("Couldn't send. Retry");
    await expect(page.locator('.card .yours .send')).toBeEnabled();
  });
});
