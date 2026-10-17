import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// public/staticwebapp.config.json is copied to the root of dist/, which is where
// Azure Static Web Apps expects it when the workflow deploys a prebuilt app.
export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist', sourcemap: true },
  server: { port: 5173 },
});
