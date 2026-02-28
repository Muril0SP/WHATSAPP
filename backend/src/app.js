import express from 'express';
import cors from 'cors';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { createServer } from 'http';
import authRoutes from './routes/auth.js';
import whatsappRoutes from './routes/whatsapp.js';
import healthRoutes from './routes/health.js';
import usersRoutes from './routes/users.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

export function createApp() {
  const app = express();
  const server = createServer(app);

  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
  app.use(cors({ origin: true }));
  app.use(compression({
    level: 6,
    threshold: 1024,
    filter: (req, res) => {
      const ct = res.getHeader('Content-Type') || '';
      if (String(ct).startsWith('image/') || String(ct).startsWith('video/') || String(ct).startsWith('audio/')) {
        return false;
      }
      return compression.filter(req, res);
    },
  }));
  app.use(express.json({ limit: '2mb' }));

  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 500,
    message: { error: 'Muitas requisições, tente novamente em breve.' },
    skip: (req) => req.originalUrl?.includes('/wa/profile-pic'),
  });
  app.use('/api', apiLimiter);

  app.use('/api/auth', authRoutes);
  app.use('/api/wa', whatsappRoutes);
  app.use('/api/users', usersRoutes);
  app.use('/api/health', healthRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return { app, server };
}
