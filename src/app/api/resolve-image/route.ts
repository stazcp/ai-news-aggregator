import { NextRequest, NextResponse } from 'next/server'
import { resolveImageUrl } from '@/lib/imageResolver'

export async function GET(req: NextRequest) {
  const original = req.nextUrl.searchParams.get('url')
  const widthParam = req.nextUrl.searchParams.get('width')
  const desiredWidth = Math.max(1, Number(widthParam || '0')) || 600

  if (!original) {
    return NextResponse.json({ error: 'Missing url' }, { status: 400 })
  }

  try {
    const resolved = await resolveImageUrl(original, desiredWidth)
    return NextResponse.json({ url: resolved })
  } catch (e) {
    return NextResponse.json({ url: original }, { status: 200 })
  }
}
