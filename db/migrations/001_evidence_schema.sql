-- Evidence DB schema — THESIS_TRACKER_SPEC.md §5 [INVARIANT]
-- Config deviations from spec (allowed, §14): embedding dimension 384
-- (Xenova/all-MiniLM-L6-v2, local + free) instead of the illustrative 1024.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE SEQUENCE IF NOT EXISTS evidence_id_seq;

-- Raw ingested items. Append-only canon; never mutated post-ingest.
CREATE TABLE IF NOT EXISTS articles (
  id            TEXT PRIMARY KEY DEFAULT ('ev-' || nextval('evidence_id_seq')),
  source        TEXT NOT NULL,
  url           TEXT NOT NULL,
  title         TEXT NOT NULL,
  category      TEXT,
  published_at  TIMESTAMPTZ NOT NULL,
  ingested_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  body          TEXT NOT NULL,
  raw_json      JSONB,
  content_hash  TEXT NOT NULL UNIQUE
);

CREATE INDEX IF NOT EXISTS idx_articles_published ON articles (published_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_source    ON articles (source);

CREATE TABLE IF NOT EXISTS article_chunks (
  id            BIGSERIAL PRIMARY KEY,
  article_id    TEXT REFERENCES articles(id) ON DELETE CASCADE,
  chunk_index   INT NOT NULL,
  text          TEXT NOT NULL,
  embedding     VECTOR(384),
  UNIQUE (article_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_chunks_article ON article_chunks (article_id);
CREATE INDEX IF NOT EXISTS idx_chunks_vector  ON article_chunks USING hnsw (embedding vector_cosine_ops);

CREATE TABLE IF NOT EXISTS entities (
  id        TEXT PRIMARY KEY,
  name      TEXT NOT NULL,
  type      TEXT NOT NULL,  -- company | regulator | person | theme | geography
  metadata  JSONB
);

CREATE TABLE IF NOT EXISTS article_entities (
  article_id TEXT REFERENCES articles(id) ON DELETE CASCADE,
  entity_id  TEXT REFERENCES entities(id) ON DELETE CASCADE,
  salience   REAL,
  PRIMARY KEY (article_id, entity_id)
);

-- Cross-link layer: which evidence supports/contradicts which claim.
CREATE TABLE IF NOT EXISTS claim_evidence (
  thesis_id    TEXT NOT NULL,
  claim_id     TEXT NOT NULL,
  article_id   TEXT REFERENCES articles(id),
  polarity     SMALLINT NOT NULL,  -- +1 supports, -1 contradicts
  weight       REAL NOT NULL DEFAULT 1.0,
  rationale    TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by   TEXT NOT NULL,
  PRIMARY KEY (thesis_id, claim_id, article_id)
);

CREATE INDEX IF NOT EXISTS idx_claim_evidence_thesis ON claim_evidence (thesis_id, claim_id);
