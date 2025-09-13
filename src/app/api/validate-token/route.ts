import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { token } = await request.json().catch(() => ({}))

    const envToken = process.env.CACHE_CLEAR_TOKEN

    // Check if env token is configured
    if (!envToken || envToken.trim() === '') {
      return NextResponse.json(
        {
          valid: false,
          error: 'Token validation not available - server not configured',
        },
        { status: 503 }
      )
    }

    // Check if request token is provided and valid
    if (!token || typeof token !== 'string' || token.trim() === '') {
      return NextResponse.json({
        valid: false,
        error: 'Token is required',
      })
    }

    // Validate token
    const isValid = token === envToken

    if (isValid) {
      return NextResponse.json({
        valid: true,
        message: 'Token is valid',
        permissions: ['cache:clear'], // What this token can do
        expiresAt: null, // Environment tokens don't expire
      })
    } else {
      return NextResponse.json({
        valid: false,
        error: 'Invalid token',
      })
    }
  } catch (error) {
    console.error('Token validation error:', error)
    return NextResponse.json(
      {
        valid: false,
        error: 'Token validation failed',
      },
      { status: 500 }
    )
  }
}

export async function GET() {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 })
  }

  return NextResponse.json({
    message: 'POST to validate a cache clearing token',
    example: '{"token": "your-token-here"}',
  })
}
