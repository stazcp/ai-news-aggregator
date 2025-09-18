import { NextResponse } from 'next/server'
import { getRefreshStatus } from '@/lib/homepage/backgroundRefresh'

interface RefreshStatusResponse {
  status: 'idle' | 'refreshing' | 'error'
  stage: string
  progress: number
  lastUpdate: string | null
  timestamp: number
  cacheAge?: number
  justCompleted?: boolean
}

export async function GET(): Promise<NextResponse<RefreshStatusResponse>> {
  try {
    const refreshData = await getRefreshStatus()

    if (!refreshData) {
      return NextResponse.json({
        status: 'idle',
        stage: 'No refresh data available',
        progress: 0,
        lastUpdate: null,
        timestamp: Date.now(),
      })
    }

    // Determine status based on the stage
    let status: 'idle' | 'refreshing' | 'error' = 'idle'
    let justCompleted = false

    if (refreshData.error) {
      status = 'error'
    } else if (refreshData.stage === 'idle') {
      status = 'idle'
    } else if (refreshData.stage === 'Fresh stories ready!') {
      status = 'idle'
      justCompleted = true
    } else {
      status = 'refreshing'
    }

    // Calculate cache age if we have a start time
    let cacheAge: number | undefined
    if (refreshData.startTime && status === 'idle') {
      cacheAge = Math.floor((Date.now() - refreshData.startTime) / (1000 * 60)) // minutes
    }

    const response: RefreshStatusResponse = {
      status,
      stage: refreshData.stage || 'Unknown',
      progress: refreshData.progress || 0,
      lastUpdate: refreshData.startTime ? new Date(refreshData.startTime).toISOString() : null,
      timestamp: refreshData.timestamp || Date.now(),
      cacheAge,
      justCompleted,
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('❌ Refresh status API error:', error)

    return NextResponse.json({
      status: 'error',
      stage: 'Failed to get refresh status',
      progress: 0,
      lastUpdate: null,
      timestamp: Date.now(),
    })
  }
}
