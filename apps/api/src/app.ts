import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './config';
import authRoutes from './modules/auth/auth.routes';
import userRoutes from './modules/users/user.routes';
import evaluationRoutes from './modules/evaluations/evaluation.routes';
import adjudicationRoutes from './modules/adjudication/adjudication.routes';
import dashboardRoutes from './modules/dashboard/dashboard.routes';
import assetRoutes from './modules/assets/asset.routes';

export function createApp() {
  const app = express();

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: config.corsOrigin, credentials: true }));
  app.use(morgan('dev'));
  app.use(express.json({ limit: '10mb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/users', userRoutes);
  app.use('/api/v1/evaluations', evaluationRoutes);
  app.use('/api/v1/adjudications', adjudicationRoutes);
  app.use('/api/v1/dashboard', dashboardRoutes);
  app.use('/api/v1/assets', assetRoutes);

  app.use((_req, res) => {
    res.status(404).json({ success: false, error: 'Not found' });
  });

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  });

  return app;
}
