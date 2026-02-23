# WhatsApp Plataforma (Microsaas)

Plataforma de conversas WhatsApp com conexão full time via QR Code, multi-tenant, com suporte a envio/recebimento de arquivos (fase 2).

## Stack

- **Backend**: Node.js, Express, Prisma (SQLite dev / Postgres opcional), whatsapp-web.js (LocalAuth por tenant), Socket.io
- **Frontend**: React (Vite), React Router, Socket.io client, qrcode.react

## Desenvolvimento local

### Backend

```bash
cd backend
cp .env.example .env
npm install
npx prisma generate
npx prisma db push
npm run dev
```

Backend em `http://localhost:3001`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend em `http://localhost:5173` (proxy para API e Socket.io).

### Uso

1. Acesse `http://localhost:5173`
2. Crie uma conta (registro) ou faça login
3. Clique em "Conectar WhatsApp" e escaneie o QR Code com o app no celular
4. A sessão fica salva em `backend/.wwebjs_auth/{tenantId}`; ao reiniciar o backend, a conexão é restaurada automaticamente

## Produção (Docker)

```bash
cp backend/.env.example backend/.env
# Ajuste JWT_SECRET e DATABASE_URL se usar Postgres
docker compose up -d
```

- Backend: porta 3001
- Frontend: porta 5173 (build estático servido por nginx, proxy para o backend)

## Endpoints

- `POST /api/auth/register` — registrar (email, password, name, tenantName)
- `POST /api/auth/login` — login (email, password, tenantSlug opcional)
- `GET /api/wa/status` — status da conexão (requer auth)
- `GET /api/wa/qr` — QR atual se houver (requer auth)
- `POST /api/wa/connect` — inicia conexão e gera QR (requer auth)
- `POST /api/wa/disconnect` — desconecta (requer auth)
- `GET /api/wa/chats` — lista de conversas (requer auth)
- `GET /api/wa/chats/:chatId/messages` — histórico de mensagens do chat (requer auth)
- `POST /api/wa/send` — enviar texto (body: `{ chatId, text }`, requer auth)
- `POST /api/wa/send-media` — enviar mídia (multipart: `chatId`, `file`, `caption`, requer auth)
- `GET /api/wa/media?path=...&token=...` — download de mídia (path relativo ao tenant; auth por query ou Bearer)
- `GET /api/health` — health check

## WebSocket

Conectar com `auth: { tenantId }` (id do tenant do usuário logado). Eventos: `qr`, `ready`, `disconnected`, `auth_failure`, `message` (payload: id, chatId, fromMe, body, type, timestamp, hasMedia, mediaPath?).

## Regras

- Um número WhatsApp por tenant (conta).
- Sessão persistida por tenant; reconexão automática com backoff em caso de queda.
- Em produção: defina `JWT_SECRET` forte e use HTTPS.

## Roadmap

### Fase 1 ✅
- Auth (registro/login JWT), multi-tenant
- Conexão por QR Code, reconexão automática
- WebSocket (qr, ready, disconnected, auth_failure)

### Fase 2 ✅
- Lista de chats, mensagens, envio texto e mídia
- Checks (enviado/entregue/lido), fotos de perfil
- Página de configurações: conexão, perfil WhatsApp, criação de usuários
- Histórico do banco quando desconectado

### Fase 3 (planejada)
1. **Gestão de usuários** — editar usuário (nome, email), remover usuário, trocar senha (própria ou por admin)
2. **Login com empresa** — campo "Empresa/conta" no login quando mesmo email existe em múltiplos tenants
3. **Recuperação de senha** — fluxo "Esqueci minha senha" por e-mail
4. **Notificação/som** — alerta ou som quando chega mensagem (especialmente com aba em background)
5. **Busca** — buscar conversas por nome/número; buscar dentro das mensagens
6. **Produção** — rate limit nas rotas, documentação de deploy (Coolify)
