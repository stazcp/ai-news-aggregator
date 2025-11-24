'use client'

import { useState, useEffect } from 'react'

interface RefreshIndicatorState {
  show: boolean
  stage: string
  progress: number
  isComplete: boolean
  isActive: boolean
}

interface RefreshStatusBarProps {
  showOnlyWhenWaiting?: boolean
  hasData?: boolean
  refreshState?: RefreshIndicatorState
}

const defaultIndicatorState: RefreshIndicatorState = {
  show: false,
  stage: 'Idle',
  progress: 0,
  isComplete: false,
  isActive: false,
}

export default function RefreshStatusBar({
  showOnlyWhenWaiting = false,
  hasData = true,
  refreshState = defaultIndicatorState,
}: RefreshStatusBarProps) {
  const { show, stage, progress, isComplete, isActive } = refreshState
  const [isVisible, setIsVisible] = useState(false)
  const [showCompletion, setShowCompletion] = useState(false)

  useEffect(() => {
    if (isActive) {
      const shouldShow = !showOnlyWhenWaiting || !hasData

      if (shouldShow) {
        setIsVisible(true)
        setShowCompletion(false)
      } else if (isVisible) {
        // User now has data but refresh is still active; hide the bar
        setIsVisible(false)
        setShowCompletion(false)
      }
    } else if (isComplete && isVisible) {
      // Show completion message briefly
      setShowCompletion(true)

      // Hide after 3 seconds
      const timeout = setTimeout(() => {
        setIsVisible(false)
        setShowCompletion(false)
      }, 3000)

      return () => clearTimeout(timeout)
    } else if (!isActive && !isComplete && isVisible) {
      // Refresh stopped without completion (error/cancel) - hide bar
      setIsVisible(false)
      setShowCompletion(false)
    }
  }, [isActive, isComplete, isVisible])

  if (!show || !isVisible) return null

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg transform transition-all duration-300 ease-in-out">
      <div className="max-w-7xl mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {showCompletion ? (
              <>
                <div className="animate-bounce">
                  <span className="text-green-300 text-lg">✨</span>
                </div>
                <div className="flex flex-col">
                  <span className="font-medium">Fresh stories ready!</span>
                  <span className="text-xs opacity-75">
                    Content has been updated with the latest news
                  </span>
                </div>
              </>
            ) : (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                <div className="flex flex-col">
                  <span className="font-medium">{stage || 'Getting fresh stories...'}</span>
                  <span className="text-xs opacity-75">
                    You can continue reading while we update in the background
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Progress indicator - only show during active refresh */}
          {isActive && progress !== null && (
            <div className="flex items-center gap-3">
              <div className="w-32 bg-white/20 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-white h-2 rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${Math.min(Math.max(progress, 0), 100)}%` }}
                />
              </div>
              <span className="text-sm font-mono min-w-[3rem] tabular-nums">
                {Math.round(progress)}%
              </span>
            </div>
          )}

          {/* Dismiss button for completion state */}
          {showCompletion && (
            <button
              onClick={() => {
                setIsVisible(false)
                setShowCompletion(false)
              }}
              className="text-white/70 hover:text-white transition-colors p-1 rounded"
              aria-label="Dismiss notification"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
