import pino from 'pino';
import type { Logger } from 'pino';
import type { Env } from './env.js';

export function createLogger(env: Env): Logger {
  if (env.NODE_ENV === 'development') {
    return pino({
      level: 'debug',
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
        },
      },
    });
  }
  return pino({ level: 'info' });
}
