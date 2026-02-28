import { Server } from 'socket.io';
import { getClient } from '../wa/manager.js';

let io = null;

export function setSocketIO(socketIO) {
  io = socketIO;
}

export function getSocketIO() {
  return io;
}

export function setupSocketIO(server) {
  io = new Server(server, {
    cors: { origin: '*' },
    path: '/socket.io',
    pingTimeout: 30000,
    pingInterval: 15000,
    upgradeTimeout: 10000,
    maxHttpBufferSize: 1e6,
    transports: ['websocket', 'polling'],
    connectionStateRecovery: {
      maxDisconnectionDuration: 2 * 60 * 1000,
      skipMiddlewares: true,
    },
  });

  io.on('connection', (socket) => {
    const tenantId =
      socket.handshake.auth?.tenantId ?? socket.handshake.query?.tenantId;
    if (tenantId) {
      socket.join(`tenant:${tenantId}`);
    }

    socket.on('typing', async ({ chatId }) => {
      if (!tenantId || !chatId) return;
      const client = getClient(tenantId);
      if (!client?.info) return;
      try {
        const chat = await client.getChatById(chatId);
        await chat.sendStateTyping();
      } catch (_) {}
    });

    socket.on('typing_stop', async ({ chatId }) => {
      if (!tenantId || !chatId) return;
      const client = getClient(tenantId);
      if (!client?.info) return;
      try {
        const chat = await client.getChatById(chatId);
        await chat.clearState();
      } catch (_) {}
    });
  });

  return io;
}
