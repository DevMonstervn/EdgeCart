import { DatabaseSync } from 'node:sqlite';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Env } from '../../src/types/env.js';

export class MockD1PreparedStatement {
  private boundValues: any[] = [];

  constructor(private sqlite: DatabaseSync, private query: string) {}

  bind(...values: any[]) {
    this.boundValues = values;
    return this;
  }

  first<T = unknown>(): T | null {
    const stmt = this.sqlite.prepare(this.query);
    const result = stmt.get(...this.boundValues);
    return (result as T) || null;
  }

  all<T = unknown>(): { results: T[] } {
    const stmt = this.sqlite.prepare(this.query);
    const results = stmt.all(...this.boundValues) as T[];
    return { results };
  }

  run(): { success: boolean; meta: { changes: number; last_row_id: number } } {
    const stmt = this.sqlite.prepare(this.query);
    const res = stmt.run(...this.boundValues);
    return {
      success: true,
      meta: {
        changes: Number(res.changes),
        last_row_id: Number(res.lastInsertRowid),
      },
    };
  }
}

export class MockD1Database {
  private sqlite: DatabaseSync;

  constructor() {
    this.sqlite = new DatabaseSync(':memory:');
    this.sqlite.exec('PRAGMA foreign_keys = ON;');
  }

  prepare(query: string): MockD1PreparedStatement {
    return new MockD1PreparedStatement(this.sqlite, query);
  }

  async batch(statements: MockD1PreparedStatement[]): Promise<any[]> {
    this.sqlite.exec('BEGIN TRANSACTION;');
    try {
      const results: any[] = [];
      for (const stmt of statements) {
        // execute run
        const res = stmt.run();
        results.push(res);
      }
      this.sqlite.exec('COMMIT;');
      return results;
    } catch (err) {
      this.sqlite.exec('ROLLBACK;');
      throw err;
    }
  }

  exec(sql: string) {
    this.sqlite.exec(sql);
  }
}

export class MockKVNamespace {
  private store = new Map<string, { value: string; expiresAt?: number }>();

  async get(key: string, type: 'text' | 'json' = 'text'): Promise<any> {
    const item = this.store.get(key);
    if (!item) return null;
    if (item.expiresAt && Date.now() > item.expiresAt) {
      this.store.delete(key);
      return null;
    }
    if (type === 'json') {
      try {
        return JSON.parse(item.value);
      } catch {
        return null;
      }
    }
    return item.value;
  }

  async put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void> {
    const expiresAt = options?.expirationTtl ? Date.now() + options.expirationTtl * 1000 : undefined;
    this.store.set(key, { value, expiresAt });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async list(options?: { prefix?: string }): Promise<{ keys: Array<{ name: string }> }> {
    const now = Date.now();
    const keys: Array<{ name: string }> = [];
    for (const [key, item] of this.store.entries()) {
      if (item.expiresAt && now > item.expiresAt) {
        this.store.delete(key);
        continue;
      }
      if (!options?.prefix || key.startsWith(options.prefix)) {
        keys.push({ name: key });
      }
    }
    return { keys };
  }
}

export function createTestEnv(): Env {
  const d1 = new MockD1Database();

  // Run initial schema migration
  const migrationPath = path.resolve(__dirname, '../../migrations/0001_initial_schema.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');
  d1.exec(sql);

  const kv = new MockKVNamespace();

  return {
    DB: d1 as unknown as D1Database,
    KV: kv as unknown as KVNamespace,
    R2: {} as unknown as R2Bucket,
    ENVIRONMENT: 'test',
    APP_URL: 'http://localhost:5173',
    JWT_SECRET: 'test-super-secret-jwt-key-for-test-suite',
  };
}
