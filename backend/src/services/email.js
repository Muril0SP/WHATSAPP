import nodemailer from 'nodemailer';
import { config } from '../config/index.js';

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  if (config.smtp?.host && config.smtp?.user) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465,
      auth: config.smtp.user && config.smtp.pass
        ? { user: config.smtp.user, pass: config.smtp.pass }
        : undefined,
    });
  }
  return transporter;
}

export async function sendPasswordResetEmail(to, resetLink, tenantName) {
  const transport = getTransporter();
  const html = `
    <p>Você solicitou a redefinição de senha${tenantName ? ` para ${tenantName}` : ''}.</p>
    <p>Clique no link abaixo para definir uma nova senha (válido por 1 hora):</p>
    <p><a href="${resetLink}">${resetLink}</a></p>
    <p>Se você não solicitou isso, ignore este e-mail.</p>
  `;
  if (transport) {
    await transport.sendMail({
      from: config.smtp.from,
      to,
      subject: 'Redefinição de senha - WhatsApp Plataforma',
      html,
    });
    return true;
  }
  console.log('[email] SMTP não configurado. Link de reset:', resetLink);
  return false;
}
