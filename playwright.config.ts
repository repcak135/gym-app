import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  projects: [
    {
      name: 'mobile',
      testMatch: 'shell.spec.ts',
      use: {
        ...devices['iPhone 13'],
        browserName: 'chromium',
      },
    },
    {
      name: 'pwa',
      testMatch: 'pwa.spec.ts',
      use: {
        ...devices['iPhone 13'],
        browserName: 'chromium',
        baseURL: 'http://localhost:4173',
      },
    },
  ],
  use: {
    baseURL: 'http://localhost:5173',
  },
  webServer: [
    {
      command: 'npm run dev -- --port 5173 --strictPort',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
    },
    {
      command: 'npm run build && npm run preview -- --port 4173 --strictPort',
      url: 'http://localhost:4173',
      reuseExistingServer: true,
      timeout: 180000,
    },
  ],
});
