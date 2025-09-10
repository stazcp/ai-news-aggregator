import { Badge } from '@/components/ui'

interface ArticleHeaderProps {
  category: string
  sourceName: string
  publishedAt: string
  variant?: 'compact' | 'full'
}

export default function ArticleHeader({
  category,
  sourceName,
  publishedAt,
  variant = 'full',
}: ArticleHeaderProps) {
  const dateFormat: Intl.DateTimeFormatOptions =
    variant === 'compact'
      ? {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        }
      : {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
      <Badge variant="outline" className="text-accent border-accent/20 bg-accent/10">
        {category}
      </Badge>
      <span>•</span>
      <span className="truncate">{sourceName}</span>
      <span>•</span>
      <time className="text-xs text-muted-foreground">
        {new Date(publishedAt).toLocaleDateString('en-US', dateFormat)}
      </time>
    </div>
  )
}
