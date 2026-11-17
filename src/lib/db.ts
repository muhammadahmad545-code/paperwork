import * as Crypto from 'expo-crypto';
import { File, Paths } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import * as SQLite from 'expo-sqlite';
import type { DateKind, DocType } from './extract';
import { ftsQuery } from './query';

export interface DocumentRow {
  id: string;
  title: string;
  type: DocType;
  notes: string;
  text: string;
  amount: number | null;
  currency: string | null;
  createdAt: number;
  updatedAt: number;
  pageCount: number;
  thumb: string | null;
  pinned: boolean;
}

export interface PageRow {
  name: string;
  thumb: string;
}

export interface DateRow {
  id: string;
  docId: string;
  kind: DateKind;
  iso: string;
  label: string;
  remind: boolean;
  reminderIds: string[];
  docTitle?: string;
  docType?: DocType;
}

const KEY_NAME = 'paperwork.db.key.v1';
const DB_NAME = 'paperwork.db';

export class DatabaseKeyLost extends Error {
  constructor() {
    super('The key for your encrypted documents is missing, so they cannot be opened. This can happen after restoring the phone from a backup. Erase all data in Settings to start again.');
    this.name = 'DatabaseKeyLost';
  }
}

/**
 * The database key is random, created on first run and stored with SecureStore (Keystore-wrapped).
 * If the key is gone but a database exists, never silently create a new key: that would lock the
 * old data away for good. Report it instead.
 */
async function databaseKey(): Promise<string> {
  const existing = await SecureStore.getItemAsync(KEY_NAME);
  if (existing && /^[0-9a-f]{64}$/.test(existing)) return existing;
  const dbFile = new File(Paths.document, 'SQLite', DB_NAME);
  if (dbFile.exists) throw new DatabaseKeyLost();
  const hex = Array.from(Crypto.getRandomBytes(32), (b) => b.toString(16).padStart(2, '0')).join('');
  await SecureStore.setItemAsync(KEY_NAME, hex, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
  return hex;
}

const MIGRATIONS: string[] = [
  // 1: initial schema
  `CREATE TABLE IF NOT EXISTS documents (
     id TEXT PRIMARY KEY NOT NULL, title TEXT NOT NULL, type TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '',
     text TEXT NOT NULL DEFAULT '', amount REAL, currency TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS pages (
     doc_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE, idx INTEGER NOT NULL, name TEXT NOT NULL, PRIMARY KEY (doc_id, idx));
   CREATE TABLE IF NOT EXISTS dates (
     id TEXT PRIMARY KEY NOT NULL, doc_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE, kind TEXT NOT NULL,
     iso TEXT NOT NULL, label TEXT NOT NULL DEFAULT '', remind INTEGER NOT NULL DEFAULT 1, reminder_ids TEXT NOT NULL DEFAULT '[]');
   CREATE INDEX IF NOT EXISTS dates_iso ON dates (iso);
   CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(doc_id UNINDEXED, title, text, notes, tokenize = 'unicode61');`,
  // 2: thumbnails and pinning
  `ALTER TABLE pages ADD COLUMN thumb TEXT NOT NULL DEFAULT '';
   ALTER TABLE documents ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;
   CREATE INDEX IF NOT EXISTS documents_created ON documents (pinned DESC, created_at DESC);`,
];

let opening: Promise<SQLite.SQLiteDatabase> | null = null;

export function db(): Promise<SQLite.SQLiteDatabase> {
  opening ??= (async () => {
    const key = await databaseKey();
    const database = await SQLite.openDatabaseAsync(DB_NAME);
    // SQLCipher: the key must be the first statement on the connection.
    await database.execAsync(`PRAGMA key = "x'${key}'";`);
    await database.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    const row = await database.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    let version = row?.user_version ?? 0;
    while (version < MIGRATIONS.length) {
      // Every statement here runs on this keyed connection; expo-sqlite's exclusive transactions
      // would open a second connection that SQLCipher has no key for.
      await database.withTransactionAsync(async () => {
        await database.execAsync(MIGRATIONS[version]);
        await database.execAsync(`PRAGMA user_version = ${version + 1}`);
      });
      version++;
    }
    return database;
  })();
  opening.catch(() => {
    opening = null;
  });
  return opening;
}

/** Serialises write transactions on the single keyed connection. */
let writeQueue: Promise<unknown> = Promise.resolve();
async function write<T>(task: (database: SQLite.SQLiteDatabase) => Promise<T>): Promise<T> {
  const database = await db();
  const run = writeQueue.then(async () => {
    let result!: T;
    await database.withTransactionAsync(async () => {
      result = await task(database);
    });
    return result;
  });
  writeQueue = run.catch(() => {});
  return run;
}

interface DocRecord {
  id: string;
  title: string;
  type: DocType;
  notes: string;
  text: string;
  amount: number | null;
  currency: string | null;
  created_at: number;
  updated_at: number;
  pinned: number;
  page_count: number;
  thumb: string | null;
}

const DOC_COLUMNS = `d.*, (SELECT COUNT(*) FROM pages p WHERE p.doc_id = d.id) AS page_count,
  (SELECT CASE WHEN p.thumb = '' THEN p.name ELSE p.thumb END FROM pages p WHERE p.doc_id = d.id ORDER BY idx LIMIT 1) AS thumb`;

const toDoc = (r: DocRecord): DocumentRow => ({
  id: r.id,
  title: r.title,
  type: r.type,
  notes: r.notes,
  text: r.text,
  amount: r.amount,
  currency: r.currency,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  pageCount: r.page_count,
  thumb: r.thumb,
  pinned: r.pinned === 1,
});

interface DateRecord {
  id: string;
  doc_id: string;
  kind: DateKind;
  iso: string;
  label: string;
  remind: number;
  reminder_ids: string;
  doc_title?: string;
  doc_type?: DocType;
}

const toDate = (r: DateRecord): DateRow => {
  let ids: string[] = [];
  try {
    const parsed = JSON.parse(r.reminder_ids);
    if (Array.isArray(parsed)) ids = parsed.filter((x): x is string => typeof x === 'string');
  } catch {
    ids = [];
  }
  return { id: r.id, docId: r.doc_id, kind: r.kind, iso: r.iso, label: r.label, remind: r.remind === 1, reminderIds: ids, docTitle: r.doc_title, docType: r.doc_type };
};

export type SortOrder = 'newest' | 'oldest' | 'title' | 'expiring';

const ORDER: Record<SortOrder, string> = {
  newest: 'd.pinned DESC, d.created_at DESC',
  oldest: 'd.pinned DESC, d.created_at ASC',
  title: 'd.pinned DESC, d.title COLLATE NOCASE ASC',
  // Soonest upcoming expiry, due or warranty date first; documents without one go last.
  expiring: `d.pinned DESC,
    (SELECT MIN(iso) FROM dates x WHERE x.doc_id = d.id AND x.kind IN ('expiry', 'due', 'warranty') AND x.iso >= date('now', 'localtime')) IS NULL,
    (SELECT MIN(iso) FROM dates x WHERE x.doc_id = d.id AND x.kind IN ('expiry', 'due', 'warranty') AND x.iso >= date('now', 'localtime')) ASC,
    d.created_at DESC`,
};

export async function listDocuments(search: string, type: DocType | null, sort: SortOrder = 'newest'): Promise<DocumentRow[]> {
  const database = await db();
  const where: string[] = [];
  const args: (string | number)[] = [];
  const fts = ftsQuery(search);
  if (fts) {
    where.push('d.id IN (SELECT doc_id FROM documents_fts WHERE documents_fts MATCH ?)');
    args.push(fts);
  }
  if (type) {
    where.push('d.type = ?');
    args.push(type);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = await database.getAllAsync<DocRecord>(`SELECT ${DOC_COLUMNS} FROM documents d ${clause} ORDER BY ${ORDER[sort] ?? ORDER.newest} LIMIT 1000`, args);
  return rows.map(toDoc);
}

export async function allDocumentIds(): Promise<string[]> {
  const database = await db();
  return (await database.getAllAsync<{ id: string }>('SELECT id FROM documents')).map((r) => r.id);
}

export async function getDocument(id: string): Promise<{ doc: DocumentRow; pages: PageRow[]; dates: DateRow[] } | null> {
  const database = await db();
  const row = await database.getFirstAsync<DocRecord>(`SELECT ${DOC_COLUMNS} FROM documents d WHERE d.id = ?`, [id]);
  if (!row) return null;
  const pages = await database.getAllAsync<{ name: string; thumb: string }>('SELECT name, thumb FROM pages WHERE doc_id = ? ORDER BY idx', [id]);
  const dates = await database.getAllAsync<DateRecord>('SELECT * FROM dates WHERE doc_id = ? ORDER BY iso', [id]);
  return { doc: toDoc(row), pages: pages.map((p) => ({ name: p.name, thumb: p.thumb || p.name })), dates: dates.map(toDate) };
}

export interface NewDocument {
  id: string;
  title: string;
  type: DocType;
  notes: string;
  text: string;
  amount: number | null;
  currency: string | null;
  pages: PageRow[];
  dates: { id: string; kind: DateKind; iso: string; label: string; remind: boolean }[];
}

export async function insertDocument(input: NewDocument): Promise<void> {
  const now = Date.now();
  await write(async (database) => {
    await database.runAsync(
      'INSERT INTO documents (id, title, type, notes, text, amount, currency, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [input.id, input.title, input.type, input.notes, input.text, input.amount, input.currency, now, now],
    );
    for (let i = 0; i < input.pages.length; i++) {
      await database.runAsync('INSERT INTO pages (doc_id, idx, name, thumb) VALUES (?, ?, ?, ?)', [input.id, i, input.pages[i].name, input.pages[i].thumb]);
    }
    for (const d of input.dates) {
      await database.runAsync('INSERT INTO dates (id, doc_id, kind, iso, label, remind, reminder_ids) VALUES (?, ?, ?, ?, ?, ?, ?)', [d.id, input.id, d.kind, d.iso, d.label, d.remind ? 1 : 0, '[]']);
    }
    await database.runAsync('INSERT INTO documents_fts (doc_id, title, text, notes) VALUES (?, ?, ?, ?)', [input.id, input.title, input.text, input.notes]);
  });
}

export async function updateDocument(id: string, patch: { title: string; type: DocType; notes: string }): Promise<void> {
  await write(async (database) => {
    await database.runAsync('UPDATE documents SET title = ?, type = ?, notes = ?, updated_at = ? WHERE id = ?', [patch.title, patch.type, patch.notes, Date.now(), id]);
    const row = await database.getFirstAsync<{ text: string }>('SELECT text FROM documents WHERE id = ?', [id]);
    await database.runAsync('DELETE FROM documents_fts WHERE doc_id = ?', [id]);
    await database.runAsync('INSERT INTO documents_fts (doc_id, title, text, notes) VALUES (?, ?, ?, ?)', [id, patch.title, row?.text ?? '', patch.notes]);
  });
}

export async function setPinned(id: string, pinned: boolean): Promise<void> {
  await write((database) => database.runAsync('UPDATE documents SET pinned = ? WHERE id = ?', [pinned ? 1 : 0, id]).then(() => undefined));
}

export async function addDate(docId: string, date: { id: string; kind: DateKind; iso: string; label: string }): Promise<void> {
  await write((database) =>
    database.runAsync('INSERT INTO dates (id, doc_id, kind, iso, label, remind, reminder_ids) VALUES (?, ?, ?, ?, ?, 0, ?)', [date.id, docId, date.kind, date.iso, date.label, '[]']).then(() => undefined),
  );
}

export async function removeDate(dateId: string): Promise<void> {
  await write((database) => database.runAsync('DELETE FROM dates WHERE id = ?', [dateId]).then(() => undefined));
}

export async function setDateReminders(dateId: string, remind: boolean, reminderIds: string[]): Promise<void> {
  await write((database) => database.runAsync('UPDATE dates SET remind = ?, reminder_ids = ? WHERE id = ?', [remind ? 1 : 0, JSON.stringify(reminderIds), dateId]).then(() => undefined));
}

export async function deleteDocument(id: string): Promise<{ reminderIds: string[] }> {
  const database = await db();
  const dates = (await database.getAllAsync<DateRecord>('SELECT * FROM dates WHERE doc_id = ?', [id])).map(toDate);
  await write(async (d) => {
    await d.runAsync('DELETE FROM documents_fts WHERE doc_id = ?', [id]);
    await d.runAsync('DELETE FROM documents WHERE id = ?', [id]);
  });
  return { reminderIds: dates.flatMap((d) => d.reminderIds) };
}

export async function allDates(): Promise<DateRow[]> {
  const database = await db();
  const rows = await database.getAllAsync<DateRecord>(
    `SELECT dt.*, d.title AS doc_title, d.type AS doc_type FROM dates dt JOIN documents d ON d.id = dt.doc_id
     WHERE dt.kind IN ('expiry', 'due', 'warranty') ORDER BY dt.iso`,
  );
  return rows.map(toDate);
}

export async function allReminderIds(): Promise<string[]> {
  const database = await db();
  const rows = await database.getAllAsync<DateRecord>('SELECT * FROM dates');
  return rows.map(toDate).flatMap((d) => d.reminderIds);
}

export interface Insights {
  documents: number;
  pages: number;
  byType: { type: DocType; count: number }[];
  /** Spending from receipts, bills and invoices, per month (YYYY-MM), newest first, in the most common currency. */
  spending: { month: string; total: number }[];
  currency: string | null;
  expiringThisYear: number;
}

export async function insights(): Promise<Insights> {
  const database = await db();
  const totals = await database.getFirstAsync<{ documents: number; pages: number }>('SELECT (SELECT COUNT(*) FROM documents) AS documents, (SELECT COUNT(*) FROM pages) AS pages');
  const byType = await database.getAllAsync<{ type: DocType; count: number }>('SELECT type, COUNT(*) AS count FROM documents GROUP BY type ORDER BY count DESC');
  const top = await database.getFirstAsync<{ currency: string }>(
    "SELECT currency FROM documents WHERE amount IS NOT NULL AND currency IS NOT NULL AND currency != '' GROUP BY currency ORDER BY COUNT(*) DESC LIMIT 1",
  );
  const currency = top?.currency ?? null;
  const spending = currency
    ? await database.getAllAsync<{ month: string; total: number }>(
        `SELECT strftime('%Y-%m', created_at / 1000, 'unixepoch', 'localtime') AS month, SUM(amount) AS total FROM documents
         WHERE amount IS NOT NULL AND currency = ? AND type IN ('receipt', 'bill', 'invoice') GROUP BY month ORDER BY month DESC LIMIT 12`,
        [currency],
      )
    : [];
  const year = new Date().getFullYear();
  const expiring = await database.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM dates WHERE kind IN ('expiry', 'warranty') AND iso >= ? AND iso <= ?", [
    new Date().toISOString().slice(0, 10),
    `${year}-12-31`,
  ]);
  return { documents: totals?.documents ?? 0, pages: totals?.pages ?? 0, byType, spending, currency, expiringThisYear: expiring?.n ?? 0 };
}

export async function wipeAll(): Promise<void> {
  await write(async (database) => {
    await database.execAsync('DELETE FROM documents_fts; DELETE FROM dates; DELETE FROM pages; DELETE FROM documents;');
  });
}

export const newId = () => Crypto.randomUUID();
