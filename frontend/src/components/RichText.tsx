import { Link } from 'react-router'
import { parseRichText } from '../lib/richText'

// Text where #hashtags and @mentions are links
export default function RichText({ text }: { text: string }) {
  return (
    <>
      {parseRichText(text).map((piece, i) =>
        piece.type === 'text' ? (
          <span key={i}>{piece.text}</span>
        ) : (
          <Link
            key={i}
            to={piece.type === 'tag' ? `/tags/${encodeURIComponent(piece.tag)}` : `/u/${piece.username}`}
            className="font-medium text-brand hover:underline"
          >
            {piece.text}
          </Link>
        ),
      )}
    </>
  )
}
