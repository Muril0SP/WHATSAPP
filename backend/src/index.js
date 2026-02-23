import express from 'express';
import cors from 'cors';
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
app.use(express.json());

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
