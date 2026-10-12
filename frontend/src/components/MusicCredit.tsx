import type { Track } from '../lib/music'

type Props = {
  track: Track
  compact?: boolean // one small line under a name
  light?: boolean // white text, for stories
}

// "♪ Title · Artist" with a link to the page that credits the song (required by the license)
export default function MusicCredit({ track, compact = false, light = false }: Props) {
  const color = light ? 'text-white/90' : 'text-muted'
  return (
    <a
      href={track.sourceUrl}
      target="_blank"
      rel="noopener noreferrer"
      title={`${track.title} by ${track.artist} · ${track.license}`}
      className={`flex min-w-0 items-center gap-1 hover:underline ${color} ${compact ? 'text-xs' : 'text-sm'}`}
    >
      <span aria-hidden>♪</span>
      <span className="truncate">
        {track.title}
        {track.artist && ` · ${track.artist}`}
      </span>
      {!compact && track.license && <span className="shrink-0 opacity-70">({track.license})</span>}
    </a>
  )
}
