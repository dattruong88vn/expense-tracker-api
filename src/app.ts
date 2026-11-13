import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { healthRouter } from './routes/health.routes.js';
import { logger } from './utils/logger.js';

export interface AppOptions {
  corsOrigins: string[];
}

/** Builds the Express application without listening, so that Supertest can drive it. */
export function createApp({ corsOrigins }: AppOptions): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: corsOrigins }));
  app.use(express.json({ limit: '100kb' }));
  app.use(pinoHttp({ logger }));

  app.use(healthRouter);

  return app;
}
