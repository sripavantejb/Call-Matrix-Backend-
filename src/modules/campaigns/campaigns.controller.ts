import { CampaignStatus } from '@prisma/client';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { parseBody } from '../../utils/validation.js';
import { createCampaign, listCampaignsForUser, setCampaignStatus } from './campaigns.service.js';

const createCampaignSchema = z.object({
  campaignName: z.string().min(1),
  agentId: z.string().uuid(),
});

export function registerCampaignsControllers(app: FastifyInstance): void {
  app.post('/campaign/create', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = parseBody(createCampaignSchema, request.body, reply);
    if (body === null) {
      return;
    }

    const result = await createCampaign(request.currentUser.id, body);
    if (!result.ok) {
      reply.status(400).send({ message: 'Agent not found' });
      return;
    }

    reply.status(201).send(result.campaign);
  });

  app.get('/campaigns', async (request: FastifyRequest, reply: FastifyReply) => {
    const campaigns = await listCampaignsForUser(request.currentUser.id);
    reply.send(campaigns);
  });

  app.post('/campaign/:id/start', async (request: FastifyRequest, reply: FastifyReply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) {
      reply.status(400).send({ message: 'Validation failed', issues: params.error.flatten() });
      return;
    }

    const result = await setCampaignStatus(
      request.currentUser.id,
      params.data.id,
      CampaignStatus.active,
    );
    if (!result.ok) {
      reply.status(404).send({ message: 'Campaign not found' });
      return;
    }
    reply.send(result.campaign);
  });

  app.post('/campaign/:id/stop', async (request: FastifyRequest, reply: FastifyReply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) {
      reply.status(400).send({ message: 'Validation failed', issues: params.error.flatten() });
      return;
    }

    const result = await setCampaignStatus(
      request.currentUser.id,
      params.data.id,
      CampaignStatus.stopped,
    );
    if (!result.ok) {
      reply.status(404).send({ message: 'Campaign not found' });
      return;
    }
    reply.send(result.campaign);
  });
}
