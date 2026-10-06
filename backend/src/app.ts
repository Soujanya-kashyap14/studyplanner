import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import mongoose from 'mongoose';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config';
import { requireAuth } from './middleware/auth';
import { errorHandler } from './lib/http';
import { authRouter } from './routes/auth';
import { dataRouter } from './routes/data';
import { scheduleRouter } from './routes/schedule';
import { meRouter } from './routes/me';
import { importRouter } from './routes/import';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  // The SPA loads Google Fonts and an inline theme script, so the default CSP is relaxed.
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
  if (config.corsOrigins.length) app.use(cors({ origin: config.corsOrigins }));
  // Syllabus uploads (PDFs / photos) get a bigger body limit on their own route.
  const json = express.json({ limit: '2mb' });
  app.use((req, res, next) => (req.path.startsWith('/api/import/') ? next() : json(req, res, next)));
  app.use(morgan(config.isProd ? 'combined' : 'dev'));

  /* -------- API -------- */
  const api = express.Router();
  api.get('/health', (_req, res) => {
    res.json({ ok: true, db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' });
  });
  api.use(authRouter); // /auth/* public, /me guarded inside
  api.use(requireAuth, dataRouter, scheduleRouter, meRouter, importRouter);
  api.use((_req, res) => res.status(404).json({ message: 'No such API endpoint.' }));
  app.use('/api', api);

  /* -------- Frontend (production: one service serves both) -------- */
  const dist = path.resolve(process.cwd(), config.frontendDist);
  if (config.frontendDist && fs.existsSync(path.join(dist, 'index.html'))) {
    app.use(express.static(dist, { index: false, maxAge: '1h' }));
    app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
    console.log(`  ✦ serving the app from ${dist}`);
  }

  app.use(errorHandler);
  return app;
}
