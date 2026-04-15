import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { parseBody } from '../../utils/validation.js';
import { createAgent, deleteAgentForUser, listAgentsForUser } from './agents.service.js';

const createAgentSchema = z.object({
  agentName: z.string().min(1),
  prompt: z.string().min(1),
  voice: z.string().min(1),
  language: z.string().min(1),
});

export function registerAgentsControllers(app: FastifyInstance): void {
  app.post('/agents/create', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = parseBody(createAgentSchema, request.body, reply);
    if (body === null) {
      return;
    }

    const agent = await createAgent(request.currentUser.id, body);
    reply.status(201).send(agent);
  });

  app.get('/agents', async (request: FastifyRequest, reply: FastifyReply) => {
    const agents = await listAgentsForUser(request.currentUser.id);
    reply.send(agents);
  });

  app.delete('/agents/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) {
      reply.status(400).send({ message: 'Validation failed', issues: params.error.flatten() });
      return;
    }

    const result = await deleteAgentForUser(params.data.id, request.currentUser.id);
    if (!result.deleted) {
      reply.status(404).send({ message: 'Agent not found' });
      return;
    }

    reply.status(204).send();
  });
}
