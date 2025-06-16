import Link from 'next/link'
import Image from 'next/image'
import { Article } from '@/types'

interface ArticleCardProps {
  article: Article
  showSummary?: boolean
}

export default function ArticleCard({ article, showSummary = false }: ArticleCardProps) {
  // Better validation for image URL
  const hasValidImage =
    article.urlToImage &&
    article.urlToImage.trim() !== '' &&
    (article.urlToImage.startsWith('http://') || article.urlToImage.startsWith('https://'))

  return (
    <article className="bg-zinc-900 rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow">
      {hasValidImage && (
        <div className="relative h-48">
          <Image
            src={article.urlToImage}
            alt={article.title}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          />
        </div>
      )}

      <div className="p-6">
        <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
          <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-medium">
            {article.category}
          </span>
          <span>•</span>
          <span>{article.source.name}</span>
          <span>•</span>
          <time>{new Date(article.publishedAt).toLocaleDateString()}</time>
        </div>

        <h3 className="text-xl font-semibold mb-2 line-clamp-2">{article.title}</h3>

        <p className="text-gray-700 line-clamp-3 mb-4">{article.description}</p>

        {showSummary && article.summary && (
          <div className="bg-yellow-50 p-3 rounded border-l-4 border-yellow-400 mb-4">
            <p className="text-sm text-gray-700">
              <strong>AI Summary:</strong> {article.summary}
            </p>
          </div>
        )}

        <a
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:text-blue-800 font-medium"
        >
          Read full article →
        </a>
      </div>
    </article>
  )
}
