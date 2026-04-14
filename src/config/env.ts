import { config } from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';

const envDir = dirname(fileURLToPath(import.meta.url));
config({ path: join(envDir, '..', '..', '.env'), override: true });

const mongoUriSchema = z
  .string()
  .min(1, 'MONGO_URI is required')
  .transform((s) => s.trim())
  .refine(
    (s) => s.startsWith('mongodb://') || s.startsWith('mongodb+srv://'),
    'MONGO_URI must start with mongodb:// or mongodb+srv://',
  );

const redisUrlSchema = z
  .string()
  .min(1, 'REDIS_URL is required')
  .transform((s) => s.trim())
  .pipe(z.string().url('REDIS_URL must be a valid URL'));

const envSchema = z.object({
  PORT: z.coerce
    .number({ invalid_type_error: 'PORT must be a number' })
    .int()
    .positive(),
  HOST: z
    .string()
    .min(1, 'HOST is required')
    .transform((s) => s.trim()),
  NODE_ENV: z.enum(['development', 'production', 'test']),
  MONGO_URI: mongoUriSchema,
  REDIS_URL: redisUrlSchema,
  RATE_LIMIT_MAX: z.coerce
    .number({ invalid_type_error: 'RATE_LIMIT_MAX must be a number' })
    .int()
    .positive(),
  RATE_LIMIT_WINDOW_MS: z.coerce
    .number({ invalid_type_error: 'RATE_LIMIT_WINDOW_MS must be a number' })
    .int()
    .positive(),
  CORS_ORIGIN: z.string().min(1).optional(),
  MONGO_DNS_SERVERS: z.string().min(1).optional(),
  /** If set, replaces `<db_password>` / `<password>` in MONGO_URI (URL-encoded). Safer for special characters than editing the URI. */
  MONGO_PASSWORD: z
    .string()
    .optional()
    .transform((s) => {
      const t = s?.trim();
      return t === '' || t === undefined ? undefined : t;
    }),
  /** If set, replaces `<db_username>` / `<username>` in MONGO_URI (URL-encoded). */
  MONGO_USERNAME: z
    .string()
    .optional()
    .transform((s) => {
      const t = s?.trim();
      return t === '' || t === undefined ? undefined : t;
    }),
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
