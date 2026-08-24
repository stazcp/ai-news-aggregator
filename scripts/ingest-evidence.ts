import './load-env'
import { fetchAllNews } from '@/lib/news/newsService'
import { backfillMissingChunks, persistArticles } from '@/lib/evidence/persist'

// Evidence ingestion is independent of PROJECT_PAUSED: it makes no LLM calls
// (embeddings run locally) and exists precisely to accumulate history even
// while the consumer site is offline.
async function main() {
  const started = Date.now()
  console.log('fetching feeds…')
  const articles = await fetchAllNews()
  console.log(`fetched ${articles.length} articles, persisting…`)
  const result = await persistArticles(articles)
  const backfilled = await backfillMissingChunks()
  const seconds = Math.round((Date.now() - started) / 1000)
  console.log(
    `done in ${seconds}s — inserted ${result.inserted} new articles ` +
      `(${result.skippedExisting} already stored), embedded ${result.chunksEmbedded} chunks` +
      (backfilled > 0 ? `, backfilled ${backfilled} chunks for earlier partial runs` : '')
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
