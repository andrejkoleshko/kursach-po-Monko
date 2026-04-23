import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import * as db from './db';
import { sendActivationEmail } from './mailer';

const SECRET = 'supersecretkey';

export async function register(req: Request, res: Response) {
  const {
    username,
    email,
    password,
    smtp_host,
    smtp_port,
    smtp_secure,
    smtp_user,
    smtp_pass,
    role
  } = req.body;

  if (!username || !email || !password)
    return res.status(400).json({ error: 'Заполните логин, email и пароль' });

  if (!smtp_host || !smtp_port || !smtp_user || !smtp_pass)
    return res.status(400).json({ error: 'Заполните SMTP-настройки' });

  if (db.getUserByUsername(username))
    return res.status(409).json({ error: 'Логин уже занят' });

  if (db.getUserByEmail(email))
    return res.status(409).json({ error: 'Email уже используется' });

  // 🔥 Проверяем роль
  let safeRole: 'user' | 'admin' = 'user';
  if (role === 'admin') safeRole = 'admin';

  const hash = await bcrypt.hash(password, 10);
  const token = crypto.randomBytes(32).toString('hex');

  const user = db.addUser({
    username,
    email,
    password_hash: hash,
    activation_token: token,
    smtp_host,
    smtp_port: Number(smtp_port),
    smtp_secure: smtp_secure === 'true' || smtp_secure === true,
    smtp_user,
    smtp_pass,
    role: safeRole
  });

  try {
    await sendActivationEmail(user);
  } catch (e) {
    console.error('Ошибка отправки письма:', e);
    return res.status(500).json({ error: 'Не удалось отправить письмо активации' });
  }

  res.json({ success: true });
}

export async function login(req: Request, res: Response) {
  const { username, password } = req.body;

  const user = db.getUserByUsername(username);
  if (!user) return res.status(401).json({ error: 'Неверный логин или пароль' });

  if (!user.is_active)
    return res.status(403).json({ error: 'Аккаунт не активирован. Проверьте email.' });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Неверный логин или пароль' });

  const token = jwt.sign({ id: user.id }, SECRET, { expiresIn: '10m' });

  res.cookie('token', token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/'
  });

  res.json({ success: true });
}

export function authRequired(req: Request, res: Response, next: NextFunction) {
  const token = (req as any).cookies?.token;
  if (!token) return res.status(401).json({ error: 'Не авторизован' });

  try {
    const data = jwt.verify(token, SECRET) as any;
    (req as any).userId = data.id;
    next();
  } catch {
    res.status(401).json({ error: 'Неверный токен' });
  }
}

// 🔥 Проверка роли
export function requireRole(role: 'user' | 'admin') {
  return (req: Request, res: Response, next: NextFunction) => {
    const userId = (req as any).userId;
    const user = db.getUserById(userId);

    if (!user || user.role !== role) {
      return res.status(403).json({ error: 'Недостаточно прав' });
    }

    next();
  };
}