#!/usr/bin/env node
// DEV-2: applies the SQL files in db/migrations in order, once each, and writes down what it
// applied. Replaces pasting files into the Neon SQL editor by hand, which is how 0005 and 0006
// ended up with a "run this one before the deploy and that one after" note nobody can verify.
//
//   npm run db:migrate -- --status     what is applied and what is pending (reads nothing else)
//   npm run db:migrate                 apply every pending file, oldest first
//   npm run db:migrate -- --baseline   record pending files as applied WITHOUT running them,
//                                      for a database that already has them (one-time adoption)
//
// The connection comes from DATABASE_URL, or --url=... . Each file manages its own transaction
// (they all BEGIN/COMMIT), so a failure leaves that file unrecorded and the run stops there.

import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { Client } = require("pg");

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "db", "migrations");

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name) => args.find((arg) => arg.startsWith(`--${name}=`))?.split("=").slice(1).join("=");

const connectionString = value("url") ?? process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Set DATABASE_URL (or pass --url=postgresql://…).");
  process.exit(1);
}
if (/neon\.tech|amazonaws|supabase/.test(connectionString) && !flag("yes") && !process.env.CI) {
  console.log(`This looks like a hosted database: ${connectionString.replace(/:[^:@/]+@/, ":***@")}`);
  console.log("Re-run with --yes once you are sure it is the right one.");
  process.exit(1);
}

const files = readdirSync(dir).filter((name) => name.endsWith(".sql")).sort();
const checksum = (text) => createHash("sha256").update(text).digest("hex").slice(0, 16);

const client = new Client({ connectionString, ssl: /sslmode=require/.test(connectionString) ? { rejectUnauthorized: true } : undefined });
try {
  await client.connect();
} catch (error) {
  console.error(`Could not connect: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}

try {
  await client.query(`
    create table if not exists "schema_migrations" (
      "filename" text primary key,
      "checksum" text not null,
      "applied_at" timestamp with time zone not null default now()
    )
  `);

  const { rows } = await client.query(`select filename, checksum from "schema_migrations"`);
  const applied = new Map(rows.map((row) => [row.filename, row.checksum]));
  const pending = files.filter((name) => !applied.has(name));

  for (const name of files) {
    const current = checksum(readFileSync(join(dir, name), "utf8"));
    const recorded = applied.get(name);
    if (recorded && recorded !== current) {
      console.warn(`! ${name} changed after it was applied (recorded ${recorded}, file ${current}).`);
    }
  }

  if (flag("status")) {
    for (const name of files) console.log(`${applied.has(name) ? "applied " : "PENDING "} ${name}`);
    console.log(`\n${applied.size} applied, ${pending.length} pending.`);
  } else if (!pending.length) {
    console.log("Nothing to do: every migration is already applied.");
  } else if (flag("baseline")) {
    for (const name of pending) {
      await client.query(`insert into "schema_migrations" (filename, checksum) values ($1, $2)`, [
        name,
        checksum(readFileSync(join(dir, name), "utf8")),
      ]);
      console.log(`recorded (not run)  ${name}`);
    }
    console.log(`\n${pending.length} file(s) recorded as already applied.`);
  } else {
    for (const name of pending) {
      const sql = readFileSync(join(dir, name), "utf8");
      process.stdout.write(`applying ${name} … `);
      await client.query(sql);
      await client.query(`insert into "schema_migrations" (filename, checksum) values ($1, $2)`, [name, checksum(sql)]);
      console.log("ok");
    }
    console.log(`\n${pending.length} migration(s) applied.`);
  }
} finally {
  await client.end();
}
