import express from 'express';
import cors from 'cors';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { config } from './config/index.js';
import { prisma } from './db.js';
import { setupSocketIO } from './websocket/socket.js';
import authRoutes from './routes/auth.js';
import whatsappRoutes from './routes/whatsapp.js';
import healthRoutes from './routes/health.js';
import usersRoutes from './routes/users.js';

const app = express();
const server = createServer(app);

app.use(cors({ origin: true }));
app.use(compression({
  level: 6,
  threshold: 1024,
  filter: (req, res) => {
    // Não comprimir arquivos de mídia (já são binários comprimidos)
    const ct = res.getHeader('Content-Type') || '';
    if (String(ct).startsWith('image/') || String(ct).startsWith('video/') || String(ct).startsWith('audio/')) {
      return false;
    }
    return compression.filter(req, res);
  },
}));
app.use(express.json({ limit: '2mb' }));

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 500,
  message: { error: 'Muitas requisições, tente novamente em breve.' },
  skip: (req) => req.originalUrl?.includes('/wa/profile-pic'),
});
app.use('/api', apiLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/wa', whatsappRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/health', healthRoutes);

setupSocketIO(server);

server.listen(config.port, () => {
  console.log(`Backend rodando em http://localhost:${config.port}`);
});

process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});
