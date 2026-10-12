import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { PERSON_FIELDS, personName, searchPeople, startChat } from '../lib/chat'
import type { Person } from '../lib/chat'
import Avatar from './Avatar'
import GroupAvatar from './GroupAvatar'

type Chat = { id: string; title: string; people: Person[] }

type Props = {
  userId: string
  postId: string
  onClose: () => void
}

// Send a post to one of your chats (or to someone new)
export default function SharePostDialog({ userId, postId, onClose }: Props) {
  const [chats, setChats] = useState<Chat[]>([])
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Person[]>([])
  const [note, setNote] = useState('')
  const [sentTo, setSentTo] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  // Recent chats
  useEffect(() => {
    let cancelled = false
    supabase
      .from('conversation_members')
      .select(
        `conversation:conversations(id, is_group, name, last_message_at, conversation_members(user_id, profile:profiles(${PERSON_FIELDS})))`,
      )
      .eq('user_id', userId)
      .then(({ data }) => {
        if (cancelled) return
        type Row = {
          conversation: {
            id: string
            is_group: boolean
            name: string | null
            last_message_at: string | null
            conversation_members: { user_id: string; profile: Person }[]
          }
        }
        const list = ((data ?? []) as unknown as Row[])
          .map((r) => r.conversation)
          .filter((c) => c && (c.is_group || c.last_message_at))
          .sort((a, b) => (b.last_message_at ?? '').localeCompare(a.last_message_at ?? ''))
          .slice(0, 15)
          .map((c) => {
            const people = c.conversation_members.filter((m) => m.user_id !== userId && m.profile).map((m) => m.profile)
            return {
              id: c.id,
              people,
              title: c.is_group ? c.name || people.map(personName).join(', ') : people[0] ? personName(people[0]) : 'Chat',
            }
          })
        setChats(list)
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  async function search(e: FormEvent) {
    e.preventDefault()
    try {
      setResults(await searchPeople(query, [userId]))
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function sendTo(key: string, getConversation: () => Promise<string>) {
    setError(null)
    try {
      const conversationId = await getConversation()
      const { error } = await supabase.from('messages').insert({
        conversation_id: conversationId,
        sender_id: userId,
        kind: 'share',
        post_id: postId,
        body: note.trim() || null,
      })
      if (error) throw error
      setSentTo((prev) => new Set(prev).add(key))
    } catch (err) {
      const message = (err as Error).message
      setError(message.includes('row-level security') ? "You can't send messages in this chat." : message)
    }
  }

  const sendButton = (key: string, onClick: () => void) => (
    <button
      onClick={onClick}
      disabled={sentTo.has(key)}
      className="rounded-full bg-brand px-3 py-1 text-xs font-medium text-white hover:bg-brand-dark disabled:bg-page disabled:text-muted"
    >
      {sentTo.has(key) ? 'Sent' : 'Send'}
    </button>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={onClose}>
      <div
        className="flex max-h-[80dvh] w-full max-w-sm flex-col gap-3 rounded-t-2xl bg-card p-4 shadow-xl animate-fade-up sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-ink">Share</h3>
          <button onClick={onClose} aria-label="Close" className="text-2xl leading-none text-muted">
            ×
          </button>
        </div>

        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={300}
          placeholder="Write a message… (optional)"
          className="rounded-lg border border-line bg-page px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand"
        />

        <form onSubmit={search} className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search people"
            className="min-w-0 flex-1 rounded-lg border border-line bg-page px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand"
          />
          <button type="submit" className="rounded-full border border-line px-3 text-sm text-ink hover:bg-page">
            Search
          </button>
        </form>

        <ul className="flex flex-col gap-2 overflow-y-auto">
          {results.map((p) => (
            <li key={`u-${p.id}`} className="flex items-center gap-3">
              <Avatar name={personName(p)} url={p.avatar_url} className="h-9 w-9 text-sm" />
              <span className="min-w-0 flex-1 truncate text-sm text-ink">{p.username}</span>
              {sendButton(`u-${p.id}`, () => sendTo(`u-${p.id}`, () => startChat(p.id)))}
            </li>
          ))}
          {results.length === 0 &&
            chats.map((c) => (
              <li key={c.id} className="flex items-center gap-3">
                <GroupAvatar people={c.people} small />
                <span className="min-w-0 flex-1 truncate text-sm text-ink">{c.title}</span>
                {sendButton(c.id, () => sendTo(c.id, async () => c.id))}
              </li>
            ))}
          {results.length === 0 && chats.length === 0 && (
            <li className="text-sm text-muted">Search for someone to send this post to.</li>
          )}
        </ul>

        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>
    </div>
  )
}
