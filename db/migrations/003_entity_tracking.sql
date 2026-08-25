-- Entity extraction bookkeeping — THESIS_TRACKER_SPEC.md §5 step 5.
-- Stamped once per article after extraction (including zero-entity articles)
-- so the batch loop over `entities_extracted_at IS NULL` always terminates.

ALTER TABLE articles ADD COLUMN IF NOT EXISTS entities_extracted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_articles_entities_pending
  ON articles (id) WHERE entities_extracted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_article_entities_entity
  ON article_entities (entity_id);
