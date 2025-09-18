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
  const baseClasses = ['space-y-4']
  if (className) baseClasses.push(className)
  const containerClass = baseClasses.join(' ').trim()

  if (error) {
    // Hide the entire summary block on error (e.g., AI spend/limit outage)
    return <div ref={elementRef} />
  }

  if (isLoading) {
    return (
      <div ref={elementRef} className={containerClass}>
        {headerBadge}
        <div className="prose prose-lg max-w-none">{loadingContent}</div>
      </div>
    )
  }

  // If there is no summary content yet, always show the placeholder so
  // manual/on-demand controls remain visible when in viewport. Auto mode
  // will render the loading state above when intersecting.
  if (!children) {
    return (
      <div ref={elementRef} className={containerClass}>
        {headerBadge}
        <div className="prose prose-lg max-w-none">{placeholderContent}</div>
      </div>
    )
  }

  return (
    <div ref={elementRef} className={containerClass}>
      {children}
    </div>
  )
}
