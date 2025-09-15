import { NextResponse } from 'next/server'
import { refreshCacheInBackground } from '@/lib/backgroundRefresh'

/**
 * Daily cache refresh cron job endpoint
 *
 * SECURITY: Requires CRON_SECRET environment variable to be configured.
 * Vercel automatically includes CRON_SECRET as Bearer token for cron jobs.
 *
 * This endpoint is called by Vercel cron jobs daily at 6 AM UTC.
 * Manual calls require: Authorization: Bearer ${CRON_SECRET}
 *
 * Setup:
 * 1. Set CRON_SECRET environment variable in Vercel (min 16 chars)
 * 2. Configure cron job in vercel.json
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

  // Security: Require CRON_SECRET for all requests
  // Vercel automatically includes CRON_SECRET as Bearer token for cron jobs
  if (!cronSecret) {
    console.error('❌ CRON_SECRET environment variable not configured')
    return NextResponse.json(
      {
        success: false,
        error: 'CRON_SECRET not configured - cron job cannot run securely',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    )
  }

  // Validate authorization header exactly matches CRON_SECRET
  const expectedAuth = `Bearer ${cronSecret}`
  if (authHeader !== expectedAuth) {
    console.error('❌ Unauthorized cron request - invalid or missing authorization token')
    console.log('📋 Expected:', expectedAuth.substring(0, 20) + '...')
    console.log('📋 Received:', authHeader?.substring(0, 20) + '...' || 'none')

    return NextResponse.json(
      {
        success: false,
        error: 'Unauthorized - invalid cron secret',
        timestamp: new Date().toISOString(),
      },
      { status: 401 }
    )
  }

  console.log('✅ Cron request authorized with valid CRON_SECRET')

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
