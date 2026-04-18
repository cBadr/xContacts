import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.VITE_DEV_API_TARGET || 'http://localhost:5174';
  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: env.VITE_API_URL ? undefined : {
        '/api': { target, changeOrigin: true, ws: true }
      }
    },
    build: {
      outDir: 'dist',
      sourcemap: false
    }
  };
});
