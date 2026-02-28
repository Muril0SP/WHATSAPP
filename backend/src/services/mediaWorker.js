import { saveMedia } from '../storage/index.js';
import { prisma } from '../db.js';
import { getSocketIO } from '../websocket/socket.js';

const activeDownloads = new Set();

function emitMediaReady(tenantId, messageId, chatId, mediaPath, mimeType) {
  try {
    const io = getSocketIO();
    if (io) {
      io.to(`tenant:${tenantId}`).emit('media_ready', {
        messageId,
        chatId,
        mediaPath,
        mimeType,
      });
    }
  } catch (_) {}
}

/**
 * Baixa mídia de uma mensagem em background sem bloquear a thread principal.
 * Emite `media_ready` via Socket.io quando concluído.
 */
export function downloadMediaBackground(tenantId, msg, msgObject) {
  const key = `${tenantId}:${msg.id}`;
  if (activeDownloads.has(key)) return;
  activeDownloads.add(key);

  setImmediate(async () => {
    try {
      const media = await msgObject.downloadMedia();
      if (!media?.data) return;

      const buffer = Buffer.from(media.data, 'base64');
      const filename =
        media.filename ||
        `media.${(media.mimetype || '').split('/')[1] || 'bin'}`;
      const safeId = msg.id.replace(/[^a-zA-Z0-9.-]/g, '_');
      const relativePath = await saveMedia(
        tenantId,
        safeId,
        buffer,
        media.mimetype || '',
        filename
      );

      await prisma.message.upsert({
        where: {
          tenantId_waMessageId: { tenantId, waMessageId: msg.id },
        },
        create: {
          tenantId,
          chatId: msg.chatId,
          waMessageId: msg.id,
          fromMe: msg.fromMe,
          body: msg.body || null,
          type: msg.type || 'chat',
          mediaPath: relativePath,
          mimeType: media.mimetype || null,
          timestamp: new Date(msg.timestamp),
        },
        update: {
          mediaPath: relativePath,
          mimeType: media.mimetype || null,
        },
      });

      emitMediaReady(tenantId, msg.id, msg.chatId, relativePath, media.mimetype);
    } catch (e) {
      console.warn('[mediaWorker] download failed:', msg.id, e.message);
    } finally {
      activeDownloads.delete(key);
    }
  });
}
