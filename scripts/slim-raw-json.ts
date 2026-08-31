import './load-env'
import { getSql } from '@/lib/evidence/db'
import { isSlimRawJson, slimRawJson } from '@/lib/evidence/persist'
import { Article } from '@/types'

// Rewrites articles.raw_json to the slim contract (see slimRawJson): body text
// lives ONLY in articles.body, so content/description and any other legacy
// keys are dropped. Idempotent: rows whose raw_json already matches the slim
// shape are left untouched.
//
// Optional retention lever, OFF by default: EVIDENCE_RAWJSON_NULL_AFTER_DAYS=N
// additionally nulls raw_json on articles published more than N days ago.
const BATCH_SIZE = 500

async function dbStats(): Promise<{ db: string; raw: string }> {
  const sql = getSql()
  const [row] = await sql`
    SELECT pg_size_pretty(pg_database_size(current_database())) AS db,
           pg_size_pretty(coalesce(sum(octet_length(raw_json::text)), 0)) AS raw
    FROM articles
  `
  return { db: row.db as string, raw: row.raw as string }
}

async function main() {
  const sql = getSql()
  const before = await dbStats()
  console.log(`before: db ${before.db}, raw_json bytes ${before.raw}`)

  let scanned = 0
  let updated = 0
  let lastId = ''
  for (;;) {
    const rows = await sql`
      SELECT id, raw_json FROM articles
      WHERE id > ${lastId} AND raw_json IS NOT NULL
      ORDER BY id
      LIMIT ${BATCH_SIZE}
    `
    if (rows.length === 0) break
    lastId = rows[rows.length - 1].id as string
    scanned += rows.length

    const changed = rows
      .filter((r) => !isSlimRawJson(r.raw_json as Record<string, unknown>))
      .map((r) => ({
        id: r.id as string,
        slim: JSON.stringify(slimRawJson(r.raw_json as Article)),
      }))
    if (changed.length === 0) continue

    await sql`
      UPDATE articles a
      SET raw_json = x.slim::jsonb
      FROM unnest(
        ${changed.map((r) => r.id)}::text[],
        ${changed.map((r) => r.slim)}::text[]
      ) AS x(id, slim)
      WHERE a.id = x.id
    `
    updated += changed.length
  }
  console.log(`slimmed ${updated} of ${scanned} rows`)

  const days = Number(process.env.EVIDENCE_RAWJSON_NULL_AFTER_DAYS)
  if (Number.isFinite(days) && days > 0) {
    let pruned = 0
    for (;;) {
      // Each pass nulls rows still matching the predicate, so the matching set
      // strictly shrinks and the loop terminates.
      const rows = await sql`
        UPDATE articles SET raw_json = NULL
        WHERE id IN (
          SELECT id FROM articles
          WHERE raw_json IS NOT NULL
            AND published_at < now() - make_interval(days => ${days})
          LIMIT ${BATCH_SIZE}
        )
        RETURNING id
      `
      pruned += rows.length
      if (rows.length < BATCH_SIZE) break
    }
    console.log(`pruned raw_json on ${pruned} articles published over ${days} days ago`)
  }

  // Optional, OFF by default: EVIDENCE_PRUNE_EXCESS_CHUNKS=true deletes
  // legacy chunks beyond the 2-per-article cap. Safe because chunking
  // constants are unchanged, so chunks 0 and 1 are byte-identical to what the
  // capped chunkText produces today; pruned embeddings are recomputable from
  // articles.body. This is where the real bytes are (embeddings + HNSW).
  if (process.env.EVIDENCE_PRUNE_EXCESS_CHUNKS === 'true') {
    let pruned = 0
    for (;;) {
      const rows = await sql`
        DELETE FROM article_chunks
        WHERE id IN (
          SELECT id FROM article_chunks WHERE chunk_index >= 2 LIMIT ${BATCH_SIZE}
        )
        RETURNING id
      `
      pruned += rows.length
      if (rows.length < BATCH_SIZE) break
    }
    console.log(`pruned ${pruned} excess chunks (chunk_index >= 2)`)
    if (pruned > 0) {
      console.log('rebuilding HNSW index to release its pages…')
      await sql.query('REINDEX INDEX idx_chunks_vector')
    }
  }

  const after = await dbStats()
  console.log(`after: db ${after.db}, raw_json bytes ${after.raw}`)
  console.log('note: freed pages return via (auto)vacuum — logical bytes drop now, file size later')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
