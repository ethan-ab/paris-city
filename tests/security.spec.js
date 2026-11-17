// Data is rendered as text, never as markup, and only web links become source links.
const { test, expect } = require('./helpers');

const EVIL = {
  n: 'Zqxevil <img src=x onerror="window.__xss=1"> Café', a: '<b>1 rue</b>', area: '11e · Oberkampf & Bastille', ll: [48.8650, 2.3780],
  cu: '<script>window.__xss=2</script>', k: 'Café', pr: 2, c: 'pe', o: '<svg onload="window.__xss=3">', y: '2026',
  note: '"><img src=x onerror="window.__xss=4">', src: 'javascript:window.__xss=5',
};

test.beforeEach(async ({ page, appPath, variant }) => {
  if (variant === 'artifact') await page.route(/openfreemap\.org/, r => r.abort());
  await page.route(u => u.pathname === appPath, async route => {
    const res = await route.fetch();
    const html = (await res.text()).replace('const PLACES = [', 'const PLACES = [' + JSON.stringify(EVIL).replace(/<\//g, '<\\/') + ',');
    await route.fulfill({ response: res, body: html });
  });
  await page.goto(appPath);
  await page.waitForFunction(() => window.__pfmm && window.__pfmm.isReady());
});

test('names, owners and notes with HTML are shown as text', async ({ page }) => {
  await page.fill('#q', 'zqxevil');
  const row = page.locator('.row:not([hidden])').first();
  await expect(row.locator('b')).toHaveText(EVIL.n);
  await row.click();
  await expect(page.locator('.card h2')).toHaveText(EVIL.n);
  await expect(page.locator('.card dd').first()).toHaveText(EVIL.o);
  await expect(page.locator('.card p').first()).toHaveText(EVIL.note);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  expect(await page.locator('.card img, .row img, .card svg[onload]').count()).toBe(0);
});

test('a non-web source never becomes a clickable link', async ({ page }) => {
  await page.fill('#q', 'zqxevil');
  await page.locator('.row:not([hidden])').first().click();
  await expect(page.locator('.card a.src')).toHaveCount(0);
});

test('deep-link hashes are not executed as markup', async ({ page, appPath }) => {
  await page.goto(appPath + '#%3Cimg%20src%3Dx%20onerror%3D%22window.__xss%3D9%22%3E');
  await page.waitForFunction(() => window.__pfmm && window.__pfmm.isReady());
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();
});
