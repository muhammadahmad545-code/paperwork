import * as Crypto from 'expo-crypto';
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
  firstPage: string | null;
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

/** The database key is random, generated on first run and kept in the Android Keystore via SecureStore. */
async function databaseKey(): Promise<string> {
  const existing = await SecureStore.getItemAsync(KEY_NAME);
  if (existing && /^[0-9a-f]{64}$/.test(existing)) return existing;
  const bytes = Crypto.getRandomBytes(32);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  await SecureStore.setItemAsync(KEY_NAME, hex, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
  return hex;
}

let opening: Promise<SQLite.SQLiteDatabase> | null = null;

export function db(): Promise<SQLite.SQLiteDatabase> {
  opening ??= (async () => {
    const key = await databaseKey();
    const database = await SQLite.openDatabaseAsync('paperwork.db');
    // SQLCipher: the key must be the first statement on the connection.
    await database.execAsync(`PRAGMA key = "x'${key}'";`);
    await database.execAsync(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        type TEXT NOT NULL,
        notes TEXT NOT NULL DEFAULT '',
        text TEXT NOT NULL DEFAULT '',
        amount REAL,
        currency TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS pages (
        doc_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        idx INTEGER NOT NULL,
        name TEXT NOT NULL,
        PRIMARY KEY (doc_id, idx)
      );
      CREATE TABLE IF NOT EXISTS dates (
        id TEXT PRIMARY KEY NOT NULL,
        doc_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        iso TEXT NOT NULL,
        label TEXT NOT NULL DEFAULT '',
        remind INTEGER NOT NULL DEFAULT 1,
        reminder_ids TEXT NOT NULL DEFAULT '[]'
      );
      CREATE INDEX IF NOT EXISTS dates_iso ON dates (iso);
      CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(doc_id UNINDEXED, title, text, notes, tokenize = 'unicode61');
    `);
    return database;
  })();
  opening.catch(() => {
    opening = null;
  });
  return opening;
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
  page_count: number;
  first_page: string | null;
}

const DOC_COLUMNS = `d.*, (SELECT COUNT(*) FROM pages p WHERE p.doc_id = d.id) AS page_count,
  (SELECT name FROM pages p WHERE p.doc_id = d.id ORDER BY idx LIMIT 1) AS first_page`;

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
  firstPage: r.first_page,
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
    ids = JSON.parse(r.reminder_ids);
  } catch {
    ids = [];
  }
  return { id: r.id, docId: r.doc_id, kind: r.kind, iso: r.iso, label: r.label, remind: r.remind === 1, reminderIds: ids, docTitle: r.doc_title, docType: r.doc_type };
};

export async function listDocuments(search: string, type: DocType | null): Promise<DocumentRow[]> {
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
  const rows = await database.getAllAsync<DocRecord>(`SELECT ${DOC_COLUMNS} FROM documents d ${clause} ORDER BY d.created_at DESC LIMIT 500`, args);
  return rows.map(toDoc);
}

export async function getDocument(id: string): Promise<{ doc: DocumentRow; pages: string[]; dates: DateRow[] } | null> {
  const database = await db();
  const row = await database.getFirstAsync<DocRecord>(`SELECT ${DOC_COLUMNS} FROM documents d WHERE d.id = ?`, [id]);
  if (!row) return null;
  const pages = await database.getAllAsync<{ name: string }>('SELECT name FROM pages WHERE doc_id = ? ORDER BY idx', [id]);
  const dates = await database.getAllAsync<DateRecord>('SELECT * FROM dates WHERE doc_id = ? ORDER BY iso', [id]);
  return { doc: toDoc(row), pages: pages.map((p) => p.name), dates: dates.map(toDate) };
}

export interface NewDocument {
  id: string;
  title: string;
  type: DocType;
  notes: string;
  text: string;
  amount: number | null;
  currency: string | null;
  pages: string[];
  dates: Omit<DateRow, 'docId'>[];
}

export async function insertDocument(input: NewDocument): Promise<void> {
  const database = await db();
  const now = Date.now();
  await database.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync(
      'INSERT INTO documents (id, title, type, notes, text, amount, currency, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [input.id, input.title, input.type, input.notes, input.text, input.amount, input.currency, now, now],
    );
    for (let i = 0; i < input.pages.length; i++) {
      await tx.runAsync('INSERT INTO pages (doc_id, idx, name) VALUES (?, ?, ?)', [input.id, i, input.pages[i]]);
    }
    for (const d of input.dates) {
      await tx.runAsync('INSERT INTO dates (id, doc_id, kind, iso, label, remind, reminder_ids) VALUES (?, ?, ?, ?, ?, ?, ?)', [
        d.id,
        input.id,
        d.kind,
        d.iso,
        d.label,
        d.remind ? 1 : 0,
        JSON.stringify(d.reminderIds),
      ]);
    }
    await tx.runAsync('INSERT INTO documents_fts (doc_id, title, text, notes) VALUES (?, ?, ?, ?)', [input.id, input.title, input.text, input.notes]);
  });
}

export async function updateDocument(id: string, patch: { title: string; type: DocType; notes: string }): Promise<void> {
  const database = await db();
  await database.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync('UPDATE documents SET title = ?, type = ?, notes = ?, updated_at = ? WHERE id = ?', [patch.title, patch.type, patch.notes, Date.now(), id]);
    const row = await tx.getFirstAsync<{ text: string }>('SELECT text FROM documents WHERE id = ?', [id]);
    await tx.runAsync('DELETE FROM documents_fts WHERE doc_id = ?', [id]);
    await tx.runAsync('INSERT INTO documents_fts (doc_id, title, text, notes) VALUES (?, ?, ?, ?)', [id, patch.title, row?.text ?? '', patch.notes]);
  });
}

export async function setDateReminders(dateId: string, remind: boolean, reminderIds: string[]): Promise<void> {
  const database = await db();
  await database.runAsync('UPDATE dates SET remind = ?, reminder_ids = ? WHERE id = ?', [remind ? 1 : 0, JSON.stringify(reminderIds), dateId]);
}

export async function deleteDocument(id: string): Promise<{ pages: string[]; reminderIds: string[] }> {
  const database = await db();
  const pages = (await database.getAllAsync<{ name: string }>('SELECT name FROM pages WHERE doc_id = ?', [id])).map((p) => p.name);
  const dates = (await database.getAllAsync<DateRecord>('SELECT * FROM dates WHERE doc_id = ?', [id])).map(toDate);
  await database.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync('DELETE FROM documents_fts WHERE doc_id = ?', [id]);
    await tx.runAsync('DELETE FROM documents WHERE id = ?', [id]);
  });
  return { pages, reminderIds: dates.flatMap((d) => d.reminderIds) };
}

export async function allDates(): Promise<DateRow[]> {
  const database = await db();
  const rows = await database.getAllAsync<DateRecord>(
    `SELECT dt.*, d.title AS doc_title, d.type AS doc_type FROM dates dt JOIN documents d ON d.id = dt.doc_id
     WHERE dt.kind IN ('expiry', 'due', 'warranty') ORDER BY dt.iso`,
  );
  return rows.map(toDate);
}

export async function wipeAll(): Promise<{ pages: string[] }> {
  const database = await db();
  const pages = (await database.getAllAsync<{ name: string }>('SELECT name FROM pages')).map((p) => p.name);
  await database.execAsync('DELETE FROM documents_fts; DELETE FROM documents;');
  return { pages };
}

export const newId = () => Crypto.randomUUID();
