import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // News sites - use wildcards for major domains
      { protocol: 'https', hostname: '*.bbc.co.uk' },
      { protocol: 'https', hostname: '*.bbci.co.uk' },
      { protocol: 'https', hostname: '*.cnn.com' },
      { protocol: 'https', hostname: '*.techcrunch.com' },
      { protocol: 'https', hostname: '*.theverge.com' },
      { protocol: 'https', hostname: '*.vox-cdn.com' },
      { protocol: 'https', hostname: '*.arstechnica.net' },
      { protocol: 'https', hostname: '*.wired.com' },
      { protocol: 'https', hostname: '*.guim.co.uk' },
      { protocol: 'https', hostname: '*.theguardian.com' },
      { protocol: 'https', hostname: '*.newscientist.com' },
      { protocol: 'https', hostname: '*.venturebeat.com' },
      { protocol: 'https', hostname: '*.npr.org' },
      { protocol: 'https', hostname: '*.livescience.com' },
      { protocol: 'https', hostname: '*.sciencedaily.com' },
      { protocol: 'https', hostname: '*.futurecdn.net' },
      { protocol: 'https', hostname: '*.lemde.fr' },
      { protocol: 'https', hostname: '*.jpost.com' },
      { protocol: 'https', hostname: '*.politico.com' },
      { protocol: 'https', hostname: '*.foxnews.com' },
      { protocol: 'https', hostname: '*.abcnews.com' },
      { protocol: 'https', hostname: '*.reuters.com' },
      { protocol: 'https', hostname: '*.ap.org' },

      // CDN patterns
      { protocol: 'https', hostname: 'ichef.bbci.co.uk' },
      { protocol: 'https', hostname: 'duet-cdn.vox-cdn.com' },
      { protocol: 'https', hostname: 'cdn.mos.cms.futurecdn.net' },
      { protocol: 'https', hostname: 'npr.brightspotcdn.com' },

      // Common image services
      { protocol: 'https', hostname: 'placehold.co' },
      { protocol: 'https', hostname: 'images.unsplash.com' },

      // Fallback for other HTTPS images from reputable news sources
      { protocol: 'https', hostname: '*.com' },
      { protocol: 'https', hostname: '*.org' },
      { protocol: 'https', hostname: '*.net' },

      // HTTP fallbacks for specific safe sites
      { protocol: 'http', hostname: 'www.bbc.com' },
    ],
  },
  serverExternalPackages: ['rss-parser'],
}

export default nextConfig
