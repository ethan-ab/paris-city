// End-to-end tests for the Paris Food Money Matrix.
// Two builds are tested with the same specs:
//   site     -> public/index.html (the Vercel site; live OpenFreeMap tiles)
//   artifact -> artifact/paris-food-money-matrix.html (self-contained; tile hosts blocked like the claude.ai sandbox)
// Build both first: `npm run build`.
const { defineConfig, devices } = require('@playwright/test');

const PORT = 4173;
const desktop = { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } };

module.exports = defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${PORT}`, trace: 'off' },
  webServer: {
    command: `python3 -m http.server ${PORT} --bind 127.0.0.1`,
    url: `http://localhost:${PORT}/public/index.html`,
    reuseExistingServer: !process.env.CI,
    stderr: 'ignore',
  },
  projects: [
    { name: 'data', testMatch: /data\.spec\.js/ },
    { name: 'site', testIgnore: /(data|artifact)\.spec\.js/, use: { ...desktop, appPath: '/public/index.html', variant: 'site' } },
    { name: 'artifact', testIgnore: /data\.spec\.js/, use: { ...desktop, appPath: '/artifact/paris-food-money-matrix.html', variant: 'artifact' } },
  ],
});
