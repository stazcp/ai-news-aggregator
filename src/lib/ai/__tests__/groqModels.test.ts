// Every other suite jest.mock()s '@/lib/ai/groq' wholesale, so the model
// constants are never evaluated and a typo'd id would ship green. This suite
// imports the real module and asserts the id that actually reaches the SDK.

const mockCreate = jest.fn()

jest.mock('groq-sdk', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      chat: { completions: { create: mockCreate } },
    })),
  }
})

jest.mock('@/lib/cache', () => ({
  getCachedData: jest.fn().mockResolvedValue(null),
  setCachedData: jest.fn().mockResolvedValue(undefined),
}))

describe('Groq model ids', () => {
  const ORIGINAL_ENV = process.env

  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
    process.env = { ...ORIGINAL_ENV, GROQ_API_KEY: 'test-key' }
    delete process.env.GROQ_MODEL_QUALITY
    delete process.env.GROQ_MODEL_FAST
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    process.env = ORIGINAL_ENV
    jest.restoreAllMocks()
  })

  function reply(content: string) {
    mockCreate.mockResolvedValue({ choices: [{ message: { content } }] })
  }

  it('sends the live quality model, not a decommissioned one', async () => {
    reply('A summary.')
    const { summarizeArticle } = await import('../groq')
    await summarizeArticle('some article text')

    expect(mockCreate).toHaveBeenCalledTimes(1)
    const params = mockCreate.mock.calls[0][0]
    expect(params.model).toBe('openai/gpt-oss-120b')
  })

  it('sends the live fast model on the severity path', async () => {
    reply(JSON.stringify({ results: [{ index: 0, level: 4, label: 'Mass Casualty' }] }))
    const { batchAssessSeverityLLM } = await import('../groq')
    await batchAssessSeverityLLM([
      { id: 'c1', title: 'Quake kills dozens', articleIds: ['a1'], articles: [] } as any,
    ])

    expect(mockCreate).toHaveBeenCalled()
    expect(mockCreate.mock.calls[0][0].model).toBe('openai/gpt-oss-20b')
  })

  it('never sends a model Groq decommissioned on 2026-08-16', async () => {
    reply('A summary.')
    const { summarizeArticle } = await import('../groq')
    await summarizeArticle('some article text')

    const dead = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant']
    for (const call of mockCreate.mock.calls) {
      expect(dead).not.toContain(call[0].model)
    }
  })

  it('honours the env override, trimming a stray pasted space', async () => {
    process.env.GROQ_MODEL_QUALITY = '  openai/gpt-oss-safety-20b  '
    reply('A summary.')
    const { summarizeArticle } = await import('../groq')
    await summarizeArticle('some article text')

    // Untrimmed, this id would 404 on every call — the exact failure this PR fixes.
    expect(mockCreate.mock.calls[0][0].model).toBe('openai/gpt-oss-safety-20b')
  })

  it('names the token budget when the model is cut off mid-answer', async () => {
    // Without finish_reason, "budget exhausted" and "model returned nothing"
    // are indistinguishable in the log — the ambiguity that let the
    // decommissioned-model failure hide for days.
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: 'A truncated sum' }, finish_reason: 'length' }],
    })
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const { summarizeArticle } = await import('../groq')
    await summarizeArticle('some article text')

    const warned = warn.mock.calls.map((c) => String(c[0])).join('\n')
    expect(warned).toContain('finish_reason=length')
    expect(warned).toContain('GROQ_REASONING_HEADROOM')
  })

  it('does not cache the failure sentinel as a cluster summary', async () => {
    reply('   ')
    const { summarizeCluster } = await import('../groq')
    const { setCachedData } = await import('@/lib/cache')

    const out = await summarizeCluster([
      { id: 'a1', title: 'T', source: { name: 'S' }, publishedAt: '', url: '' } as any,
    ])

    // Caching this pinned "Summary could not be generated." for an hour and
    // suppressed the retry that would have replaced it.
    expect(out).toBe('Summary could not be generated.')
    expect(setCachedData).not.toHaveBeenCalled()
  })

  it('leaves severity uncached when the model returns empty content', async () => {
    reply('   ')
    const { batchAssessSeverityLLM } = await import('../groq')
    const { setCachedData } = await import('@/lib/cache')

    const out = await batchAssessSeverityLLM([
      { id: 'c1', title: 'Quake kills dozens', articleIds: ['a1'], articles: [] } as any,
    ])

    // An empty completion must not be cached as a level-0 verdict for 30 min.
    expect(setCachedData).not.toHaveBeenCalled()
    // null, not {level:0}: clusterService only overwrites severity when this is
    // truthy, so null preserves the heuristic value instead of flattening it.
    expect(out).toEqual([null])
  })
})
