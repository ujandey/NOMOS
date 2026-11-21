import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  snapshotPathTemplate: '{testDir}/{testFilePath}-snapshots/{arg}{ext}',
  use: { baseURL: 'http://127.0.0.1:4189', viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' },
  workers: 2,
  webServer: {
    command: 'npm start',
    url: 'http://127.0.0.1:4189',
    env: { PORT: '4189', NOMOS_HOST: '127.0.0.1', NOMOS_LLM_API_KEY: '' },
    reuseExistingServer: false,
    timeout: 30000,
  },
});
