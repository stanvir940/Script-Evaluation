import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import { config } from './config';
import { errorHandler } from './middleware/error-handler.middleware';
import authRoutes from './modules/auth/auth.routes';
import userRoutes from './modules/users/user.routes';
import departmentRoutes from './modules/departments/department.routes';
import subjectRoutes from './modules/subjects/subject.routes';
import admissionExamRoutes from './modules/admission-exams/admission-exam.routes';
import sessionRoutes from './modules/sessions/session.routes';
import auditRoutes from './modules/audit/audit.routes';
import questionRoutes from './modules/questions/question.routes';
import studentRoutes from './modules/students/student.routes';
import evaluationRoutes from './modules/evaluations/evaluation.routes';
import adjudicationRoutes from './modules/adjudications/adjudication.routes';
import resultRoutes from './modules/results/result.routes';

export function createApp() {
  const app = express();

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: config.corsOrigin, credentials: true }));
  app.use(morgan('dev'));
  app.use(express.json({ limit: '50mb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'DASEMS API', phase: '1-6', timestamp: new Date().toISOString() });
  });

  app.use('/api/v1/files', express.static(path.resolve(process.cwd(), config.uploadsDir)));

  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/users', userRoutes);
  app.use('/api/v1/departments', departmentRoutes);
  app.use('/api/v1/subjects', subjectRoutes);
  app.use('/api/v1/admission-exams', admissionExamRoutes);
  app.use('/api/v1/sessions', sessionRoutes);
  app.use('/api/v1/audit-logs', auditRoutes);
  app.use('/api/v1/questions', questionRoutes);
  app.use('/api/v1/students', studentRoutes);
  app.use('/api/v1/evaluations', evaluationRoutes);
  app.use('/api/v1/adjudications', adjudicationRoutes);
  app.use('/api/v1/results', resultRoutes);

  app.use((_req, res) => {
    res.status(404).json({ success: false, error: 'Not found' });
  });

  app.use(errorHandler);

  return app;
}
