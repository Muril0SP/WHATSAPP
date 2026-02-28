# WhatsApp Plataforma (Microsaas)

Plataforma de conversas WhatsApp com conexão full time via QR Code, multi-tenant, com suporte a envio/recebimento de arquivos (fase 2).

## Stack

- **Backend**: Node.js, Express, Prisma (PostgreSQL), whatsapp-web.js (LocalAuth por tenant), Socket.io, Redis (cache opcional)
- **Frontend**: React (Vite), React Router, Socket.io client, qrcode.react

## Desenvolvimento local

### Pré-requisitos

- Node.js 18+
- PostgreSQL (local ou Docker)
- Redis (opcional, para cache de chats)

### Backend

```bash
cd backend
cp .env.example .env
# Configure DATABASE_URL no .env (ex: postgresql://postgres:postgres@localhost:5432/whatsapp)
npm install
npx prisma generate
npx prisma migrate deploy
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
# Ajuste JWT_SECRET, POSTGRES_PASSWORD e variáveis de produção
docker compose up -d
```

- Backend: porta 3001
- Frontend: porta 5173 (build estático servido por nginx, proxy para o backend)

### Deploy no Coolify

1. Crie um novo projeto no Coolify e conecte o repositório Git
2. Use o `docker-compose.yml` na raiz ou configure os serviços manualmente
3. Variáveis de ambiente necessárias:
   - `DATABASE_URL` — URL do PostgreSQL
   - `JWT_SECRET` — chave secreta forte para JWT
   - `REDIS_URL` — URL do Redis (opcional, para cache)
   - `POSTGRES_PASSWORD` — senha do PostgreSQL (se usar o container do compose)
4. Para o backend: o CMD já executa `prisma migrate deploy` antes de iniciar
5. Certifique-se de usar HTTPS no proxy reverso e variáveis seguras em produção

## Endpoints

- `POST /api/auth/register` — registrar (email, password, name, tenantName)
- `POST /api/auth/login` — login (email, password, tenantSlug opcional)
- `GET /api/wa/status` — status da conexão (requer auth)
- `GET /api/wa/qr` — QR atual se houver (requer auth)
- `POST /api/wa/connect` — inicia conexão e gera QR (requer auth)
- `POST /api/wa/disconnect` — desconecta (requer auth)
- `GET /api/wa/chats` — lista de conversas (requer auth)
- `GET /api/wa/chats/:chatId/messages` — histórico de mensagens (query: limit, before; retorna hasMore)
- `GET /api/wa/chats/:chatId/search?q=...` — busca em mensagens do chat (requer auth)
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

### Fase 3 (parcial)
- ✅ **Gestão de usuários** — editar usuário, remover usuário, trocar senha (própria)
- ✅ **Login com empresa** — campo "Empresa/conta" no login quando mesmo email em múltiplos tenants
- ✅ **Recuperação de senha** — fluxo "Esqueci minha senha" por e-mail
- ✅ **Busca em mensagens** — buscar texto dentro das mensagens do chat
- ✅ **Produção** — rate limit nas rotas

### Fase 3 (pendente)
1. **Notificação/som** — alerta ou som quando chega mensagem (especialmente com aba em background)
2. **Busca aprimorada** — buscar conversas por nome/número (hoje só mensagens)
3. **Documentação de deploy** — guia de deploy no Coolify
