import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  envDir: './',
  plugins: [react()],
  resolve: {
    alias: {
      '~bootstrap-icons': path.resolve(__dirname, 'node_modules/bootstrap-icons'),
    },
  },
  server: {
    port: 3000,
    allowedHosts: ['www.konnn04.live', 'api1.konnn04.live'],
    proxy: {
      '/api': {
        target: 'https://api1.konnn04.live',
        changeOrigin: true,
        secure: true,
        ws: true,
      },
      '/ws': {
        target: 'https://api1.konnn04.live',
        changeOrigin: true,
        secure: true,
        ws: true,
      },
    },
    hmr: {
      clientPort: 443,
    },
  },
  css: {
    preprocessorOptions: {
      scss: {
        additionalData: `@import "./src/styles/variables.scss";`
      }
    }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          'react-router': ['react-router-dom'],
          vendor: ['axios', 'socket.io-client'],
        },
      },
    },
    sourcemap: true,
  },
});
