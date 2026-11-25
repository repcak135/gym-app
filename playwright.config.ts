import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  projects: [
    {
      name: 'mobile',
      testMatch: ['shell.spec.ts', 'exercises.spec.ts', 'plans.spec.ts', 'workout.spec.ts', 'history.spec.ts', 'import.spec.ts', 'stats.spec.ts', 'body.spec.ts', 'plates.spec.ts', 'backup.spec.ts', 'plans-share.spec.ts', 'report.spec.ts', 'polish.spec.ts', 'plan-sync.spec.ts', 'workout-list.spec.ts', 'exercise-share.spec.ts', 'plan-from-history.spec.ts', 'motivation.spec.ts', 'consistency.spec.ts', 'sounds.spec.ts', 'timed.spec.ts', 'templates.spec.ts'],
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
