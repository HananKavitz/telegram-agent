import initSqlJs from "sql.js";
import type { Database as SqlJsDatabase } from "sql.js";
import path from "path";
import fs from "fs";
import { config, MAX_CONTEXT_PAIRS, DEFAULT_DIGEST_TOPICS, DEFAULT_DIGEST_TIME } from "../config.js";

let db: SqlJsDatabase;

export async function initDatabase(): Promise<void> {
  const dir = path.dirname(config.databasePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const SQL = await initSqlJs();

  if (fs.existsSync(config.databasePath)) {
    const buffer = fs.readFileSync(config.databasePath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`PRAGMA journal_mode = WAL`);

  db.run(`
    CREATE TABLE IF NOT EXISTS conversations (
      user_id INTEGER NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system', 'tool')),
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id, created_at)
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS user_settings (
      user_id INTEGER PRIMARY KEY,
      selected_model TEXT NOT NULL DEFAULT '${config.defaultModel}',
image_model TEXT NOT NULL DEFAULT 'flux.2-klein-4b'
    )
  `);

  try {
    db.run(`ALTER TABLE user_settings ADD COLUMN image_model TEXT NOT NULL DEFAULT 'flux.2-klein-4b'`);
  } catch {
    // column already exists
  }

  for (const col of [
    `digest_enabled INTEGER NOT NULL DEFAULT 0`,
    `digest_time TEXT NOT NULL DEFAULT '${DEFAULT_DIGEST_TIME}'`,
    `digest_topics TEXT NOT NULL DEFAULT '${JSON.stringify([...DEFAULT_DIGEST_TOPICS])}'`,
    `digest_last_sent TEXT`,
  ]) {
    try {
      db.run(`ALTER TABLE user_settings ADD COLUMN ${col}`);
    } catch {
      // column already exists
    }
  }

  saveDatabase();
}

function saveDatabase(): void {
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(config.databasePath, buffer);
}

function getMessageLimit(): number {
  return MAX_CONTEXT_PAIRS * 2;
}

export function getMessages(userId: number) {
  const limit = getMessageLimit();
  const stmt = db.prepare(
    `SELECT role, content FROM conversations WHERE user_id = ? ORDER BY created_at ASC LIMIT ?`
  );
  stmt.bind([userId, limit]);

  const rows: { role: string; content: string }[] = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject() as { role: string; content: string });
  }
  stmt.free();
  return rows;
}

export function addMessage(userId: number, role: string, content: string) {
  db.run(
    `INSERT INTO conversations (user_id, role, content) VALUES (?, ?, ?)`,
    [userId, role, content]
  );
  saveDatabase();
}

export function clearMessages(userId: number) {
  db.run(`DELETE FROM conversations WHERE user_id = ?`, [userId]);
  saveDatabase();
}

export function getSelectedModel(userId: number): string {
  const stmt = db.prepare(
    `SELECT selected_model FROM user_settings WHERE user_id = ?`
  );
  stmt.bind([userId]);

  let model = config.defaultModel;
  if (stmt.step()) {
    const row = stmt.getAsObject() as { selected_model: string };
    model = row.selected_model;
  }
  stmt.free();
  return model;
}

export function setSelectedModel(userId: number, model: string) {
  db.run(
    `INSERT INTO user_settings (user_id, selected_model) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET selected_model = excluded.selected_model`,
    [userId, model]
  );
  saveDatabase();
}

export function getSelectedImageModel(userId: number): string {
  const stmt = db.prepare(
    `SELECT image_model FROM user_settings WHERE user_id = ?`
  );
  stmt.bind([userId]);

  let model = "flux.2-klein-4b";
  if (stmt.step()) {
    const row = stmt.getAsObject() as { image_model: string };
    model = row.image_model;
  }
  stmt.free();
  return model;
}

export function setSelectedImageModel(userId: number, model: string) {
  db.run(
    `INSERT INTO user_settings (user_id, image_model) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET image_model = excluded.image_model`,
    [userId, model]
  );
  saveDatabase();
}

export interface DigestSettings {
  enabled: boolean;
  time: string;
  topics: string[];
  lastSent: string | null;
}

export function getDigestSettings(userId: number): DigestSettings {
  const stmt = db.prepare(
    `SELECT digest_enabled, digest_time, digest_topics, digest_last_sent FROM user_settings WHERE user_id = ?`
  );
  stmt.bind([userId]);

  if (stmt.step()) {
    const row = stmt.getAsObject() as {
      digest_enabled: number;
      digest_time: string;
      digest_topics: string;
      digest_last_sent: string | null;
    };
    stmt.free();
    return {
      enabled: row.digest_enabled === 1,
      time: row.digest_time,
      topics: JSON.parse(row.digest_topics),
      lastSent: row.digest_last_sent,
    };
  }
  stmt.free();
  return {
    enabled: false,
    time: DEFAULT_DIGEST_TIME,
    topics: [...DEFAULT_DIGEST_TOPICS],
    lastSent: null,
  };
}

export function setDigestTopics(userId: number, topics: string[]) {
  const json = JSON.stringify(topics);
  db.run(
    `INSERT INTO user_settings (user_id, digest_topics) VALUES (?, ?)
     ON CONFLICT(user_id) DO UPDATE SET digest_topics = excluded.digest_topics`,
    [userId, json]
  );
  saveDatabase();
}

export function setDigestTime(userId: number, time: string) {
  db.run(
    `INSERT INTO user_settings (user_id, digest_time) VALUES (?, ?)
     ON CONFLICT(user_id) DO UPDATE SET digest_time = excluded.digest_time`,
    [userId, time]
  );
  saveDatabase();
}

export function setDigestEnabled(userId: number, enabled: boolean) {
  db.run(
    `INSERT INTO user_settings (user_id, digest_enabled) VALUES (?, ?)
     ON CONFLICT(user_id) DO UPDATE SET digest_enabled = excluded.digest_enabled`,
    [userId, enabled ? 1 : 0]
  );
  saveDatabase();
}

export function setDigestLastSent(userId: number, date: string) {
  db.run(
    `INSERT INTO user_settings (user_id, digest_last_sent) VALUES (?, ?)
     ON CONFLICT(user_id) DO UPDATE SET digest_last_sent = excluded.digest_last_sent`,
    [userId, date]
  );
  saveDatabase();
}

export function getAllDigestEnabledUsers(): { userId: number; time: string; lastSent: string | null }[] {
  const stmt = db.prepare(
    `SELECT user_id, digest_time, digest_last_sent FROM user_settings WHERE digest_enabled = 1`
  );
  const users: { userId: number; time: string; lastSent: string | null }[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject() as {
      user_id: number;
      digest_time: string;
      digest_last_sent: string | null;
    };
    users.push({
      userId: row.user_id,
      time: row.digest_time,
      lastSent: row.digest_last_sent,
    });
  }
  stmt.free();
  return users;
}
