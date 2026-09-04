import './load-env'
import { getSql } from '@/lib/evidence/db'

// Reclaims space in the evidence DB when Neon's project size limit is reached
// ("could not extend file because project size limit has been exceeded").
//
// Order matters on a FULL database: the vector index is DROPPED first, because
// REINDEX builds the replacement before releasing the original and therefore
// needs headroom that a full project does not have. Only chunks beyond the
// per-article cap are deleted; article rows, bodies, entities, and stories are
// never touched, and the deleted embeddings are recomputable from articles.body
// via `pnpm ingest:evidence` (backfillMissingChunks).
//
//   pnpm db:reclaim            report only, no writes
//   pnpm db:reclaim --apply    perform the reclamation

const BATCH_SIZE = 2000
const VECTOR_INDEX = 'idx_chunks_vector'
// Must match MAX_CHUNKS_PER_ARTICLE in src/lib/evidence/persist.ts
const KEEP_CHUNKS_PER_ARTICLE = 2

async function report(label: string): Promise<void> {
  const sql = getSql()
  const [row] = await sql`
    SELECT pg_size_pretty(pg_database_size(current_database())) AS db,
           (SELECT count(*)::int FROM article_chunks) AS chunks,
           (SELECT count(*)::int FROM article_chunks WHERE chunk_index >= ${KEEP_CHUNKS_PER_ARTICLE}) AS excess,
           (SELECT count(*)::int FROM articles) AS articles
  `
  console.log(
    `${label}: db ${row.db}, ${row.articles} articles, ${row.chunks} chunks ` +
      `(${row.excess} beyond the ${KEEP_CHUNKS_PER_ARTICLE}-chunk cap)`
  )
}

async function main() {
  const apply = process.argv.includes('--apply')
  const sql = getSql()
  await report('before')

  if (!apply) {
    console.log('\ndry run — pass --apply to reclaim. Planned steps:')
    console.log(`  1. DROP INDEX ${VECTOR_INDEX} (frees its pages immediately)`)
    console.log(`  2. DELETE article_chunks WHERE chunk_index >= ${KEEP_CHUNKS_PER_ARTICLE}`)
    console.log('  3. VACUUM article_chunks (makes the freed pages reusable)')
    console.log(`  4. CREATE INDEX ${VECTOR_INDEX} on the reduced set`)
    return
  }

  // 1. Dropping first is what makes this work at 100% capacity; it also means
  // the rebuild in step 4 covers only the rows we keep.
  console.log(`dropping ${VECTOR_INDEX}…`)
  await sql.query(`DROP INDEX IF EXISTS ${VECTOR_INDEX}`)
  await report('after index drop')

  // 2. Batched so each statement stays small; deletes are idempotent.
  let deleted = 0
  for (;;) {
    const rows = await sql`
      DELETE FROM article_chunks
      WHERE id IN (
        SELECT id FROM article_chunks
        WHERE chunk_index >= ${KEEP_CHUNKS_PER_ARTICLE}
        LIMIT ${BATCH_SIZE}
      )
      RETURNING id
    `
    deleted += rows.length
    if (rows.length > 0) console.log(`  deleted ${deleted} excess chunks…`)
    if (rows.length < BATCH_SIZE) break
  }
  console.log(`deleted ${deleted} excess chunks`)

  // 3. Plain VACUUM (not FULL): FULL rewrites the table and would need as much
  // free space as the table itself — exactly what a full project lacks.
  console.log('vacuuming article_chunks…')
  await sql.query('VACUUM (ANALYZE) article_chunks')
  await report('after vacuum')

  // 4. Rebuild on the reduced set.
  console.log(`rebuilding ${VECTOR_INDEX}…`)
  await sql.query(
    `CREATE INDEX IF NOT EXISTS ${VECTOR_INDEX} ON article_chunks USING hnsw (embedding vector_cosine_ops)`
  )
  await report('after')
  console.log('\nNote: Neon reports reclaimed space with a delay; ingestion should resume now.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
