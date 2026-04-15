import type { FastifyInstance } from 'fastify';
import type { Env } from '../../config/env.js';
import { registerAuthControllers } from './auth.controller.js';

export async function authRoutes(app: FastifyInstance, env: Env): Promise<void> {
  registerAuthControllers(app, env);
}
