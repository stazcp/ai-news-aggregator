import { cn } from '@/lib/utils'

interface SkeletonProps {
  className?: string
}

export function Skeleton({ className }: SkeletonProps) {
  return <div className={cn('animate-pulse rounded-md bg-gray-200 dark:bg-gray-800', className)} />
}

export function ArticleCardSkeleton() {
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden">
      <Skeleton className="w-full h-48" />
      <div className="p-4 space-y-3">
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
        </div>
        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-4 rounded-full" />
            <Skeleton className="h-3 w-20" />
          </div>
          <Skeleton className="h-3 w-16" />
        </div>
      </div>
    </div>
  )
}

export function StoryClusterCardSkeleton({ withImages = true }: { withImages?: boolean } = {}) {
  return (
    <section className="mb-16 border-b border-border pb-16 last:border-b-0">
      <header className="mb-6 space-y-3">
        <div className="flex items-center gap-4">
          {/* Badge shape (Top Story/Breaking News) */}
          <Skeleton className="h-6 w-28 rounded-full" />
          {/* Sources • Date */}
          <div className="flex items-center gap-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-1.5 w-1.5 rounded-full" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
        {/* Headline (two lines for long titles) */}
        <div className="space-y-2">
          <Skeleton className="h-10 w-full max-w-3xl" />
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
        {withImages ? (
          <div className="lg:col-span-1">
            <div className="grid grid-cols-[2fr,1fr] grid-rows-2 gap-2 h-80 lg:h-96 xl:h-[500px] rounded-lg overflow-hidden border">
              <Skeleton className="col-span-1 row-span-2 w-full h-full" />
              <Skeleton className="col-start-2 row-start-1 w-full h-full" />
              <Skeleton className="col-start-2 row-start-2 w-full h-full" />
            </div>
          </div>
        ) : (
          <div className="lg:col-span-1">
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex gap-4 items-start">
                  <Skeleton className="w-20 h-16 rounded-md" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3 w-5/6" />
                    <Skeleton className="h-3 w-2/3" />
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-2 w-16" />
                      <Skeleton className="h-2 w-12" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="lg:col-span-2">
          <div className="rounded-2xl border border-border bg-card/60 backdrop-blur p-6 sm:p-7 shadow-sm">
            <CategorySummaryContentSkeleton />
          </div>
        </div>

        <div className="lg:col-span-3 space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex gap-4 items-start">
              <Skeleton className="w-20 h-16 rounded-md" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-3 w-full" />
                <div className="flex items-center gap-3">
                  <Skeleton className="h-2 w-20" />
                  <Skeleton className="h-2 w-12" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export function NewsListSkeleton() {
  return (
    <div className="container mx-auto px-4 py-6">
      <div className="mb-8">
        <div className="mb-8">
          <div className="mb-8">
            <div className="space-y-6">
              <StoryClusterCardSkeleton />
            </div>
          </div>
        </div>
        <Skeleton className="h-6 w-48 mb-4" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <ArticleCardSkeleton key={i} />
          ))}
        </div>
      </div>

      <div>
        <Skeleton className="h-6 w-36 mb-4" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <ArticleCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  )
}

export function HomeHeaderSkeleton() {
  return (
    <header className="text-center mb-12">
      <h1 className="text-5xl font-extrabold tracking-tight text-[var(--foreground)] sm:text-6xl md:text-7xl">
        AI-Curated News
      </h1>
      <p className="mt-4 text-lg text-[var(--muted-foreground)]">
        Your daily feed of news, intelligently grouped and summarized by AI.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2 mt-6">
        <div className="flex items-center gap-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-8 w-20 rounded-full" />
          ))}
        </div>
      </div>
    </header>
  )
}

export function CategorySummaryContentSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Skeleton className="h-6 w-32 rounded-full" />
          <Skeleton className="h-3 w-24" />
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-7 w-20 rounded-md" />
        </div>
      </div>
      {Array.from({ length: 10 }).map((_, i) => (
        <Skeleton key={i} className="h-4 w-full" />
      ))}
      <div className="flex items-center gap-2">
        <Skeleton className="h-2 w-2 rounded-full" />
        <Skeleton className="h-3 w-32" />
      </div>
    </div>
  )
}

export function CategorySummarySkeleton() {
  return (
    <section className="max-w-5xl mx-auto mb-12 w-full px-4 sm:px-6 lg:px-0">
      <div className="rounded-2xl border border-border bg-card/60 backdrop-blur p-6 sm:p-7 shadow-sm">
        <CategorySummaryContentSkeleton />
      </div>
    </section>
  )
}
