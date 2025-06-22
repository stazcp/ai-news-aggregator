import { StoryCluster } from '@/types'

const ImageCollage = ({ cluster }: { cluster: StoryCluster }) => {
  if (!cluster.imageUrls || cluster.imageUrls.length === 0) {
    return null
  }

  return (
    <div className="mb-4 grid grid-cols-2 grid-rows-2 gap-2 max-h-96 rounded-lg overflow-hidden border">
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

        return (
          <div key={url} className={className}>
            <img
              src={url}
              alt={`${cluster.clusterTitle} - Image ${index + 1}`}
              className="w-full h-full object-cover"
              style={{
                objectPosition: 'center 25%',
              }}
            />
          </div>
        )
      })}
    </div>
  )
}

export default ImageCollage
