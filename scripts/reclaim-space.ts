import './load-env'
import { neon } from '@neondatabase/serverless'

// Reclaims space in the evidence DB when Neon's project size limit is reached
// ("could not extend file because project size limit has been exceeded").
//
// Order matters on a FULL database: the vector index is DROPPED first, because
// REINDEX builds the replacement before releasing the original and therefore
// needs headroom that a full project does not have.
//
// THE DELETE IS PERMANENT under current code. Article rows, bodies, entities
// and stories are never touched, but the dropped chunks are NOT restored by
// re-running ingestion: backfillMissingChunks only revisits articles with ZERO
// chunks and every article keeps chunk 0, and chunkText caps output at
// MAX_CHUNKS_PER_ARTICLE anyway. The full text survives in articles.body, so
// rebuilding them would take a new script with a raised cap. What is lost is
// vector coverage of the tail of long articles — the point of the 2-chunk diet.
//
// Every step is idempotent (DROP/CREATE ... IF NOT EXISTS, resumable delete
// loop), so if the run dies partway, re-running it recovers cleanly. Between
// the drop and the rebuild there is no vector index; only scripts/verify-
// evidence.ts queries embeddings, and it degrades to a sequential scan.
//
//   pnpm db:reclaim            report only, no writes
//   pnpm db:reclaim --apply    reclaim (plain VACUUM; frees pages for reuse)
//   pnpm db:reclaim --apply --full   also VACUUM FULL to return pages to Neon

const BATCH_SIZE = 2000
// Neon free tier ceiling. The gate below compares against it rather than a
// hardcoded guess so the message stays true if the plan changes.
const PROJECT_LIMIT_BYTES = 512 * 1024 * 1024
const mb = (bytes: number) => `${Math.round(bytes / 1024 / 1024)} MB`

const VECTOR_INDEX = 'idx_chunks_vector'
// Must match MAX_CHUNKS_PER_ARTICLE in src/lib/evidence/persist.ts
const KEEP_CHUNKS_PER_ARTICLE = 2

// Non-pooling URL for the DDL and the long index build, matching
// scripts/db-migrate.ts (DDL over the pooler can hit statement limits).
function getSql() {
  const url =
    process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL || process.env.POSTGRES_URL
  if (!url) throw new Error('DATABASE_URL is not set')
  return neon(url)
}

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
  const full = process.argv.includes('--full')
  const skipIndex = process.argv.includes('--no-index')
  const sql = getSql()
  await report('before')

  if (!apply) {
    console.log('\ndry run — pass --apply to reclaim. Planned steps:')
    console.log(`  1. DROP INDEX ${VECTOR_INDEX} (frees its pages immediately)`)
    console.log(`  2. DELETE article_chunks WHERE chunk_index >= ${KEEP_CHUNKS_PER_ARTICLE}`)
    console.log(
      `  3. ${full ? 'VACUUM (FULL, ANALYZE)' : 'VACUUM (ANALYZE)'} article_chunks` +
        (full
          ? ' (rewrites the table, returning pages to Neon)'
          : ' (frees pages for reuse; the reported size will barely move)')
    )
    console.log(`  4. CREATE INDEX ${VECTOR_INDEX} on the reduced set`)
    console.log('\nDeleted chunks are NOT recoverable by re-running ingestion — see the header.')
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

  // 3. Plain VACUUM by default: it only marks pages reusable, so the reported
  // size barely moves — kept and deleted rows are interleaved to the end of
  // the heap, leaving little to truncate. VACUUM FULL rewrites the table and
  // does return the pages, which is only safe AFTER the delete has freed
  // enough headroom for the copy (it needs roughly the size of the surviving
  // table).
  console.log(`vacuuming article_chunks${full ? ' (FULL)' : ''}…`)
  await sql.query(full ? 'VACUUM (FULL, ANALYZE) article_chunks' : 'VACUUM (ANALYZE) article_chunks')
  await report('after vacuum')

  // 4. Rebuild on the reduced set. This is one long HTTP request and the graph
  // no longer fits in maintenance_work_mem, so the build spills to disk and can
  // outlive the client's timeout. Failing here is recoverable — the data is
  // already reclaimed and the statement is idempotent — but the table is left
  // without a vector index until it succeeds, so say exactly how to finish.
  // An HNSW index stores the full vector, so rebuilding costs roughly
  // chunks x 384 x 4 bytes plus link overhead — around 140 MB at 80k chunks,
  // MORE than the ~97 MB the delete just freed. Rebuilding straight after a
  // reclaim can therefore leave the database LARGER than before, or fail
  // mid-build against the project limit and leave the operator believing they
  // bought headroom they did not. Skip it unless the space is demonstrably
  // there, and say so either way.
  const [{ chunks: remaining, free_bytes: freeBytes }] = (await sql`
    SELECT (SELECT count(*) FROM article_chunks)::int AS chunks,
           (${PROJECT_LIMIT_BYTES}::bigint - pg_database_size(current_database())) AS free_bytes
  `) as unknown as { chunks: number; free_bytes: string }[]
  const estimatedIndexBytes = remaining * (384 * 4 + 128)
  const free = Number(freeBytes)
  if (skipIndex) {
    console.log(`skipping ${VECTOR_INDEX} rebuild (--no-index).`)
    console.log(`  Semantic search degrades to a sequential scan until it is rebuilt.`)
    await report('after')
    return
  }
  if (free < estimatedIndexBytes * 1.2) {
    console.log(`\n⚠️ NOT rebuilding ${VECTOR_INDEX}: it needs about ${mb(estimatedIndexBytes)},`)
    console.log(`   and only ${mb(free)} is free. Rebuilding now would re-fill the space you`)
    console.log(`   just reclaimed, or fail part-way through.`)
    console.log(`   Semantic search degrades to a sequential scan until it is rebuilt.`)
    console.log(`   Rebuild later, once there is headroom, with:`)
    console.log(`     pnpm db:reclaim --rebuild-index-only`)
    await report('after')
    return
  }
  console.log(`rebuilding ${VECTOR_INDEX} (may take several minutes)…`)
  const createIndex = `CREATE INDEX IF NOT EXISTS ${VECTOR_INDEX} ON article_chunks USING hnsw (embedding vector_cosine_ops)`
  try {
    await sql.query(createIndex)
  } catch (error) {
    console.error(`\n✗ Index rebuild failed: ${(error as Error).message}`)
    console.error('The space HAS been reclaimed; only the vector index is missing.')
    console.error('Finish it by re-running this script, or directly over psql:')
    console.error(`  psql "$POSTGRES_URL_NON_POOLING" -c "${createIndex}"`)
    process.exitCode = 1
    return
  }
  await report('after')
  console.log(
    full
      ? '\nIngestion should resume now.'
      : '\nIngestion should resume now. The reported size stays high because a plain ' +
          'VACUUM frees pages for reuse rather than returning them — re-run with --full ' +
          'to shrink the file itself, now that the delete has made room for the rewrite.'
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
