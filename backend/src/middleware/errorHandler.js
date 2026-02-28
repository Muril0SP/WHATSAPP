import { logger } from '../logger.js';
import { config } from '../config/index.js';

const isDev = config.nodeEnv === 'development';

export function errorHandler(err, req, res, next) {
  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Erro interno do servidor';

  if (status >= 500) {
    logger.error({ err, path: req.path, method: req.method }, message);
  } else {
    logger.warn({ path: req.path, method: req.method }, message);
  }

  res.status(status).json({
    error: isDev ? message : (status >= 500 ? 'Erro interno do servidor' : message),
    ...(isDev && err.stack && { stack: err.stack }),
  });
}

export function notFoundHandler(req, res) {
  res.status(404).json({ error: 'Rota não encontrada' });
}
