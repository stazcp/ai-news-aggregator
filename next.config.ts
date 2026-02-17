import type { NextConfig } from 'next'
import { ENV_DEFAULTS, envInt } from './src/lib/config/env'

const runtimeQuality = envInt('NEXT_PUBLIC_IMAGE_QUALITY', ENV_DEFAULTS.nextPublicImageQuality)
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
