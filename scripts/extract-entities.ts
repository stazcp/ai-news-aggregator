import './load-env'
import { getSql } from '@/lib/evidence/db'
import { extractEntities } from '@/lib/evidence/entities'
import { ENTITY_DICTIONARY } from '@/lib/evidence/entityDictionary'

// Zero-cost entity extraction (dictionary + rules, no LLM calls). Idempotent
// and resumable: every processed article — including ones with zero entity
// matches — is stamped with entities_extracted_at, so each batch strictly
// shrinks the `IS NULL` set and the loop always terminates.

const BATCH_SIZE = 500

async function seedEntities(): Promise<void> {
  const sql = getSql()
  await sql`
    INSERT INTO entities (id, name, type, metadata)
    SELECT i, n, t, m::jsonb
    FROM unnest(
      ${ENTITY_DICTIONARY.map((e) => e.id)}::text[],
      ${ENTITY_DICTIONARY.map((e) => e.name)}::text[],
      ${ENTITY_DICTIONARY.map((e) => e.type)}::text[],
      ${ENTITY_DICTIONARY.map((e) => JSON.stringify({ aliases: e.aliases }))}::text[]
    ) AS x(i, n, t, m)
    ON CONFLICT (id) DO UPDATE
      SET name = EXCLUDED.name, type = EXCLUDED.type, metadata = EXCLUDED.metadata
  `
  console.log(`seeded ${ENTITY_DICTIONARY.length} dictionary entities`)
}

async function extractBatches(): Promise<{ processed: number; links: number }> {
  const sql = getSql()
  let processed = 0
  let links = 0
  for (;;) {
    const articles = await sql`
      SELECT id, title, body FROM articles
      WHERE entities_extracted_at IS NULL
      LIMIT ${BATCH_SIZE}
    `
    if (articles.length === 0) return { processed, links }

    const rows: { articleId: string; entityId: string; salience: number }[] = []
    for (const article of articles) {
      for (const mention of extractEntities(article.title as string, article.body as string)) {
        rows.push({ articleId: article.id as string, ...mention })
      }
    }
    if (rows.length > 0) {
      await sql`
        INSERT INTO article_entities (article_id, entity_id, salience)
        SELECT a, e, s
        FROM unnest(
          ${rows.map((r) => r.articleId)}::text[],
          ${rows.map((r) => r.entityId)}::text[],
          ${rows.map((r) => r.salience)}::real[]
        ) AS x(a, e, s)
        ON CONFLICT DO NOTHING
      `
    }
    // Stamp the WHOLE batch (zero-entity articles included) — termination guarantee.
    await sql`
      UPDATE articles SET entities_extracted_at = now()
      WHERE id = ANY(${articles.map((a) => a.id as string)})
    `
    processed += articles.length
    links += rows.length
    console.log(`processed ${processed} articles, ${links} entity links so far…`)
  }
}

async function logTopEntities(): Promise<void> {
  const sql = getSql()
  const top = await sql`
    SELECT e.id, e.name, count(*)::int AS article_count
    FROM article_entities ae
    JOIN entities e ON e.id = ae.entity_id
    GROUP BY e.id, e.name
    ORDER BY article_count DESC, e.id
    LIMIT 10
  `
  console.log('top entities by article count:')
  for (const row of top) {
    console.log(`  ${String(row.article_count).padStart(5)}  ${row.name} (${row.id})`)
  }
}

async function main() {
  const started = Date.now()
  await seedEntities()
  const { processed, links } = await extractBatches()
  const seconds = Math.round((Date.now() - started) / 1000)
  console.log(`done in ${seconds}s — processed ${processed} articles, wrote ${links} entity links`)
  await logTopEntities()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
