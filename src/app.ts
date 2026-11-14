import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { errorHandler, notFoundHandler } from './middlewares/error-handler.js';
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
  // Retry-After is exposed so that the cross-origin web app can read it on 429 responses.
  app.use(cors({ origin: corsOrigins, exposedHeaders: ['Retry-After'] }));
  app.use(express.json({ limit: '100kb' }));
  app.use(pinoHttp({ logger }));

  app.use(healthRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
