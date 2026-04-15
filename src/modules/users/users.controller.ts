import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { parseBody } from '../../utils/validation.js';
import { getProfile, updateProfileName } from './users.service.js';

const patchProfileSchema = z.object({
  name: z.string().min(1).optional(),
});

export function registerUsersControllers(app: FastifyInstance): void {
  app.get('/user/profile', async (request: FastifyRequest, reply: FastifyReply) => {
    const profile = await getProfile(request.currentUser.id);
    if (!profile) {
      reply.status(404).send({ message: 'User not found' });
      return;
    }
    reply.send(profile);
  });

  app.patch('/user/profile', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = parseBody(patchProfileSchema, request.body, reply);
    if (body === null) {
      return;
    }
    if (body.name === undefined) {
      reply.status(400).send({ message: 'No updatable fields provided' });
      return;
    }

    const profile = await updateProfileName(request.currentUser.id, body.name);
    reply.send(profile);
  });
}
