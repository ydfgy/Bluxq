import { readdir, readFile } from "node:fs/promises";
import dns from "node:dns";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import postgres from "postgres";

dns.setDefaultResultOrder("ipv4first");

const databaseUrl = process.env["DATABASE_URL"];
if (!databaseUrl) {
  throw new Error("DATABASE_URL must be set to a direct or pooled Postgres connection string.");
}

const migrationsDir = fileURLToPath(new URL("../drizzle/migrations/", import.meta.url));
const migrationFiles = (await readdir(migrationsDir))
  .filter((name) => /^\d+_.+\.sql$/.test(name))
  .sort();
const sql = postgres(databaseUrl, { ssl: "require", max: 1 });

function withoutOuterTransaction(source) {
  return source.replace(/^\s*begin\s*;\s*/i, "").replace(/\s*commit\s*;\s*$/i, "");
}

try {
  await sql`
    create table if not exists public.bluxtrade_schema_migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    )
  `;

  for (const migrationName of migrationFiles) {
    const applied = await sql`
      select 1
      from public.bluxtrade_schema_migrations
      where name = ${migrationName}
      limit 1
    `;
    if (applied.length > 0) {
      console.log(`${migrationName} already applied`);
      continue;
    }

    // Versions before the tracking table may already exist in a deployed
    // database. Treat the base schema as a baseline instead of rerunning its
    // non-idempotent CREATE TYPE/CREATE TABLE statements.
    if (migrationName === "0000_migration.sql") {
      const [base] = await sql`
        select to_regclass('public.user_roles') as table_name
      `;
      if (base?.table_name) {
        await sql`
          insert into public.bluxtrade_schema_migrations (name)
          values (${migrationName})
        `;
        console.log(`${migrationName} recorded as existing baseline`);
        continue;
      }
    }

    const migrationPath = join(migrationsDir, migrationName);
    const migrationSql = withoutOuterTransaction(await readFile(migrationPath, "utf8"));
    await sql.begin(async (transaction) => {
      await transaction.unsafe(migrationSql);
      await transaction`
        insert into public.bluxtrade_schema_migrations (name)
        values (${migrationName})
      `;
    });
    console.log(`${migrationName} applied`);
  }
} finally {
  await sql.end({ timeout: 5 });
}
