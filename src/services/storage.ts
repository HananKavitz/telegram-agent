import initSqlJs from "sql.js";
import type { Database as SqlJsDatabase } from "sql.js";
import path from "path";
import fs from "fs";
import { config, MAX_CONTEXT_PAIRS } from "../config.js";

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
      image_model TEXT NOT NULL DEFAULT 'flux-1-schnell'
    )
  `);

  const hasImageCol = db.exec(`PRAGMA table_info(user_settings)`)
    .some(row => row.values.some(v => String(v) === "image_model"));
  if (!hasImageCol) {
    db.run(`ALTER TABLE user_settings ADD COLUMN image_model TEXT NOT NULL DEFAULT 'flux-1-schnell'`);
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

  let model = "flux-1-schnell";
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
