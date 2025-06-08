import Groq from 'groq-sdk'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

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
