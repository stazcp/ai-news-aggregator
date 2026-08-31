-- Story-cluster persistence — THESIS_TRACKER_SPEC Phase 2.
-- Stories are long-lived: snapshots from the in-memory clustering engine are
-- matched to existing rows by member overlap (see clusterPersist.ts) so a
-- developing story keeps one id across runs.

CREATE SEQUENCE IF NOT EXISTS story_id_seq;

CREATE TABLE IF NOT EXISTS story_clusters (
  id             TEXT PRIMARY KEY DEFAULT ('st-' || nextval('story_id_seq')),
  title          TEXT NOT NULL,
  category       TEXT,
  summary        TEXT,
  summary_generated_at TIMESTAMPTZ,
  summary_article_count INT,
  severity_level INT,
  severity_label TEXT,
  score          REAL,
  image_urls     JSONB,
  first_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_story_clusters_last_seen ON story_clusters (last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_story_clusters_score ON story_clusters (score DESC);

CREATE TABLE IF NOT EXISTS cluster_articles (
  cluster_id TEXT REFERENCES story_clusters(id) ON DELETE CASCADE,
  article_id TEXT REFERENCES articles(id) ON DELETE CASCADE,
  added_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (cluster_id, article_id)
);

CREATE INDEX IF NOT EXISTS idx_cluster_articles_article ON cluster_articles (article_id);

-- One digest per category per UTC day; the PK dedupes concurrent runs.
CREATE TABLE IF NOT EXISTS category_digests (
  category     TEXT NOT NULL,
  digest_date  DATE NOT NULL,
  digest       JSONB NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (category, digest_date)
);
