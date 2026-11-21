import fs from 'node:fs';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import multer from 'multer';
import { config } from './config/index.js';
import { requestContext } from './context.js';
import { state } from './state.js';
import { authenticate } from './middleware/auth.js';
import { HttpError } from './utils/http.js';

import adminRouter from './routes/admin.js';
import allotmentsRouter from './routes/allotments.js';
import applicationsRouter from './routes/applications.js';
import authRouter from './routes/auth.js';
import certificatesRouter from './routes/certificates.js';
import coloniesRouter from './routes/colonies.js';
import dashboardRouter from './routes/dashboard.js';
import documentsRouter from './routes/documents.js';
import { audit as auditRouter, notifications as notificationsRouter, reports as reportsRouter } from './routes/misc.js';
import profileRouter from './routes/profile.js';
import quartersRouter from './routes/quarters.js';
import retirementsRouter from './routes/retirements.js';
import vacationsRouter from './routes/vacations.js';
import waitingListRouter from './routes/waitingList.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'same-site' } }));
  app.use(cookieParser());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // Optional CORS for when the React dev server calls the API directly (Vite proxy is the default).
  if (config.clientOrigins.length) {
    app.use((req, res, next) => {
      const origin = req.headers.origin;
      if (origin && config.clientOrigins.includes(origin)) {
        res.set({
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Credentials': 'true',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
          Vary: 'Origin',
        });
        if (req.method === 'OPTIONS') return res.sendStatus(204);
      }
      next();
    });
  }

  // Per-request context (user / IP / user agent) for the audit log.
  app.use((req, _res, next) => {
    requestContext.run({ user: null, ip: req.ip, userAgent: req.get('user-agent') ?? null }, next);
  });

  app.get('/api/health', (_req, res) =>
    res.status(state.ready ? 200 : 503).json({ status: state.ready ? 'ok' : state.error ? 'error' : 'starting', ready: state.ready, ...(state.error ? { error: state.error } : {}) }),
  );

  // While the database check / first-run bootstrap is still running (or failed) the API is unavailable.
  app.use('/api', (_req, res, next) => {
    if (state.ready) return next();
    res.status(503).json({
      message: state.error ? `The server could not start (${state.error}). Check the application logs.` : 'The server is starting - please retry in a few seconds.',
    });
  });

  // ---- public ----
  app.use('/api/auth', authRouter);

  // ---- authenticated API ----
  const api = express.Router();
  api.use(authenticate);
  api.use('/dashboard', dashboardRouter);
  api.use('/profile', profileRouter);
  api.use('/applications', applicationsRouter);
  api.use('/colonies', coloniesRouter);
  api.use('/documents', documentsRouter);
  api.use('/waiting-list', waitingListRouter);
  api.use('/quarters', quartersRouter);
  api.use('/', allotmentsRouter); // /allotments..., /quarters/:id/offer
  api.use('/vacations', vacationsRouter);
  api.use('/retirements', retirementsRouter);
  api.use('/certificates', certificatesRouter);
  api.use('/notifications', notificationsRouter);
  api.use('/reports', reportsRouter);
  api.use('/audit', auditRouter);
  api.use('/admin', adminRouter);
  app.use('/api', api);

  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found.')));

  // ---- built React app (production) ----
  const indexHtml = path.join(config.frontendDist, 'index.html');
  if (fs.existsSync(indexHtml)) {
    app.use(express.static(config.frontendDist, { index: false, maxAge: '1h' }));
    app.get('/{*splat}', (_req, res) => res.sendFile(indexHtml));
  } else if (process.env.NODE_ENV !== 'test') {
    console.warn(`[rqms] ${indexHtml} not found - serving the API only. Run "npm run build" to build the React app.`);
  }

  // ---- errors ----
  app.use((err, _req, res, _next) => {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ message: err.message, ...(err.errors ? { errors: err.errors } : {}) });
    }
    if (err instanceof multer.MulterError) {
      const message = err.code === 'LIMIT_FILE_SIZE' ? 'Each document may not be greater than 5 MB.' : err.message;
      return res.status(422).json({ message, errors: { documents: [message] } });
    }
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ message: 'Malformed JSON body.' });
    console.error(err);
    res.status(500).json({ message: config.isProd ? 'Server error.' : String(err?.message ?? err) });
  });

  return app;
}
