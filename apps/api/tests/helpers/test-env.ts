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
  public listCallCount = 0;

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

  async list(options?: {
    prefix?: string;
    limit?: number;
    cursor?: string;
  }): Promise<
    | { keys: Array<{ name: string }>; list_complete: true; cacheStatus: null }
    | { keys: Array<{ name: string }>; list_complete: false; cursor: string; cacheStatus: null }
  > {
    this.listCallCount += 1;
    const now = Date.now();
    const matchedKeys: string[] = [];

    for (const [key, item] of this.store.entries()) {
      if (item.expiresAt && now > item.expiresAt) {
        this.store.delete(key);
        continue;
      }
      if (!options?.prefix || key.startsWith(options.prefix)) {
        matchedKeys.push(key);
      }
    }

    // Real Cloudflare KV returns keys in lexicographical UTF-8 order, max 1,000 per page
    matchedKeys.sort();
    const pageLimit = Math.min(Math.max(1, options?.limit ?? 1000), 1000);
    const startOffset = options?.cursor ? Math.max(0, Number(options.cursor) || 0) : 0;
    const slice = matchedKeys.slice(startOffset, startOffset + pageLimit);
    const nextOffset = startOffset + slice.length;

    if (nextOffset < matchedKeys.length) {
      return {
        keys: slice.map((name) => ({ name })),
        list_complete: false,
        cursor: String(nextOffset),
        cacheStatus: null,
      };
    }

    return {
      keys: slice.map((name) => ({ name })),
      list_complete: true,
      cacheStatus: null,
    };
  }
}

export interface StoredMockR2Object {
  key: string;
  bytes: Uint8Array;
  httpMetadata?: { contentType?: string; cacheControl?: string };
  customMetadata?: Record<string, string>;
  httpEtag: string;
  uploaded: Date;
}

export class MockR2Bucket {
  private objects = new Map<string, StoredMockR2Object>();
  public simulatePutError = false;
  public simulateGetError = false;

  async put(
    key: string,
    value: ArrayBuffer | ArrayBufferView | string | Blob,
    options?: {
      httpMetadata?: { contentType?: string; cacheControl?: string };
      customMetadata?: Record<string, string>;
    }
  ): Promise<StoredMockR2Object> {
    if (this.simulatePutError) {
      throw new Error('Simulated Cloudflare R2 storage write error');
    }

    let bytes: Uint8Array;
    if (typeof value === 'string') {
      bytes = new TextEncoder().encode(value);
    } else if (value instanceof ArrayBuffer) {
      bytes = new Uint8Array(value.slice(0));
    } else if (ArrayBuffer.isView(value)) {
      bytes = new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
    } else if (typeof Blob !== 'undefined' && value instanceof Blob) {
      bytes = new Uint8Array(await value.arrayBuffer());
    } else {
      bytes = new Uint8Array(0);
    }

    const stored: StoredMockR2Object = {
      key,
      bytes,
      httpMetadata: options?.httpMetadata,
      customMetadata: options?.customMetadata,
      httpEtag: `"mock-etag-${bytes.byteLength}-${Date.now()}"`,
      uploaded: new Date(),
    };
    this.objects.set(key, stored);
    return stored;
  }

  async get(key: string): Promise<{
    key: string;
    size: number;
    httpMetadata?: { contentType?: string; cacheControl?: string };
    customMetadata?: Record<string, string>;
    httpEtag: string;
    arrayBuffer: () => Promise<ArrayBuffer>;
    text: () => Promise<string>;
  } | null> {
    if (this.simulateGetError) {
      throw new Error('Simulated Cloudflare R2 storage read error');
    }

    const found = this.objects.get(key);
    if (!found) return null;

    return {
      key: found.key,
      size: found.bytes.byteLength,
      httpMetadata: found.httpMetadata,
      customMetadata: found.customMetadata,
      httpEtag: found.httpEtag,
      arrayBuffer: async () =>
        found.bytes.buffer.slice(found.bytes.byteOffset, found.bytes.byteOffset + found.bytes.byteLength) as ArrayBuffer,
      text: async () => new TextDecoder().decode(found.bytes),
    };
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }

  has(key: string): boolean {
    return this.objects.has(key);
  }
}

export function applyMigrationFile(d1: MockD1Database, fileName: string, implicitTransaction = true): void {
  const migrationPath = path.resolve(__dirname, '../../migrations', fileName);
  const sql = fs.readFileSync(migrationPath, 'utf8');
  if (implicitTransaction) {
    d1.exec('BEGIN TRANSACTION;');
    try {
      d1.exec(sql);
      d1.exec('COMMIT;');
    } catch (err) {
      d1.exec('ROLLBACK;');
      throw err;
    }
  } else {
    d1.exec(sql);
  }
}

export function createTestEnv(options?: { upToMigration?: string }): Env & {
  __rawD1: MockD1Database;
  __rawKV: MockKVNamespace;
  __rawR2: MockR2Bucket;
} {
  const d1 = new MockD1Database();

  const migrationsDir = path.resolve(__dirname, '../../migrations');
  const migrationFiles = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of migrationFiles) {
    applyMigrationFile(d1, file, true);
    if (options?.upToMigration && file === options.upToMigration) {
      break;
    }
  }

  const kv = new MockKVNamespace();
  const r2 = new MockR2Bucket();

  return {
    DB: d1 as unknown as D1Database,
    KV: kv as unknown as KVNamespace,
    R2: r2 as unknown as R2Bucket,
    ENVIRONMENT: 'test',
    APP_URL: 'http://localhost:5173',
    JWT_SECRET: 'test-super-secret-jwt-key-for-test-suite',
    __rawD1: d1,
    __rawKV: kv,
    __rawR2: r2,
  };
}
