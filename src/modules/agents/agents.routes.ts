import type { FastifyInstance } from 'fastify';
import { registerAgentsControllers } from './agents.controller.js';

export async function agentsRoutes(app: FastifyInstance): Promise<void> {
  registerAgentsControllers(app);
}
