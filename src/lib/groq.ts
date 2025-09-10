import Groq from 'groq-sdk'
import { getCachedData, setCachedData } from '@/lib/cache'
import { Article, StoryCluster } from '@/types'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

// Helper function to check if error is a rate limit error
function isRateLimitError(error: any): boolean {
  if (!error) return false

  const errorMessage = error.message || error.toString() || ''
  const errorCode = error.code || error.error?.code || ''

  return (
    errorMessage.includes('rate_limit_exceeded') ||
    errorMessage.includes('429') ||
    errorCode === 'rate_limit_exceeded' ||
    error.status === 429 ||
    errorMessage.includes('Rate limit reached')
  )
}

export async function summarizeArticle(content: string, maxLength: number = 150): Promise<string> {
  try {
    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: 'You are a professional news summarizer. Create concise, informative summaries.',
        },
        {
          role: 'user',
          content: `Summarize this article in ${maxLength} characters or less. Focus on the key facts and main points:\n\n${content}`,
        },
      ],
      model: 'llama-3.3-70b-versatile',
      max_tokens: 100,
      temperature: 0.3,
    })

    return completion.choices[0]?.message?.content?.trim() || 'Summary not available'
  } catch (error) {
    if (isRateLimitError(error)) {
      console.warn('⚠️ Rate limit hit during article summarization')
      throw error // Re-throw rate limit errors to be handled upstream
    }
    console.error('Error summarizing article', error)
    return 'Summary not available'
  }
}

export async function summarizeCluster(articles: Article[]): Promise<string> {
  const cacheKey = `cluster-summary-${articles
    .map((a) => a.id)
    .sort()
    .join('-')}`
  const cachedSummary = await getCachedData(cacheKey)
  if (cachedSummary) {
    console.log('📦 Returning cached cluster summary')
    return cachedSummary
  }

  const contentToSummarize = articles
    .map(
      (a) =>
        `Source: ${a.source.name}\nTitle: ${a.title}\nSummary: ${a.description || ''}\nContent: ${a.content || ''}\nPublished: ${a.publishedAt}\nURL: ${a.url}\n\n`
    )
    .join('--- \n')

  const prompt = `
You are a senior news editor. Synthesize a single, cohesive summary from multiple articles covering the same event.
Requirements:
- One paragraph, 4–6 sentences, neutral and precise.
- Integrate key facts that multiple sources agree on; avoid duplication.
- Note any major disagreements or uncertainty if present.
- Avoid rhetoric and adjectives; prefer numbers, timeframes, and concrete details.
- Do not list sources; write a unified narrative.
Here are the sources (title, brief, content, date, url):
${contentToSummarize}
  `

  try {
    const completion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: 'You are a senior news editor.' },
        { role: 'user', content: prompt },
      ],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.4,
      max_tokens: 320,
    })

    const summary =
      completion.choices[0]?.message?.content?.trim() || 'Summary could not be generated.'
    await setCachedData(cacheKey, summary, 3600) // Cache for 1 hour
    return summary
  } catch (error) {
    if (isRateLimitError(error)) {
      console.warn('⚠️ Rate limit hit during cluster summarization')
      throw error // Re-throw rate limit errors to be handled upstream
    }
    console.error('Error summarizing cluster:', error)
    return 'An error occurred while generating the cluster summary.'
  }
}

export async function clusterArticles(articles: Article[]): Promise<StoryCluster[]> {
  const articleSummaries = articles.map((a) => ({
    id: a.id,
    title: a.title,
    description: (a.description || '').substring(0, 160),
    publishedAt: a.publishedAt,
    source: a.source?.name,
    category: a.category,
  }))

  const prompt = `
You are a news categorization engine. Group only truly similar articles referring to the SAME event.
Return ONLY JSON: {"clusters": [{"clusterTitle": string, "articleIds": string[]}, ...]}.

Strict rules:
- Make a cluster ONLY if there are 2+ highly similar items (near-duplicate titles/descriptions) about a single event.
- Do NOT cluster unrelated topics/categories (e.g., local incidents vs. sports vs. business) together.
- Prefer clusters within ~72 hours; different dates often mean different events.
- If unsure, return {"clusters": []}.
- Cluster titles must be descriptive of the event (avoid generic titles like "Live Coverage").

Articles JSON:
${JSON.stringify(articleSummaries)}
  `

  const cacheKey = `clusters-${articles
    .map((a) => a.id)
    .sort()
    .join('-')}`

  try {
    const cachedClusters = await getCachedData(cacheKey)
    if (cachedClusters) {
      console.log('📦 Returning cached clusters')
      return cachedClusters
    }

    // First attempt: structured JSON response
    let responseContent: string | undefined
    try {
      const completion = await groq.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant that only responds with valid, well-formed JSON.',
          },
          { role: 'user', content: prompt },
        ],
        model: 'llama-3.3-70b-versatile',
        temperature: 0.1,
        response_format: { type: 'json_object' },
      })
      responseContent = completion.choices[0]?.message?.content ?? undefined
    } catch (err: any) {
      const message = err?.message || String(err)
      const code = err?.code || err?.error?.code
      // If the model failed JSON validation, try a fallback call without response_format
      if (code === 'json_validate_failed' || message.includes('json_validate_failed')) {
        console.warn('⚠️ JSON validation failed. Retrying clustering without response_format...')
        const strictPrompt = `Respond ONLY with a JSON object of shape {"clusters": [{"clusterTitle": string, "articleIds": string[]} ...]}. No prose. If unsure, return {"clusters": []}.\nArticles JSON:\n${JSON.stringify(
          articleSummaries
        )}`
        const retry = await groq.chat.completions.create({
          messages: [
            { role: 'system', content: 'Output valid JSON only. No explanations.' },
            { role: 'user', content: strictPrompt },
          ],
          model: 'llama-3.3-70b-versatile',
          temperature: 0,
          max_tokens: 800,
        })
        responseContent = retry.choices[0]?.message?.content ?? undefined
      } else {
        throw err
      }
    }

    if (!responseContent) return []

    // Parse JSON safely, allowing for possible surrounding text
    let responseObject: any
    try {
      responseObject = JSON.parse(responseContent)
    } catch {
      const start = responseContent.indexOf('{')
      const end = responseContent.lastIndexOf('}')
      if (start !== -1 && end !== -1 && end > start) {
        try {
          responseObject = JSON.parse(responseContent.slice(start, end + 1))
        } catch {
          console.warn('⚠️ Failed to parse clustering JSON after fallback. Returning empty.')
          return []
        }
      } else {
        return []
      }
    }

    const clusters = responseObject?.clusters

    if (Array.isArray(clusters)) {
      const validClusters = clusters.filter(
        (c) => c.clusterTitle && Array.isArray(c.articleIds) && c.articleIds.length >= 2
      )

      // Only cache successful results - don't cache empty results which might be due to rate limits
      if (validClusters.length > 0) {
        await setCachedData(cacheKey, validClusters, 600) // Cache for 10 minutes
        console.log(`✅ Successfully clustered and cached ${validClusters.length} clusters`)
      } else {
        console.log('ℹ️ No clusters found - not caching empty result')
      }

      return validClusters
    }

    return []
  } catch (error) {
    if (isRateLimitError(error)) {
      console.warn('⚠️ Rate limit hit during article clustering - not caching this failure')
      throw error // Re-throw rate limit errors to be handled upstream
    }
    console.error('Error clustering articles:', error)
    return []
  }
}

/**
 * Assess cluster severity using the LLM.
 * Returns an object with {level 0-5, label, reasons[]} where higher is more severe.
 * Cached to limit cost.
 */
export async function assessClusterSeverityLLM(
  cluster: StoryCluster
): Promise<{ level: number; label: string; reasons: string[] }> {
  try {
    const arts = (cluster.articles || []).slice(0, 6)
    const brief = {
      title: cluster.clusterTitle,
      size: cluster.articles?.length || 0,
      headlines: arts.map((a) => ({
        source: a.source?.name,
        title: a.title,
        desc: (a.description || '').slice(0, 200),
        date: a.publishedAt,
      })),
    }

    const cacheKey = `sev-llm-${(cluster.articleIds || []).slice(0, 20).sort().join('-')}`
    const cached = await getCachedData(cacheKey)
    if (cached) return cached

    const prompt = `
You are rating the NEWS SEVERITY of a single event cluster. Output ONLY JSON with keys: level (0-5), label (string), reasons (string array).

Guidelines:
- 5 War/Conflict: active war, missile/drone strikes, widespread violence.
- 4 Mass Casualty/Deaths: many killed, disasters, major outbreaks.
- 3 National Politics: head-of-state/government, elections, parliament, impeachment.
- 2 Economy/Markets: major macro shifts, crises.
- 1 Tech/Business: launches, earnings, corporate news.
- 0 Other: everything else.

Be conservative and justify briefly in reasons. Consider the headlines collectively and recency.
Cluster JSON follows:
${JSON.stringify(brief)}
    `

    const completion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: 'Return valid JSON only.' },
        { role: 'user', content: prompt },
      ],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.1,
      response_format: { type: 'json_object' },
      max_tokens: 200,
    })

    const content = completion.choices[0]?.message?.content || '{}'
    let obj: any
    try {
      obj = JSON.parse(content)
    } catch {
      const s = content.indexOf('{')
      const e = content.lastIndexOf('}')
      obj = s >= 0 && e > s ? JSON.parse(content.slice(s, e + 1)) : { level: 0, label: 'Other', reasons: [] }
    }
    const out = {
      level: Number(obj?.level) || 0,
      label: typeof obj?.label === 'string' ? obj.label : 'Other',
      reasons: Array.isArray(obj?.reasons) ? obj.reasons.slice(0, 4).map(String) : [],
    }
    await setCachedData(cacheKey, out, 1800)
    return out
  } catch (e) {
    console.warn('LLM severity failed; defaulting to Other')
    return { level: 0, label: 'Other', reasons: [] }
  }
}

/**
 * Merge highly similar clusters using the LLM (handles paraphrases and cross-language titles).
 * Accepts a list of clusters and a map for looking up article titles/dates.
 * Returns a new list of merged clusters.
 */
export async function mergeClustersByLLM(
  clusters: StoryCluster[],
  articleMap: Map<string, Article>
): Promise<StoryCluster[]> {
  if (clusters.length <= 1) return clusters

  // Build compact briefs for each cluster to keep token usage bounded
  const briefs = clusters.map((c, index) => {
    const arts = (c.articleIds || [])
      .map((id) => articleMap.get(id))
      .filter(Boolean) as Article[]
    const topTitles = arts
      .slice(0, 3)
      .map((a) => `${a.source?.name || ''}: ${a.title}`)
    const dates = arts.map((a) => a.publishedAt).filter(Boolean)
    const range = dates.length
      ? `${new Date(Math.min(...dates.map((d) => new Date(d).getTime()))).toISOString()}–${new Date(
          Math.max(...dates.map((d) => new Date(d).getTime()))
        ).toISOString()}`
      : ''
    return {
      index,
      title: c.clusterTitle || '',
      headlines: topTitles,
      dateRange: range,
      size: (c.articleIds || []).length,
    }
  })

  const cacheKey = `llm-merge-${briefs.map((b) => b.title).join('|').slice(0, 900)}`
  const cached = await getCachedData(cacheKey)
  if (cached) return cached

  const prompt = `
You are grouping cluster candidates that describe the SAME news event, even across languages and paraphrases.
Return ONLY JSON with shape {"groups": [{"title": string, "indices": number[]} ...]} where indices refer to the input array order.

Rules:
- Group clusters that clearly refer to the same event (same country/location/actors/timing), even if titles are paraphrased or translated.
- Do NOT merge different events.
- Prefer descriptive group titles; reuse an existing title if suitable.
- If a cluster is unique, you may return it as a single-element group.

Input clusters (JSON array with {index,title,headlines,dateRange,size}):
${JSON.stringify(briefs)}
  `

  try {
    const completion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: 'You return strict JSON only.' },
        { role: 'user', content: prompt },
      ],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.1,
      response_format: { type: 'json_object' },
      max_tokens: 800,
    })

    const content = completion.choices[0]?.message?.content || '{}'
    let obj: any
    try {
      obj = JSON.parse(content)
    } catch {
      const s = content.indexOf('{')
      const e = content.lastIndexOf('}')
      obj = s >= 0 && e > s ? JSON.parse(content.slice(s, e + 1)) : { groups: [] }
    }
    const groups = Array.isArray(obj?.groups) ? obj.groups : []

    // Build merged clusters from groups
    const used = new Set<number>()
    const merged: StoryCluster[] = []
    for (const g of groups) {
      const idxs: number[] = Array.isArray(g?.indices) ? g.indices : []
      if (!idxs.length) continue
      idxs.forEach((i) => used.add(i))
      const unionIds = Array.from(
        new Set(
          idxs.flatMap((i) => clusters[i]?.articleIds || [])
        )
      )
      const titleCandidates = idxs
        .map((i) => clusters[i]?.clusterTitle || '')
        .filter(Boolean)
        .sort((a, b) => b.length - a.length)
      const title = (g?.title && String(g.title)) || titleCandidates[0] || 'Merged Event'
      merged.push({ clusterTitle: title, articleIds: unionIds })
    }

    // Add any clusters not mentioned in groups as singletons
    for (let i = 0; i < clusters.length; i++) {
      if (!used.has(i)) merged.push(clusters[i])
    }

    await setCachedData(cacheKey, merged, 600)
    return merged
  } catch (error) {
    console.warn('LLM merge failed, returning original clusters', error)
    return clusters
  }
}
