import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const databaseUrl = process.env["DATABASE_URL"];
if (!databaseUrl) {
  throw new Error("DATABASE_URL must be set to a direct or pooled Postgres connection string.");
}

const migrationName = "0003_security_hardening.sql";
const migrationPath = fileURLToPath(
  new URL(`../drizzle/migrations/${migrationName}`, import.meta.url),
);
const migrationSql = await readFile(migrationPath, "utf8");
const sql = postgres(databaseUrl, { ssl: "require", max: 1 });

try {
  await sql.begin(async (transaction) => {
    await transaction.unsafe(`
      create table if not exists public.bluxtrade_schema_migrations (
        name text primary key,
        applied_at timestamptz not null default now()
      )
    `);

    const applied = await transaction`
      select 1 from public.bluxtrade_schema_migrations where name = ${migrationName}
    `;
    if (applied.length > 0) {
      console.log(`${migrationName} already applied`);
      return;
    }

    await transaction.unsafe(migrationSql);
    await transaction`
      insert into public.bluxtrade_schema_migrations (name) values (${migrationName})
    `;
    console.log(`${migrationName} applied`);
  });
} finally {
  await sql.end({ timeout: 5 });
}
