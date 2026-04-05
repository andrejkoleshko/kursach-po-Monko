import express, { Request, Response } from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import Busboy from 'busboy';

import * as db from './db';
import * as auth from './auth';
import { CATEGORIES, classifyDocument } from './classifier';
import { extractText } from './extractText';

db.repairAllNames();

const app = express();
const PORT = 5000;

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

app.use(express.json());
app.use(cookieParser());

// ============================
// Главная страница
// ============================
app.get('/', (req: Request, res: Response) => {
  const token = req.cookies?.token;
  if (!token) {
    res.clearCookie('token', { path: '/', sameSite: 'lax' });
  }
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// ============================
// Авторизация и регистрация
// ============================
app.post('/api/register', auth.register);
app.post('/api/login', auth.login);

// ============================
// Выход из аккаунта
// ============================
app.post('/api/logout', (req: Request, res: Response) => {
  res.clearCookie('token', { path: '/', sameSite: 'lax' });
  res.json({ success: true });
});

// ============================
// Админ: список пользователей
// ============================
app.get('/api/admin/users', (req: Request, res: Response) => {
  try {
    const users = db.listUsers();
    res.json(users);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Не удалось получить список пользователей.' });
  }
});

// ============================
// Админ: удалить пользователя по имени
// ============================
app.delete('/api/admin/users/:username', (req: Request, res: Response) => {
  try {
    const username = String(req.params.username);
    const deleted = db.deleteUserByUsername(username);
    if (!deleted) {
      return res.status(404).json({ error: 'Пользователь не найден.' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка удаления пользователя.' });
  }
});

// ============================
// Активация аккаунта
// ============================
app.get('/activate/:token', (req: Request, res: Response) => {
  const token = req.params.token as string;
  const ok = db.activateUser(token);

  if (!ok) {
    return res.status(400).send(`
      <h2>Ошибка</h2>
      <p>Ссылка активации недействительна или устарела.</p>
    `);
  }

  res.send(`
    <h2>Аккаунт активирован!</h2>
    <p>Теперь вы можете войти.</p>
    <a href="/">Перейти на сайт</a>
  `);
});

// ============================
// Загрузка файлов
// ============================
app.post('/api/upload', auth.authRequired, (req: Request, res: Response) => {
  try {
    const busboy = Busboy({ headers: req.headers });
    const uploaded: any[] = [];
    let activeWrites = 0;

    busboy.on('file', (fieldname: string, file: NodeJS.ReadableStream, info: any) => {
      const rawBytes = Buffer.from(info.filename, 'latin1');
      const rawName = rawBytes.toString('utf8');

      const orig = db.improveOriginalName(rawName);
      const ext = path.extname(orig);
      const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
      const storedName = unique + ext;

      const saveTo = path.join(UPLOAD_DIR, storedName);
      const writeStream = fs.createWriteStream(saveTo);
      let totalSize = 0;

      activeWrites++;

      file.on('data', (chunk: any) => {
        totalSize += chunk.length;
      });

      file.pipe(writeStream);

      writeStream.on('close', () => {
        const { category, keywords } = classifyDocument({ originalname: orig });

        (async () => {
          const fullPath = saveTo;
          const textContent = await extractText(fullPath, info.mimeType || '');

          const doc = db.addDocument({
            user_id: (req as any).userId,
            filename: storedName,
            original_name: orig,
            mime_type: info.mimeType || 'application/octet-stream',
            size: totalSize,
            category,
            keywords,
            description: '',
            uploaded_at: new Date().toISOString(),
            content: textContent,
          });

          uploaded.push(doc);
          activeWrites--;

          if (activeWrites === 0) {
            res.status(201).json(uploaded);
          }
        })().catch((err) => {
          console.error('Ошибка при обработке файла:', err);
          activeWrites--;
          if (activeWrites === 0 && uploaded.length === 0) {
            res.status(500).json({ error: 'Ошибка при обработке файла.' });
          }
        });
      });
    });

    busboy.on('finish', () => {
      if (activeWrites === 0 && uploaded.length === 0) {
        res.status(400).json({ error: 'Файлы не были переданы.' });
      }
    });

    req.pipe(busboy);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка при загрузке файла.' });
  }
});

// ============================
// Скачивание файлов
// ============================
app.get('/files/:filename', auth.authRequired, (req: Request, res: Response) => {
  const storedName = req.params.filename as string;
  const filePath = path.join(UPLOAD_DIR, storedName);

  const doc = db.getDocumentByFilename(storedName, (req as any).userId);
  if (!doc || !fs.existsSync(filePath)) {
    return res.status(404).send('Файл не найден');
  }

  res.download(filePath, doc.original_name);
});

// ============================
// Категории
// ============================
app.get('/api/categories', auth.authRequired, (req: Request, res: Response) => {
  res.json(CATEGORIES);
});

// ============================
// Список документов
// ============================
app.get('/api/documents', auth.authRequired, (req: Request, res: Response) => {
  try {
    const category = (req.query.category as string) || 'all';
    const q = (req.query.q as string) || '';

    const docs = db.listDocuments({
      userId: (req as any).userId,
      category,
      query: q,
    });

    res.json(docs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Не удалось получить список документов.' });
  }
});

// ============================
// Обновление документа
// ============================
app.patch('/api/documents/:id', auth.authRequired, (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const { category, description } = req.body;

    const updated = db.updateDocument(id, (req as any).userId, { category, description });
    if (!updated) {
      res.status(404).json({ error: 'Документ не найден.' });
      return;
    }

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Не удалось обновить документ.' });
  }
});

// ============================
// Удаление документа
// ============================
app.delete('/api/documents/:id', auth.authRequired, (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);

    const deleted = db.deleteDocument(id, (req as any).userId);
    if (!deleted) {
      res.status(404).json({ error: 'Документ не найден.' });
      return;
    }

    const filePath = path.join(UPLOAD_DIR, deleted.filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Не удалось удалить документ.' });
  }
});

// ============================
// Статика
// ============================
app.use(express.static(path.join(__dirname, '..', 'public')));

// ============================
// Старт сервера
// ============================
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
