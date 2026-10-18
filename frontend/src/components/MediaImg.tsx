import type { ImgHTMLAttributes } from 'react'
import { useMediaUrl } from '../lib/media'
import type { MediaBucket } from '../lib/media'

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & { bucket?: MediaBucket; path: string | null | undefined }

// <img> for a private post/story file (shows a soft placeholder while the link loads)
export default function MediaImg({ bucket = 'posts', path, className = '', alt = '', ...rest }: Props) {
  const url = useMediaUrl(bucket, path)
  if (!url) return <span aria-hidden className={`block animate-pulse bg-line ${className}`} />
  return <img src={url} alt={alt} className={className} {...rest} />
}
