import { Router } from 'express';
import { getAllTenantStates } from '../wa/manager.js';

const router = Router();

router.get('/', (_req, res) => {
  const states = getAllTenantStates();
  const connected = Object.values(states).filter((s) => s.status === 'connected').length;
  res.json({
    ok: true,
    timestamp: new Date().toISOString(),
    tenants: Object.keys(states).length,
    connected,
  });
});

export default router;
