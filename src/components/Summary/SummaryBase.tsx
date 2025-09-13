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
    // Hide the entire summary block on error (e.g., AI spend/limit outage)
    return <div ref={elementRef} />
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
