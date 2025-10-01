import 'dotenv/config';

import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import Fastify, { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { createLogger } from '@dlmm-copilot/core';

import { env } from './config.js';
import { registerStrategyRoutes } from './routes/api.js';
import { defaultProblemType, sendProblem } from './utils/problem.js';

const logger = createLogger(env.LOG_LEVEL);

export const createServer = async (): Promise<void> => {
  const fastify: FastifyInstance = Fastify({
    logger: env.LOG_LEVEL === 'debug' ? { level: 'debug' } : false,
  });

  try {
    await fastify.register(helmet, {
      contentSecurityPolicy: false,
    });

    await fastify.register(cors, {
      origin: env.CORS_ORIGINS.split(',').map((origin) => origin.trim()),
      credentials: true,
    });

    await fastify.register(rateLimit, {
      max: 60,
      timeWindow: '1 minute',
      addHeaders: {
        'x-ratelimit-limit': true,
        'x-ratelimit-remaining': true,
        'x-ratelimit-reset': true,
      },
    });

    await fastify.register(swagger, {
      openapi: {
        info: {
          title: 'DLMM Strategy API',
          version: '1.0.0',
          description: 'Strategy orchestration service for the DLMM CoPilot',
        },
      },
    });

    await fastify.register(registerStrategyRoutes);

    fastify.get('/openapi.json', async () => fastify.swagger());

    fastify.setNotFoundHandler(async (_request, reply) =>
      sendProblem(reply, {
        type: defaultProblemType,
        title: 'Not Found',
        status: 404,
        detail: 'The requested resource does not exist.',
      }),
    );

    fastify.setErrorHandler(
      (
        error: Error & { statusCode?: number; type?: string; detail?: string; code?: string },
        _request: FastifyRequest,
        reply: FastifyReply,
      ) => {
        logger.error('Unhandled error', error);
        const status = error.statusCode && error.statusCode >= 400 ? error.statusCode : 500;
        const title = status === 500 ? 'Internal Server Error' : error.message;
        return sendProblem(reply, {
          type: error.type ?? defaultProblemType,
          title,
          status,
          detail: error.detail ?? (status === 500 ? undefined : error.message),
          code: error.code,
        });
      },
    );

    await fastify.listen({
      host: '0.0.0.0',
      port: env.STRATEGY_PORT ?? 4000,
    });

    logger.info(`Strategy service listening on port ${env.STRATEGY_PORT ?? 4000}`);
  } catch (error) {
    logger.error('Failed to start strategy service', error);
    process.exit(1);
  }

  const shutdown = async (signal: string): Promise<void> => {
    logger.warn(`Received ${signal}, shutting down strategy service`);
    try {
      await fastify.close();
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown', error);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
};

// ES module equivalent of require.main === module
if (import.meta.url === `file://${process.argv[1]}`) {
  void createServer();
}
