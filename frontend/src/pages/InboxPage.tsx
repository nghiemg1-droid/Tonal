import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import StreakBean from '../components/StreakBean'
import { supabase } from '../lib/supabase'
import { timeAgo } from '../lib/time'
import { PERSON_FIELDS, personName } from '../lib/chat'
import type { Person } from '../lib/chat'
import GroupAvatar from '../components/GroupAvatar'

type Row = {
  last_read_at: string
  conversation: {
    id: string
    is_group: boolean
    name: string | null
    last_message_at: string | null
    last_sender_id: string | null
    last_message_preview: string | null
    conversation_members: { user_id: string; profile: Person }[]
  }
}

const FIELDS = `last_read_at, conversation:conversations(id, is_group, name, last_message_at, last_sender_id, last_message_preview, conversation_members(user_id, profile:profiles(${PERSON_FIELDS})))`

export default function InboxPage({ userId }: { userId: string }) {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [streaks, setStreaks] = useState<Record<string, number>>({})
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const { data, error } = await supabase
        .from('conversation_members')
        .select(FIELDS)
        .eq('user_id', userId)

      const { data: streakRows } = await supabase.rpc('my_dm_streaks')
      if (cancelled) return
      setStreaks(
        Object.fromEntries(((streakRows ?? []) as { conversation_id: string; streak: number }[]).map((r) => [r.conversation_id, r.streak])),
      )
      if (error) {
        setError(error.message)
      } else {
        const list = ((data ?? []) as unknown as Row[])
          // hide empty 1-to-1 chats (someone opened it but nobody wrote yet)
          .filter((r) => r.conversation && (r.conversation.is_group || r.conversation.last_message_at))
          .sort((a, b) =>
            (b.conversation.last_message_at ?? '').localeCompare(a.conversation.last_message_at ?? ''),
          )
        setRows(list)
      }
      setLoading(false)
    }

    load()

    // Any conversation I'm in gets a new message -> refresh the list
    const channel = supabase
      .channel('inbox')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, () => load())
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [userId])

  return (
    <div className="w-full animate-fade-up">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-bold text-ink">Messages</h2>
        <Link
          to="/messages/new-group"
          className="rounded-full bg-brand px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-dark active:scale-95 transition"
        >
          New group
        </Link>
      </div>

      {loading && <p className="text-sm text-muted">Loading…</p>}
      {error && <p className="text-sm text-red-500">{error}</p>}

      {!loading && !error && rows.length === 0 && (
        <p className="rounded-2xl border border-line bg-card p-6 text-center text-sm text-muted">
          No messages yet. Find someone in Search and tap 💬 to start a chat.
        </p>
      )}

      <ul className="flex flex-col">
        {rows.map((row) => {
          const c = row.conversation
          const others = c.conversation_members
            .filter((m) => m.user_id !== userId && m.profile)
            .map((m) => m.profile)
          const title = c.is_group
            ? c.name || others.map(personName).join(', ')
            : others[0]
              ? personName(others[0])
              : 'Tonal user'
          const unread =
            !!c.last_message_at &&
            c.last_sender_id !== userId &&
            new Date(c.last_message_at).getTime() > new Date(row.last_read_at).getTime()
          const preview =
            (c.last_sender_id === userId ? 'You: ' : '') + (c.last_message_preview ?? '')

          return (
            <li key={c.id}>
              <Link
                to={`/messages/${c.id}`}
                className="flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-card transition"
              >
                <GroupAvatar people={others} />
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-ink ${unread ? 'font-bold' : 'font-medium'}`}>
                    {title}
                    {streaks[c.id] && (
                      <span title={`${streaks[c.id]}-day chat streak`} className="ml-1.5 inline-flex items-center gap-0.5 align-middle text-sm font-semibold text-ink">
                        <StreakBean days={streaks[c.id]} size={18} />
                        {streaks[c.id]}
                      </span>
                    )}
                  </p>
                  <p className={`truncate text-sm ${unread ? 'font-semibold text-ink' : 'text-muted'}`}>
                    {preview}
                    {c.last_message_at && (
                      <span className="text-muted font-normal"> · {timeAgo(c.last_message_at)}</span>
                    )}
                  </p>
                </div>
                {unread && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-brand" />}
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
