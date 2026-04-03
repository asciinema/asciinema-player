import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',

  use: {
    baseURL: 'http://localhost:8066',
    trace: 'on-first-retry',
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: 'chromium',
      testIgnore: 'tests/driver/**',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
    {
      name: 'firefox',
      testIgnore: 'tests/driver/**',
      use: {
        ...devices['Desktop Firefox'],
      },
    },
    {
      name: 'driver',
      testMatch: 'tests/driver/**/*.spec.js',
    },
  ],

  webServer: {
    command: 'cd tests && python -m http.server 8066 > /dev/null 2>&1',
    url: 'http://localhost:8066',
    reuseExistingServer: !process.env.CI,
  },
});
