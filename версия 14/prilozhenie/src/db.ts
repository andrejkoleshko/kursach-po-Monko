import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { classifyDocument } from './classifier';

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
    smtp_pass TEXT,

    display_name TEXT,
    first_name TEXT,
    last_name TEXT,
    phone TEXT,
    avatar_url TEXT,

    role TEXT NOT NULL DEFAULT 'user'
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

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

// 🔥 Добавляем недостающие поля профиля (мягко, через try/catch)
const profileColumns = [
  "ALTER TABLE users ADD COLUMN display_name TEXT",
  "ALTER TABLE users ADD COLUMN first_name TEXT",
  "ALTER TABLE users ADD COLUMN last_name TEXT",
  "ALTER TABLE users ADD COLUMN phone TEXT",
  "ALTER TABLE users ADD COLUMN avatar_url TEXT"
];

for (const sql of profileColumns) {
  try {
    db.exec(sql);
  } catch {
    // колонка уже есть — игнорируем
  }
}

// 🔥 Добавляем колонку role, если её ещё нет
try {
  db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'");
} catch {
  // уже есть — ок
}

// 🔥 Методы для лимита
export function getUploadLimit(): number {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'upload_limit_mb'").get() as { value: string } | undefined;
  return row ? Number(row.value) : 500;
}

export function setUploadLimit(value: number): void {
  db.prepare(`
    INSERT INTO settings (key, value)
    VALUES ('upload_limit_mb', @value)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run({ value });
}

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

  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  avatar_url: string | null;

  role: Role;
}

export interface UserProfile {
  id: number;
  username: string;
  email: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  role: Role;
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

export function getUserById(id: number): UserRecord | undefined {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRecord | undefined;
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

  role: 'user' | 'support' | 'moderator' | 'manager' | 'admin' | 'superadmin';
}): UserRecord {
  const stmt = db.prepare(`
    INSERT INTO users (
      username, email, password_hash, is_active, activation_token,
      smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass,
      role
    )
    VALUES (
      @username, @email, @password_hash, 0, @activation_token,
      @smtp_host, @smtp_port, @smtp_secure, @smtp_user, @smtp_pass,
      @role
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

    display_name: null,
    first_name: null,
    last_name: null,
    phone: null,
    avatar_url: null,

    role: user.role,
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

export function listUsers(): Pick<UserRecord, 'id' | 'username' | 'email' | 'is_active' | 'role'>[] {
  return db.prepare(`
    SELECT id, username, email, is_active, role
    FROM users
    ORDER BY id
  `).all() as any;
}

export function deleteUserByUsername(username: string): boolean {
  const user = getUserByUsername(username);
  if (!user) return false;

  // 🔥 Нельзя удалить последнего администратора
  if (user.role === 'admin' && countAdmins() <= 1) {
    return false;
  }

  const info = db.prepare('DELETE FROM users WHERE username = ?').run(username);
  return info.changes > 0;
}

// 🔥 Профиль пользователя
export function getUserProfile(userId: number): UserProfile | undefined {
  const user = getUserById(userId);
  if (!user) return undefined;

  return {
    id: user.id,
    username: user.username,
    email: user.email,
    display_name: user.display_name,
    first_name: user.first_name,
    last_name: user.last_name,
    phone: user.phone,
    avatar_url: user.avatar_url,
    role: user.role,
  };
}

export function updateUserProfile(
  userId: number,
  updates: {
    display_name?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    phone?: string | null;
    avatar_url?: string | null;
  }
): UserProfile | undefined {
  const fields: string[] = [];
  const params: Record<string, unknown> = { userId };

  if (typeof updates.display_name !== 'undefined') {
    fields.push('display_name = @display_name');
    params.display_name = updates.display_name;
  }
  if (typeof updates.first_name !== 'undefined') {
    fields.push('first_name = @first_name');
    params.first_name = updates.first_name;
  }
  if (typeof updates.last_name !== 'undefined') {
    fields.push('last_name = @last_name');
    params.last_name = updates.last_name;
  }
  if (typeof updates.phone !== 'undefined') {
    fields.push('phone = @phone');
    params.phone = updates.phone;
  }
  if (typeof updates.avatar_url !== 'undefined') {
    fields.push('avatar_url = @avatar_url');
    params.avatar_url = updates.avatar_url;
  }

  if (!fields.length) {
    return getUserProfile(userId);
  }

  const stmt = db.prepare(`
    UPDATE users
    SET ${fields.join(', ')}
    WHERE id = @userId
  `);
  stmt.run(params as any);

  return getUserProfile(userId);
}

// 🔥 Переклассификация всех документов
export function reclassifyAllDocuments(): void {
  const docs = db.prepare('SELECT id, original_name, user_id FROM documents').all();
  const update = db.prepare('UPDATE documents SET category = ?, keywords = ? WHERE id = ? AND user_id = ?');

  (docs as any[]).forEach((doc) => {
    const { category, keywords } = classifyDocument({ originalname: doc.original_name });
    update.run(category, keywords, doc.id, doc.user_id);
  });
}

export function renameAllFilesToOriginal(): void {
  const docs = db.prepare('SELECT id, filename, original_name, user_id FROM documents').all();
  const update = db.prepare('UPDATE documents SET filename = ? WHERE id = ? AND user_id = ?');

  docs.forEach((doc: any) => {
    const oldPath = path.join(__dirname, '..', 'uploads', doc.filename);
    const newName = `${doc.user_id}_${doc.original_name}`;
    const newPath = path.join(__dirname, '..', 'uploads', newName);

    if (fs.existsSync(oldPath)) {
      try {
        fs.renameSync(oldPath, newPath);
        update.run(newName, doc.id, doc.user_id);
      } catch (err) {
        console.error(`Ошибка при переименовании ${doc.filename}:`, err);
      }
    }
  });
}

export function countAdmins(): number {
  const row = db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'admin'").get() as { c: number };
  return row.c;
}

// 🔥 Работа с ролями
export function updateUserRole(id: number, role: 'user' | 'support' | 'moderator' | 'manager' | 'admin' | 'superadmin'): boolean {
  const user = getUserById(id);
  if (!user) return false;

  // 🔥 Нельзя понизить последнего администратора
  if (user.role === 'admin' && role === 'user' && countAdmins() <= 1) {
    return false;
  }

  const info = db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id);
  return info.changes > 0;
}

export const ROLE_LEVEL = {
  user: 1,
  support: 2,
  moderator: 3,
  manager: 4,
  admin: 5,
  superadmin: 6
} as const;
export type Role = keyof typeof ROLE_LEVEL;