export const ENV_DEFAULTS = {
  // Cache
  cacheDisableRedis: false,
  cacheTtlSeconds: 43200,
  allowLocalBackgroundRefresh: false,

  // Groq
  groqMaxConcurrency: 2,
  groqRetryMax: 3,
  groqRetryBaseMs: 800,
  summaryFallbackOnLimit: false,

  // Feed intake
  feedLogLevel: 'warn',
  feedBlocklist: '',
  aggregatorFeedItemsLimit: 50,
  feedItemsPerFeed: 15,
  newsGlobalLimit: 800,

  // Clustering
  preclusterThreshold: 0.38,
  preclusterMinSize: 2,
  preclusterMaxGroup: 60,
  clusterJaccardMerge: 0.4,
  clusterDiagnostics: false,
  clusterSeedChunk: 35,
  clusterSeedOverlap: 8,
  clusterUncoveredChunk: 60,
  clusterTitleMerge: 0.7,
  clusterEntityMinShared: 2,
  clusterEntityMinLength: 4,
  clusterEntityMinCoherence: 0.12,
  clusterCoherenceThreshold: 0.54,
  clusterCoherenceMin: 2,
  clusterLlmMerge: true,
  clusterExpand: true,
  clusterExpandSim: 0.42,
  clusterExpandMaxAdd: 50,
  clusterExpandTimeHours: 168,
  clusterExpandCategoryStrict: false,
  clusterSummarizeDuringEnrich: false,
  clusterPerDomainMax: 3,
  clusterDisplayCap: 40,
  clusterSummarizeTopN: 6,

  // Severity and ranking
  severityUseLlm: true,
  severityBoostWar: 10,
  severityBoostDeaths: 7,
  severityBoostPolitics: 3,
  severityBoostEconomy: 2,
  severityBoostTech: 1,
  severityBoostOther: 0,
  scoreWArticles: 0.6,
  scoreWDomains: 0.8,
  scoreWImages: 0.4,
  scoreWRecency: 0.3,
  scoreImageBonusGe2: 2,
  scoreImageBonusGe1: 1,
  scoreImagePenaltyNone: -2,

  // UI / client
  nextPublicSummaryOnDemand: true,
  nextPublicMinImageWidth: 320,
  nextPublicMinImageHeight: 200,
  nextPublicImageQuality: 85,
  nextPublicTopicActivityWeight: 1,
  nextPublicTopicRecencyWeight: 1,
  nextPublicTopicRecencyHalfLifeHours: 24,

  // Article card keeps stricter client-side image guard when env is absent
  articleCardMinImageWidth: 480,
  articleCardMinImageHeight: 300,
} as const

export function envString(name: string, fallback: string): string {
  const value = process.env[name]
  if (value === undefined || value === null || value.trim() === '') return fallback
  return value
}

export function envInt(name: string, fallback: number): number {
  const value = process.env[name]
  if (value === undefined || value === null || value.trim() === '') return fallback
  const parsed = Number.parseInt(value, 10)
  return Number.isNaN(parsed) ? fallback : parsed
}

export function envNumber(name: string, fallback: number): number {
  const value = process.env[name]
  if (value === undefined || value === null || value.trim() === '') return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function envBool(name: string, fallback: boolean): boolean {
  const value = process.env[name]
  if (value === undefined || value === null || value.trim() === '') return fallback
  const normalized = value.trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  return fallback
}
