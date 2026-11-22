import { backfillMissingChunks, chunkWindowDays } from '../persist'
import { ENV_DEFAULTS } from '@/lib/config/env'

// No DB: getSql returns a recorder that captures each query and returns no
// rows, so backfill exits after its first SELECT and nothing is ever written.
const queries: { text: string; values: unknown[] }[] = []
jest.mock('../db', () => ({
  getSql: () =>
    async (strings: TemplateStringsArray, ...values: unknown[]) => {
      queries.push({ text: strings.join('$?'), values })
      return []
    },
}))
jest.mock('../embeddings', () => ({
  embedTexts: jest.fn(async () => {
    throw new Error('backfill must not embed when no rows are selected')
  }),
}))

const ORIGINAL = process.env.CHUNK_WINDOW_DAYS

afterEach(() => {
  queries.length = 0
  if (ORIGINAL === undefined) delete process.env.CHUNK_WINDOW_DAYS
  else process.env.CHUNK_WINDOW_DAYS = ORIGINAL
  jest.restoreAllMocks()
})

describe('chunkWindowDays', () => {
  it('defaults to 14 days', () => {
    delete process.env.CHUNK_WINDOW_DAYS
    expect(ENV_DEFAULTS.chunkWindowDays).toBe(14)
    expect(chunkWindowDays()).toBe(14)
  })

  it('honours CHUNK_WINDOW_DAYS', () => {
    process.env.CHUNK_WINDOW_DAYS = '30'
    expect(chunkWindowDays()).toBe(30)
  })

  it('falls back to the default for non-positive or garbage values', () => {
    for (const bad of ['0', '-5', 'abc']) {
      process.env.CHUNK_WINDOW_DAYS = bad
      expect(chunkWindowDays()).toBe(14)
    }
  })
})

describe('backfillMissingChunks window', () => {
  it('anchors the cutoff on max(published_at), not the clock', async () => {
    delete process.env.CHUNK_WINDOW_DAYS
    await backfillMissingChunks()
    expect(queries).toHaveLength(1)
    const { text, values } = queries[0]
    expect(text).toMatch(
      /a\.published_at >= \(SELECT max\(published_at\) FROM articles\)\s*- make_interval\(days => \$\?::int\)/
    )
    expect(values).toContain(14)
    expect(text).not.toMatch(/now\(\)|current_timestamp|current_date|localtimestamp/i)
  })

  it('passes the env-overridden window into the query', async () => {
    process.env.CHUNK_WINDOW_DAYS = '7'
    await backfillMissingChunks()
    expect(queries[0].values).toContain(7)
  })

  it('never reads the JS clock to compute the cutoff', async () => {
    const dateNow = jest.spyOn(Date, 'now')
    const RealDate = Date
    const ctor = jest
      .spyOn(global, 'Date')
      .mockImplementation(((...args: ConstructorParameters<typeof Date>) =>
        new RealDate(...args)) as unknown as () => Date)
    await backfillMissingChunks()
    expect(dateNow).not.toHaveBeenCalled()
    expect(ctor).not.toHaveBeenCalled()
    for (const v of queries[0].values) expect(v).not.toBeInstanceOf(RealDate)
  })
})
