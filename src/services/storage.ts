import { createClient } from "@libsql/client";
import type { Client } from "@libsql/client";
import { config, MAX_CONTEXT_PAIRS, DEFAULT_DIGEST_TOPICS, DEFAULT_DIGEST_TIME } from "../config.js";
import fs from "fs";
import path from "path";

let turso: Client;

export async function initDatabase(): Promise<void> {
  const isFileDb = config.tursoUrl.startsWith("file:");
  if (isFileDb) {
    const dbPath = config.tursoUrl.replace("file:", "");
    const dir = path.dirname(dbPath);
    fs.mkdirSync(dir, { recursive: true });
  }

  turso = createClient({
    url: config.tursoUrl,
    authToken: config.tursoAuthToken || undefined,
  });

  await turso.execute({
    sql: `
      CREATE TABLE IF NOT EXISTS conversations (
        user_id INTEGER NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system', 'tool')),
        content TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `,
    args: [],
  });

  await turso.execute({
    sql: `
      CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id, created_at)
    `,
    args: [],
  });

  await turso.execute({
    sql: `
      CREATE TABLE IF NOT EXISTS user_settings (
        user_id INTEGER PRIMARY KEY,
        selected_model TEXT NOT NULL DEFAULT '${config.defaultModel}',
        image_model TEXT NOT NULL DEFAULT 'flux.2-klein-4b'
      )
    `,
    args: [],
  });

  try {
    await turso.execute({
      sql: `ALTER TABLE user_settings ADD COLUMN image_model TEXT NOT NULL DEFAULT 'flux.2-klein-4b'`,
      args: [],
    });
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
      await turso.execute({ sql: `ALTER TABLE user_settings ADD COLUMN ${col}`, args: [] });
    } catch {
      // column already exists
    }
  }
}

export async function getMessages(userId: number) {
  const limit = MAX_CONTEXT_PAIRS * 2;
  const result = await turso.execute({
    sql: `SELECT role, content FROM conversations WHERE user_id = ? ORDER BY created_at ASC LIMIT ?`,
    args: [userId, limit],
  });
  return result.rows as unknown as { role: string; content: string }[];
}

export async function addMessage(userId: number, role: string, content: string) {
  await turso.execute({
    sql: `INSERT INTO conversations (user_id, role, content) VALUES (?, ?, ?)`,
    args: [userId, role, content],
  });
}

export async function clearMessages(userId: number) {
  await turso.execute({
    sql: `DELETE FROM conversations WHERE user_id = ?`,
    args: [userId],
  });
}

export async function getSelectedModel(userId: number): Promise<string> {
  const result = await turso.execute({
    sql: `SELECT selected_model FROM user_settings WHERE user_id = ?`,
    args: [userId],
  });
  if (result.rows.length > 0) {
    return (result.rows[0] as unknown as { selected_model: string }).selected_model;
  }
  return config.defaultModel;
}

export async function setSelectedModel(userId: number, model: string) {
  await turso.execute({
    sql: `INSERT INTO user_settings (user_id, selected_model) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET selected_model = excluded.selected_model`,
    args: [userId, model],
  });
}

export async function getSelectedImageModel(userId: number): Promise<string> {
  const result = await turso.execute({
    sql: `SELECT image_model FROM user_settings WHERE user_id = ?`,
    args: [userId],
  });
  if (result.rows.length > 0) {
    return (result.rows[0] as unknown as { image_model: string }).image_model;
  }
  return "flux.2-klein-4b";
}

export async function setSelectedImageModel(userId: number, model: string) {
  await turso.execute({
    sql: `INSERT INTO user_settings (user_id, image_model) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET image_model = excluded.image_model`,
    args: [userId, model],
  });
}

export interface DigestSettings {
  enabled: boolean;
  time: string;
  topics: string[];
  lastSent: string | null;
}

export async function getDigestSettings(userId: number): Promise<DigestSettings> {
  const result = await turso.execute({
    sql: `SELECT digest_enabled, digest_time, digest_topics, digest_last_sent FROM user_settings WHERE user_id = ?`,
    args: [userId],
  });

  if (result.rows.length > 0) {
    const row = result.rows[0] as unknown as {
      digest_enabled: number;
      digest_time: string;
      digest_topics: string;
      digest_last_sent: string | null;
    };
    return {
      enabled: row.digest_enabled === 1,
      time: row.digest_time,
      topics: JSON.parse(row.digest_topics),
      lastSent: row.digest_last_sent,
    };
  }

  return {
    enabled: false,
    time: DEFAULT_DIGEST_TIME,
    topics: [...DEFAULT_DIGEST_TOPICS],
    lastSent: null,
  };
}

export async function setDigestTopics(userId: number, topics: string[]) {
  const json = JSON.stringify(topics);
  await turso.execute({
    sql: `INSERT INTO user_settings (user_id, digest_topics) VALUES (?, ?)
     ON CONFLICT(user_id) DO UPDATE SET digest_topics = excluded.digest_topics`,
    args: [userId, json],
  });
}

export async function setDigestTime(userId: number, time: string) {
  await turso.execute({
    sql: `INSERT INTO user_settings (user_id, digest_time) VALUES (?, ?)
     ON CONFLICT(user_id) DO UPDATE SET digest_time = excluded.digest_time`,
    args: [userId, time],
  });
}

export async function setDigestEnabled(userId: number, enabled: boolean) {
  await turso.execute({
    sql: `INSERT INTO user_settings (user_id, digest_enabled) VALUES (?, ?)
     ON CONFLICT(user_id) DO UPDATE SET digest_enabled = excluded.digest_enabled`,
    args: [userId, enabled ? 1 : 0],
  });
}

export async function setDigestLastSent(userId: number, date: string) {
  await turso.execute({
    sql: `INSERT INTO user_settings (user_id, digest_last_sent) VALUES (?, ?)
     ON CONFLICT(user_id) DO UPDATE SET digest_last_sent = excluded.digest_last_sent`,
    args: [userId, date],
  });
}

export async function getTotalMessageCount(): Promise<number> {
  const result = await turso.execute({ sql: `SELECT COUNT(*) as cnt FROM conversations`, args: [] });
  const row = result.rows[0] as unknown as { cnt: number };
  return row.cnt;
}

export async function getDatabaseUrl(): Promise<string> {
  return config.tursoUrl;
}

export async function getAllDigestEnabledUsers(): Promise<{ userId: number; time: string; lastSent: string | null }[]> {
  const result = await turso.execute({
    sql: `SELECT user_id, digest_time, digest_last_sent FROM user_settings WHERE digest_enabled = 1`,
    args: [],
  });
  return result.rows.map((row) => {
    const r = row as unknown as { user_id: number; digest_time: string; digest_last_sent: string | null };
    return {
      userId: r.user_id,
      time: r.digest_time,
      lastSent: r.digest_last_sent,
    };
  });
}
