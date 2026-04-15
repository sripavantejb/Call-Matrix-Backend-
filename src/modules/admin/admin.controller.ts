import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../config/database.js';
import type { Env } from '../../config/env.js';
import { parseBody } from '../../utils/validation.js';
import {
  createCredentialForUser,
  listCredentialsForAdmin,
  regenerateApiKeysForUser,
  revokeCredentialById,
} from './admin-credential.service.js';
import {
  deleteAgentByIdAdmin,
  deleteCampaignByIdAdmin,
  getAdminAnalytics,
  getDashboardStats,
  listAllAgentsAdmin,
  listAllCallsAdmin,
  listAllCampaignsAdmin,
} from './admin-platform.service.js';
import {
  createSaaSUser,
  deleteUserById,
  getUsageAnalytics,
  listAllUsers,
  resetUserPassword,
  setUserStatus,
  updateUserById,
} from './admin.service.js';
import { getOrCreatePlatformSettings, mergePlatformSettings } from './settings.service.js';
import { appendSystemLog, listSystemLogs } from './system-log.service.js';

const createUserBodySchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  company: z.string().min(1),
  plan: z.string().min(1),
  /** Optional login password for the main app; omit to auto-generate. */
  password: z.string().min(8).max(128).optional(),
});

const patchUserSchema = z
  .object({
    name: z.string().min(1).optional(),
    company: z.string().min(1).optional(),
    plan: z.string().min(1).optional(),
    status: z.enum(['active', 'disabled']).optional(),
    role: z.enum(['admin', 'user']).optional(),
  })
  .refine((o) => Object.keys(o).length > 0, { message: 'At least one field required' });

const statusBodySchema = z.object({
  status: z.enum(['active', 'disabled']),
});

const usageQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

const callsQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  userId: z.string().uuid().optional(),
  campaignId: z.string().uuid().optional(),
});

const logsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  type: z.enum(['login', 'api_request', 'call_error']).optional(),
  userId: z.string().uuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

const settingsPatchSchema = z.record(z.string(), z.unknown());

const uuidParam = z.object({ id: z.string().uuid() });

const credentialCreateBody = z.object({
  user_id: z.string().uuid(),
});

const regenerateBody = z.object({
  user_id: z.string().uuid(),
});

export function registerAdminControllers(app: FastifyInstance, env: Env): void {
  app.get('/admin/dashboard', async (_request: FastifyRequest, reply: FastifyReply) => {
    const stats = await getDashboardStats();
    reply.send({
      totalUsers: stats.totalUsers,
      activeUsers: stats.activeUsers,
      totalCalls: stats.totalCalls,
      callsLast30Days: stats.callsLast30Days,
      totalCampaigns: stats.totalCampaigns,
      totalAgents: stats.totalAgents,
      systemUsageMinutes: stats.systemUsageMinutes,
      talkTimeLast30DaysMinutes: stats.talkTimeLast30DaysMinutes,
    });
  });

  app.post('/admin/users/create', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = parseBody(createUserBodySchema, request.body, reply);
    if (body === null) return;
    try {
      const result = await createSaaSUser(body, env);
      reply.status(201).send(result);
    } catch (err) {
      if (err instanceof Error && (err as Error & { code?: string }).code === 'EMAIL_TAKEN') {
        reply.status(409).send({ message: 'Email already registered' });
        return;
      }
      throw err;
    }
  });

  app.post('/admin/create-user', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = parseBody(createUserBodySchema, request.body, reply);
    if (body === null) return;
    try {
      const result = await createSaaSUser(body, env);
      reply.status(201).send(result);
    } catch (err) {
      if (err instanceof Error && (err as Error & { code?: string }).code === 'EMAIL_TAKEN') {
        reply.status(409).send({ message: 'Email already registered' });
        return;
      }
      throw err;
    }
  });

  app.get('/admin/users', async (_request: FastifyRequest, reply: FastifyReply) => {
    const users = await listAllUsers();
    reply.send(users);
  });

  app.patch('/admin/users/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const params = uuidParam.safeParse(request.params);
    if (!params.success) {
      reply.status(400).send({ message: 'Validation failed', issues: params.error.flatten() });
      return;
    }
    const body = parseBody(patchUserSchema, request.body, reply);
    if (body === null) return;
    try {
      await updateUserById(params.data.id, body, request.currentUser.id);
      reply.send({ ok: true });
    } catch (err) {
      const code = err instanceof Error && (err as Error & { code?: string }).code;
      if (code === 'NOT_FOUND') {
        reply.status(404).send({ message: 'User not found' });
        return;
      }
      if (code === 'LAST_ADMIN') {
        reply.status(400).send({ message: (err as Error).message });
        return;
      }
      throw err;
    }
  });

  app.patch('/admin/user/:id/status', async (request: FastifyRequest, reply: FastifyReply) => {
    const params = uuidParam.safeParse(request.params);
    if (!params.success) {
      reply.status(400).send({ message: 'Validation failed', issues: params.error.flatten() });
      return;
    }
    const body = parseBody(statusBodySchema, request.body, reply);
    if (body === null) return;
    const exists = await prisma.user.findUnique({
      where: { id: params.data.id },
      select: { id: true },
    });
    if (!exists) {
      reply.status(404).send({ message: 'User not found' });
      return;
    }
    await setUserStatus(params.data.id, body.status);
    reply.send({ ok: true });
  });

  app.delete('/admin/users/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const params = uuidParam.safeParse(request.params);
    if (!params.success) {
      reply.status(400).send({ message: 'Validation failed', issues: params.error.flatten() });
      return;
    }
    if (params.data.id === request.currentUser.id) {
      reply.status(400).send({ message: 'Cannot delete your own account' });
      return;
    }
    try {
      await deleteUserById(params.data.id);
    } catch {
      reply.status(404).send({ message: 'User not found' });
      return;
    }
    reply.status(204).send();
  });

  app.delete('/admin/user/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const params = uuidParam.safeParse(request.params);
    if (!params.success) {
      reply.status(400).send({ message: 'Validation failed', issues: params.error.flatten() });
      return;
    }
    if (params.data.id === request.currentUser.id) {
      reply.status(400).send({ message: 'Cannot delete your own account' });
      return;
    }
    try {
      await deleteUserById(params.data.id);
    } catch {
      reply.status(404).send({ message: 'User not found' });
      return;
    }
    reply.status(204).send();
  });

  app.post('/admin/user/:id/reset-password', async (request: FastifyRequest, reply: FastifyReply) => {
    const params = uuidParam.safeParse(request.params);
    if (!params.success) {
      reply.status(400).send({ message: 'Validation failed', issues: params.error.flatten() });
      return;
    }
    try {
      const { password } = await resetUserPassword(params.data.id, env);
      reply.send({ password });
    } catch {
      reply.status(404).send({ message: 'User not found' });
    }
  });

  app.post('/admin/credentials/create', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = parseBody(credentialCreateBody, request.body, reply);
    if (body === null) return;
    try {
      const result = await createCredentialForUser(body.user_id, env);
      reply.status(201).send(result);
    } catch (err) {
      if ((err as Error & { code?: string }).code === 'NOT_FOUND') {
        reply.status(404).send({ message: 'User not found' });
        return;
      }
      throw err;
    }
  });

  app.get('/admin/credentials', async (request: FastifyRequest, reply: FastifyReply) => {
    const includeRevoked =
      typeof request.query === 'object' && request.query !== null
        ? (request.query as Record<string, string>).includeRevoked === 'true'
        : false;
    const rows = await listCredentialsForAdmin(includeRevoked);
    reply.send(rows);
  });

  app.delete('/admin/credentials/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const params = uuidParam.safeParse(request.params);
    if (!params.success) {
      reply.status(400).send({ message: 'Validation failed', issues: params.error.flatten() });
      return;
    }
    try {
      await revokeCredentialById(params.data.id, request.currentUser.id);
      reply.status(204).send();
    } catch (err) {
      const code = (err as Error & { code?: string }).code;
      if (code === 'NOT_FOUND') {
        reply.status(404).send({ message: 'Credential not found' });
        return;
      }
      if (code === 'LAST_CREDENTIAL') {
        reply.status(400).send({ message: (err as Error).message });
        return;
      }
      throw err;
    }
  });

  app.post('/admin/api/regenerate', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = parseBody(regenerateBody, request.body, reply);
    if (body === null) return;
    try {
      const result = await regenerateApiKeysForUser(body.user_id, env);
      reply.send(result);
    } catch (err) {
      if ((err as Error & { code?: string }).code === 'NOT_FOUND') {
        reply.status(404).send({ message: 'User not found' });
        return;
      }
      throw err;
    }
  });

  app.get('/admin/agents', async (_request: FastifyRequest, reply: FastifyReply) => {
    const agents = await listAllAgentsAdmin();
    reply.send(agents);
  });

  app.delete('/admin/agents/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const params = uuidParam.safeParse(request.params);
    if (!params.success) {
      reply.status(400).send({ message: 'Validation failed', issues: params.error.flatten() });
      return;
    }
    try {
      await deleteAgentByIdAdmin(params.data.id);
      reply.status(204).send();
    } catch {
      reply.status(404).send({ message: 'Agent not found' });
    }
  });

  app.get('/admin/campaigns', async (_request: FastifyRequest, reply: FastifyReply) => {
    const campaigns = await listAllCampaignsAdmin();
    reply.send(campaigns);
  });

  const deleteCampaignHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const params = uuidParam.safeParse(request.params);
    if (!params.success) {
      reply.status(400).send({ message: 'Validation failed', issues: params.error.flatten() });
      return;
    }
    try {
      await deleteCampaignByIdAdmin(params.data.id);
      reply.status(204).send();
    } catch {
      reply.status(404).send({ message: 'Campaign not found' });
    }
  };

  app.delete('/admin/campaign/:id', deleteCampaignHandler);
  app.delete('/admin/campaigns/:id', deleteCampaignHandler);

  app.get('/admin/calls', async (request: FastifyRequest, reply: FastifyReply) => {
    const q = callsQuerySchema.safeParse(request.query);
    if (!q.success) {
      reply.status(400).send({ message: 'Validation failed', issues: q.error.flatten() });
      return;
    }
    const calls = await listAllCallsAdmin({
      from: q.data.from,
      to: q.data.to,
      userId: q.data.userId,
      campaignId: q.data.campaignId,
    });
    reply.send(calls);
  });

  app.get('/admin/analytics', async (request: FastifyRequest, reply: FastifyReply) => {
    const q = usageQuerySchema.safeParse(request.query);
    if (!q.success) {
      reply.status(400).send({ message: 'Validation failed', issues: q.error.flatten() });
      return;
    }
    const analytics = await getAdminAnalytics(q.data.from, q.data.to);
    reply.send(analytics);
  });

  app.get('/admin/usage', async (request: FastifyRequest, reply: FastifyReply) => {
    const q = usageQuerySchema.safeParse(request.query);
    if (!q.success) {
      reply.status(400).send({ message: 'Validation failed', issues: q.error.flatten() });
      return;
    }
    const analytics = await getUsageAnalytics(q.data.from, q.data.to);
    reply.send(analytics);
  });

  app.get('/admin/logs', async (request: FastifyRequest, reply: FastifyReply) => {
    const q = logsQuerySchema.safeParse(request.query);
    if (!q.success) {
      reply.status(400).send({ message: 'Validation failed', issues: q.error.flatten() });
      return;
    }
    const skip = (q.data.page - 1) * q.data.limit;
    const logs = await listSystemLogs({
      take: q.data.limit,
      skip,
      type: q.data.type,
      userId: q.data.userId,
      from: q.data.from,
      to: q.data.to,
    });
    reply.send({ page: q.data.page, limit: q.data.limit, items: logs });
  });

  app.get('/admin/settings', async (_request: FastifyRequest, reply: FastifyReply) => {
    const config = await getOrCreatePlatformSettings();
    reply.send(config);
  });

  app.patch('/admin/settings', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = parseBody(settingsPatchSchema, request.body, reply);
    if (body === null) return;
    const merged = await mergePlatformSettings(body);
    reply.send(merged);
  });
}
