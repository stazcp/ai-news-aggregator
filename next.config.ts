import type { NextConfig } from 'next'

const runtimeQuality = parseInt(process.env.NEXT_PUBLIC_IMAGE_QUALITY || '85', 10)
const qualities = Array.from(new Set([75, runtimeQuality])).filter((q) => !Number.isNaN(q))

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
      { protocol: 'http', hostname: '**' },
    ],
    qualities,
  },
  serverExternalPackages: ['rss-parser'],
}

export default nextConfig
