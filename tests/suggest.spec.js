// "Suggest a place": the modal, validation, the GitHub fallback and the Supabase path.
const { test, expect } = require('./helpers');

const open = async page => { await page.click('#suggest'); await expect(page.locator('#modal')).toBeVisible(); };

test.beforeEach(async ({ app }) => { await app.open('', { waitMap: false }); });

test('opens with the name field focused', async ({ page }) => {
  await open(page);
  await expect(page.locator('#sgTitle')).toHaveText('Suggest a place');
  await expect(page.locator('#sgName')).toBeFocused();
});

test('closes with ×, a backdrop click or Escape, and returns focus', async ({ page }) => {
  await open(page);
  await page.click('#sgClose');
  await expect(page.locator('#modal')).toBeHidden();
  await expect(page.locator('#suggest')).toBeFocused();
  await open(page);
  await page.mouse.click(5, 5);
  await expect(page.locator('#modal')).toBeHidden();
  await open(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('#modal')).toBeHidden();
});

test('Escape inside the modal leaves an open card alone', async ({ page }) => {
  await page.locator('.row').first().click();
  await expect(page.locator('.card')).toBeVisible();
  await open(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('#modal')).toBeHidden();
  await expect(page.locator('.card')).toBeVisible();
});

test('asks for a name before sending', async ({ page }) => {
  await open(page);
  await page.click('#sgGo');
  await expect(page.locator('#sgMsg')).toHaveText('Add the name of the place.');
  await expect(page.locator('#sgMsg')).toHaveClass(/err/);
  await page.fill('#sgName', 'A');
  await page.click('#sgGo');
  await expect(page.locator('#sgMsg')).toHaveText('Add the name of the place.');
});

test('rejects a source that is not a web link', async ({ page }) => {
  await open(page);
  await page.fill('#sgName', 'Chez Test');
  await page.fill('#sgSrc', 'ftp://example.com/x');
  await page.click('#sgGo');
  await expect(page.locator('#sgMsg')).toHaveText('Source link should start with https://');
});

test('without a database, builds a pre-filled GitHub issue link', async ({ page }) => {
  await open(page);
  await page.fill('#sgName', 'Chez Test & Fils');
  await page.fill('#sgLoc', '12 rue de Test, 11e');
  await page.fill('#sgOwner', 'bought by a fund in 2026');
  await page.fill('#sgSrc', 'https://example.com/article');
  await page.click('#sgGo');
  const link = page.locator('#sgBody a.go');
  await expect(link).toHaveText('Open the pre-filled suggestion ↗');
  await expect(link).toHaveAttribute('target', '_blank');
  const href = new URL(await link.getAttribute('href'));
  expect(href.origin + href.pathname).toBe('https://github.com/ethan-ab/paris-city/issues/new');
  expect(href.searchParams.get('title')).toBe('Suggest: Chez Test & Fils');
  expect(href.searchParams.get('labels')).toBe('suggestion');
  const body = href.searchParams.get('body');
  expect(body).toContain('**name**: Chez Test & Fils');
  expect(body).toContain('**location**: 12 rue de Test, 11e');
  expect(body).toContain('**owner hint**: bought by a fund in 2026');
  expect(body).toContain('**source url**: https://example.com/article');
});

test('the form resets when reopened', async ({ page }) => {
  await open(page);
  await page.fill('#sgName', 'Chez Test');
  await page.click('#sgGo');
  await page.click('#sgClose');
  await open(page);
  await expect(page.locator('#sgName')).toHaveValue('');
  await expect(page.locator('#sgGo')).toBeVisible();
});

test.describe('with the Supabase backend configured', () => {
  test.beforeEach(async ({ page, appPath }) => {
    // Serve the page with a Supabase URL switched on.
    await page.route(u => u.pathname === appPath, async route => {
      const res = await route.fetch();
      const html = (await res.text()).replace(/const SUGGEST = \{url:"",key:""/, 'const SUGGEST = {url:"https://test.supabase.co",key:"pk_test"');
      await route.fulfill({ response: res, body: html });
    });
    await page.goto(appPath);
  });

  test('sends the suggestion and thanks the visitor', async ({ page }) => {
    let sent;
    await page.route('https://test.supabase.co/rest/v1/submissions', async route => {
      sent = { body: route.request().postDataJSON(), headers: route.request().headers(), method: route.request().method() };
      await route.fulfill({ status: 201, body: '' });
    });
    await open(page);
    await page.fill('#sgName', 'Le Petit Test');
    await page.fill('#sgNote', 'great bistro');
    await page.click('#sgGo');
    await expect(page.locator('.done b')).toHaveText('Merci');
    await expect(page.locator('.done')).toContainText('Le Petit Test');
    expect(sent.method).toBe('POST');
    expect(sent.body).toEqual({ name: 'Le Petit Test', note: 'great bistro' });
    expect(sent.headers.apikey).toBe('pk_test');
    expect(sent.headers.prefer).toBe('return=minimal');
    await page.click('#sgAgain');
    await expect(page.locator('#sgName')).toHaveValue('');
  });

  test('shows a retry message when the server fails', async ({ page }) => {
    await page.route('https://test.supabase.co/rest/v1/submissions', r => r.fulfill({ status: 500, body: 'x' }));
    await open(page);
    await page.fill('#sgName', 'Le Petit Test');
    await page.click('#sgGo');
    await expect(page.locator('#sgMsg')).toHaveText("Couldn't send that. Try again in a moment.");
    await expect(page.locator('#sgGo')).toBeEnabled();
  });

  test('silently drops bot submissions caught by the honeypot', async ({ page }) => {
    let called = false;
    await page.route('https://test.supabase.co/rest/v1/submissions', r => { called = true; r.fulfill({ status: 201 }); });
    await open(page);
    await page.fill('#sgName', 'Spam');
    await page.locator('input[name=website]').evaluate(e => { e.value = 'http://spam'; });
    await page.click('#sgGo');
    await page.waitForTimeout(500);
    expect(called).toBe(false);
    await expect(page.locator('.done')).toHaveCount(0);
  });
});
