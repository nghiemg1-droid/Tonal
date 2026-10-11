import Avatar from './Avatar'
import { personName } from '../lib/chat'
import type { Person } from '../lib/chat'

type Props = {
  people: Person[]
  small?: boolean
}

// Two overlapping faces for a group, one face for a 1-to-1 chat
export default function GroupAvatar({ people, small = false }: Props) {
  const box = small ? 'h-9 w-9' : 'h-14 w-14'
  const one = small ? 'h-9 w-9 text-sm' : 'h-14 w-14 text-xl'
  const half = small ? 'h-6 w-6 text-[10px]' : 'h-10 w-10 text-sm'
  const [a, b] = people

  if (!a) return <Avatar name="?" url={null} className={one} />
  if (!b) return <Avatar name={personName(a)} url={a.avatar_url} className={one} />

  return (
    <div className={`relative shrink-0 ${box}`}>
      <Avatar name={personName(a)} url={a.avatar_url} className={`absolute top-0 left-0 ${half}`} />
      <Avatar
        name={personName(b)}
        url={b.avatar_url}
        className={`absolute right-0 bottom-0 ring-2 ring-card ${half}`}
      />
    </div>
  )
}
