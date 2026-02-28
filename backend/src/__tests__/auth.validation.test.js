import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';

describe('Auth validation', () => {
  let app;

  beforeAll(() => {
    const { app: a } = createApp();
    app = a;
  });

  it('POST /api/auth/register rejeita email inválido', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'invalido', password: '123456' })
      .expect(400);

    expect(res.body.error).toMatch(/email|inválido/i);
  });

  it('POST /api/auth/register rejeita senha curta', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'test@example.com', password: '12345' })
      .expect(400);

    expect(res.body.error).toMatch(/senha|6/i);
  });

  it('POST /api/auth/login rejeita email inválido', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nao-email', password: 'qualquer' })
      .expect(400);

    expect(res.body.error).toMatch(/email|inválido/i);
  });

  it('POST /api/auth/login rejeita sem senha', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com' })
      .expect(400);

    expect(res.body.error).toBeDefined();
  });
});
