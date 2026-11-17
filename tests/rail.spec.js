// The left rail: headline, stat buttons, search, filters and the grouped list.
const { test, expect, PLACES, COUNTS, fold, visibleRows, countText } = require('./helpers');

test.beforeEach(async ({ app }) => { await app.open(); });

test('loads with the Paris title, skyline and no errors', async ({ page, errors }) => {
  await expect(page).toHaveTitle('Paris Food Money Matrix');
  await expect(page.locator('h1')).toHaveText('Paris Food Money Matrix');
  await expect(page.locator('h1 em')).toHaveText('Money');
  expect(await page.locator('#skyline g').count()).toBe(9);
  await expect(page.locator('.dek')).toContainText('Paris');
  expect(errors).toEqual([]);
});

test('stat buttons show the real counts', async ({ page }) => {
  await expect(page.locator('#nPe')).toHaveText(String(COUNTS.pe));
  await expect(page.locator('#nInd')).toHaveText(String(COUNTS.ind));
  await expect(page.locator('#nOther')).toHaveText(String(COUNTS.corp + COUNTS.vc));
  await expect(countText(page)).toHaveText(`${PLACES.length} PLACES`);
});

test('proportion bar has one segment per category, sized by count', async ({ page }) => {
  const segs = page.locator('#bar i');
  await expect(segs).toHaveCount(4);
  const grows = await segs.evaluateAll(els => els.map(e => Number(e.style.flexGrow)));
  expect(grows).toEqual([COUNTS.pe, COUNTS.vc, COUNTS.corp, COUNTS.ind]);
});

test('list shows every place, grouped PE → VC → Corporate → Independent', async ({ page }) => {
  await expect(visibleRows(page)).toHaveCount(PLACES.length);
  const groups = await page.locator('.grp').evaluateAll(els => els.map(e => e.firstChild.textContent));
  expect(groups).toEqual(['PE-backed', 'VC-backed', 'Corporate', 'Independent']);
  const groupCounts = await page.locator('.grp span').allTextContents();
  expect(groupCounts.map(Number)).toEqual([COUNTS.pe, COUNTS.vc, COUNTS.corp, COUNTS.ind]);
});

test('rows inside a group are in French alphabetical order', async ({ page }) => {
  const names = await page.evaluate(() => {
    const out = []; let cur = null;
    for (const el of document.querySelectorAll('#list > .grp, #list > .row')) {
      if (el.classList.contains('grp')) { cur = []; out.push(cur); } else cur.push(el.querySelector('b').textContent);
    }
    return out;
  });
  for (const g of names) expect(g).toEqual([...g].sort((a, b) => a.localeCompare(b, 'fr')));
});

test('rows show cuisine, arrondissement, backer and a euro price ladder', async ({ page }) => {
  const p = PLACES.find(x => x.c === 'pe' && x.pr === 2);
  const row = page.locator('.row', { has: page.locator('b', { hasText: p.n }) }).first();
  await expect(row.locator('span').first()).toContainText(p.area);
  await expect(row.locator('span').first()).toContainText(p.o.slice(0, 20));
  await expect(row.locator('.price')).toHaveText('€€€€');
  await expect(row.locator('.price s')).toHaveText('€€');
});

test('tapping PE-backed isolates PE places; tapping again restores everything', async ({ page }) => {
  await page.click('.stat.pe');
  await expect(visibleRows(page)).toHaveCount(COUNTS.pe);
  await expect(page.locator('.stat.pe')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.stat.ind')).toHaveAttribute('aria-pressed', 'false');
  await expect(countText(page)).toHaveText(`${COUNTS.pe} OF ${PLACES.length} PLACES · ${COUNTS.pe} PE-BACKED`);
  await expect(page.locator('.grp:not([hidden])')).toHaveCount(1);
  await page.click('.stat.pe');
  await expect(visibleRows(page)).toHaveCount(PLACES.length);
});

test('Independent and Corp & VC buttons filter their categories', async ({ page }) => {
  await page.click('.stat.ind');
  await expect(visibleRows(page)).toHaveCount(COUNTS.ind);
  await page.click('.stat.other');
  await expect(visibleRows(page)).toHaveCount(COUNTS.corp + COUNTS.vc);
  const cats = await page.locator('.row:not([hidden]) .dot').evaluateAll(els => [...new Set(els.map(e => e.className))]);
  expect(cats.sort()).toEqual(['dot dia', 'dot ring']);
});

test('search matches names, case- and accent-insensitively', async ({ page }) => {
  const target = PLACES.find(p => /[éèêàç]/.test(p.n) && p.c === 'ind');
  const q = fold(target.n).toUpperCase();
  await page.fill('#q', q);
  const expected = PLACES.filter(p => fold([p.n, p.a, p.area, p.o, p.cu, p.k].join(' ')).includes(fold(q))).length;
  await expect(visibleRows(page)).toHaveCount(expected);
  await expect(page.locator('.row:not([hidden]) b', { hasText: target.n }).first()).toBeVisible();
});

test('search matches owners (e.g. every Bridgepoint-backed place)', async ({ page }) => {
  await page.fill('#q', 'bridgepoint');
  const expected = PLACES.filter(p => fold([p.n, p.a, p.area, p.o, p.cu, p.k].join(' ')).includes('bridgepoint')).length;
  expect(expected).toBeGreaterThan(5);
  await expect(visibleRows(page)).toHaveCount(expected);
});

test('search matches streets', async ({ page }) => {
  await page.fill('#q', 'rue de rivoli');
  const expected = PLACES.filter(p => fold([p.n, p.a, p.area, p.o, p.cu, p.k].join(' ')).includes('rue de rivoli')).length;
  expect(expected).toBeGreaterThan(0);
  await expect(visibleRows(page)).toHaveCount(expected);
});

test('a search with no match shows the empty state and a Suggest link', async ({ page }) => {
  await page.fill('#q', 'zzzz no such place');
  await expect(visibleRows(page)).toHaveCount(0);
  await expect(page.locator('.empty')).toBeVisible();
  await expect(page.locator('.grp:not([hidden])')).toHaveCount(0);
  await page.click('#emptySuggest');
  await expect(page.locator('#modal')).toBeVisible();
  await expect(page.locator('#sgName')).toHaveValue('zzzz no such place');
});

test('clearing the search restores the full list', async ({ page }) => {
  await page.fill('#q', 'starbucks');
  await expect(visibleRows(page)).not.toHaveCount(PLACES.length);
  await page.fill('#q', '');
  await expect(visibleRows(page)).toHaveCount(PLACES.length);
  await expect(page.locator('.empty')).toBeHidden();
});

test('arrondissement filter lists 1er → 20e with counts and filters the list', async ({ page }) => {
  const labels = await page.locator('#fArea option').allTextContents();
  expect(labels[0]).toBe('All areas');
  const nums = labels.slice(1).map(l => parseInt(l, 10));
  expect(nums).toEqual([...nums].sort((a, b) => a - b));
  expect(nums.length).toBe(20);
  const area = PLACES.find(p => p.area.startsWith('11e')).area;
  const n = PLACES.filter(p => p.area === area).length;
  expect(labels).toContain(`${area} (${n})`);
  await page.selectOption('#fArea', area);
  await expect(visibleRows(page)).toHaveCount(n);
});

test('food filter narrows to one type of food', async ({ page }) => {
  const n = PLACES.filter(p => p.k === 'Bouillon').length;
  await page.selectOption('#fCu', 'Bouillon');
  await expect(visibleRows(page)).toHaveCount(n);
  const k = PLACES.filter(p => p.k === 'Bakery & pastry').length;
  await page.selectOption('#fCu', 'Bakery & pastry');
  await expect(visibleRows(page)).toHaveCount(k);
});

test('filters combine: area + food + category + search', async ({ page }) => {
  const area = PLACES.find(p => p.area.startsWith('1er')).area;
  await page.selectOption('#fArea', area);
  await page.selectOption('#fCu', 'Coffee');
  await page.click('.stat.other');
  await page.fill('#q', 'starbucks');
  const n = PLACES.filter(p => p.area === area && p.k === 'Coffee' && (p.c === 'corp' || p.c === 'vc') && fold(p.n).includes('starbucks')).length;
  expect(n).toBeGreaterThan(0);
  await expect(visibleRows(page)).toHaveCount(n);
  await expect(countText(page)).toHaveText(`${n} OF ${PLACES.length} PLACES · 0 PE-BACKED`);
});

test('legend lists the four categories', async ({ page }) => {
  await expect(page.locator('#legend span')).toHaveText(['PE-backed', 'VC-backed', 'Corporate', 'Independent']);
});

test('footer explains the method and credits the London original', async ({ page }) => {
  const foot = page.locator('.foot');
  await expect(foot).toContainText('OpenStreetMap');
  await expect(foot).toContainText('checked');
  await expect(foot.locator('a')).toHaveAttribute('href', 'https://london-food-money-matrix.vercel.app');
});
