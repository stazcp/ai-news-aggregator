import 'tsconfig-paths/register'
import { refreshCacheInBackground } from '@/lib/homepage/backgroundRefresh'

async function main(): Promise<void> {
  console.log('🚀 Starting homepage cache refresh (CLI)')
  const start = Date.now()

  await refreshCacheInBackground()

  const duration = Date.now() - start
  console.log(`✅ Homepage cache refresh completed in ${duration}ms`)
}

main().catch((error) => {
  console.error('❌ Homepage cache refresh failed', error)
  process.exit(1)
})
