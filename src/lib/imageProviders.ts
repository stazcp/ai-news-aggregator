// Centralized image provider helpers
// Add host-specific inference here to avoid scattering hardcoded domains

export type ImageDims = { width?: number; height?: number }

// Known provider matchers and inference logic
function inferGuardian(u: URL): ImageDims | null {
  // The Guardian image CDN uses a signed URL with a width query param
  // Example: https://i.guim.co.uk/.../master/5345.jpg?width=140&quality=85&...
  if (!u.hostname.toLowerCase().endsWith('i.guim.co.uk')) return null
  const w = parseInt(u.searchParams.get('width') || '', 10)
  if (!Number.isNaN(w) && w > 0) return { width: w }
  return null
}

function inferBBC(u: URL): ImageDims | null {
  // BBC ichef patterns encode sizes in the path
  // - /ace/standard/{w}/...
  // - /news/{w}/...
  // - /images/ic/{w}x{h}/...
  if (!u.hostname.toLowerCase().endsWith('ichef.bbci.co.uk')) return null

  const m1 = u.pathname.match(/\/ace\/standard\/(\d+)\//)
  if (m1) {
    const w = parseInt(m1[1], 10)
    if (!Number.isNaN(w) && w > 0) return { width: w }
  }
  const m2 = u.pathname.match(/\/news\/(\d+)\//)
  if (m2) {
    const w = parseInt(m2[1], 10)
    if (!Number.isNaN(w) && w > 0) return { width: w }
  }
  const m3 = u.pathname.match(/\/images\/ic\/(\d+)x(\d+)\//)
  if (m3) {
    const w = parseInt(m3[1], 10)
    const h = parseInt(m3[2], 10)
    if (!Number.isNaN(w) && !Number.isNaN(h)) return { width: w, height: h }
  }

  return null
}

export function inferImageDimsFromUrl(url: string): ImageDims {
  if (!url) return {}
  try {
    const u = new URL(url)
    // Try known providers first
    return inferGuardian(u) ?? inferBBC(u) ?? {}
  } catch {
    return {}
  }
}

// Helper to evaluate whether an image is below thresholds given partially-known dims
export function isBelowMin(dims: ImageDims, minW: number, minH: number): boolean {
  const { width: w, height: h } = dims
  if (typeof w === 'number' && w > 0 && w < minW) return true
  if (typeof h === 'number' && h > 0 && h < minH) return true
  return false
}
