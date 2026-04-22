import 'tsconfig-paths/register'
import { isProjectPaused } from '@/lib/config/projectState'

async function main(): Promise<void> {
  if (isProjectPaused()) {
    console.log('Project paused. Homepage refresh CLI exited without running.')
    return
  }

  const { refreshCacheInBackground } = await import('@/lib/homepage/backgroundRefresh')

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
