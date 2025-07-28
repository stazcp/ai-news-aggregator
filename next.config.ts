import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'cdn.cnn.com' },
      { protocol: 'http', hostname: 'www.bbc.com' },
      { protocol: 'https', hostname: 'static01.nyt.com' },
      { protocol: 'https', hostname: 'placehold.co' },
      { protocol: 'https', hostname: 'images.ctfassets.net' },
      { protocol: 'https', hostname: 'cdn.arstechnica.net' },
      { protocol: 'https', hostname: 'img-cdn.tnwcdn.com' },
      { protocol: 'https', hostname: 'i.guim.co.uk' },
      { protocol: 'https', hostname: 'media.wired.com' },
      { protocol: 'https', hostname: 'techcrunch.com' },
      { protocol: 'https', hostname: '9to5mac.com' },
      { protocol: 'https', hostname: 'cdn.mos.cms.futurecdn.net' },
      { protocol: 'https', hostname: 'assets.entrepreneur.com' },
      { protocol: 'https', hostname: 'images.macrumors.com' },
      { protocol: 'https', hostname: 'images.fastcompany.com' },
      { protocol: 'https', hostname: 'o.aolcdn.com' },
      { protocol: 'https', hostname: 'platform.theverge.com' },
      { protocol: 'https', hostname: 'www.androidauthority.com' },
    ],
  },
  serverExternalPackages: ['rss-parser'],
}

export default nextConfig
