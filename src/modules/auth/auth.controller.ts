import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Env } from '../../config/env.js';
import { appendSystemLog } from '../admin/system-log.service.js';
import { signUserAccessToken } from '../../utils/jwt.js';
import { parseBody } from '../../utils/validation.js';
import { loginWithPassword } from './auth.service.js';

const loginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export function registerAuthControllers(app: FastifyInstance, env: Env): void {
  app.post('/auth/login', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = parseBody(loginBodySchema, request.body, reply);
    if (body === null) {
      return;
    }

    const result = await loginWithPassword(body.email, body.password, env);

    if (!result.ok) {
      void appendSystemLog({
        type: 'login',
        message:
          result.reason === 'disabled'
            ? `Login blocked (disabled): ${body.email}`
            : `Login failed: ${body.email}`,
        metadata: { email: body.email, reason: result.reason },
      }).catch(() => {});
      if (result.reason === 'disabled') {
        reply.status(403).send({ message: 'Account disabled' });
        return;
      }
      reply.status(401).send({ message: 'Invalid email or password' });
      return;
    }

    void appendSystemLog({
      type: 'login',
      message: `Login success: ${result.user.email}`,
      userId: result.user.id,
    }).catch(() => {});

    const token = signUserAccessToken(
      app,
      {
        userId: result.user.id,
        role: result.user.role,
        email: result.user.email,
      },
      env.JWT_EXPIRES_IN,
    );

    reply.send({
      token,
      user: {
        id: result.user.id,
        email: result.user.email,
        role: result.user.role,
      },
    });
  });
}
