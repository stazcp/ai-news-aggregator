interface ArticleFooterProps {
  url: string
  variant?: 'compact' | 'full'
}

export default function ArticleFooter({ url, variant = 'full' }: ArticleFooterProps) {
  const linkClasses =
    variant === 'compact'
      ? 'inline-flex items-center text-xs font-semibold text-accent hover:underline'
      : 'inline-flex items-center text-sm font-semibold text-accent hover:underline'

  const linkText = variant === 'compact' ? 'Read Article →' : 'Read Full Article →'

  return (
    <footer className="mt-auto pt-3">
      <a href={url} target="_blank" rel="noopener noreferrer" className={linkClasses}>
        {linkText}
      </a>
    </footer>
  )
}
