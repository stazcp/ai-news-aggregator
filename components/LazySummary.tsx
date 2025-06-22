'use client'

import { useState, useEffect } from 'react'

interface LazySummaryProps {
  articleId: string
  content: string
  className?: string
}

export default function LazySummary({ articleId, content, className = '' }: LazySummaryProps) {
  const [summary, setSummary] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasRequested, setHasRequested] = useState(false)

  const fetchSummary = async () => {
    if (hasRequested) return // Prevent duplicate requests

    setIsLoading(true)
    setError(null)
    setHasRequested(true)

    try {
      const response = await fetch('/api/summarize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          articleId,
          content,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to fetch summary')
      }

      const data = await response.json()
      setSummary(data.summary)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load summary')
    } finally {
      setIsLoading(false)
    }
  }

  // Auto-fetch summary when component mounts
  useEffect(() => {
    if (content && content.length > 100) {
      fetchSummary()
    }
  }, [content])

  if (!content || content.length <= 100) {
    return null // Don't show summary for short content
  }

  const baseClasses = 'mt-4 p-4 rounded-lg border'
  const containerClasses = `${baseClasses} ${className}`

  if (error) {
    return (
      <div className={`${containerClasses} bg-red-900/20 border-red-700/30`}>
        <p className="text-sm text-red-400">Failed to load AI summary.</p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className={`${containerClasses} bg-[var(--accent)]/10 border-[var(--accent)]/30`}>
        <h4 className="flex items-center text-sm font-semibold text-[var(--accent)] mb-2">
          <span className="mr-2">✨</span>
          AI-Powered Summary
        </h4>
        <div className="flex items-center space-x-2">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-[var(--accent)]"></div>
          <p className="text-sm text-[var(--muted-foreground)]">Generating summary...</p>
        </div>
      </div>
    )
  }

  if (!summary) {
    return null
  }

  return (
    <div
      className={`${containerClasses} bg-[var(--accent)]/10`}
      style={{ animation: 'pulse-border 2s infinite' }}
    >
      <h4 className="flex items-center text-sm font-semibold text-[var(--accent)] mb-2">
        <span className="mr-2">✨</span>
        AI-Powered Summary
      </h4>
      <p className="text-sm text-[var(--muted-foreground)] leading-relaxed">{summary}</p>
    </div>
  )
}
