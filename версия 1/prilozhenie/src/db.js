const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'storage.db');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size INTEGER NOT NULL,
    category TEXT NOT NULL,
    keywords TEXT,
    description TEXT,
    uploaded_at TEXT NOT NULL
  );
`);

// ===============================
//   Улучшение имени файла
// ===============================
function improveOriginalName(str) {
  if (typeof str !== 'string') return str;

  const latin1 = Buffer.from(str, 'latin1').toString('utf8');

  let mimeDecoded = str;
  try {
    const mimeMatch = str.match(/=\?utf-8\?q\?(.+?)\?=/i);
    if (mimeMatch) {
      const q = mimeMatch[1]
        .replace(/_/g, ' ')
        .replace(/=([0-9A-F]{2})/gi, (_, p1) =>
          String.fromCharCode(parseInt(p1, 16))
        );
      mimeDecoded = q;
    }
  } catch {}

  let rfcDecoded = str;
  try {
    if (str.includes("''")) {
      const encoded = str.split("''")[1];
      rfcDecoded = decodeURIComponent(encoded);
    }
  } catch {}

  const score = s => (s.match(/[А-Яа-яЁё]/g) || []).length;
  const candidates = [str, latin1, mimeDecoded, rfcDecoded];
  candidates.sort((a, b) => score(b) - score(a));
  return candidates[0];
}

function needsDecoding(str) {
  return typeof str === 'string' && /[ÐÑÃ]/.test(str);
}

function decodeIfNeeded(str) {
  if (str == null) return str;
  if (!needsDecoding(str)) return str;
  return Buffer.from(str, 'latin1').toString('utf8');
}

// ===============================
//   CRUD операции
// ===============================
function addDocument(doc) {
  const stmt = db.prepare(`
    INSERT INTO documents 
      (filename, original_name, mime_type, size, category, keywords, description, uploaded_at)
    VALUES
      (@filename, @original_name, @mime_type, @size, @category, @keywords, @description, @uploaded_at)
  `);

  const info = stmt.run(doc);
  return { id: Number(info.lastInsertRowid), ...doc };
}

function listDocuments(filters = {}) {
  const conditions = [];
  const params = {};

  if (filters.category && filters.category !== 'all') {
    conditions.push('category = @category');
    params.category = filters.category;
  }

  if (filters.query) {
    conditions.push(
      '(lower(original_name) LIKE @q OR lower(keywords) LIKE @q OR lower(description) LIKE @q)'
    );
    params.q = `%${filters.query.toLowerCase()}%`;
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const stmt = db.prepare(`
    SELECT * FROM documents
    ${where}
    ORDER BY datetime(uploaded_at) DESC
  `);

  const rows = stmt.all(params);

  return rows.map(r => ({
    ...r,
    original_name: decodeIfNeeded(r.original_name) || r.original_name,
    keywords: decodeIfNeeded(r.keywords)
  }));
}

function getDocument(id) {
  const stmt = db.prepare('SELECT * FROM documents WHERE id = ?');
  const r = stmt.get(id);
  if (!r) return undefined;

  return {
    ...r,
    original_name: decodeIfNeeded(r.original_name) || r.original_name,
    keywords: decodeIfNeeded(r.keywords)
  };
}

function updateDocument(id, updates) {
  const fields = [];
  const params = { id };

  if (updates.category) {
    fields.push('category = @category');
    params.category = updates.category;
  }
  if (typeof updates.description === 'string') {
    fields.push('description = @description');
    params.description = updates.description;
  }

  if (!fields.length) return getDocument(id);

  const stmt = db.prepare(`
    UPDATE documents
    SET ${fields.join(', ')}
    WHERE id = @id
  `);

  stmt.run(params);
  return getDocument(id);
}

function deleteDocument(id) {
  const doc = getDocument(id);
  if (!doc) return undefined;

  db.prepare('DELETE FROM documents WHERE id = ?').run(id);
  return doc;
}

function getDocumentByFilename(filename) {
  const stmt = db.prepare('SELECT * FROM documents WHERE filename = ?');
  const r = stmt.get(filename);
  if (!r) return undefined;

  return {
    ...r,
    original_name: decodeIfNeeded(r.original_name) || r.original_name,
    keywords: decodeIfNeeded(r.keywords)
  };
}

function repairAllNames() {
  const docs = db.prepare('SELECT id, original_name FROM documents').all();
  const update = db.prepare('UPDATE documents SET original_name = ? WHERE id = ?');

  docs.forEach(doc => {
    const fixed = improveOriginalName(doc.original_name);
    if (fixed !== doc.original_name) {
      update.run(fixed, doc.id);
    }
  });
}

// ===============================
//   Экспорт
// ===============================
module.exports = {
  addDocument,
  listDocuments,
  getDocument,
  updateDocument,
  deleteDocument,
  getDocumentByFilename,
  repairAllNames,
  improveOriginalName
};