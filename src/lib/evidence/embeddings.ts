/**
 * Local embeddings via @xenova/transformers (no API cost).
 * Model and dimension are config (THESIS_TRACKER_SPEC §14); changing the
 * model requires a full re-embed and a matching VECTOR(n) migration.
 */
export const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'Xenova/all-MiniLM-L6-v2'
export const EMBEDDING_DIM = 384

type FeatureExtractor = (
  texts: string[],
  opts: { pooling: 'mean'; normalize: boolean }
) => Promise<{ tolist(): number[][] }>

let _embedder: FeatureExtractor | null = null

async function getEmbedder(): Promise<FeatureExtractor> {
  if (!_embedder) {
    const { pipeline, env } = await import('@xenova/transformers')
    if (process.env.TRANSFORMERS_CACHE_DIR) {
      env.cacheDir = process.env.TRANSFORMERS_CACHE_DIR
    }
    _embedder = (await pipeline('feature-extraction', EMBEDDING_MODEL)) as FeatureExtractor
  }
  return _embedder
}

export async function embedTexts(texts: string[], batchSize = 16): Promise<number[][]> {
  if (texts.length === 0) return []
  const embedder = await getEmbedder()
  const out: number[][] = []
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize)
    const result = await embedder(batch, { pooling: 'mean', normalize: true })
    out.push(...result.tolist())
  }
  return out
}
