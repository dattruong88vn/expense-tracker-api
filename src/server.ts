import 'dotenv/config';
import mongoose from 'mongoose';
import { createApp } from './app.js';
import { loadEnv } from './config/env.js';
import { logger } from './utils/logger.js';

async function main(): Promise<void> {
  const env = loadEnv();

  await mongoose.connect(env.MONGODB_URI);
  logger.info('Connected to MongoDB');

  const server = createApp({ corsOrigins: env.CORS_ORIGINS }).listen(env.PORT, () => {
    logger.info({ port: env.PORT }, 'API listening');
  });

  const shutdown = (signal: string): void => {
    logger.info({ signal }, 'Shutting down');
    server.close(() => {
      void mongoose.disconnect().finally(() => process.exit(0));
    });
  };
  process.on('SIGTERM', () => {
    shutdown('SIGTERM');
  });
  process.on('SIGINT', () => {
    shutdown('SIGINT');
  });
}

main().catch((err: unknown) => {
  logger.fatal({ err }, 'Failed to start the API');
  process.exit(1);
});
