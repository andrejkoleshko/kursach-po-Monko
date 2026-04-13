import express, { Request, Response } from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import Busboy from 'busboy';
import sharp from 'sharp';

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

app.get('/', (req: Request, res: Response) => {
  const token = req.cookies?.token;
  if (!token) {
    res.clearCookie('token', { path: '/', sameSite: 'lax' });
  }
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.post('/api/register', auth.register);
app.post('/api/login', auth.login);

app.post('/api/logout', (req: Request, res: Response) => {
  res.clearCookie('token', { path: '/', sameSite: 'lax' });
  res.json({ success: true });
});

// 🔥 Профиль пользователя
app.get('/api/profile', auth.authRequired, (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId as number;
    const profile = db.getUserProfile(userId);
    if (!profile) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    res.json(profile);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Не удалось получить профиль' });
  }
});

app.patch('/api/profile', auth.authRequired, (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId as number;
    const { display_name, first_name, last_name, phone } = req.body || {};

    const updated = db.updateUserProfile(userId, {
      display_name: typeof display_name === 'string' ? display_name.trim() || null : undefined,
      first_name: typeof first_name === 'string' ? first_name.trim() || null : undefined,
      last_name: typeof last_name === 'string' ? last_name.trim() || null : undefined,
      phone: typeof phone === 'string' ? phone.trim() || null : undefined,
    });

    if (!updated) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Не удалось обновить профиль' });
  }
});

// 🔥 Загрузка аватара
app.post('/api/profile/avatar', auth.authRequired, (req: Request, res: Response) => {
  try {
    const busboy = Busboy({ headers: req.headers });

    busboy.on('file', (fieldname, file, info) => {
      const ext = '.png';
      const unique = Date.now() + '-' + Math.round(Math.random() * 1e9) + ext;
      const saveTo = path.join(UPLOAD_DIR, unique);

      const chunks: Buffer[] = [];

      file.on('data', (chunk) => chunks.push(chunk));

      file.on('end', async () => {
        try {
          const buffer = Buffer.concat(chunks);

          // 🔥 Делаем квадрат 512x512, заполняем полностью, обрезаем только фон
          const square = await sharp(buffer)
            .resize(512, 512, {
              fit: 'cover',        // 🔥 заполняет квадрат полностью
              position: sharp.strategy.attention,  // 🔥 центрирует человека
            })
            .png()
            .toBuffer();

          fs.writeFileSync(saveTo, square);

          const uploadedUrl = '/files/' + unique;
          db.updateUserProfile((req as any).userId, { avatar_url: uploadedUrl });

          res.json({ avatar_url: uploadedUrl });
        } catch (err) {
          console.error(err);
          res.status(500).json({ error: 'Ошибка обработки изображения' });
        }
      });
    });

    req.pipe(busboy);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки аватара' });
  }
});

app.delete('/api/profile/avatar', auth.authRequired, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;

    // 1. Получаем профиль пользователя
    const profile = db.getUserProfile(userId);
    if (!profile || !profile.avatar_url) {
      return res.status(400).json({ error: 'Аватар отсутствует' });
    }

    // 2. Путь к файлу
    const filePath = path.join(UPLOAD_DIR, path.basename(profile.avatar_url));

    // 3. Удаляем файл, если существует
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // 4. Сбрасываем avatar_url в базе
    db.updateUserProfile(userId, { avatar_url: null });

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка удаления аватара' });
  }
});


app.get('/api/admin/users', (req: Request, res: Response) => {
  try {
    const users = db.listUsers();
    res.json(users);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Не удалось получить список пользователей' });
  }
});

app.delete('/api/admin/users/:username', (req: Request, res: Response) => {
  try {
    const username = String(req.params.username);
    const deleted = db.deleteUserByUsername(username);
    if (!deleted) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка удаления пользователя' });
  }
});

app.get('/activate/:token', (req: Request, res: Response) => {
  const token = req.params.token as string;
  const ok = db.activateUser(token);

  if (!ok) {
    return res.status(400).send(`
      <h2>Ошибка</h2>
      <p>Ссылка активации недействительна или устарела</p>
    `);
  }

  res.send(`
    <h2>Аккаунт активирован!</h2>
    <p>Теперь вы можете войти</p>
    <a href="/">Перейти на сайт</a>
  `);
});

// 🔥 Загрузка документов
app.post('/api/upload', auth.authRequired, (req: Request, res: Response) => {
  try {
    const busboy = Busboy({ headers: req.headers });
    const uploaded: any[] = [];
    let activeWrites = 0;

    busboy.on('file', (fieldname: string, file: NodeJS.ReadableStream, info: any) => {
      const rawBytes = Buffer.from(info.filename, 'latin1');
      const rawName = rawBytes.toString('utf8');

      const orig = db.improveOriginalName(rawName);

      const storedName = `${(req as any).userId}_${orig}`;
      const saveTo = path.join(UPLOAD_DIR, storedName);

      const writeStream = fs.createWriteStream(saveTo);
      let totalSize = 0;

      const MAX_SIZE = 500 * 1024 * 1024; // 🔥 500 МБ

      activeWrites++;

      file.on('data', (chunk: any) => {
        totalSize += chunk.length;

        if (totalSize > MAX_SIZE) {
          file.unpipe(writeStream);
          writeStream.destroy();

          if (fs.existsSync(saveTo)) {
            fs.unlinkSync(saveTo);
          }

          return res.status(413).json({ error: 'Файл превышает допустимый размер 500 МБ' });
        }
      });

      file.pipe(writeStream);

      writeStream.on('close', () => {
        if (totalSize > MAX_SIZE) return;

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
            res.status(500).json({ error: 'Ошибка при обработке файла' });
          }
        });
      });
    });

    busboy.on('finish', () => {
      if (activeWrites === 0 && uploaded.length === 0) {
        res.status(400).json({ error: 'Файлы не были переданы' });
      }
    });

    req.pipe(busboy);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка при загрузке файла' });
  }
});

// 🔥 Исправленный маршрут раздачи файлов (для аватаров тоже)
app.get('/files/:filename', (req: Request, res: Response) => {
  const storedName = req.params.filename as string;
  const filePath = path.join(UPLOAD_DIR, storedName);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send('Файл не найден');
  }

  res.sendFile(filePath);
});

app.get('/api/categories', auth.authRequired, (req: Request, res: Response) => {
  res.json(CATEGORIES);
});

app.get('/api/documents', auth.authRequired, (req: Request, res: Response) => {
  try {
    const category = (req.query.category as string) || 'all';
    const q = (req.query.q as string) || '';
    const sort = (req.query.sort as string) || 'date_desc';

    const docs = db.listDocuments({
      userId: (req as any).userId,
      category,
      query: q,
      sort,
    });

    res.json(docs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Не удалось получить список документов' });
  }
});

app.patch('/api/documents/:id', auth.authRequired, (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const { category, description, original_name } = req.body;

    const updated = db.updateDocument(id, (req as any).userId, {
      category,
      description,
      original_name
    });

    if (!updated) {
      res.status(404).json({ error: 'Документ не найден' });
      return;
    }

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Не удалось обновить документ' });
  }
});

app.delete('/api/documents/:id', auth.authRequired, (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);

    const deleted = db.deleteDocument(id, (req as any).userId);
    if (!deleted) {
      res.status(404).json({ error: 'Документ не найден' });
      return;
    }

    const filePath = path.join(UPLOAD_DIR, deleted.filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Не удалось удалить документ' });
  }
});

app.post('/api/admin/reclassify', (req: Request, res: Response) => {
  try {
    db.reclassifyAllDocuments();
    res.json({ success: true, message: 'Все документы переклассифицированы' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка переклассификации документов' });
  }
});

// 🔥 Админ-маршрут для переименования файлов
app.post('/api/admin/rename-files', (req: Request, res: Response) => {
  try {
    db.renameAllFilesToOriginal();
    res.json({ success: true, message: 'Все файлы переименованы по оригинальным именам' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка переименования файлов' });
  }
});

app.use(express.static(path.join(__dirname, '..', 'public')));

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  
  // 🔥 Автоматическая переклассификация при запуске
  try {
    db.reclassifyAllDocuments();
    console.log('Все документы переклассифицированы автоматически при старте сервера');
  } catch (err) {
    console.error('Ошибка переклассификации при старте:', err);
  }
});

