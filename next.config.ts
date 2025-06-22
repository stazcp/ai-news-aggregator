import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    domains: [
      'images.unsplash.com',
      'cdn.cnn.com',
      'www.bbc.com',
      'static01.nyt.com',
      'placehold.co',
    ],
  },
  serverExternalPackages: ['rss-parser'],
}

export default nextConfig
