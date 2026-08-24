import './load-env'
import { getSql } from '@/lib/evidence/db'
import { embedTexts } from '@/lib/evidence/embeddings'

async function main() {
  const sql = getSql()
  const [counts] = await sql`
    SELECT
      (SELECT count(*)::int FROM articles) AS articles,
      (SELECT count(*)::int FROM article_chunks) AS chunks,
      (SELECT count(*)::int FROM articles a
        LEFT JOIN article_chunks c ON c.article_id = a.id
        WHERE c.id IS NULL) AS articles_without_chunks
  `
  console.log(counts)

  const query = process.argv[2] || 'nuclear energy policy and reactor approvals'
  const [embedding] = await embedTexts([query])
  const matches = await sql`
    SELECT a.source, a.title, round((1 - (c.embedding <=> ${`[${embedding.join(',')}]`}::vector))::numeric, 3) AS similarity
    FROM article_chunks c
    JOIN articles a ON a.id = c.article_id
    ORDER BY c.embedding <=> ${`[${embedding.join(',')}]`}::vector
    LIMIT 5
  `
  console.log(`\ntop matches for "${query}":`)
  for (const m of matches) console.log(`  ${m.similarity}  [${m.source}] ${m.title}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
