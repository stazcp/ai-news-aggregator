import { ReactNode } from 'react'

interface SummaryBaseProps {
  elementRef: React.RefObject<HTMLDivElement | null>
  isLoading: boolean
  error: string | null
  isIntersecting: boolean
  eager?: boolean
  className?: string
  headerBadge?: ReactNode
  loadingContent: ReactNode
  placeholderContent: ReactNode
  children?: ReactNode
  showContainer?: boolean
}

export function SummaryBase({
  elementRef,
  isLoading,
  error,
  isIntersecting,
  eager,
  className = '',
  headerBadge,
  loadingContent,
  placeholderContent,
  children,
  showContainer = true,
}: SummaryBaseProps) {
  if (error) {
    return (
      <div ref={elementRef} className={`space-y-4 ${showContainer ? '' : ''}`}>
        {headerBadge}
        <div className="prose prose-lg max-w-none">
          <p className="text-sm text-red-400">Failed to generate AI summary.</p>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div ref={elementRef} className={`space-y-4 ${showContainer ? '' : ''}`}>
        {headerBadge}
        <div className="prose prose-lg max-w-none">{loadingContent}</div>
      </div>
    )
  }

  if (!children) {
    if (!isIntersecting && !eager) {
      return (
        <div ref={elementRef} className={`space-y-4 ${showContainer ? '' : ''}`}>
          {headerBadge}
          <div className="prose prose-lg max-w-none">{placeholderContent}</div>
        </div>
      )
    }
    return null
  }

  return (
    <div ref={elementRef} className={`${className}`}>
      {children}
    </div>
  )
}
