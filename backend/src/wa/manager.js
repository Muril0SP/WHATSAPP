import { createRequire } from 'module';
import path from 'path';
import { config } from '../config/index.js';
import { saveMedia } from '../storage/index.js';
import { prisma } from '../db.js';

const require = createRequire(import.meta.url);
const { Client, LocalAuth } = require('whatsapp-web.js');

const RECONNECT_DELAYS = [2000, 5000, 15000, 60000];
const MAX_RECONNECT_ATTEMPTS = 10;

const clients = new Map();
const tenantState = new Map();

function getAuthPath(tenantId) {
  return path.join(config.sessionPath, String(tenantId));
}

function createClient(tenantId, onQr, onReady, onDisconnected, onAuthFailure, onMessage, onMessageAck) {
  const authPath = getAuthPath(tenantId);
  const client = new Client({
    authStrategy: new LocalAuth({
      clientId: tenantId,
      dataPath: authPath,
    }),
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
      ],
    },
  });

  let reconnectAttempt = 0;
  let reconnectTimer = null;

  function scheduleReconnect() {
    if (reconnectAttempt >= MAX_RECONNECT_ATTEMPTS) {
      tenantState.set(tenantId, { status: 'auth_failure', qr: null });
      onAuthFailure?.(tenantId);
      return;
    }
    const delay = RECONNECT_DELAYS[Math.min(reconnectAttempt, RECONNECT_DELAYS.length - 1)];
    reconnectAttempt += 1;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      client.initialize().catch(() => {});
    }, delay);
  }

  client.on('qr', (qr) => {
    reconnectAttempt = 0;
    tenantState.set(tenantId, { status: 'qr', qr });
    onQr?.(tenantId, qr);
  });

  client.on('ready', () => {
    reconnectAttempt = 0;
    tenantState.set(tenantId, { status: 'connected', qr: null });
    onReady?.(tenantId);
  });

  client.on('authenticated', () => {
    tenantState.set(tenantId, { status: 'authenticating', qr: null });
  });

  client.on('auth_failure', () => {
    tenantState.set(tenantId, { status: 'auth_failure', qr: null });
    onAuthFailure?.(tenantId);
  });

  client.on('disconnected', (reason) => {
    tenantState.set(tenantId, { status: 'disconnected', qr: null });
    onDisconnected?.(tenantId, reason);
    scheduleReconnect();
  });

  client.on('message', async (msg) => {
    try {
      const chatId = msg.fromMe ? (msg.to || msg.from) : msg.from;
      const id = msg.id._serialized || msg.id?.id || String(Date.now());
      const fromMe = !!msg.fromMe;
      const body = msg.body || '';
      const type = msg.type || 'chat';
      const timestamp = msg.timestamp ? new Date(msg.timestamp * 1000) : new Date();
      const hasMedia = !!msg.hasMedia;

      const ack = msg.ack ?? 0;
      const payload = {
        id,
        chatId,
        fromMe,
        body,
        type,
        timestamp: timestamp.toISOString(),
        hasMedia,
        ack,
      };

      if (hasMedia) {
        try {
          const media = await msg.downloadMedia();
          if (media && media.data) {
            const buffer = Buffer.from(media.data, 'base64');
            const filename = media.filename || `media.${(media.mimetype || '').split('/')[1] || 'bin'}`;
            const relativePath = saveMedia(tenantId, id.replace(/[^a-zA-Z0-9.-]/g, '_'), buffer, media.mimetype || '', filename);
            payload.mediaPath = relativePath;
            payload.mimeType = media.mimetype;
          }
        } catch (e) {
          payload.mediaError = e.message;
        }
      }

      onMessage?.(tenantId, payload);

      try {
        await prisma.message.upsert({
          where: {
            tenantId_waMessageId: { tenantId, waMessageId: payload.id },
          },
          create: {
            tenantId,
            chatId: payload.chatId,
            waMessageId: payload.id,
            fromMe: payload.fromMe,
            body: payload.body || null,
            type: payload.type || 'chat',
            mediaPath: payload.mediaPath || null,
            timestamp: new Date(payload.timestamp),
          },
          update: {},
        });
      } catch (dbErr) {
        // ignore duplicate or DB errors
      }
    } catch (e) {
      console.error('[wa manager] message handler error:', e);
    }
  });

  client.on('message_ack', (msg, ack) => {
    try {
      const id = msg.id._serialized || msg.id?.id;
      if (!id) return;
      const chatId = msg.fromMe ? (msg.to || msg.from) : msg.from;
      if (!chatId) return;
      onMessageAck?.(tenantId, { messageId: String(id), chatId: String(chatId), ack: ack ?? 0 });
    } catch (e) {
      console.error('[wa manager] message_ack error:', e);
    }
  });

  return client;
}

export function getOrCreateClient(tenantId, callbacks = {}) {
  if (clients.has(tenantId)) {
    return clients.get(tenantId);
  }
  const client = createClient(
    tenantId,
    callbacks.onQr,
    callbacks.onReady,
    callbacks.onDisconnected,
    callbacks.onAuthFailure,
    callbacks.onMessage,
    callbacks.onMessageAck
  );
  clients.set(tenantId, client);
  tenantState.set(tenantId, { status: 'initializing', qr: null });
  return client;
}

export function getClient(tenantId) {
  return clients.get(tenantId) || null;
}

export function getTenantState(tenantId) {
  return tenantState.get(tenantId) || { status: 'none', qr: null };
}

export function getAllTenantStates() {
  return Object.fromEntries(tenantState);
}

export function destroyClient(tenantId) {
  const client = clients.get(tenantId);
  if (client) {
    client.destroy();
    clients.delete(tenantId);
    tenantState.delete(tenantId);
  }
}

export function initializeClient(tenantId, callbacks) {
  const client = getOrCreateClient(tenantId, callbacks);
  if (!client.info) {
    client.initialize().catch((err) => {
      tenantState.set(tenantId, { status: 'error', qr: null });
      callbacks.onAuthFailure?.(tenantId);
    });
  }
  return client;
}
