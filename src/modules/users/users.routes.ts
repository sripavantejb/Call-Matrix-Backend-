import type { FastifyInstance } from 'fastify';
import { registerUsersControllers } from './users.controller.js';

export async function usersRoutes(app: FastifyInstance): Promise<void> {
  registerUsersControllers(app);
}
