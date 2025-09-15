import { NextResponse } from 'next/server'
import { refreshCacheInBackground } from '@/lib/backgroundRefresh'

export async function GET(request: Request): Promise<NextResponse> {
  console.log('📅 Daily cron job triggered')

  // Verify cron secret for security
  const authHeader = request.headers.get('authorization')
  const expectedAuth = `Bearer ${process.env.CRON_SECRET}`

  if (!process.env.CRON_SECRET) {
    console.error('❌ CRON_SECRET environment variable not configured')
    return NextResponse.json(
      {
        success: false,
        error: 'CRON_SECRET not configured',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    )
  }

  if (authHeader !== expectedAuth) {
    console.error('❌ Unauthorized cron request')
    return NextResponse.json(
      {
        success: false,
        error: 'Unauthorized',
        timestamp: new Date().toISOString(),
      },
      { status: 401 }
    )
  }

  const startTime = Date.now()
  console.log('🚀 Starting daily cache refresh...')

  try {
    // Run the background refresh process
    await refreshCacheInBackground()

    const duration = Date.now() - startTime
    console.log(`✅ Daily cache refresh completed in ${duration}ms`)

    return NextResponse.json({
      success: true,
      message: 'Daily cache refresh completed successfully',
      duration: `${duration}ms`,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    const duration = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'

    console.error(`❌ Daily cache refresh failed after ${duration}ms:`, error)

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    )
  }
}

// Also support POST for manual triggering via webhooks
export async function POST(request: Request): Promise<NextResponse> {
  console.log('📅 Manual refresh triggered via POST')
  return GET(request)
}
