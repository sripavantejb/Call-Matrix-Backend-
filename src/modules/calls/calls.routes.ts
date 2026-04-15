import type { FastifyInstance } from 'fastify';
import { registerCallsControllers } from './calls.controller.js';

export async function callsRoutes(app: FastifyInstance): Promise<void> {
  registerCallsControllers(app);
}
