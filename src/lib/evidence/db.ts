import { neon, NeonQueryFunction } from '@neondatabase/serverless'

let _sql: NeonQueryFunction<false, false> | null = null

/**
 * Lazy Neon client. DATABASE_URL is injected by the Vercel Neon integration
 * (pulled locally via `vercel env pull`); lazy init keeps `next build` safe
 * when the var is absent.
 */
export function getSql(): NeonQueryFunction<false, false> {
  if (!_sql) {
    const url = process.env.DATABASE_URL || process.env.POSTGRES_URL
    if (!url) {
      throw new Error('DATABASE_URL is not set — run `vercel env pull .env.local --yes`')
    }
    _sql = neon(url)
  }
  return _sql
}
