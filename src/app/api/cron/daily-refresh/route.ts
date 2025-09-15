import { NextResponse } from 'next/server'
import { refreshCacheInBackground } from '@/lib/backgroundRefresh'

/**
 * Daily cache refresh cron job endpoint
 *
 * This endpoint is called by Vercel cron jobs daily at 6 AM UTC.
 * Vercel automatically adds an authorization header for security.
 *
 * Manual calls can also be made with: Authorization: Bearer ${CRON_SECRET}
 *
 * Configured in vercel.json:
 * {
 *   "crons": [
 *     {
 *       "path": "/api/cron/daily-refresh",
 *       "schedule": "0 6 * * *"
 *     }
 *   ]
 * }
 */

export async function GET(request: Request): Promise<NextResponse> {
  console.log('📅 Daily cron job triggered')

  // Verify this is a legitimate cron request
  // Vercel automatically adds authorization header for cron jobs
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  // Check if it's a Vercel cron job (has authorization header) or manual call with secret
  const isVercelCron = authHeader && authHeader.startsWith('Bearer ')
  const isManualWithSecret = cronSecret && authHeader === `Bearer ${cronSecret}`

  if (!isVercelCron && !isManualWithSecret) {
    console.error('❌ Unauthorized cron request - missing or invalid authorization')
    console.log('📋 Request headers:', Object.fromEntries(request.headers.entries()))

    return NextResponse.json(
      {
        success: false,
        error: 'Unauthorized - cron requests must include proper authorization',
        timestamp: new Date().toISOString(),
      },
      { status: 401 }
    )
  }

  console.log('✅ Cron request authorized', isVercelCron ? '(Vercel cron)' : '(manual with secret)')

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
