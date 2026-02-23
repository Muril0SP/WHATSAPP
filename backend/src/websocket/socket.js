import { Server } from 'socket.io';

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
  });

  io.on('connection', (socket) => {
    const tenantId = socket.handshake.auth?.tenantId ?? socket.handshake.query?.tenantId;
    if (tenantId) {
      socket.join(`tenant:${tenantId}`);
    }
  });

  return io;
}
