import { Article } from '@/types'
import Summary from '@/components/Summary/Summary'

interface ArticleContentProps {
  article: Article
  showSummary?: boolean
  eager?: boolean
  variant?: 'compact' | 'full'
}

export default function ArticleContent({
  article,
  showSummary = true,
  eager = false,
  variant = 'full',
}: ArticleContentProps) {
  const titleClasses =
    variant === 'compact'
      ? 'text-base font-bold mb-2 flex-grow line-clamp-4 text-foreground leading-tight'
      : 'text-lg font-bold mb-2 flex-grow line-clamp-3 text-foreground'

  const descriptionClasses =
    variant === 'compact'
      ? 'text-sm text-muted-foreground line-clamp-2 mb-3'
      : 'text-sm text-muted-foreground line-clamp-3 mb-4'

  const summaryClasses = variant === 'compact' ? 'text-xs' : ''

  return (
    <>
      <h3 className={titleClasses}>{article.title}</h3>

      <p className={descriptionClasses}>{article.description}</p>

      {showSummary && (
        <Summary
          articleId={article.id}
          content={article.content ?? ''}
          eager={eager}
          className={summaryClasses}
        />
      )}
    </>
  )
}
