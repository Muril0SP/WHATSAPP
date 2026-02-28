import Redis from 'ioredis';
import { config } from '../config/index.js';

let client = null;
let connected = false;

function getClient() {
  if (client) return client;
  const url = config.redisUrl || process.env.REDIS_URL;
  if (!url) return null;

  client = new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: (times) => {
      if (times > 3) return null;
      return Math.min(times * 500, 2000);
    },
  });

  client.on('connect', () => {
    connected = true;
  });
  client.on('error', () => {
    connected = false;
  });
  client.on('close', () => {
    connected = false;
  });

  client.connect().catch(() => {});
  return client;
}

export async function cacheGet(key) {
  try {
    const c = getClient();
    if (!c || !connected) return null;
    const val = await c.get(key);
    return val ? JSON.parse(val) : null;
  } catch {
    return null;
  }
}

export async function cacheSet(key, value, ttlSeconds = 30) {
  try {
    const c = getClient();
    if (!c || !connected) return;
    await c.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch {
    // Redis não disponível — continua sem cache
  }
}

export async function cacheDel(key) {
  try {
    const c = getClient();
    if (!c || !connected) return;
    await c.del(key);
  } catch {
    // ignorar
  }
}

export function isRedisConnected() {
  return connected;
}

export async function redisPing() {
  try {
    const c = getClient();
    if (!c) return false;
    await c.ping();
    return true;
  } catch {
    return false;
  }
}

export { getClient };
