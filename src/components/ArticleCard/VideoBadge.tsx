import { Play } from 'lucide-react'

/**
 * Small play indicator overlaid on the article image for video articles.
 * Render inside the card's `relative` image wrapper.
 */
export default function VideoBadge() {
  return (
    <div className="absolute bottom-2 left-2 z-10 flex items-center gap-1 rounded-md bg-black/70 px-2 py-1 text-xs font-medium text-white pointer-events-none">
      <Play className="h-3 w-3 fill-current" aria-hidden="true" />
      <span>Video</span>
    </div>
  )
}
