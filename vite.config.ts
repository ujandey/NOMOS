import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { missionMiddleware } from './server/mission.mjs';

export default defineConfig(({ mode }) => ({
  plugins: [react(), {
    name: 'nomos-mission',
    configureServer(server) { server.middlewares.use(missionMiddleware(loadEnv(mode, process.cwd(), 'NOMOS_'))); },
  }],
}));
