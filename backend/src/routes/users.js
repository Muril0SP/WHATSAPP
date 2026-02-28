import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../db.js';
import { authMiddleware } from '../auth/middleware.js';
import {
  handleValidationErrors,
  usersCreate,
  usersUpdate,
  usersChangePassword,
  usersDelete,
} from '../validators/index.js';

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

router.post('/', usersCreate, handleValidationErrors, async (req, res) => {
  try {
    const { email, password, name } = req.body;
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

router.patch('/me/password', usersChangePassword, handleValidationErrors, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
    const ok = await bcrypt.compare(currentPassword, user.password);
    if (!ok) return res.status(401).json({ error: 'Senha atual incorreta' });
    const hashed = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashed },
    });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Erro ao trocar senha' });
  }
});

router.patch('/:id', usersUpdate, handleValidationErrors, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email } = req.body;
    const target = await prisma.user.findFirst({
      where: { id, tenantId: req.tenantId },
    });
    if (!target) return res.status(404).json({ error: 'Usuário não encontrado' });
    const data = {};
    if (name !== undefined) data.name = name?.trim() || null;
    if (email !== undefined) data.email = email.trim().toLowerCase();
    const user = await prisma.user.update({
      where: { id },
      data,
      select: { id: true, email: true, name: true, createdAt: true },
    });
    res.json({ user });
  } catch (e) {
    if (e.code === 'P2002') {
      return res.status(400).json({ error: 'Email já em uso nesta conta' });
    }
    res.status(500).json({ error: e.message || 'Erro ao atualizar usuário' });
  }
});

router.delete('/:id', usersDelete, handleValidationErrors, async (req, res) => {
  try {
    const { id } = req.params;
    if (id === req.user.id) {
      return res.status(400).json({ error: 'Não é possível remover seu próprio usuário' });
    }
    const target = await prisma.user.findFirst({
      where: { id, tenantId: req.tenantId },
    });
    if (!target) return res.status(404).json({ error: 'Usuário não encontrado' });
    await prisma.user.delete({ where: { id } });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Erro ao remover usuário' });
  }
});

export default router;
