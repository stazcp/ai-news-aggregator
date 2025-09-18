// Utility functions for working with the organized RSS feeds structure
import rssConfig from './rss-feeds.json'

const SOURCES_CONFIG = rssConfig.sources as Record<
  string,
  {
    name: string
    feeds: Array<{
      id: string
      category: string
      url: string
    }>
  }
>

/**
 * Get all available sources
 */
export function getAllSources(): string[] {
  return Object.keys(SOURCES_CONFIG)
}

/**
 * Get all feeds for a specific source
 */
export function getFeedsForSource(sourceKey: string) {
  return SOURCES_CONFIG[sourceKey]?.feeds || []
}

/**
 * Check if a source has a specific feed category
 */
export function hasFeed(sourceKey: string, category: string): boolean {
  const feeds = getFeedsForSource(sourceKey)
  return feeds.some((feed) => feed.category.toLowerCase() === category.toLowerCase())
}

/**
 * Get all sources that have a specific category
 */
export function getSourcesWithCategory(category: string): string[] {
  return Object.keys(SOURCES_CONFIG).filter((sourceKey) =>
    getFeedsForSource(sourceKey).some((feed) => feed.category === category)
  )
}

/**
 * Get all categories
 */
export function getAllCategories(): string[] {
  const categories = new Set<string>()
  Object.values(SOURCES_CONFIG).forEach((source) => {
    source.feeds.forEach((feed) => categories.add(feed.category))
  })
  return Array.from(categories)
}

/**
 * Get source summary - useful for debugging/management
 */
export function getSourceSummary() {
  return Object.entries(SOURCES_CONFIG).map(([key, source]) => ({
    source: key,
    name: source.name,
    feedCount: source.feeds.length,
    categories: [...new Set(source.feeds.map((f) => f.category))],
    feeds: source.feeds.map((f) => ({ id: f.id, category: f.category })),
  }))
}
