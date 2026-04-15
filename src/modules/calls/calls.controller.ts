import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { parseQuery } from '../../utils/validation.js';
import { listCallsForUser } from './calls.service.js';

const listQuerySchema = z.object({
  campaignId: z.string().uuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export function registerCallsControllers(app: FastifyInstance): void {
  app.get('/calls', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = parseQuery(listQuerySchema, request.query, reply);
    if (query === null) {
      return;
    }

    const calls = await listCallsForUser(request.currentUser.id, query);
    reply.send(calls);
  });
}
