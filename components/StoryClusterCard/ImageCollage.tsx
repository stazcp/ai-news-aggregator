import { StoryCluster } from '@/types'

const ImageCollage = ({ cluster }: { cluster: StoryCluster }) => {
  if (!cluster.imageUrls || cluster.imageUrls.length === 0) {
    return null
  }

  // Get articles that have images, in the same order as imageUrls
  const articlesWithImages =
    cluster.articles
      ?.filter((article) => article.urlToImage && !article.urlToImage.includes('placehold.co'))
      .slice(0, 4) || []

  return (
    <div className="mb-4 grid grid-cols-2 grid-rows-2 gap-2 h-80 lg:h-96 xl:h-[500px] rounded-lg overflow-hidden border">
      {cluster.imageUrls.map((url, index) => {
        const isFirst = index === 0
        const count = cluster.imageUrls?.length || 0
        const singleImage = count === 1
        const twoImages = count === 2
        const threeImages = count === 3

        let className = 'w-full h-full'

        if (singleImage) {
          className += ' col-span-2 row-span-2'
        } else if (twoImages) {
          className += ' col-span-1 row-span-2'
        } else if (threeImages && isFirst) {
          className += ' col-span-1 row-span-2'
        } else {
          className += ' col-span-1 row-span-1'
        }

        // Get the corresponding article for this image
        const correspondingArticle = articlesWithImages[index]

        return (
          <div key={url} className={className}>
            {correspondingArticle ? (
              <a
                href={correspondingArticle.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full h-full group relative overflow-hidden rounded-sm"
              >
                <img
                  src={url}
                  alt={`${cluster.clusterTitle} - ${correspondingArticle.source.name}`}
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                  style={{
                    objectPosition: 'center 25%',
                  }}
                />
                {/* Overlay with source name on hover */}
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-3">
                  <div className="text-white">
                    <p className="text-xs font-medium">{correspondingArticle.source.name}</p>
                    <p className="text-xs opacity-75 line-clamp-2 mt-1">
                      {correspondingArticle.title}
                    </p>
                  </div>
                </div>
                {/* External link icon */}
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  <svg
                    className="w-4 h-4 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                    />
                  </svg>
                </div>
              </a>
            ) : (
              <img
                src={url}
                alt={`${cluster.clusterTitle} - Image ${index + 1}`}
                className="w-full h-full object-cover"
                style={{
                  objectPosition: 'center 25%',
                }}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

export default ImageCollage
