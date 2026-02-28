import { Router } from 'express';
import { getAllTenantStates } from '../wa/manager.js';
import { prisma } from '../db.js';
import { redisPing } from '../cache/redis.js';
import { config } from '../config/index.js';
import fs from 'fs';
import path from 'path';

const router = Router();

router.get('/', async (_req, res) => {
  const timestamp = new Date().toISOString();
  const states = getAllTenantStates();
  const tenantsConnected = Object.values(states).filter((s) => s.status === 'connected').length;

  let dbOk = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch (_) {}

  let redisOk = false;
  const hasRedis = !!config.redisUrl || !!process.env.REDIS_URL;
  if (hasRedis) {
    redisOk = await redisPing();
  } else {
    redisOk = null;
  }

  let storageOk = true;
  try {
    const storagePath = config.storagePath || path.join(process.cwd(), 'storage');
    fs.accessSync(storagePath, fs.constants.W_OK);
  } catch (_) {
    storageOk = false;
  }

  const ok = dbOk && (redisOk !== false) && storageOk;
  const status = ok ? 200 : 503;

  res.status(status).json({
    ok,
    timestamp,
    tenants: Object.keys(states).length,
    tenantsConnected,
    db: dbOk ? 'ok' : 'error',
    redis: hasRedis ? (redisOk ? 'ok' : 'error') : 'disabled',
    storage: storageOk ? 'ok' : 'error',
  });
});

export default router;
