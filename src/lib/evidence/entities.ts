import { ENTITY_DICTIONARY } from './entityDictionary'

export interface EntityMention {
  entityId: string
  salience: number
}

// Terms this short are treated as acronyms/tickers and matched
// case-SENSITIVELY, so "Fed" never matches "fed the dog" and "SEC" never
// matches "a sec later". Longer names match case-insensitively.
const ACRONYM_MAX_CHARS = 4

// Salience shape: each mention adds MENTION_WEIGHT, a title mention adds
// TITLE_BOOST on top; capped at 1. One body mention → 0.2, a title mention
// → 0.6, repeated coverage saturates toward 1.
const MENTION_WEIGHT = 0.2
const TITLE_BOOST = 0.4

// Markup and boilerplate stripped before matching. Google News-style feeds
// store raw HTML bodies full of news.google.com links and "Google News"
// attributions, which would otherwise credit every syndicated article to
// Alphabet — so HTML tags (including their href URLs), bare URLs, and the
// attribution phrase all go first.
const STOP_PATTERNS = [/<[^>]*>/g, /https?:\/\/\S+/g, /\bGoogle News\b/g]

// RSS bodies arrive HTML-encoded (often doubly: "&amp;amp;"), and news copy
// uses curly apostrophes — both must be normalized or names like
// "Johnson & Johnson" and "People's Bank of China" never match.
const NAMED_HTML_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“',
}

function decodeHtmlEntitiesOnce(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (match, name) => NAMED_HTML_ENTITIES[name.toLowerCase()] ?? match)
}

function normalizeText(text: string): string {
  const decoded = decodeHtmlEntitiesOnce(decodeHtmlEntitiesOnce(text))
  return decoded.replace(/[‘’ʼ]/g, "'").replace(/[“”]/g, '"')
}

// Collocations where a case-correct acronym is still not the entity
// ("Fed up with delays…"). Keyed by term, appended as a negative lookahead.
const TERM_EXCEPTIONS: Record<string, string> = {
  Fed: '(?!\\s+up\\b)',
}

interface CompiledEntity {
  entityId: string
  // ONE longest-first, case-insensitive alternation per entity, so
  // overlapping terms for the SAME entity ("U.S. Federal Reserve" ⊃
  // "Federal Reserve", "OPEC+" ⊃ "OPEC", "NVIDIA"/"Nvidia") consume each
  // text span exactly once instead of double-counting salience. Acronym
  // case rules are enforced per match against exactForms.
  regex: RegExp
  // lowercased acronym term → the exact spellings that count as a match
  exactForms: Map<string, Set<string>>
}

function escapeRegExp(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Custom \w-lookaround boundaries instead of \b: terms like "U.S." or
// "OPEC+" end in non-word characters, where \b would not anchor correctly.
function compileEntity(entityId: string, terms: string[]): CompiledEntity {
  const normalized = [...new Set(terms.map(normalizeText))]
  const sorted = normalized.sort((a, b) => b.length - a.length)
  const body = sorted
    .map((t) => `${escapeRegExp(t)}${TERM_EXCEPTIONS[t] ?? ''}`)
    .join('|')
  const exactForms = new Map<string, Set<string>>()
  for (const term of normalized) {
    if (term.length > ACRONYM_MAX_CHARS) continue
    const key = term.toLowerCase()
    if (!exactForms.has(key)) exactForms.set(key, new Set())
    exactForms.get(key)!.add(term)
  }
  return { entityId, regex: new RegExp(`(?<!\\w)(?:${body})(?!\\w)`, 'gi'), exactForms }
}

const COMPILED_ENTITIES: CompiledEntity[] = ENTITY_DICTIONARY.map((entry) =>
  compileEntity(entry.id, [entry.name, ...entry.aliases])
)

function stripMarkupAndBoilerplate(text: string): string {
  return normalizeText(STOP_PATTERNS.reduce((t, pattern) => t.replace(pattern, ' '), text))
}

// All-caps text (shouting headlines: "WHO SAID IT FIRST?") destroys the
// case signal acronym matching relies on, so skip case-sensitive terms there.
function isMostlyUppercase(text: string): boolean {
  const letters = text.match(/\p{L}/gu)
  if (!letters || letters.length < 12) return false
  const upper = letters.filter((l) => l !== l.toLowerCase() && l === l.toUpperCase()).length
  return upper / letters.length > 0.7
}

function countEntity(text: string, entity: CompiledEntity, allCaps: boolean): number {
  entity.regex.lastIndex = 0
  let count = 0
  for (const match of text.matchAll(entity.regex)) {
    const exact = entity.exactForms.get(match[0].toLowerCase())
    // Long names count case-insensitively; acronyms/tickers only in one of
    // their exact spellings, and never inside all-caps shouting text.
    if (!exact) count++
    else if (!allCaps && exact.has(match[0])) count++
  }
  return count
}

/**
 * Dictionary + rules entity extraction (no LLM calls). Returns one mention
 * per entity (aliases deduped), with salience in (0,1] derived from mention
 * count plus a boost when the entity appears in the title.
 */
export function extractEntities(title: string, body: string): EntityMention[] {
  if (!title.trim() && !body.trim()) return []
  title = stripMarkupAndBoilerplate(title)
  body = stripMarkupAndBoilerplate(body)
  const titleAllCaps = isMostlyUppercase(title)
  const bodyAllCaps = isMostlyUppercase(body)

  return COMPILED_ENTITIES.flatMap((entity) => {
    const inTitle = countEntity(title, entity, titleAllCaps)
    const total = inTitle + countEntity(body, entity, bodyAllCaps)
    if (total === 0) return []
    const salience = Math.min(1, MENTION_WEIGHT * total + (inTitle > 0 ? TITLE_BOOST : 0))
    return [{ entityId: entity.entityId, salience }]
  }).sort((a, b) => b.salience - a.salience || a.entityId.localeCompare(b.entityId))
}
