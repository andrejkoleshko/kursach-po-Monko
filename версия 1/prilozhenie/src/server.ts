import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import Busboy from 'busboy';

import * as db from './db';
import { CATEGORIES, classifyDocument } from './classifier';

// Восстановление имён при старте
db.repairAllNames();

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 5000;

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// =======================
//   СКАЧИВАНИЕ ФАЙЛОВ
// =======================
app.get('/files/:filename', (req, res) => {
  const storedName = req.params.filename;
  const filePath = path.join(UPLOAD_DIR, storedName);

  const doc = db.getDocumentByFilename(storedName);

  if (!doc || !fs.existsSync(filePath)) {
    return res.status(404).send('Файл не найден');
  }

  res.download(filePath, doc.original_name);
});

// =======================
//       API ROUTES
// =======================

// --- UPLOAD ---
app.post('/api/upload', (req: Request, res: Response) => {
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

      file.on('data', chunk => {
        totalSize += chunk.length;
      });

      file.pipe(writeStream);

      writeStream.on('close', () => {
        const { category, keywords } = classifyDocument({ originalname: orig });

        const doc = db.addDocument({
          filename: storedName,
          original_name: orig,
          mime_type: info.mimeType || 'application/octet-stream',
          size: totalSize,
          category,
          keywords,
          description: '',
          uploaded_at: new Date().toISOString(),
        });

        uploaded.push(doc);
        activeWrites--;

        if (activeWrites === 0) {
          res.status(201).json(uploaded);
        }
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

// --- Остальные API ---
app.get('/api/categories', (_req: Request, res: Response) => {
  res.json(CATEGORIES);
});

app.get('/api/documents', (req: Request, res: Response) => {
  try {
    const { category = 'all', q = '' } = req.query as { category?: string; q?: string };
    const docs = db.listDocuments({ category, query: q });
    res.json(docs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Не удалось получить список документов.' });
  }
});

app.patch('/api/documents/:id', (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const { category, description } = req.body;

    const updated = db.updateDocument(id, { category, description });
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

app.delete('/api/documents/:id', (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const deleted = db.deleteDocument(id);
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

// =======================
//     STATIC FILES
// =======================
app.use(express.static(path.join(__dirname, '..', 'public')));

// =======================
//        START
// =======================
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
