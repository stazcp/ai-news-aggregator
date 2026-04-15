export const ENV_DEFAULTS = {
  // Cache
  cacheDisableRedis: false,
  cacheTtlSeconds: 43200,
  cacheReadFallbackPrefixes: '',
  allowLocalBackgroundRefresh: false,
  homepageRefreshMode: 'cron-only',

  // Groq
  groqMaxConcurrency: 2,
  groqRetryMax: 3,
  groqRetryBaseMs: 800,
  summaryFallbackOnLimit: false,

  // Feed intake
  feedLogLevel: 'warn',
  feedBlocklist: '',
  aggregatorFeedItemsLimit: 100,
  feedItemsPerFeed: 25,
  newsGlobalLimit: 2000,

  // Clustering
  preclusterThreshold: 0.42,
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
  clusterEntityMinCoherence: 0.20,
  clusterCoherenceThreshold: 0.54,
  clusterCoherenceMin: 2,
  clusterLlmMerge: true,
  clusterExpandSim: 0.65,
  clusterExpandMaxAdd: 15,
  clusterExpandTimeHours: 48,
  clusterExpandCategoryStrict: true,
  clusterSummarizeDuringEnrich: false,
  clusterPerDomainMax: 8,
  clusterDisplayCap: 50,
  clusterSummarizeTopN: 6,

  // Severity and ranking
  severityUseLlm: true,
  severityLlmTopN: 8,
  // Severity multipliers (applied to base score; 1.0 = no effect)
  severityMultWar: 1.3,
  severityMultDeaths: 1.25,
  severityMultPolitics: 1.15,
  severityMultEconomy: 1.1,
  severityMultTech: 1.05,
  // Scoring weights
  scoreWArticles: 0.6,
  scoreWDomains: 0.8,
  scoreWImages: 0.4,
  scoreWVelocity: 1.5,
  scoreVelocityWindowHours: 4,
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
