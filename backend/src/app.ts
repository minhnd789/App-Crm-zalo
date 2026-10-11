import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { config } from './config.js';
import { errorHandler } from './lib/errors.js';
import { appRouter } from './routes/app/index.js';
import { adminRouter } from './routes/admin/index.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(cors(config.corsOrigins.length ? { origin: config.corsOrigins } : undefined));
  app.use(express.json({ limit: '1mb' }));
  app.use('/uploads', express.static(path.resolve(config.uploadDir), { maxAge: '7d' }));

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });
  app.use('/api/app', appRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API không tồn tại' });
  });
  app.use(errorHandler);
  return app;
}
