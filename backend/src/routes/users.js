import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../db.js';
import { authMiddleware } from '../auth/middleware.js';

const router = Router();
router.use(authMiddleware);

router.get('/', async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: { tenantId: req.tenantId },
      select: { id: true, email: true, name: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ users });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Erro ao listar usuários' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email e senha são obrigatórios' });
    }
    const hashed = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        email: email.trim().toLowerCase(),
        password: hashed,
        name: name?.trim() || null,
        tenantId: req.tenantId,
      },
      select: { id: true, email: true, name: true, createdAt: true },
    });
    res.status(201).json({ user });
  } catch (e) {
    if (e.code === 'P2002') {
      return res.status(400).json({ error: 'Email já em uso nesta conta' });
    }
    res.status(500).json({ error: e.message || 'Erro ao criar usuário' });
  }
});

export default router;
