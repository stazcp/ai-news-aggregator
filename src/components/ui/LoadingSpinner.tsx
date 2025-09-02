export const LoadingSpinner = ({
  variant,
  articleCount,
}: {
  variant: 'article' | 'cluster'
  articleCount?: number
}) => (
  <div className="flex items-center space-x-2">
    <div
      className={`animate-spin rounded-full border-b-2 border-accent ${variant === 'cluster' ? 'h-5 w-5' : 'h-4 w-4'}`}
    ></div>
    <p
      className={`text-muted-foreground ${variant === 'cluster' ? 'text-lg animate-pulse' : 'text-sm'}`}
    >
      {variant === 'cluster'
        ? `AI is analyzing ${articleCount || 0} articles to create a comprehensive summary...`
        : 'Generating summary...'}
    </p>
  </div>
)
