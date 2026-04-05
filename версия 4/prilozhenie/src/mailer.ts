import nodemailer from 'nodemailer';
import { UserRecord } from './db';

export async function sendActivationEmail(user: UserRecord) {
  if (!user.smtp_host || !user.smtp_port || !user.smtp_user || !user.smtp_pass) {
    throw new Error('SMTP-настройки не заданы');
  }

  const transporter = nodemailer.createTransport({
    host: user.smtp_host,
    port: user.smtp_port,
    secure: Boolean(user.smtp_secure),
    auth: {
      user: user.smtp_user,
      pass: user.smtp_pass,
    },
  });

  const link = `http://localhost:5000/activate/${user.activation_token}`;

  await transporter.sendMail({
    from: `"Документы" <${user.smtp_user}>`,
    to: user.email,
    subject: 'Подтверждение регистрации',
    html: `
      <h2>Подтверждение регистрации</h2>
      <p>Для активации аккаунта нажмите на ссылку:</p>
      <p><a href="${link}">${link}</a></p>
    `,
  });
}
