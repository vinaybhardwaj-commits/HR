import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { sql } from '@/lib/db';
import { logAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/** Split SQL into statements: strips -- comment lines, respects single-quoted strings ('' escape). */
function splitSql(body: string): string[] {
  const noComments = body
    .split('\n')
    .filter(line => !line.trimStart().startsWith('--'))
    .join('\n');
  const out: string[] = [];
  let cur = '', inQuote = false;
  for (let i = 0; i < noComments.length; i++) {
    const ch = noComments[i];
    if (inQuote) {
      cur += ch;
      if (ch === "'") {
        if (noComments[i + 1] === "'") { cur += "'"; i++; }
        else inQuote = false;
      }
    } else if (ch === "'") {
      cur += ch; inQuote = true;
    } else if (ch === ';') {
      if (cur.trim()) out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Migration runner. Auth: Bearer MIGRATION_SECRET. Applies pending migrations/NNNN_*.sql in order. */
export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? '';
  const secret = process.env.MIGRATION_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const db = sql();
  await db`CREATE TABLE IF NOT EXISTS _migrations (
    name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`;

  const dir = path.join(process.cwd(), 'migrations');
  const files = (await fs.readdir(dir)).filter(f => f.endsWith('.sql')).sort();
  const done = new Set(((await db`SELECT name FROM _migrations`) as { name: string }[]).map(r => r.name));

  const applied: string[] = [];
  for (const f of files) {
    if (done.has(f)) continue;
    const body = await fs.readFile(path.join(dir, f), 'utf8');
    const statements = splitSql(body);
    try {
      for (const st of statements) {
        await (db as unknown as { query: (q: string) => Promise<unknown> }).query(st);
      }
      await db`INSERT INTO _migrations (name) VALUES (${f})`;
      applied.push(f);
    } catch (e) {
      return NextResponse.json(
        { applied, errored: f, message: e instanceof Error ? e.message : 'unknown' },
        { status: 500 }
      );
    }
  }
  await logAudit({ actorType: 'system', action: 'migrate', meta: { applied } });
  return NextResponse.json({ applied, errored: null, total: files.length });
}
