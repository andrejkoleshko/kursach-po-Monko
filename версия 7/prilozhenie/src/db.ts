import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'storage.db');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 0,
    activation_token TEXT,

    smtp_host TEXT,
    smtp_port INTEGER,
    smtp_secure INTEGER,
    smtp_user TEXT,
    smtp_pass TEXT
  );
`);

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
    uploaded_at TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    content TEXT
  );
`);

export interface DocumentRecord {
  id: number;
  filename: string;
  original_name: string;
  mime_type: string;
  size: number;
  category: string;
  keywords: string | null;
  description: string | null;
  uploaded_at: string;
  user_id: number;
  content: string | null;
}

export interface NewDocument {
  filename: string;
  original_name: string;
  mime_type: string;
  size: number;
  category: string;
  keywords: string;
  description: string;
  uploaded_at: string;
  user_id: number;
  content: string;
}

export interface DocumentFilters {
  category?: string;
  query?: string;
  userId: number;
  sort?: string;
}

export interface UserRecord {
  id: number;
  username: string;
  email: string;
  password_hash: string;
  is_active: number;
  activation_token: string | null;

  smtp_host: string | null;
  smtp_port: number | null;
  smtp_secure: number | null;
  smtp_user: string | null;
  smtp_pass: string | null;
}

export function improveOriginalName(str: string): string {
  if (typeof str !== 'string') return str as any;

  const latin1 = Buffer.from(str, 'latin1').toString('utf8');

  let mimeDecoded = str;
  try {
    const mimeMatch = str.match(/=\?utf-8\?q\?(.+?)\?=/i);
    if (mimeMatch) {
      const q = mimeMatch[1]
        .replace(/_/g, ' ')
        .replace(/=([0-9A-F]{2})/gi, (_, p1) =>
          String.fromCharCode(parseInt(p1, 16)),
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

  const score = (s: string) => (s.match(/[А-Яа-яЁё]/g) || []).length;
  const candidates = [str, latin1, mimeDecoded, rfcDecoded];
  candidates.sort((a, b) => score(b) - score(a));
  return candidates[0];
}

function needsDecoding(str: string): boolean {
  return typeof str === 'string' && /[ÐÑÃ]/.test(str);
}

function decodeIfNeeded(str: string | null): string | null {
  if (str == null) return str;
  if (!needsDecoding(str)) return str;
  return Buffer.from(str, 'latin1').toString('utf8');
}

export function addDocument(doc: NewDocument): DocumentRecord {
  const stmt = db.prepare<NewDocument & { id?: number }>(`
    INSERT INTO documents 
      (filename, original_name, mime_type, size, category, keywords, description, uploaded_at, user_id, content)
    VALUES
      (@filename, @original_name, @mime_type, @size, @category, @keywords, @description, @uploaded_at, @user_id, @content)
  `);
  const info = stmt.run(doc as any);
  return { id: Number(info.lastInsertRowid), ...(doc as any) };
}

export function listDocuments(filters: DocumentFilters): DocumentRecord[] {
  const conditions: string[] = ['user_id = @userId'];
  const params: Record<string, unknown> = { userId: filters.userId };

  if (filters.category && filters.category !== 'all') {
    conditions.push('category = @category');
    params.category = filters.category;
  }

  if (filters.query) {
    conditions.push(`
      (
        lower(original_name) LIKE @q OR
        lower(keywords) LIKE @q OR
        lower(description) LIKE @q OR
        lower(content) LIKE @q
      )
    `);
    params.q = `%${filters.query.toLowerCase()}%`;
  }

  const where = `WHERE ${conditions.join(' AND ')}`;

  let orderBy = 'datetime(uploaded_at) DESC';

  const sortByNameAsc = filters.sort === 'name_asc';
  const sortByNameDesc = filters.sort === 'name_desc';

  if (filters.sort === 'size_asc') orderBy = 'size ASC';
  if (filters.sort === 'size_desc') orderBy = 'size DESC';
  if (filters.sort === 'date_asc') orderBy = 'datetime(uploaded_at) ASC';
  if (filters.sort === 'date_desc') orderBy = 'datetime(uploaded_at) DESC';

  if (sortByNameAsc || sortByNameDesc) {
    orderBy = '';
  }

  const stmt = db.prepare(`
    SELECT * FROM documents
    ${where}
    ${orderBy ? `ORDER BY ${orderBy}` : ''}
  `);

  let rows = stmt.all(params as any) as DocumentRecord[];

  function alphabetGroup(ch: string): number {
    if (!ch) return 3;

    const code = ch.toLowerCase().charCodeAt(0);

    if (code >= 48 && code <= 57) return 0;
    if (code >= 97 && code <= 122) return 1;
    if (code >= 1072 && code <= 1103) return 2;

    return 3;
  }

  function compareNames(a: string, b: string, direction: 1 | -1) {
    const a0 = a[0] || '';
    const b0 = b[0] || '';

    const groupA = alphabetGroup(a0);
    const groupB = alphabetGroup(b0);

    if (groupA !== groupB) return (groupA - groupB) * direction;

    return a.localeCompare(b, 'ru', {
      sensitivity: 'accent',
      caseFirst: 'false',
      numeric: true
    }) * direction;
  }

  if (sortByNameAsc) {
    rows.sort((a, b) => compareNames(a.original_name, b.original_name, 1));
  }

  if (sortByNameDesc) {
    rows.sort((a, b) => compareNames(a.original_name, b.original_name, -1));
  }

  rows = rows.map((r) => ({
    ...r,
    original_name: decodeIfNeeded(r.original_name) || r.original_name,
    keywords: decodeIfNeeded(r.keywords),
  }));

  return rows;
}

export function getDocument(id: number, userId: number): DocumentRecord | undefined {
  const stmt = db.prepare('SELECT * FROM documents WHERE id = ? AND user_id = ?');
  const r = stmt.get(id, userId) as DocumentRecord | undefined;
  if (!r) return r;

  return {
    ...r,
    original_name: decodeIfNeeded(r.original_name) || r.original_name,
    keywords: decodeIfNeeded(r.keywords),
  };
}

export function updateDocument(
  id: number,
  userId: number,
  updates: { category?: string; description?: string; original_name?: string },
): DocumentRecord | undefined {
  const fields: string[] = [];
  const params: Record<string, unknown> = { id, userId };

  if (updates.category) {
    fields.push('category = @category');
    params.category = updates.category;
  }
  if (typeof updates.description === 'string') {
    fields.push('description = @description');
    params.description = updates.description;
  }
  if (typeof updates.original_name === 'string') {
    fields.push('original_name = @original_name');
    params.original_name = updates.original_name;
  }

  if (!fields.length) return getDocument(id, userId);

  const stmt = db.prepare(`
    UPDATE documents
    SET ${fields.join(', ')}
    WHERE id = @id AND user_id = @userId
  `);
  stmt.run(params as any);
  return getDocument(id, userId);
}

export function deleteDocument(id: number, userId: number): DocumentRecord | undefined {
  const doc = getDocument(id, userId);
  if (!doc) return undefined;

  const stmt = db.prepare('DELETE FROM documents WHERE id = ? AND user_id = ?');
  stmt.run(id, userId);

  return doc;
}

export function getDocumentByFilename(filename: string, userId: number): DocumentRecord | undefined {
  const stmt = db.prepare('SELECT * FROM documents WHERE filename = ? AND user_id = ?');
  const r = stmt.get(filename, userId) as DocumentRecord | undefined;
  if (!r) return r;
  return {
    ...r,
    original_name: decodeIfNeeded(r.original_name) || r.original_name,
    keywords: decodeIfNeeded(r.keywords),
  };
}

export function repairAllNames(): void {
  const docs = db.prepare('SELECT id, original_name FROM documents').all();
  const update = db.prepare('UPDATE documents SET original_name = ? WHERE id = ?');

  (docs as any[]).forEach((doc) => {
    const fixed = improveOriginalName(doc.original_name);
    if (fixed !== doc.original_name) {
      update.run(fixed, doc.id);
    }
  });
}

export function getUserByUsername(username: string): UserRecord | undefined {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username) as UserRecord | undefined;
}

export function getUserByEmail(email: string): UserRecord | undefined {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRecord | undefined;
}

export function getUserByActivationToken(token: string): UserRecord | undefined {
  return db.prepare('SELECT * FROM users WHERE activation_token = ?').get(token) as UserRecord | undefined;
}

export function addUser(user: {
  username: string;
  email: string;
  password_hash: string;
  activation_token: string;

  smtp_host: string;
  smtp_port: number;
  smtp_secure: boolean;
  smtp_user: string;
  smtp_pass: string;
}): UserRecord {
  const stmt = db.prepare(`
    INSERT INTO users (
      username, email, password_hash, is_active, activation_token,
      smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass
    )
    VALUES (
      @username, @email, @password_hash, 0, @activation_token,
      @smtp_host, @smtp_port, @smtp_secure, @smtp_user, @smtp_pass
    )
  `);

  const info = stmt.run({
    ...user,
    smtp_secure: user.smtp_secure ? 1 : 0,
  });

  return {
    id: Number(info.lastInsertRowid),
    username: user.username,
    email: user.email,
    password_hash: user.password_hash,
    is_active: 0,
    activation_token: user.activation_token,
    smtp_host: user.smtp_host,
    smtp_port: user.smtp_port,
    smtp_secure: user.smtp_secure ? 1 : 0,
    smtp_user: user.smtp_user,
    smtp_pass: user.smtp_pass,
  };
}

export function activateUser(token: string): boolean {
  const user = getUserByActivationToken(token);
  if (!user) return false;

  db.prepare(`
    UPDATE users SET is_active = 1, activation_token = NULL WHERE id = ?
  `).run(user.id);

  return true;
}

export function listUsers(): Pick<UserRecord, 'id' | 'username' | 'email' | 'is_active'>[] {
  return db.prepare(`
    SELECT id, username, email, is_active
    FROM users
    ORDER BY id
  `).all() as any;
}

export function deleteUserByUsername(username: string): boolean {
  const info = db.prepare('DELETE FROM users WHERE username = ?').run(username);
  return info.changes > 0;
}
