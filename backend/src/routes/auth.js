import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../db.js';
import { config } from '../config/index.js';

const router = Router();

router.post('/register', async (req, res) => {
  try {
    const { email, password, name, tenantName } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email e senha são obrigatórios' });
    }
    const slug = (tenantName || email.split('@')[0])
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');
    const existing = await prisma.tenant.findUnique({ where: { slug } });
    let tenant = existing;
    if (!tenant) {
      tenant = await prisma.tenant.create({
        data: { name: tenantName || slug, slug },
      });
    }
    const hashed = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        email,
        password: hashed,
        name: name || null,
        tenantId: tenant.id,
      },
      include: { tenant: true },
    });
    const token = jwt.sign(
      { userId: user.id, tenantId: user.tenantId },
      config.jwtSecret,
      { expiresIn: '7d' }
    );
    res.status(201).json({
      token,
      user: { id: user.id, email: user.email, name: user.name, tenant: user.tenant },
    });
  } catch (e) {
    if (e.code === 'P2002') {
      return res.status(400).json({ error: 'Email já em uso neste tenant' });
    }
    res.status(500).json({ error: e.message || 'Erro ao registrar' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password, tenantSlug } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email e senha são obrigatórios' });
    }
    const where = { email };
    if (tenantSlug) {
      const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
      if (!tenant) return res.status(401).json({ error: 'Credenciais inválidas' });
      where.tenantId = tenant.id;
    }
    const user = await prisma.user.findFirst({ where, include: { tenant: true } });
    if (!user) return res.status(401).json({ error: 'Credenciais inválidas' });
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: 'Credenciais inválidas' });
    const token = jwt.sign(
      { userId: user.id, tenantId: user.tenantId },
      config.jwtSecret,
      { expiresIn: '7d' }
    );
    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, tenant: user.tenant },
    });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Erro ao fazer login' });
  }
});

export default router;
