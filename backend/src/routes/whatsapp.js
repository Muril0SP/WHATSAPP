import { Router } from 'express';
import { createRequire } from 'module';
import multer from 'multer';
import jwt from 'jsonwebtoken';
import { authMiddleware } from '../auth/middleware.js';
import {
  getTenantState,
  initializeClient,
  getClient,
  destroyClient,
} from '../wa/manager.js';
import { getSocketIO } from '../websocket/socket.js';
import { getMediaPath } from '../storage/index.js';
import { config } from '../config/index.js';
import { prisma } from '../db.js';

const require = createRequire(import.meta.url);
const { MessageMedia } = require('whatsapp-web.js');

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 16 * 1024 * 1024 },
});

function isAllowedMime(mime) {
  if (!mime) return true;
  const p = mime.split('/')[0];
  return ['image', 'audio', 'video', 'application', 'text'].includes(p);
}

function mediaAuth(req, res, next) {
  const token = req.query.token || (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null);
  if (!token) return res.status(401).json({ error: 'Não autorizado' });
  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    req.tenantId = decoded.tenantId;
    next();
  } catch (_) {
    res.status(401).json({ error: 'Token inválido' });
  }
}

router.get('/media', mediaAuth, (req, res, next) => {
  const pathParam = req.query.path;
  if (!pathParam) {
    return res.status(400).json({ error: 'path é obrigatório' });
  }
  const tenantId = req.tenantId;
  const absolutePath = getMediaPath(tenantId, pathParam);
  if (!absolutePath) {
    return res.status(404).json({ error: 'Arquivo não encontrado' });
  }
  res.sendFile(absolutePath, (err) => {
    if (err) res.status(500).send('Erro ao enviar arquivo');
  });
});

router.get('/profile-pic/:chatId', mediaAuth, async (req, res) => {
  const client = getClient(req.tenantId);
  if (!client?.info) {
    return res.status(503).json({ error: 'WhatsApp não conectado' });
  }
  const { chatId } = req.params;
  if (!chatId) return res.status(400).json({ error: 'chatId é obrigatório' });
  try {
    const url = await client.getProfilePicUrl(chatId);
    if (!url) return res.status(404).json({ error: 'Foto não disponível' });
    const imageRes = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } });
    if (!imageRes.ok) return res.status(404).json({ error: 'Foto não disponível' });
    const contentType = imageRes.headers.get('content-type') || 'image/jpeg';
    const buffer = Buffer.from(await imageRes.arrayBuffer());
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(buffer);
  } catch (e) {
    res.status(404).json({ error: 'Foto não disponível' });
  }
});

router.use(authMiddleware);

function emitToTenant(tenantId, event, data) {
  const io = getSocketIO();
  if (io) io.to(`tenant:${tenantId}`).emit(event, data);
}

router.get('/status', (req, res) => {
  const state = getTenantState(req.tenantId);
  res.json({
    status: state.status,
    hasQr: !!state.qr,
  });
});

router.get('/qr', (req, res) => {
  const state = getTenantState(req.tenantId);
  if (state.status === 'qr' && state.qr) {
    return res.json({ qr: state.qr });
  }
  res.json({ qr: null });
});

router.post('/connect', (req, res) => {
  const tenantId = req.tenantId;
  const client = getClient(tenantId);
  if (client?.info) {
    return res.json({ status: 'connected', message: 'Já conectado' });
  }
  initializeClient(tenantId, {
    onQr: (tid, qr) => emitToTenant(tid, 'qr', { qr }),
    onReady: (tid) => emitToTenant(tid, 'ready', {}),
    onDisconnected: (tid) => emitToTenant(tid, 'disconnected', {}),
    onAuthFailure: (tid) => emitToTenant(tid, 'auth_failure', {}),
    onMessage: (tid, payload) => emitToTenant(tid, 'message', payload),
    onMessageAck: (tid, data) => emitToTenant(tid, 'message_ack', data),
  });
  res.json({ status: 'initializing', message: 'Aguardando QR Code' });
});

router.post('/disconnect', (req, res) => {
  destroyClient(req.tenantId);
  res.json({ status: 'disconnected' });
});

router.get('/profile', async (req, res) => {
  const client = getClient(req.tenantId);
  if (!client?.info) {
    return res.status(503).json({ error: 'WhatsApp não conectado' });
  }
  try {
    const info = client.info;
    const id = info.wid?._serialized || info.wid?.id || '';
    const name = info.pushname || info.name || '';
    const number = (id && id.includes('@')) ? id.split('@')[0] : id;
    res.json({ id, number, name });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Erro ao obter perfil' });
  }
});

router.patch('/profile', async (req, res) => {
  const client = getClient(req.tenantId);
  if (!client?.info) {
    return res.status(503).json({ error: 'WhatsApp não conectado' });
  }
  const { displayName } = req.body;
  if (!displayName || typeof displayName !== 'string') {
    return res.status(400).json({ error: 'displayName é obrigatório' });
  }
  try {
    await client.setDisplayName(displayName.trim());
    res.json({ success: true, name: displayName.trim() });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Erro ao atualizar nome' });
  }
});

router.post('/profile-picture', upload.single('file'), async (req, res) => {
  const client = getClient(req.tenantId);
  if (!client?.info) {
    return res.status(503).json({ error: 'WhatsApp não conectado' });
  }
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'Envie uma imagem' });
  const mime = file.mimetype || '';
  if (!mime.startsWith('image/')) {
    return res.status(400).json({ error: 'Apenas imagens são permitidas para foto de perfil' });
  }
  try {
    const media = new MessageMedia(mime, file.buffer.toString('base64'), file.originalname || 'photo');
    await client.setProfilePicture(media);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Erro ao atualizar foto' });
  }
});

function normalizeMessage(msg) {
  const id = msg.id?._serialized || msg.id?.id || '';
  const chatId = msg.from || msg.to;
  const fromMe = !!msg.fromMe;
  const body = msg.body || '';
  const type = msg.type || 'chat';
  const timestamp = msg.timestamp ? new Date(msg.timestamp * 1000).toISOString() : new Date().toISOString();
  const hasMedia = !!msg.hasMedia;
  const ack = msg.ack ?? 0;
  return { id, chatId, fromMe, body, type, timestamp, hasMedia, ack };
}

function normalizeDbMessage(row) {
  return {
    id: row.waMessageId,
    chatId: row.chatId,
    fromMe: row.fromMe,
    body: row.body || '',
    type: row.type || 'chat',
    timestamp: row.timestamp.toISOString(),
    hasMedia: !!row.mediaPath,
    mediaPath: row.mediaPath || undefined,
    ack: 0,
  };
}

router.get('/chats', async (req, res) => {
  const client = getClient(req.tenantId);
  const tenantId = req.tenantId;
  if (client?.info) {
    try {
      const chats = await client.getChats();
      const list = await Promise.all(
        chats.map(async (chat) => {
          let lastMessage = null;
          try {
            if (chat.lastMessage) {
              lastMessage = {
                body: chat.lastMessage.body?.slice(0, 80) || '(mídia)',
                timestamp: chat.lastMessage.timestamp ? new Date(chat.lastMessage.timestamp * 1000).toISOString() : null,
              };
            }
          } catch (_) {}
          return {
            id: chat.id._serialized,
            name: chat.name,
            isGroup: chat.isGroup,
            lastMessage,
          };
        })
      );
      list.sort((a, b) => {
        const ta = a.lastMessage?.timestamp || '';
        const tb = b.lastMessage?.timestamp || '';
        return tb.localeCompare(ta);
      });
      return res.json({ chats: list });
    } catch (e) {
      return res.status(500).json({ error: e.message || 'Erro ao listar chats' });
    }
  }
  try {
    const messages = await prisma.message.findMany({
      where: { tenantId },
      orderBy: { timestamp: 'desc' },
      take: 500,
    });
    const chatMap = new Map();
    for (const m of messages) {
      if (!chatMap.has(m.chatId)) {
        chatMap.set(m.chatId, {
          id: m.chatId,
          name: m.chatId,
          isGroup: false,
          lastMessage: {
            body: (m.body || '(mídia)').slice(0, 80),
            timestamp: m.timestamp.toISOString(),
          },
        });
      }
    }
    const list = Array.from(chatMap.values()).sort((a, b) => {
      const ta = a.lastMessage?.timestamp || '';
      const tb = b.lastMessage?.timestamp || '';
      return tb.localeCompare(ta);
    });
    res.json({ chats: list });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Erro ao listar chats' });
  }
});

router.get('/chats/:chatId/messages', async (req, res) => {
  const client = getClient(req.tenantId);
  const tenantId = req.tenantId;
  const { chatId } = req.params;
  if (client?.info) {
    try {
      const chat = await client.getChatById(chatId);
      const messages = await chat.fetchMessages({ limit: 50 });
      const list = messages.map((msg) => normalizeMessage(msg));
      for (const msg of list) {
        try {
          await prisma.message.upsert({
            where: { tenantId_waMessageId: { tenantId, waMessageId: msg.id } },
            create: {
              tenantId,
              chatId: msg.chatId,
              waMessageId: msg.id,
              fromMe: msg.fromMe,
              body: msg.body || null,
              type: msg.type || 'chat',
              mediaPath: null,
              timestamp: new Date(msg.timestamp),
            },
            update: {},
          });
        } catch (_) {}
      }
      return res.json({ messages: list });
    } catch (e) {
      return res.status(500).json({ error: e.message || 'Erro ao carregar mensagens' });
    }
  }
  try {
    const rows = await prisma.message.findMany({
      where: { tenantId, chatId },
      orderBy: { timestamp: 'asc' },
      take: 100,
    });
    const list = rows.map((row) => normalizeDbMessage(row));
    res.json({ messages: list });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Erro ao carregar mensagens' });
  }
});

router.post('/send', async (req, res) => {
  const client = getClient(req.tenantId);
  if (!client?.info) {
    return res.status(503).json({ error: 'WhatsApp não conectado' });
  }
  const { chatId, text } = req.body;
  if (!chatId || !text) {
    return res.status(400).json({ error: 'chatId e text são obrigatórios' });
  }
  try {
    const sent = await client.sendMessage(chatId, text);
    const sentId = sent.id?._serialized || (typeof sent.id === 'string' ? sent.id : sent.id?.id) || '';
    try {
      await prisma.message.upsert({
        where: { tenantId_waMessageId: { tenantId: req.tenantId, waMessageId: String(sentId) } },
        create: {
          tenantId: req.tenantId,
          chatId,
          waMessageId: String(sentId),
          fromMe: true,
          body: text,
          type: 'chat',
          mediaPath: null,
          timestamp: new Date(),
        },
        update: {},
      });
    } catch (_) {}
    res.json({ id: String(sentId), success: true });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Erro ao enviar' });
  }
});

router.post('/send-media', upload.single('file'), async (req, res) => {
  const client = getClient(req.tenantId);
  if (!client?.info) {
    return res.status(503).json({ error: 'WhatsApp não conectado' });
  }
  const chatId = req.body.chatId;
  const caption = req.body.caption || '';
  const file = req.file;
  if (!chatId || !file) {
    return res.status(400).json({ error: 'chatId e file são obrigatórios' });
  }
  const mime = file.mimetype || 'application/octet-stream';
  if (!isAllowedMime(mime)) {
    return res.status(400).json({ error: 'Tipo de arquivo não permitido' });
  }
  try {
    const media = new MessageMedia(mime, file.buffer.toString('base64'), file.originalname || 'file');
    const sent = await client.sendMessage(chatId, media, { caption: caption || '' });
    const sentId = sent.id?._serialized || (typeof sent.id === 'string' ? sent.id : sent.id?.id) || '';
    try {
      await prisma.message.upsert({
        where: { tenantId_waMessageId: { tenantId: req.tenantId, waMessageId: String(sentId) } },
        create: {
          tenantId: req.tenantId,
          chatId,
          waMessageId: String(sentId),
          fromMe: true,
          body: caption || null,
          type: mime.startsWith('image/') ? 'image' : mime.startsWith('video/') ? 'video' : mime.startsWith('audio/') ? 'audio' : 'chat',
          mediaPath: null,
          timestamp: new Date(),
        },
        update: {},
      });
    } catch (_) {}
    res.json({ id: String(sentId), success: true });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Erro ao enviar mídia' });
  }
});

export default router;
