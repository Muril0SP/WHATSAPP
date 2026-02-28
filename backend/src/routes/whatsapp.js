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
import { getMediaPath, saveMedia } from '../storage/index.js';
import { config } from '../config/index.js';
import { prisma } from '../db.js';
import { cacheGet, cacheSet, cacheDel } from '../cache/redis.js';
import { downloadMediaBackground } from '../services/mediaWorker.js';
import { handleValidationErrors, waSend, waSendMedia } from '../validators/index.js';

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
  const token =
    req.query.token ||
    (req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.slice(7)
      : null);
  if (!token) return res.status(401).json({ error: 'Não autorizado' });
  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    req.tenantId = decoded.tenantId;
    next();
  } catch (_) {
    res.status(401).json({ error: 'Token inválido' });
  }
}

router.get('/media', mediaAuth, (req, res) => {
  const pathParam = req.query.path;
  if (!pathParam) {
    return res.status(400).json({ error: 'path é obrigatório' });
  }
  const absolutePath = getMediaPath(req.tenantId, pathParam);
  if (!absolutePath) {
    return res.status(404).json({ error: 'Arquivo não encontrado' });
  }
  res.setHeader('Cache-Control', 'private, max-age=86400, immutable');
  res.sendFile(absolutePath, (err) => {
    if (err && !res.headersSent) res.status(500).send('Erro ao enviar arquivo');
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
    const imageRes = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    if (!imageRes.ok) return res.status(404).json({ error: 'Foto não disponível' });
    const contentType = imageRes.headers.get('content-type') || 'image/jpeg';
    const buffer = Buffer.from(await imageRes.arrayBuffer());
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(buffer);
  } catch (_) {
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
  res.json({ status: state.status, hasQr: !!state.qr });
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
    onReady: (tid) => {
      cacheDel(`chats:${tid}`);
      emitToTenant(tid, 'ready', {});
    },
    onDisconnected: (tid) => {
      cacheDel(`chats:${tid}`);
      emitToTenant(tid, 'disconnected', {});
    },
    onAuthFailure: (tid) => emitToTenant(tid, 'auth_failure', {}),
    onMessage: (tid, payload) => emitToTenant(tid, 'message', payload),
    onMessageAck: (tid, data) => emitToTenant(tid, 'message_ack', data),
  });
  res.json({ status: 'initializing', message: 'Aguardando QR Code' });
});

router.post('/disconnect', (req, res) => {
  cacheDel(`chats:${req.tenantId}`);
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
    const number = id.includes('@') ? id.split('@')[0] : id;
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
  if (!file.mimetype?.startsWith('image/')) {
    return res
      .status(400)
      .json({ error: 'Apenas imagens são permitidas para foto de perfil' });
  }
  try {
    const media = new MessageMedia(
      file.mimetype,
      file.buffer.toString('base64'),
      file.originalname || 'photo'
    );
    await client.setProfilePicture(media);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Erro ao atualizar foto' });
  }
});

const MEDIA_TYPES = ['image', 'audio', 'video', 'ptt', 'sticker', 'document', 'album'];
function isMediaType(type) {
  if (!type) return false;
  const t = String(type).toLowerCase();
  return MEDIA_TYPES.some((m) => t === m || t.startsWith(m));
}

function inferTypeFromMimetype(mimetype) {
  if (!mimetype) return null;
  const m = mimetype.toLowerCase().split('/')[0];
  if (m === 'image') return 'image';
  if (m === 'audio') return 'audio';
  if (m === 'video') return 'video';
  return null;
}

function normalizeMessage(msg) {
  const id = msg.id?._serialized || msg.id?.id || '';
  const chatId = msg.fromMe ? msg.to || msg.from : msg.from || msg.to;
  const fromMe = !!msg.fromMe;
  const body = msg.body || '';
  let type = msg.type || 'chat';
  if (type === 'chat' && msg.mimetype) {
    const inferred = inferTypeFromMimetype(msg.mimetype);
    if (inferred) type = inferred;
  }
  const ts = msg.timestamp ? Number(msg.timestamp) * 1000 : Date.now();
  const timestamp = new Date(ts).toISOString();
  const hasMedia = !!msg.hasMedia || isMediaType(type) || !!msg.mimetype;
  const ack = msg.ack ?? 0;
  return { id, chatId, fromMe, body, type, timestamp, timestampMs: ts, hasMedia, ack };
}

function normalizeDbMessage(row) {
  const ts = row.timestamp.getTime();
  const type = row.type || 'chat';
  return {
    id: row.waMessageId,
    chatId: row.chatId,
    fromMe: row.fromMe,
    body: row.body || '',
    type,
    timestamp: row.timestamp.toISOString(),
    timestampMs: ts,
    hasMedia: !!row.mediaPath || isMediaType(type),
    mediaPath: row.mediaPath || undefined,
    mimeType: row.mimeType || undefined,
    ack: row.ack ?? 0,
  };
}

// Timeout helper para evitar fetchMessages travar indefinidamente
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Timeout ao carregar mensagens')), ms)
    ),
  ]);
}

// Tenta getChatById com fallback de formato (@c.us <-> @s.whatsapp.net)
async function getChatByIdWithFallback(client, chatId) {
  let chat = await client.getChatById(chatId);
  if (chat) return chat;
  if (chatId.includes('@c.us')) {
    const alt = chatId.replace('@c.us', '@s.whatsapp.net');
    chat = await client.getChatById(alt);
  } else if (chatId.includes('@s.whatsapp.net')) {
    const alt = chatId.replace('@s.whatsapp.net', '@c.us');
    chat = await client.getChatById(alt);
  }
  return chat || null;
}

// Scroll reduzido: máximo 5 iterações, 200ms cada — apenas para forçar
// carregamento inicial, sem bloquear por 15 segundos.
async function scrollChatListBriefly(page) {
  if (!page) return;
  try {
    for (let i = 0; i < 5; i++) {
      const done = await page
        .evaluate(() => {
          const pane =
            document.getElementById('pane-side') ||
            document.querySelector('[data-testid="chat-list"]');
          if (!pane) return true;
          const before = pane.scrollTop;
          pane.scrollTop += 600;
          return pane.scrollTop === before;
        })
        .catch(() => true);
      if (done) break;
      await new Promise((r) => setTimeout(r, 200));
    }
  } catch (_) {}
}

// ─── GET /chats ──────────────────────────────────────────────────────────────

router.get('/chats', async (req, res) => {
  const client = getClient(req.tenantId);
  const tenantId = req.tenantId;
  const cacheKey = `chats:${tenantId}`;
  const searchQ = String(req.query.q || '').trim().toLowerCase();

  if (client?.info) {
    // Verifica cache Redis primeiro (TTL 30s)
    const cached = await cacheGet(cacheKey);
    let list = cached;
    if (!list) {
      try {
        if (client.pupPage) await scrollChatListBriefly(client.pupPage);
        const chats = await client.getChats();
        list = chats
          .filter((chat) => chat.id?._serialized !== 'status@broadcast')
          .map((chat) => {
          let lastMessage = null;
          try {
            if (chat.lastMessage) {
              lastMessage = {
                body: (chat.lastMessage.body?.slice(0, 80)) || '(mídia)',
                timestamp: chat.lastMessage.timestamp
                  ? new Date(chat.lastMessage.timestamp * 1000).toISOString()
                  : null,
              };
            }
          } catch (_) {}
          return {
            id: chat.id._serialized,
            name: chat.name,
            isGroup: chat.isGroup,
            lastMessage,
            };
          });

        list.sort((a, b) =>
          (b.lastMessage?.timestamp || '').localeCompare(a.lastMessage?.timestamp || '')
        );
        await cacheSet(cacheKey, list, 30);
      } catch (e) {
        return res.status(500).json({ error: e.message || 'Erro ao listar chats' });
      }
    }
    if (searchQ) {
      list = list.filter((c) => {
        const name = (c.name || '').toLowerCase();
        const id = (c.id || '').toLowerCase();
        return name.includes(searchQ) || id.includes(searchQ);
      });
    }
    return res.json({ chats: list });
  }

  // Fallback: banco de dados — última mensagem por chat (DISTINCT ON no PostgreSQL)
  try {
    const messages = await prisma.$queryRaw`
      SELECT DISTINCT ON ("chatId") "chatId", "body", "timestamp"
      FROM "Message"
      WHERE "tenantId" = ${tenantId} AND "chatId" != 'status@broadcast'
      ORDER BY "chatId", "timestamp" DESC
    `;
    const list = messages.map((m) => ({
      id: m.chatId,
      name: m.chatId,
      isGroup: false,
      lastMessage: {
        body: (m.body || '(mídia)').slice(0, 80),
        timestamp: m.timestamp?.toISOString?.() ?? new Date(m.timestamp).toISOString(),
      },
    }));
    list.sort((a, b) =>
      (b.lastMessage?.timestamp || '').localeCompare(a.lastMessage?.timestamp || '')
    );
    if (searchQ) {
      const q = searchQ;
      list = list.filter((c) => {
        const name = (c.name || '').toLowerCase();
        const id = (c.id || '').toLowerCase();
        return name.includes(q) || id.includes(q);
      });
    }
    res.json({ chats: list });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Erro ao listar chats' });
  }
});

// ─── GET /chats/:chatId/search ────────────────────────────────────────────────

router.get('/chats/:chatId/search', async (req, res) => {
  const tenantId = req.tenantId;
  const { chatId } = req.params;
  const q = String(req.query.q || '').trim();
  if (!q) return res.json({ messages: [] });
  try {
    const rows = await prisma.message.findMany({
      where: {
        tenantId,
        chatId,
        body: {
          contains: q,
          mode: 'insensitive',
        },
      },
      orderBy: { timestamp: 'desc' },
      take: 50,
    });
    const list = rows.map((row) => normalizeDbMessage(row));
    res.json({ messages: list });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Erro ao buscar mensagens' });
  }
});

// ─── GET /chats/:chatId/messages ─────────────────────────────────────────────
// Estratégia híbrida: banco + fetchMessages. syncHistory antes do fetch.

async function fetchMessagesFromDb(tenantId, chatId, limit, before) {
  const where = { tenantId, chatId };
  if (before) where.timestamp = { lt: new Date(before) };
  const limitPlusOne = limit + 1;
  const rows = await prisma.message.findMany({
    where,
    orderBy: { timestamp: 'desc' },
    take: limitPlusOne,
  });
  const hasMore = rows.length > limit;
  const list = rows.slice(0, limit).reverse().map((row) => normalizeDbMessage(row));
  return { messages: list, hasMore };
}

function mergeMessages(dbMessages, apiMessages) {
  const byId = new Map();
  for (const m of dbMessages) byId.set(m.id, { ...m });
  for (const m of apiMessages) {
    const existing = byId.get(m.id);
    byId.set(m.id, existing ? {
      ...m,
      mediaPath: m.mediaPath || existing.mediaPath,
      mimeType: m.mimeType || existing.mimeType,
      body: m.body || existing.body,
      ack: Math.max(m.ack ?? 0, existing.ack ?? 0),
    } : { ...m });
  }
  const list = Array.from(byId.values());
  list.sort((a, b) => {
    const ta = a.timestampMs ?? new Date(a.timestamp).getTime();
    const tb = b.timestampMs ?? new Date(b.timestamp).getTime();
    if (ta !== tb) return ta - tb;
    return String(a.id).localeCompare(String(b.id));
  });
  return list;
}

router.get('/chats/:chatId/messages', async (req, res) => {
  const client = getClient(req.tenantId);
  const tenantId = req.tenantId;
  const chatId = decodeURIComponent(req.params.chatId || '');
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
  const before = req.query.before;

  let dbResult = { messages: [], hasMore: false };
  try {
    dbResult = await fetchMessagesFromDb(tenantId, chatId, limit, before);
  } catch (_) {}
  const dbMessages = dbResult.messages;
  const dbHasMore = dbResult.hasMore;

  if (!client?.info) {
    return res.json({ messages: dbMessages, hasMore: dbHasMore });
  }

  try {
    try {
      const chat = await getChatByIdWithFallback(client, chatId);
      if (!chat) return res.json({ messages: dbMessages, hasMore: dbHasMore });

      try {
        await chat.syncHistory();
      } catch (_) {}

      let rawMessages = [];
      try {
        rawMessages = await withTimeout(chat.fetchMessages({ limit: 50 }), 8000);
      } catch (_) {
        return res.json({ messages: dbMessages, hasMore: dbHasMore });
      }
      if (!Array.isArray(rawMessages)) rawMessages = [];

      const idsWithMedia = [];
      const rawProcessed = [];
      for (let idx = 0; idx < rawMessages.length; idx++) {
        let msg = rawMessages[idx];
        if (
          (!msg.body || msg.body === '') &&
          (msg.type === 'chat' || !msg.type) &&
          typeof msg.reload === 'function'
        ) {
          try { msg = await msg.reload(); } catch (_) {}
        }
        const norm = { ...normalizeMessage(msg), _idx: idx };
        rawProcessed.push({ norm, msg });
        if (norm.hasMedia) {
          idsWithMedia.push(norm.id);
        }
      }

      let mediaMap = new Map();
      if (idsWithMedia.length > 0) {
        const existingMedia = await prisma.message.findMany({
          where: { tenantId, waMessageId: { in: idsWithMedia } },
          select: { waMessageId: true, mediaPath: true, mimeType: true },
        });
        mediaMap = new Map(existingMedia.map((r) => [r.waMessageId, r]));
      }

      const apiList = [];
      for (const { norm, msg } of rawProcessed) {
        if (norm.hasMedia) {
          const existing = mediaMap.get(norm.id);
          if (existing?.mediaPath) {
            norm.mediaPath = existing.mediaPath;
            if (existing.mimeType) norm.mimeType = existing.mimeType;
          } else {
            downloadMediaBackground(tenantId, norm, msg);
          }
        }
        apiList.push(norm);
      }

      apiList.sort((a, b) => {
        const ta = a.timestampMs ?? new Date(a.timestamp).getTime();
        const tb = b.timestampMs ?? new Date(b.timestamp).getTime();
        if (ta !== tb) return ta - tb;
        const idCmp = String(a.id).localeCompare(String(b.id));
        if (idCmp !== 0) return idCmp;
        return (a._idx ?? 0) - (b._idx ?? 0);
      });

      const cleanApi = apiList.map(({ _idx, ...m }) => m);
      const merged = mergeMessages(dbMessages, cleanApi);
      return res.json({ messages: merged, hasMore: dbHasMore });
    } catch (e) {
      return res.json({ messages: dbMessages, hasMore: dbHasMore });
    }
  } catch (e) {
    return res.json({ messages: dbMessages, hasMore: dbHasMore });
  }
});

// ─── POST /send ───────────────────────────────────────────────────────────────

router.post('/send', waSend, handleValidationErrors, async (req, res) => {
  const client = getClient(req.tenantId);
  if (!client?.info) {
    return res.status(503).json({ error: 'WhatsApp não conectado' });
  }
  const { chatId, text } = req.body;
  try {
    const sent = await client.sendMessage(chatId, text);
    const sentId =
      sent.id?._serialized ||
      (typeof sent.id === 'string' ? sent.id : sent.id?.id) ||
      '';
    try {
      await prisma.message.upsert({
        where: {
          tenantId_waMessageId: {
            tenantId: req.tenantId,
            waMessageId: String(sentId),
          },
        },
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
    cacheDel(`chats:${req.tenantId}`);
    res.json({ id: String(sentId), success: true });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Erro ao enviar' });
  }
});

// ─── POST /send-media ─────────────────────────────────────────────────────────

router.post('/send-media', upload.single('file'), waSendMedia, handleValidationErrors, async (req, res) => {
  const client = getClient(req.tenantId);
  if (!client?.info) {
    return res.status(503).json({ error: 'WhatsApp não conectado' });
  }
  const chatId = req.body.chatId;
  const caption = req.body.caption || '';
  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: 'Arquivo é obrigatório' });
  }
  const mime = file.mimetype || 'application/octet-stream';
  if (!isAllowedMime(mime)) {
    return res.status(400).json({ error: 'Tipo de arquivo não permitido' });
  }
  try {
    const media = new MessageMedia(
      mime,
      file.buffer.toString('base64'),
      file.originalname || 'file'
    );
    const sent = await client.sendMessage(chatId, media, { caption });
    const sentId =
      sent.id?._serialized ||
      (typeof sent.id === 'string' ? sent.id : sent.id?.id) ||
      '';

    const msgType = mime.startsWith('image/')
      ? 'image'
      : mime.startsWith('video/')
        ? 'video'
        : mime.startsWith('audio/')
          ? 'audio'
          : 'document';

    const tenantId = req.tenantId;

    // Salva mídia enviada no storage para exibição imediata
    let savedPath = null;
    try {
      const safeId = String(sentId).replace(/[^a-zA-Z0-9.-]/g, '_') || `sent_${Date.now()}`;
      savedPath = await saveMedia(tenantId, safeId, file.buffer, mime, file.originalname || 'file');
    } catch (_) {}

    try {
      await prisma.message.upsert({
        where: {
          tenantId_waMessageId: {
            tenantId,
            waMessageId: String(sentId),
          },
        },
        create: {
          tenantId,
          chatId,
          waMessageId: String(sentId),
          fromMe: true,
          body: caption || null,
          type: msgType,
          mediaPath: savedPath,
          mimeType: mime,
          timestamp: new Date(),
        },
        update: { mediaPath: savedPath, mimeType: mime },
      });
    } catch (_) {}

    cacheDel(`chats:${req.tenantId}`);
    res.json({ id: String(sentId), success: true, mediaPath: savedPath });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Erro ao enviar mídia' });
  }
});

export default router;
