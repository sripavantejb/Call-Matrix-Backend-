import dns from 'node:dns';
import mongoose from 'mongoose';
import type { Logger } from 'pino';
import type { Env } from './env.js';

const MAX_ATTEMPTS = 10;
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 30_000;

let connectionListenersBound = false;

/** True while `mongoose.disconnect()` is in progress so the `disconnected` event is not logged as an unexpected outage. */
let mongoDisconnectingIntentionally = false;

function bindConnectionListeners(logger: Logger): void {
  if (connectionListenersBound) {
    return;
  }
  connectionListenersBound = true;
  const log = logger.child({ component: 'mongodb' });

  mongoose.connection.on('connected', () => {
    log.info(
      {
        host: mongoose.connection.host,
        name: mongoose.connection.name,
        readyState: mongoose.connection.readyState,
      },
      'MongoDB connection active',
    );
  });

  mongoose.connection.on('error', (err: Error) => {
    log.error({ err }, 'MongoDB driver error');
  });

  mongoose.connection.on('disconnected', () => {
    if (mongoDisconnectingIntentionally) {
      return;
    }
    log.warn('MongoDB disconnected unexpectedly');
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isMongoSrvDnsFailure(err: unknown): boolean {
  if (!err || typeof err !== 'object') {
    return false;
  }
  const e = err as NodeJS.ErrnoException & { syscall?: string };
  return (
    e.syscall === 'querySrv' &&
    (e.code === 'ECONNREFUSED' || e.code === 'ENOTFOUND' || e.code === 'ETIMEOUT')
  );
}

const AUTH_PLACEHOLDER_PATTERN =
  /<db_password>|<password>|<db_username>|<username>/i;

function isUnrecoverableMongoAuthError(err: unknown): boolean {
  if (!err || typeof err !== 'object') {
    return false;
  }
  const e = err as { code?: number; codeName?: string; message?: string };
  if (e.code === 8000 || e.codeName === 'AtlasError') {
    return true;
  }
  const msg = typeof e.message === 'string' ? e.message : '';
  return /bad auth|authentication failed/i.test(msg);
}

/**
 * Substitutes Atlas-style placeholders using env vars so passwords with
 * reserved URI characters are encoded correctly.
 */
function resolveMongoConnectionUri(env: Env): string {
  let uri = env.MONGO_URI;
  const password = env.MONGO_PASSWORD;
  if (password) {
    uri = uri.replace(/<db_password>/gi, encodeURIComponent(password));
    uri = uri.replace(/<password>/gi, encodeURIComponent(password));
  }
  const username = env.MONGO_USERNAME;
  if (username) {
    uri = uri.replace(/<db_username>/gi, encodeURIComponent(username));
    uri = uri.replace(/<username>/gi, encodeURIComponent(username));
  }
  return uri;
}

/**
 * Connects Mongoose using `env.MONGO_URI` (from `.env` / process env).
 * Retries with exponential backoff until success or max attempts.
 */
function applyMongoDnsServers(env: Env, log: Logger): void {
  const raw = env.MONGO_DNS_SERVERS?.trim();
  if (!raw) {
    return;
  }
  const servers = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (servers.length === 0) {
    return;
  }
  dns.setServers(servers);
  log.info({ count: servers.length }, 'MongoDB: using MONGO_DNS_SERVERS for DNS resolution');
}

export async function connectMongo(env: Env, logger: Logger): Promise<void> {
  bindConnectionListeners(logger);
  const log = logger.child({ component: 'mongodb' });
  applyMongoDnsServers(env, log);
  const uri = resolveMongoConnectionUri(env);

  if (AUTH_PLACEHOLDER_PATTERN.test(uri)) {
    log.error(
      'MONGO_URI still contains placeholders such as <db_password>. Set MONGO_PASSWORD in .env (and MONGO_USERNAME if you use <db_username>), or paste the full URI from Atlas with your password URL-encoded.',
    );
    throw new Error('MONGO_URI authentication placeholders not resolved');
  }

  if (!uri.startsWith('mongodb://') && !uri.startsWith('mongodb+srv://')) {
    log.error('MONGO_URI must start with mongodb:// or mongodb+srv://');
    throw new Error('Invalid MONGO_URI scheme');
  }

  const connectOptions: mongoose.ConnectOptions = {
    serverSelectionTimeoutMS: 30_000,
    socketTimeoutMS: 45_000,
    maxPoolSize: 10,
    retryWrites: true,
    w: 'majority',
    // Helps on some networks where IPv6 to Atlas is flaky (e.g. Windows).
    family: 4,
  };

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      await mongoose.connect(uri, connectOptions);
      log.info(
        {
          attempt,
          db: mongoose.connection.db?.databaseName,
          host: mongoose.connection.host,
        },
        'MongoDB connect() resolved',
      );
      return;
    } catch (err) {
      if (isUnrecoverableMongoAuthError(err)) {
        log.error(
          { err },
          'MongoDB authentication failed (wrong user/password, user missing in Atlas Database Access, or IP not allowed in Network Access). Retrying will not help; fix credentials and restart.',
        );
        throw err;
      }
      if (isMongoSrvDnsFailure(err)) {
        log.error(
          'MongoDB SRV DNS lookup failed (querySrv). Set MONGO_DNS_SERVERS=8.8.8.8,1.1.1.1 in .env, use Atlas standard `mongodb://host1,host2,...` URI, or fix local DNS/VPN/firewall.',
        );
      }
      log.warn(
        { err, attempt, maxAttempts: MAX_ATTEMPTS },
        'MongoDB connection attempt failed',
      );
      if (attempt === MAX_ATTEMPTS) {
        log.error({ err }, 'MongoDB connection exhausted retries');
        throw err;
      }
      const delay = Math.min(BASE_DELAY_MS * 2 ** (attempt - 1), MAX_DELAY_MS);
      await sleep(delay);
    }
  }
}

export function getMongoConnection(): mongoose.Connection {
  return mongoose.connection;
}

export async function disconnectMongo(logger: Logger): Promise<void> {
  const log = logger.child({ component: 'mongodb' });
  if (mongoose.connection.readyState === 0) {
    return;
  }
  mongoDisconnectingIntentionally = true;
  try {
    await mongoose.disconnect();
    log.info('MongoDB disconnected');
  } finally {
    mongoDisconnectingIntentionally = false;
  }
}
