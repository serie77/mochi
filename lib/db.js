// postgres key/value backend for serverless hosting (vercel + neon). one table,
// jsonb values, and a single advisory lock standing in for the local file lock.
import pg from "pg";

let pool = null;
function pgPool() {
  if (!pool) {
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL || "") ? false : { rejectUnauthorized: false },
      max: 3,
      idleTimeoutMillis: 20_000,
    });
  }
  return pool;
}

let readyPromise = null;
function ready() {
  if (!readyPromise) {
    readyPromise = pgPool()
      .query("CREATE TABLE IF NOT EXISTS kv (name text PRIMARY KEY, value jsonb NOT NULL)")
      .catch((e) => {
        readyPromise = null;
        throw e;
      });
  }
  return readyPromise;
}

export async function dbGet(name, fallback) {
  await ready();
  const r = await pgPool().query("SELECT value FROM kv WHERE name = $1", [name]);
  return r.rows.length ? r.rows[0].value : fallback;
}

export async function dbSet(name, obj) {
  await ready();
  await pgPool().query(
    "INSERT INTO kv (name, value) VALUES ($1, $2) ON CONFLICT (name) DO UPDATE SET value = EXCLUDED.value",
    [name, JSON.stringify(obj)]
  );
}

// cross-instance mutex: a transaction-scoped advisory lock held for the duration of fn.
// fn's own reads/writes go through the pool; every writer takes this lock first, so
// read-modify-write sequences never interleave.
const LOCK_KEY = 46_115_215; // arbitrary, stable
export async function dbLock(fn) {
  await ready();
  const client = await pgPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)", [LOCK_KEY]);
    const out = await fn();
    await client.query("COMMIT");
    return out;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
