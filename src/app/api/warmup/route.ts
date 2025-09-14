import { NextResponse } from 'next/server'
import { fetchAllNews } from '@/lib/newsService'

export async function GET() {
  try {
    await fetchAllNews()
    return NextResponse.json({ status: 'warmed' })
  } catch (error) {
    console.error('Warmup failed', error)
    return NextResponse.json({ status: 'error' }, { status: 500 })
  }
}
