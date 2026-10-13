import { mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";

export type Db = BetterSQLite3Database<typeof schema>;

export interface DatabaseHandle {
  db: Db;
  sqlite: Database.Database;
  close: () => void;
}

/**
 * Open (and create if needed) the SQLite database with production-friendly pragmas.
 * better-sqlite3 is synchronous and single-connection, which is the right model
 * for SQLite: one writer, no connection pool, no async overhead.
 */
export function createDb(url: string): DatabaseHandle {
  if (url !== ":memory:") {
    mkdirSync(path.dirname(path.resolve(url)), { recursive: true });
  }

  const sqlite = new Database(url);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("synchronous = NORMAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");

  const db = drizzle({ client: sqlite, schema });

  return {
    db,
    sqlite,
    close: () => {
      sqlite.close();
    },
  };
}
