import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { prisma } from '../db.js';
import { config } from '../config/index.js';
import { sendPasswordResetEmail } from '../services/email.js';

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
    const emailNorm = email.trim().toLowerCase();
    const usersWithEmail = await prisma.user.findMany({
      where: { email: emailNorm },
      include: { tenant: { select: { id: true, slug: true, name: true } } },
    });
    if (usersWithEmail.length === 0) return res.status(401).json({ error: 'Credenciais inválidas' });
    if (usersWithEmail.length > 1 && !tenantSlug) {
      return res.status(400).json({
        error: 'Este e-mail está em múltiplas empresas. Informe o slug da empresa.',
        tenants: usersWithEmail.map((u) => ({ slug: u.tenant.slug, name: u.tenant.name })),
      });
    }
    let user;
    if (tenantSlug) {
      const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
      if (!tenant) return res.status(401).json({ error: 'Credenciais inválidas' });
      user = usersWithEmail.find((u) => u.tenantId === tenant.id);
      if (!user) return res.status(401).json({ error: 'Credenciais inválidas' });
    } else {
      user = usersWithEmail[0];
    }
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

router.get('/tenants', async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) {
      return res.status(400).json({ error: 'Email é obrigatório' });
    }
    const users = await prisma.user.findMany({
      where: { email: email.trim().toLowerCase() },
      include: { tenant: { select: { slug: true, name: true } } },
    });
    const tenants = users.map((u) => ({ slug: u.tenant.slug, name: u.tenant.name }));
    res.json({ tenants });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Erro ao buscar empresas' });
  }
});

router.post('/forgot-password', async (req, res) => {
  try {
    const { email, tenantSlug } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email é obrigatório' });
    }
    const emailNorm = email.trim().toLowerCase();
    let tenant = null;
    if (tenantSlug) {
      tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
    }
    const users = await prisma.user.findMany({
      where: { email: emailNorm, ...(tenant && { tenantId: tenant.id }) },
      include: { tenant: true },
    });
    if (users.length === 0) {
      return res.json({ message: 'Se o e-mail existir, você receberá instruções.' });
    }
    if (users.length > 1 && !tenant) {
      return res.status(400).json({
        error: 'Este e-mail está em múltiplas empresas. Informe o slug da empresa.',
        tenants: users.map((u) => ({ slug: u.tenant.slug, name: u.tenant.name })),
      });
    }
    const user = users[0];
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await prisma.passwordReset.create({
      data: { email: emailNorm, token, tenantId: user.tenantId, expiresAt },
    });
    const resetLink = `${config.appUrl}/redefinir-senha?token=${token}`;
    await sendPasswordResetEmail(user.email, resetLink, user.tenant?.name);
    res.json({ message: 'Se o e-mail existir, você receberá instruções.' });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Erro ao enviar e-mail' });
  }
});

router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token e nova senha são obrigatórios' });
    }
    const reset = await prisma.passwordReset.findUnique({
      where: { token },
      include: { tenant: true },
    });
    if (!reset || reset.usedAt || reset.expiresAt < new Date()) {
      return res.status(400).json({ error: 'Link inválido ou expirado' });
    }
    const user = await prisma.user.findFirst({
      where: { email: reset.email, tenantId: reset.tenantId },
    });
    if (!user) return res.status(400).json({ error: 'Usuário não encontrado' });
    const hashed = await bcrypt.hash(newPassword, 10);
    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { password: hashed } }),
      prisma.passwordReset.update({ where: { id: reset.id }, data: { usedAt: new Date() } }),
    ]);
    res.json({ success: true, message: 'Senha alterada com sucesso' });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Erro ao redefinir senha' });
  }
});

export default router;
