import './load-env'
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { neon } from '@neondatabase/serverless'

async function main() {
  // Non-pooling URL: DDL over the pooler can hit statement limits
  const url =
    process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL || process.env.POSTGRES_URL
  if (!url) throw new Error('DATABASE_URL is not set')
  const sql = neon(url)

  await sql`CREATE TABLE IF NOT EXISTS _migrations (
    name TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`
  const applied = new Set(
    (await sql`SELECT name FROM _migrations`).map((r) => r.name as string)
  )

  const dir = join(process.cwd(), 'db', 'migrations')
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`skip  ${file}`)
      continue
    }
    console.log(`apply ${file}`)
    const statements = readFileSync(join(dir, file), 'utf8')
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n')
      .split(/;\s*\n/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
    for (const statement of statements) {
      await sql.query(statement)
    }
    await sql`INSERT INTO _migrations (name) VALUES (${file})`
  }
  console.log('migrations up to date')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
