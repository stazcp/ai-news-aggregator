import { getCachedData, setCachedData } from './cache'

const DENYLIST_HOSTS = ['guim.co.uk', 'static01.nyt.com']

const IGNORE_WIDTH_HOSTS = ['guim.co.uk']

const SIGNED_PARAM_KEYS = new Set([
  's',
  'sig',
  'signature',
  'token',
  'expires',
  'exp',
  'hash',
  'hmac',
  'policy',
  'x-amz-signature',
  'x-amz-credential',
  'x-amz-algorithm',
  'x-amz-date',
  'x-amz-expires',
  'x-amz-signedheaders',
  'x-amz-security-token',
])

function isDenylisted(hostname: string): boolean {
  return DENYLIST_HOSTS.some((h) => hostname.endsWith(h))
}

function ignoreWidthFor(hostname: string): boolean {
  return IGNORE_WIDTH_HOSTS.some((h) => hostname.endsWith(h))
}

function hasSignedParams(url: URL): boolean {
  for (const [key] of url.searchParams.entries()) {
    if (SIGNED_PARAM_KEYS.has(key.toLowerCase())) return true
  }
  return false
}

function rewriteUrl(originalUrl: string, desiredWidth: number): string {
  try {
    const url = new URL(originalUrl)

    // Skip hosts that are known to break when width is changed
    if (isDenylisted(url.hostname) || ignoreWidthFor(url.hostname)) return originalUrl

    // Skip URLs that appear signed (beyond just `s`)
    if (hasSignedParams(url)) return originalUrl

    const allowed = [320, 480, 624, 768, 976, 1200, 1440, 2048]
    const pick = allowed.find((w) => w >= desiredWidth) || allowed[allowed.length - 1]

    let changed = false
    // Query params
    for (const key of ['w', 'width']) {
      const v = url.searchParams.get(key)
      if (v && /^\d{2,4}$/.test(v)) {
        url.searchParams.set(key, String(pick))
        changed = true
      }
    }
    // Path segments (avoid touching 's' which often means signature)
    if (!changed) {
      const parts = url.pathname.split('/')
      for (let i = 0; i < parts.length; i++) {
        if (/^(w|width|size|standard)$/i.test(parts[i])) {
          const next = parts[i + 1]
          if (next && /^\d{2,4}$/.test(next)) {
            parts[i + 1] = String(pick)
            url.pathname = parts.join('/')
            changed = true
            break
          }
        }
      }
    }

    return changed ? url.toString() : originalUrl
  } catch {
    return originalUrl
  }
}

async function isImageUrlReachable(url: string, timeoutMs = 2000): Promise<boolean> {
  try {
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), timeoutMs)
    let res = await fetch(url, { method: 'HEAD', signal: controller.signal })
    clearTimeout(t)
    if (res.ok) {
      const ct = res.headers.get('content-type') || ''
      return ct.startsWith('image/')
    }

    // Some CDNs block HEAD or return 405; try GET with Range: bytes=0-0
    const controller2 = new AbortController()
    const t2 = setTimeout(() => controller2.abort(), timeoutMs)
    res = await fetch(url, {
      method: 'GET',
      headers: { Range: 'bytes=0-0' },
      signal: controller2.signal,
    })
    clearTimeout(t2)
    if (!(res.ok || res.status === 206)) return false
    const ct = res.headers.get('content-type') || ''
    return ct.startsWith('image/')
  } catch {
    return false
  }
}

export async function resolveImageUrl(originalUrl: string, desiredWidth: number): Promise<string> {
  const cacheKey = `imgResolve:${desiredWidth}:${originalUrl}`
  const cached = await getCachedData(cacheKey)
  if (cached) return cached

  const candidate = rewriteUrl(originalUrl, desiredWidth)
  if (candidate === originalUrl) {
    await setCachedData(cacheKey, originalUrl, 60 * 60)
    return originalUrl
  }

  const ok = await isImageUrlReachable(candidate)
  const finalUrl = ok ? candidate : originalUrl
  await setCachedData(cacheKey, finalUrl, 60 * 60)
  return finalUrl
}
