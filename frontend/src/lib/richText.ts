// Split text into plain parts, #hashtags and @mentions (same rules as the database)

export type Piece =
  | { type: 'text'; text: string }
  | { type: 'tag'; text: string; tag: string }
  | { type: 'mention'; text: string; username: string }

const PATTERN = /#([0-9A-Za-z_À-ɏḀ-ỿ]{1,50})|@([A-Za-z0-9_]{3,20})/g

export function parseRichText(input: string): Piece[] {
  const pieces: Piece[] = []
  let last = 0
  for (const match of input.matchAll(PATTERN)) {
    const start = match.index ?? 0
    // "#" or "@" in the middle of a word (like an email) is just text
    const before = start > 0 ? input[start - 1] : ' '
    if (/[0-9A-Za-z_]/.test(before)) continue

    if (start > last) pieces.push({ type: 'text', text: input.slice(last, start) })
    if (match[1]) pieces.push({ type: 'tag', text: match[0], tag: match[1].toLowerCase() })
    else pieces.push({ type: 'mention', text: match[0], username: match[2].toLowerCase() })
    last = start + match[0].length
  }
  if (last < input.length) pieces.push({ type: 'text', text: input.slice(last) })
  return pieces
}
