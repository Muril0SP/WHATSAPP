import { config } from './config/index.js';
import { prisma } from './db.js';
import { setupSocketIO } from './websocket/socket.js';
import { createApp } from './app.js';
import { logger } from './logger.js';

const { app, server } = createApp();
setupSocketIO(server);

server.listen(config.port, () => {
  logger.info({ port: config.port }, 'Backend rodando');
});

process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});
