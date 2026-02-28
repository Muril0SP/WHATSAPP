import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';

describe('Health API', () => {
  let app;

  beforeAll(() => {
    const { app: a } = createApp();
    app = a;
  });

  it('GET /api/health retorna status e componentes', async () => {
    const res = await request(app).get('/api/health');

    expect([200, 503]).toContain(res.status);
    expect(res.body).toHaveProperty('ok');
    expect(res.body).toHaveProperty('timestamp');
    expect(res.body).toHaveProperty('db');
    expect(res.body).toHaveProperty('redis');
    expect(res.body).toHaveProperty('storage');
    expect(res.body).toHaveProperty('tenants');
    expect(res.body).toHaveProperty('tenantsConnected');
  });
});
