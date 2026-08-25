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

interface CompiledTerm {
  entityId: string
  regex: RegExp
}

function escapeRegExp(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Custom \w-lookaround boundaries instead of \b: terms like "U.S." or
// "OPEC+" end in non-word characters, where \b would not anchor correctly.
function compileTerm(entityId: string, term: string): CompiledTerm {
  const caseSensitive = term.length <= ACRONYM_MAX_CHARS
  const pattern = `(?<!\\w)${escapeRegExp(term)}(?!\\w)`
  return { entityId, regex: new RegExp(pattern, caseSensitive ? 'g' : 'gi') }
}

const COMPILED_TERMS: CompiledTerm[] = ENTITY_DICTIONARY.flatMap((entry) =>
  [entry.name, ...entry.aliases].map((term) => compileTerm(entry.id, term))
)

function stripMarkupAndBoilerplate(text: string): string {
  return STOP_PATTERNS.reduce((t, pattern) => t.replace(pattern, ' '), text)
}

function countMatches(text: string, regex: RegExp): number {
  regex.lastIndex = 0
  return text.match(regex)?.length ?? 0
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

  const titleCounts = new Map<string, number>()
  const bodyCounts = new Map<string, number>()
  for (const { entityId, regex } of COMPILED_TERMS) {
    const inTitle = countMatches(title, regex)
    if (inTitle > 0) titleCounts.set(entityId, (titleCounts.get(entityId) ?? 0) + inTitle)
    const inBody = countMatches(body, regex)
    if (inBody > 0) bodyCounts.set(entityId, (bodyCounts.get(entityId) ?? 0) + inBody)
  }

  const entityIds = new Set([...titleCounts.keys(), ...bodyCounts.keys()])
  return [...entityIds]
    .map((entityId) => {
      const inTitle = titleCounts.get(entityId) ?? 0
      const total = inTitle + (bodyCounts.get(entityId) ?? 0)
      const salience = Math.min(1, MENTION_WEIGHT * total + (inTitle > 0 ? TITLE_BOOST : 0))
      return { entityId, salience }
    })
    .sort((a, b) => b.salience - a.salience || a.entityId.localeCompare(b.entityId))
}
