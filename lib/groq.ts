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

export async function main() {
  const chatCompletion = await getGroqChatCompletion()
  // Print the completion returned by the LLM.
  console.log(chatCompletion.choices[0]?.message?.content || '')
}

export async function getGroqChatCompletion() {
  return groq.chat.completions.create({
    messages: [
      {
        role: 'user',
        content: 'Explain the importance of fast language models',
      },
    ],
    model: 'llama-3.3-70b-versatile',
  })
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

export async function batchSummarize(
  articles: Array<{ id: string; content: string }>
): Promise<Record<string, string>> {
  const summaries: Record<string, string> = {}

  // Process in batches to respect rate limits
  const batchSize = 5
  for (let i = 0; i < articles.length; i += batchSize) {
    const batch = articles.slice(i, i + batchSize)
    const promises = batch.map(async (article) => {
      const summary = await summarizeArticle(article.content)
      return { id: article.id, summary }
    })

    const results = await Promise.allSettled(promises)
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        summaries[batch[index].id] = result.value.summary
      }
    })

    // Rate limiting delay
    if (i + batchSize < articles.length) {
      await new Promise((resolve) => setTimeout(resolve, 2000))
    }
  }

  return summaries
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
    .map((a) => `Source: ${a.source.name}\nTitle: ${a.title}\nContent: ${a.content}\n\n`)
    .join('--- \n')

  const prompt = `
    You are a senior news editor. Your task is to synthesize a single, cohesive summary from multiple articles covering the same event.
    The following is a collection of articles.
    Generate a single, well-written summary paragraph that incorporates the key facts and perspectives from all provided sources.
    Do not just list what each source said. Synthesize the information into a unified narrative.

    Here is the content:
    ${contentToSummarize}
  `

  try {
    const completion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: 'You are a senior news editor.' },
        { role: 'user', content: prompt },
      ],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.5,
      max_tokens: 250,
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
    description: a.description?.substring(0, 100),
  }))

  const prompt = `
    You are a news categorization engine. Your task is to group similar articles into story clusters based on the core event they are reporting.
    Analyze the following list of JSON objects.
    Respond with ONLY a valid JSON object containing a single key "clusters". The value should be an array of objects.
    Each object in the array represents a story cluster and must have two keys:
    1. "clusterTitle": A short, clear headline for the overall event (e.g., "Federal Reserve Announces Interest Rate Hike").
    2. "articleIds": An array of the original article IDs that belong to this cluster. A cluster must contain 2 or more articles.

    Do not include articles that are unique.

    Here is the list of articles:
    ${JSON.stringify(articleSummaries)}
  `

  try {
    const cacheKey = `clusters-${articles
      .map((a) => a.id)
      .sort()
      .join('-')}`
    const cachedClusters = await getCachedData(cacheKey)
    if (cachedClusters) {
      console.log('📦 Returning cached clusters')
      return cachedClusters
    }

    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant that only responds with valid, well-formed JSON.',
        },
        { role: 'user', content: prompt },
      ],
      model: 'llama3-8b-8192', // Use a faster model for categorization
      temperature: 0.1,
      response_format: { type: 'json_object' },
    })

    const responseContent = completion.choices[0]?.message?.content
    if (!responseContent) return []

    const responseObject = JSON.parse(responseContent)
    const clusters = responseObject.clusters

    if (Array.isArray(clusters)) {
      const validClusters = clusters.filter(
        (c) => c.clusterTitle && Array.isArray(c.articleIds) && c.articleIds.length >= 2
      )
      await setCachedData(cacheKey, validClusters, 600) // Cache for 10 minutes
      return validClusters
    }

    return []
  } catch (error) {
    if (isRateLimitError(error)) {
      console.warn('⚠️ Rate limit hit during article clustering')
      throw error // Re-throw rate limit errors to be handled upstream
    }
    console.error('Error clustering articles:', error)
    return []
  }
}
