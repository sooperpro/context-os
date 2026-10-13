import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { createDb } from "./index.js";
import { runMigrations } from "./migrate.js";
import { sourceObjects, workspaces } from "./schema.js";

it("upgrades a legacy V0 database without dropping content and applies migrations idempotently", () => {
  const database = createDb(":memory:");
  const folder = fileURLToPath(new URL("../../drizzle", import.meta.url));
  try {
    const journal = JSON.parse(readFileSync(`${folder}/meta/_journal.json`, "utf8")) as {
      entries: Array<{ when: number; tag: string }>;
    };
    database.sqlite.exec(
      "CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY, hash TEXT NOT NULL, created_at NUMERIC)",
    );
    for (const migration of journal.entries.slice(0, 2)) {
      const sql = readFileSync(`${folder}/${migration.tag}.sql`, "utf8");
      database.sqlite.exec(sql);
      database.sqlite
        .prepare("INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)")
        .run(createHash("sha256").update(sql).digest("hex"), migration.when);
    }
    database.sqlite
      .prepare("INSERT INTO workspaces (id, name, created_at) VALUES (?, ?, ?)")
      .run("legacy-workspace", "Legacy", 1);
    database.sqlite
      .prepare(
        "INSERT INTO projects (id, workspace_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run("legacy-project", "legacy-workspace", "Legacy project", 1, 1);
    database.sqlite
      .prepare(
        "INSERT INTO source_objects (id, project_id, connector, kind, title, content, content_hash, ingested_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        "legacy-source",
        "legacy-project",
        "manual",
        "document",
        "Legacy source",
        "Retained private content",
        "legacy-hash",
        1,
      );
    runMigrations(database.db, folder);
    runMigrations(database.db, folder);
    expect(database.db.select().from(sourceObjects).get()).toMatchObject({
      id: "legacy-source",
      content: "Retained private content",
      visibility: "restricted",
    });
    expect(database.db.select().from(workspaces).get()).toMatchObject({
      id: "legacy-workspace",
      version: 1,
      region: "us-east-1",
      settings: {},
    });
    expect(
      database.sqlite.prepare("SELECT COUNT(*) AS total FROM __drizzle_migrations").get(),
    ).toEqual({ total: journal.entries.length });
    expect(
      database.sqlite
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'trigger' AND name = 'audit_log_no_delete'",
        )
        .get(),
    ).toBeDefined();
  } finally {
    database.close();
  }
});
