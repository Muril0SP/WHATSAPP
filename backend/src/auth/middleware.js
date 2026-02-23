import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { prisma } from '../db.js';

export async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Token não informado' });
  }
  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: { tenant: true },
    });
    if (!user) return res.status(401).json({ error: 'Usuário não encontrado' });
    req.user = user;
    req.tenantId = user.tenantId;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Token inválido' });
  }
}
