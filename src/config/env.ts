import { config } from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';

const envDir = dirname(fileURLToPath(import.meta.url));
config({ path: join(envDir, '..', '..', '.env') });
const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  MONGO_URI: z
    .string()
    .min(1, 'MONGO_URI is required')
    .url('MONGO_URI must be a valid URL'),
  REDIS_URL: z
    .string()
    .min(1, 'REDIS_URL is required')
    .url('REDIS_URL must be a valid URL'),
  NODE_ENV: z.enum(['development', 'production', 'test']),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  CORS_ORIGIN: z.string().min(1).optional(),
  /** Comma-separated DNS servers (e.g. `8.8.8.8,1.1.1.1`) for Node SRV lookups when `mongodb+srv://` fails with querySrv errors. */
  MONGO_DNS_SERVERS: z.string().min(1).optional(),
});


export type Env = z.infer<typeof envSchema>;

export function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('Invalid environment configuration:', parsed.error.flatten());
    process.exit(1);
  }
  return parsed.data;
}
