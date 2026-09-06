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

main()
  .then(() => {
    // The local embedding model (@xenova/transformers → onnxruntime-node) keeps
    // native handles open after the last await, so the event loop never drains
    // and the step hangs until the job timeout kills it. Run 34065417107: work
    // finished in 70s, the process was killed 44 minutes later having done
    // nothing, and the two later steps were skipped. Exit explicitly instead of
    // trusting the loop to empty.
    process.exit(0)
  })
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
