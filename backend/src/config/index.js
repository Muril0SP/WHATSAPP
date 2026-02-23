import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env') });

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  databaseUrl: process.env.DATABASE_URL || 'file:./dev.sqlite',
  sessionPath: path.resolve(process.env.SESSION_PATH || '.wwebjs_auth'),
  storagePath: path.resolve(process.env.STORAGE_PATH || 'storage'),
  jwtSecret: process.env.JWT_SECRET || 'dev-secret',
  nodeEnv: process.env.NODE_ENV || 'development',
};
