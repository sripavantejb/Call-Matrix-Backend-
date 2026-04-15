import type { FastifyInstance } from 'fastify';
import type { Env } from '../../config/env.js';
import { registerAdminControllers } from './admin.controller.js';

export async function adminRoutes(app: FastifyInstance, env: Env): Promise<void> {
  registerAdminControllers(app, env);
}
