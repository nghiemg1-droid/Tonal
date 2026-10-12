// Open-license music search (no API key needed).
// Songs come from libraries of Creative Commons music; we keep the credits with every use.

export type Track = {
  url: string // the audio file
  title: string
  artist: string
  license: string // e.g. "CC BY 4.0"
  sourceUrl: string // page that credits the song
  durationMs: number | null
}

const API = 'https://api.openverse.org/v1/audio/'

type ApiResult = {
  url?: string
  title?: string
  creator?: string
  license?: string
  license_version?: string
  foreign_landing_url?: string
  duration?: number | null
}

export function licenseLabel(license?: string, version?: string): string {
  if (!license) return 'Open license'
  if (license === 'cc0') return 'CC0'
  if (license === 'pdm') return 'Public domain'
  return `CC ${license.toUpperCase()}${version ? ` ${version}` : ''}`
}

export function toTrack(r: ApiResult): Track | null {
  if (!r.url?.startsWith('https://') || !r.foreign_landing_url?.startsWith('https://')) return null
  return {
    url: r.url,
    title: (r.title || 'Untitled').slice(0, 200),
    artist: (r.creator || 'Unknown artist').slice(0, 200),
    license: licenseLabel(r.license, r.license_version).slice(0, 50),
    sourceUrl: r.foreign_landing_url,
    durationMs: r.duration ?? null,
  }
}

export async function searchMusic(query: string): Promise<Track[]> {
  const params = new URLSearchParams({
    q: query.trim() || 'chill',
    category: 'music',
    page_size: '20',
    mature: 'false',
  })
  const res = await fetch(`${API}?${params}`)
  if (!res.ok) throw new Error('Music search is not available right now')
  const data = (await res.json()) as { results?: ApiResult[] }
  return (data.results ?? []).map(toTrack).filter((t): t is Track => t !== null)
}

// Columns used on posts and stories
export type MusicColumns = {
  music_url: string | null
  music_title: string | null
  music_artist: string | null
  music_license: string | null
  music_source_url: string | null
}

export function trackToColumns(track: Track | null): MusicColumns {
  return {
    music_url: track?.url ?? null,
    music_title: track?.title ?? null,
    music_artist: track?.artist ?? null,
    music_license: track?.license ?? null,
    music_source_url: track?.sourceUrl ?? null,
  }
}

export function columnsToTrack(c: Partial<MusicColumns>): Track | null {
  if (!c.music_url || !c.music_title) return null
  return {
    url: c.music_url,
    title: c.music_title,
    artist: c.music_artist ?? '',
    license: c.music_license ?? '',
    sourceUrl: c.music_source_url ?? c.music_url,
    durationMs: null,
  }
}
