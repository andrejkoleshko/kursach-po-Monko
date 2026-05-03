import express, { Request, Response } from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import Busboy from 'busboy';
import sharp from 'sharp';
import { log } from './logger';
import * as db from './db';
import * as auth from './auth';
import { ROLE_LEVEL } from './db';
import { CATEGORIES, classifyDocument } from './classifier';
import { extractText } from './extractText';
import assistantRoute from './routes/assistantRoute';
import dotenv from 'dotenv';
dotenv.config();

db.repairAllNames();

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));
const PORT = 5000;

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

app.use(express.json());
app.use(cookieParser());

// ============================
// Главная
// ============================
app.get('/', (req: Request, res: Response) => {
  const token = req.cookies?.token;
  if (!token) {
    res.clearCookie('token', { path: '/', sameSite: 'lax' });
  }
  res.render('index');
});

// ============================
// Страницы интерфейса (EJS)
// ============================

// Профиль
app.get('/profile', auth.authRequired, (req: Request, res: Response) => {
  res.render('profile');
});

// Админка
app.get('/admin', auth.authRequired, auth.requireRole('support'), (req: Request, res: Response) => {
  res.render('admin');
});

// Страница 403
app.get('/403', (req: Request, res: Response) => {
  res.render('403');
});

// Страница ИИ‑ассистента
app.get('/assistant', auth.authRequired, (req: Request, res: Response) => {
  res.render('assistant');
});


// ============================
// Авторизация
// ============================
app.post('/api/register', auth.register);
app.post('/api/login', auth.login);

app.post('/api/logout', (req: Request, res: Response) => {
  log("LOGOUT", { userId: (req as any).userId });
  res.clearCookie('token', { path: '/', sameSite: 'lax' });
  res.json({ success: true });
});

// ============================
// Профиль
// ============================
app.get('/api/profile', auth.authRequired, (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;

    log("GET_PROFILE", { userId });

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
    const userId = (req as any).userId;
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

    log("UPDATE_PROFILE", {
      userId,
      fields: Object.keys(req.body)
    });

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Не удалось обновить профиль' });
  }
});

// ============================
// Аватар
// ============================
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

          const square = await sharp(buffer)
            .resize(512, 512, {
              fit: 'cover',
              position: sharp.strategy.attention,
            })
            .png()
            .toBuffer();

          fs.writeFileSync(saveTo, square);

          const uploadedUrl = '/files/' + unique;
          db.updateUserProfile((req as any).userId, { avatar_url: uploadedUrl });

          log("UPLOAD_AVATAR", {
            userId: (req as any).userId,
            filename: unique
          });

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

    const profile = db.getUserProfile(userId);
    if (!profile || !profile.avatar_url) {
      return res.status(400).json({ error: 'Аватар отсутствует' });
    }

    const filePath = path.join(UPLOAD_DIR, path.basename(profile.avatar_url));

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    db.updateUserProfile(userId, { avatar_url: null });

    log("DELETE_AVATAR", { userId });

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка удаления аватара' });
  }
});

// ============================
// Админка — список пользователей
// ============================
// support и выше могут смотреть
app.get('/api/admin/users',
  auth.authRequired,
  auth.requireRole('support'),
  (req: Request, res: Response) => {
    try {
      log("ADMIN_LIST_USERS", { adminId: (req as any).userId });

      const users = db.listUsers();
      res.json(users);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Не удалось получить список пользователей' });
    }
  }
);

// ============================
// Админка — удалить пользователя
// ============================
// moderator и выше могут удалять
app.delete('/api/admin/users/:username',
  auth.authRequired,
  auth.requireRole('moderator'),
  (req: Request, res: Response) => {
    try {
      const username = String(req.params.username);
      const current = db.getUserById((req as any).userId);
      if (!current) {
        return res.status(401).json({ error: 'Пользователь не найден' });
      }

      const target = db.getUserByUsername(username);
      if (!target) {
        return res.status(404).json({ error: 'Пользователь не найден' });
      }

      if (ROLE_LEVEL[current.role] <= ROLE_LEVEL[target.role]) {
        return res.status(403).json({ error: 'Недостаточно прав' });
      }

      if (target.role === 'admin' && db.countAdmins() <= 1) {
        return res.status(400).json({ error: 'Нельзя удалить последнего администратора' });
      }

      log("ADMIN_DELETE_USER", {
        adminId: current.id,
        targetId: target.id,
        targetRole: target.role
      });

      const deleted = db.deleteUserByUsername(username);
      if (!deleted) {
        return res.status(400).json({ error: 'Не удалось удалить пользователя' });
      }

      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Ошибка удаления пользователя' });
    }
  }
);


// ============================
// Админка — изменить роль
// ============================
// moderator и выше могут менять роли
app.patch('/api/admin/users/:id/role',
  auth.authRequired,
  auth.requireRole('moderator'),
  (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const { role } = req.body;

    const allowedRoles = ['user', 'support', 'moderator', 'manager', 'admin', 'superadmin'];
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({ error: 'Недопустимая роль' });
    }

    const newRole = role as keyof typeof ROLE_LEVEL;

    const target = db.getUserById(id);
    if (!target) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    const current = db.getUserById((req as any).userId);
    if (!current) {
      return res.status(401).json({ error: 'Пользователь не найден' });
  }

    if (ROLE_LEVEL[current.role] <= ROLE_LEVEL[target.role]) {
      return res.status(403).json({ error: 'Недостаточно прав' });
    }

    if (ROLE_LEVEL[newRole] >= ROLE_LEVEL[current.role]) {
      return res.status(403).json({ error: 'Нельзя назначить роль выше вашей' });
    }

    log("ADMIN_CHANGE_ROLE", {
      adminId: current.id,
      targetId: id,
      oldRole: target.role,
      newRole
    });

    const ok = db.updateUserRole(id, newRole);
    if (!ok) {
      return res.status(400).json({ error: 'Нельзя понизить роль последнего администратора' });
    }

    res.json({ success: true });
  }
);

// ============================
// Активация аккаунта
// ============================
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

// ============================
// Админ — лимит загрузки
// ============================
app.get('/api/admin/upload-limit',
  auth.authRequired,
  auth.requireRole('admin'),
  (req: Request, res: Response) => {
    try {
      const limit = db.getUploadLimit();
      res.json({ upload_limit_mb: limit });
    } catch (err) {
      res.status(500).json({ error: 'Не удалось получить лимит' });
    }
  }
);

app.patch('/api/admin/upload-limit',
  auth.authRequired,
  auth.requireRole('admin'),
  (req: Request, res: Response) => {
    try {
      let { upload_limit_mb } = req.body;
      const value = Number(upload_limit_mb);

      if (isNaN(value) || value <= 0) {
        return res.status(400).json({ error: 'Некорректное значение лимита' });
      }

      log("ADMIN_SET_UPLOAD_LIMIT", {
        adminId: (req as any).userId,
        newLimit: value
      });

      db.setUploadLimit(value);
      res.json({ success: true, upload_limit_mb: value });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Не удалось обновить лимит' });
    }
  }
);

// ============================
// Загрузка документов
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

      const storedName = `${(req as any).userId}_${orig}`;
      const saveTo = path.join(UPLOAD_DIR, storedName);

      const writeStream = fs.createWriteStream(saveTo);
      let totalSize = 0;

      const MAX_SIZE = db.getUploadLimit() * 1024 * 1024;

      activeWrites++;

      file.on('data', (chunk: any) => {
        totalSize += chunk.length;
        if (totalSize > MAX_SIZE) {
          file.unpipe(writeStream);
          writeStream.destroy();
          if (fs.existsSync(saveTo)) fs.unlinkSync(saveTo);
          return res.status(413).json({ error: `Файл превышает допустимый размер ${db.getUploadLimit()} МБ` });
        }
      });

      file.pipe(writeStream);

      writeStream.on('close', async () => {
        if (totalSize > MAX_SIZE) return;

        const { category, keywords } = classifyDocument({ originalname: orig });

        try {
          const textContent = await extractText(saveTo, info.mimeType || '');

          log("UPLOAD_DOCUMENT", {
            userId: (req as any).userId,
            filename: storedName,
            size: totalSize,
            category
          });

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

          if (activeWrites === 0) res.status(201).json(uploaded);
        } catch (err) {
          activeWrites--;
          if (activeWrites === 0 && uploaded.length === 0) {
            res.status(500).json({ error: 'Ошибка при обработке файла' });
          }
        }
      });
    });

    busboy.on('finish', () => {
      if (activeWrites === 0 && uploaded.length === 0) {
        res.status(400).json({ error: 'Файлы не были переданы' });
      }
    });

    req.pipe(busboy);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка при загрузке файла' });
  }
});

// ============================
// Раздача файлов
// ============================
app.get('/files/:filename', (req: Request, res: Response) => {
  const storedName = req.params.filename as string;
  const filePath = path.join(UPLOAD_DIR, storedName);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send('Файл не найден');
  }

  res.sendFile(filePath);
});

// ============================
// Категории
// ============================
app.get('/api/categories', auth.authRequired, (req: Request, res: Response) => {
  res.json(CATEGORIES);
});

// ============================
// Документы
// ============================
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

    log("UPDATE_DOCUMENT", {
      userId: (req as any).userId,
      documentId: id,
      fields: Object.keys(req.body)
    });

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

    log("DELETE_DOCUMENT", {
      userId: (req as any).userId,
      documentId: id
    });

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

// ============================
// Админ — переклассификация
// ============================
app.post('/api/admin/reclassify',
  auth.authRequired,
  auth.requireRole('admin'),
  (req: Request, res: Response) => {
    try {
      log("ADMIN_RECLASSIFY_ALL", { adminId: (req as any).userId });

      db.reclassifyAllDocuments();
      res.json({ success: true, message: 'Все документы переклассифицированы' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Ошибка переклассификации документов' });
    }
  }
);

// ============================
// Админ — переименование файлов
// ============================
app.post('/api/admin/rename-files',
  auth.authRequired,
  auth.requireRole('admin'),
  (req: Request, res: Response) => {
    try {
      log("ADMIN_RENAME_FILES", { adminId: (req as any).userId });

      db.renameAllFilesToOriginal();
      res.json({ success: true, message: 'Все файлы переименованы по оригинальным именам' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Ошибка переименования файлов' });
    }
  }
);

app.use('/api', assistantRoute);
app.use(express.static(path.join(__dirname, '..', 'public')));

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);

  try {
    db.reclassifyAllDocuments();
    console.log('Все документы переклассифицированы автоматически при старте сервера');
  } catch (err) {
    console.error('Ошибка переклассификации при старте:', err);
  }
});
