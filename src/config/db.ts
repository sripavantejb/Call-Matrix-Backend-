import dns from 'node:dns';
import mongoose from 'mongoose';
import type { Logger } from 'pino';
import type { Env } from './env.js';

const MAX_ATTEMPTS = 10;
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 30_000;

let connectionListenersBound = false;

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
    log.warn('MongoDB disconnected');
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
  const uri = env.MONGO_URI.trim();

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
  await mongoose.disconnect();
  log.info('MongoDB disconnected');
}
