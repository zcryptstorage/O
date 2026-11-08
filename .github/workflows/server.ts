/**
 * CloudTab — Local-Powered Personal Browser
 * Full-Stack Server Entry Point
 * 
 * Runs Express, mounts Vite middlewares in development, exposes REST APIs,
 * manages WebSockets, and controls the local browser engine.
 */

import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import cookieParser from 'cookie-parser';
import { authRouter } from './src/server/routes/auth.ts';
import { browserRouter } from './src/server/routes/browser.ts';
import { WebSocketCoordinator } from './src/server/ws-handler.ts';
import { LocalProfileStore } from './src/server/state.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const port = parseInt(process.env.PORT || '3000', 10);
  const isProduction = process.env.NODE_ENV === 'production';

  // Middlewares
  app.use(express.json({ limit: '10mb' }));
  app.use(cookieParser());

  // Security headers for local browser isolation
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
  });

  // REST API Routes
  app.use('/api/auth', authRouter);
  app.use('/api/browser', browserRouter);

  // Initialize WebSocket coordinator
  new WebSocketCoordinator(server);

  // Vite Integration (Dev vs Prod)
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  server.listen(port, '0.0.0.0', () => {
    const store = LocalProfileStore.getInstance();
    console.log(`[CloudTab] Local Browser active at http://0.0.0.0:${port}`);
    console.log(`[CloudTab] Engine: ${store.profileMetadata.browserEngine} (CPU Cores: ${store.profileMetadata.cpuCores}, RAM: ${store.profileMetadata.totalMemoryMb}MB)`);
    console.log(`[CloudTab] Local Storage: ${store.profileMetadata.localStoragePath}`);
  });
}

startServer().catch(err => {
  console.error('[CloudTab] Fatal startup error:', err);
  process.exit(1);
});
