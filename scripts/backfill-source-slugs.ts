import './load-env'
import { getSql } from '@/lib/evidence/db'
import { sourceSlug } from '@/lib/evidence/sourceSlug'

// Rewrites articles.source to the normalized slug, recomputed from raw_json
// (which preserves the original source name + URLs). Idempotent: rows whose
// source already equals the recomputed slug are left untouched.
const BATCH_SIZE = 500

async function main() {
  const sql = getSql()
  const [before] = await sql`
    SELECT count(DISTINCT source)::int AS sources, count(*)::int AS articles FROM articles
  `
  console.log(`before: ${before.articles} articles, ${before.sources} distinct sources`)

  let updated = 0
  let lastId = ''
  for (;;) {
    const rows = await sql`
      SELECT id, source,
        raw_json->'source'->>'name' AS name,
        raw_json->'source'->>'url'  AS source_url,
        raw_json->>'url'            AS article_url,
        url
      FROM articles
      WHERE id > ${lastId}
        -- raw_json-pruned rows (EVIDENCE_RAWJSON_NULL_AFTER_DAYS) lost their
        -- original source provenance; recomputing from the article URL alone
        -- would rewrite syndicated articles to the syndication host's slug.
        AND raw_json IS NOT NULL
      ORDER BY id
      LIMIT ${BATCH_SIZE}
    `
    if (rows.length === 0) break
    lastId = rows[rows.length - 1].id as string

    const changed = rows
      .map((r) => ({
        id: r.id as string,
        slug: sourceSlug((r.name as string | null) ?? (r.source as string), [
          r.source_url as string | null,
          r.article_url as string | null,
          r.url as string,
        ]),
        current: r.source as string,
      }))
      .filter((r) => r.slug !== r.current)
    if (changed.length === 0) continue

    await sql`
      UPDATE articles a
      SET source = x.slug
      FROM unnest(
        ${changed.map((r) => r.id)}::text[],
        ${changed.map((r) => r.slug)}::text[]
      ) AS x(id, slug)
      WHERE a.id = x.id
    `
    updated += changed.length
  }

  const [after] = await sql`
    SELECT count(DISTINCT source)::int AS sources FROM articles
  `
  console.log(`updated ${updated} rows — ${before.sources} distinct sources → ${after.sources} slugs`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
