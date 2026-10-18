// Vercel serverless function: link previews for shared posts.
// Messenger, iMessage, Instagram etc. read the <meta> tags below to show a picture and a title.
// People are sent straight on to the app (/p/<id>?app=1).
// Uses only the public (anon) key: the database decides what is public.

type Req = { query: Record<string, string | string[] | undefined>; headers: Record<string, string | undefined> }
type Res = { setHeader: (k: string, v: string) => void; status: (n: number) => Res; send: (body: string) => void }

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? ''
const KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? ''

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

async function signed(path: string): Promise<string | null> {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/posts/${path.split('/').map(encodeURIComponent).join('/')}`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ expiresIn: 60 * 60 * 24 * 7 }),
  })
  if (!res.ok) return null
  const json = (await res.json()) as { signedURL?: string }
  return json.signedURL ? `${SUPABASE_URL}/storage/v1${json.signedURL}` : null
}

export default async function handler(req: Req, res: Res) {
  const id = String(req.query.id ?? '')
  const host = req.headers['x-forwarded-host'] ?? req.headers.host ?? 'tonal-six.vercel.app'
  const origin = `https://${host}`
  const appUrl = /^[0-9a-f-]{36}$/.test(id) ? `/p/${id}?app=1` : '/'

  let title = 'Tonal'
  let description = 'Voice notes, photos with music and short clips from your campus.'
  let image = `${origin}/icons/icon-512.png`
  let video: string | null = null

  if (SUPABASE_URL && KEY && appUrl !== '/') {
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/public_post`, {
        method: 'POST',
        headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ pid: id }),
      })
      const post = r.ok ? ((await r.json()) as Record<string, string | null> | null) : null
      if (post) {
        const kind = post.kind === 'video' ? 'a clip' : post.kind === 'image' ? 'a photo' : 'a voice post'
        title = `@${post.username} shared ${kind} on Tonal`
        if (post.caption) description = post.caption.slice(0, 180)
        const pic = post.kind === 'video' ? post.poster_path : post.kind === 'image' ? post.media_path : null
        if (pic) image = (await signed(pic)) ?? image
        if (post.kind === 'video' && post.media_path) video = await signed(post.media_path)
      }
    } catch {
      // keep the general preview
    }
  }

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta property="og:site_name" content="Tonal">
<meta property="og:type" content="${video ? 'video.other' : 'website'}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${esc(image)}">
${video ? `<meta property="og:video" content="${esc(video)}"><meta property="og:video:type" content="video/mp4">` : ''}
<meta property="og:url" content="${esc(origin + '/p/' + id)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${esc(image)}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<script>location.replace(${JSON.stringify(appUrl)})</script>
</head><body><p><a href="${esc(appUrl)}">Open on Tonal</a></p></body></html>`

  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300')
  res.status(200).send(html)
}
