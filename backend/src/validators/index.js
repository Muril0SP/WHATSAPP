import { body, param, query, validationResult } from 'express-validator';

export function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const msg = errors.array().map((e) => e.msg).join('; ');
    return res.status(400).json({ error: msg });
  }
  next();
}

export const authRegister = [
  body('email').isEmail().normalizeEmail().withMessage('Email inválido'),
  body('password').isLength({ min: 6 }).withMessage('Senha deve ter no mínimo 6 caracteres'),
  body('name').optional().trim().isLength({ max: 200 }).withMessage('Nome muito longo'),
  body('tenantName').optional().trim().isLength({ max: 100 }).withMessage('Nome da empresa muito longo'),
];

export const authLogin = [
  body('email').isEmail().normalizeEmail().withMessage('Email inválido'),
  body('password').notEmpty().withMessage('Senha é obrigatória'),
  body('tenantSlug').optional().trim().isLength({ max: 100 }).withMessage('Slug inválido'),
];

export const authForgotPassword = [
  body('email').isEmail().normalizeEmail().withMessage('Email inválido'),
  body('tenantSlug').optional().trim().isLength({ max: 100 }),
];

export const authResetPassword = [
  body('token').notEmpty().withMessage('Token é obrigatório'),
  body('newPassword').isLength({ min: 6 }).withMessage('Senha deve ter no mínimo 6 caracteres'),
];

export const waSend = [
  body('chatId').notEmpty().trim().isLength({ max: 200 }).withMessage('chatId é obrigatório'),
  body('text').notEmpty().trim().isLength({ max: 10000 }).withMessage('Mensagem é obrigatória (máx 10000 caracteres)'),
];

export const waSendMedia = [
  body('chatId').notEmpty().trim().isLength({ max: 200 }).withMessage('chatId é obrigatório'),
];

export const waChatId = [
  param('chatId').notEmpty().trim().isLength({ max: 200 }).withMessage('chatId inválido'),
];

export const waSearch = [
  param('chatId').notEmpty().trim().isLength({ max: 200 }).withMessage('chatId inválido'),
  query('q').optional().trim().isLength({ max: 200 }).withMessage('Termo de busca muito longo'),
];

export const usersCreate = [
  body('email').isEmail().normalizeEmail().withMessage('Email inválido'),
  body('password').isLength({ min: 6 }).withMessage('Senha deve ter no mínimo 6 caracteres'),
  body('name').optional().trim().isLength({ max: 200 }).withMessage('Nome muito longo'),
];

export const usersUpdate = [
  param('id').notEmpty().isLength({ max: 50 }).withMessage('ID inválido'),
  body('email').optional().isEmail().normalizeEmail().withMessage('Email inválido'),
  body('name').optional().trim().isLength({ max: 200 }).withMessage('Nome muito longo'),
];

export const usersChangePassword = [
  body('currentPassword').notEmpty().withMessage('Senha atual é obrigatória'),
  body('newPassword').isLength({ min: 6 }).withMessage('Nova senha deve ter no mínimo 6 caracteres'),
];

export const usersDelete = [
  param('id').notEmpty().isLength({ max: 50 }).withMessage('ID inválido'),
];
