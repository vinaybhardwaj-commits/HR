import { neon } from '@neondatabase/serverless';

let _sql: ReturnType<typeof neon> | null = null;

/** Lazy Neon HTTP client (never a pool). Throws only at call time if env missing. */
export function sql() {
  if (!_sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    _sql = neon(url);
  }
  return _sql;
}
