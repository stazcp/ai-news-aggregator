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
  // Degrade, do not abort. The primary persist has already committed by now, and
  // a throw here exits non-zero — which skips the entity-extraction and
  // clustering steps in the workflow. That coupling is what turned ONE poisoned
  // row into four days of zero summaries (2026-09-10 to 09-14): articles were
  // persisting fine the whole time; only backfill was failing. Backfill is a
  // recovery pass for earlier partial runs, so losing one attempt costs nothing
  // that the next run cannot redo.
  let backfilled = 0
  try {
    backfilled = await backfillMissingChunks()
  } catch (err) {
    console.error('⚠️ backfillMissingChunks failed; continuing so clustering still runs:', err)
  }
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
