import type { FastifyInstance } from 'fastify';
import { registerCampaignsControllers } from './campaigns.controller.js';

export async function campaignsRoutes(app: FastifyInstance): Promise<void> {
  registerCampaignsControllers(app);
}
