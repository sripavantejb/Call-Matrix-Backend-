# Call Matrix — backend API

Fastify + PostgreSQL (Prisma) + Redis (rate limiting) + JWT authentication with role-based access (`admin` vs `user`).

## Prerequisites

- Node.js 20+
- PostgreSQL 14+ (or use Docker — see repo root `docker-compose.yml`: `docker compose up -d`)
- Redis 6+

## Setup

1. Copy environment variables:

   ```bash
   cp .env.example .env
   ```

   Edit `.env`: set `DATABASE_URL`, `REDIS_URL`, and a strong `JWT_SECRET` (at least 32 characters).

2. Install dependencies and generate Prisma Client:

   ```bash
   npm install
   npm run db:generate
   ```

3. Apply database migrations:

   ```bash
   npm run db:migrate
   ```

   Or push schema in development without migration history:

   ```bash
   npm run db:push
   ```

4. (Recommended for the web admin panel) Seed the first super admin — set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env` (defaults in `.env.example` match the frontend admin login at `/admin/login`). Then:

   ```bash
   npm run db:seed
   ```

   Point the frontend’s `VITE_API_URL` at this API so `POST /auth/login` returns a JWT with `role: admin` (required for all `/admin/*` routes).

5. Run the server:

   ```bash
   npm run dev
   ```

   API listens on `PORT` (default `3000`). Health check: `GET /health`.

## Roles

- **admin** — Platform operators: full admin API (`GET /admin/dashboard`, `POST /admin/users/create`, `GET/PATCH/DELETE /admin/users/:id`, credentials, platform-wide agents/campaigns/calls, `GET /admin/analytics`, `GET /admin/logs`, `GET/PATCH /admin/settings`, plus legacy aliases such as `POST /admin/create-user` and `GET /admin/usage`).
- **user** — Customer tenant: agents, campaigns, calls, and `GET`/`PATCH` `/user/profile`.

Both roles can use `/user/profile`. Tenant resources (`/agents`, `/campaigns`, `/calls`) require `role: user`.

After migrating the DB, new tables support **multiple API credentials per user** (`api_credentials`), **platform settings** (`platform_settings`), and **system logs** (`system_logs`). Run `npm run db:migrate` to apply [prisma/migrations/20260415190000_admin_platform](prisma/migrations/20260415190000_admin_platform/migration.sql).

## Example requests

See [docs/api-examples.http](docs/api-examples.http).

## Project layout

- `src/server.ts` — entrypoint, graceful shutdown (HTTP, Prisma, Redis).
- `src/app.ts` — Fastify app: security plugins, JWT, Redis-backed rate limits, route groups.
- `src/config/` — environment (`env.ts`), Prisma (`database.ts`), Redis (`redis.ts`), logging (`logger.ts`).
- `src/modules/*` — feature modules (controllers + services + optional `*.routes.ts`).
- `src/middleware/` — JWT auth and role guards.
- `prisma/schema.prisma` — data model and migrations under `prisma/migrations/`.

## Scripts

| Script        | Description                |
|---------------|----------------------------|
| `npm run dev` | `tsx watch` development    |
| `npm run build` | `prisma generate` + `tsc` |
| `npm start`   | Run compiled `dist/server.js` |
| `npm run db:generate` | `prisma generate` |
| `npm run db:migrate`  | `prisma migrate dev` |
| `npm run db:push`     | `prisma db push` |
| `npm run db:seed`     | `prisma db seed` |
