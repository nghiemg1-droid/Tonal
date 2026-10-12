import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { Link, useParams } from 'react-router'
import { supabase } from '../lib/supabase'
import { encodeCanvas, makePostImage } from '../lib/image'
import { timeAgo } from '../lib/time'
import { PERSON_FIELDS, personName } from '../lib/chat'
import type { Person } from '../lib/chat'
import Avatar from '../components/Avatar'
import GroupAvatar from '../components/GroupAvatar'
import GroupInfo from '../components/GroupInfo'
import type { Member } from '../components/GroupInfo'
import VoicePlayer from '../components/VoicePlayer'
import VoiceRecorder from '../components/VoiceRecorder'
import type { Recording } from '../components/VoiceRecorder'
import DrawingPad from '../components/DrawingPad'
import type { RealtimeChannel } from '@supabase/supabase-js'
import ReportDialog from '../components/ReportDialog'
import { blockUser, unblockUser } from '../lib/safety'
import type { ReportTarget } from '../lib/safety'
import {
  addView,
  applyReaction,
  audioExtension,
  checkFile,
  countReactions,
  fileExtension,
  formatSize,
  normalPaths,
  preview,
} from '../lib/messages'
import type { Message, Reaction, ReactionMap, View } from '../lib/messages'

type ChatMember = Member & { last_read_at: string }

type Info = {
  id: string
  is_group: boolean
  name: string | null
  members: ChatMember[]
}

const MESSAGE_FIELDS =
  'id, conversation_id, sender_id, kind, body, media_path, duration_ms, file_size, reply_to_id, deleted_at, view_once, story_id, post_id, created_at'
const PAGE = 40
const REACTIONS = ['❤️', '😂', '😮', '😢', '😡', '👍']
const FILE_ACCEPT = '.pdf,.txt,.csv,.zip,.doc,.docx,.xls,.xlsx,.ppt,.pptx'
const STICKERS = ['🎉', '🔥', '🥳', '😍', '🤣', '😭', '🙏', '👏', '💯', '✨', '🎶', '🌹', '🐶', '🐱', '🍕', '☕']

type SharedPost = {
  id: string
  kind: 'voice' | 'image' | 'video'
  media_path: string
  poster_path: string | null
  caption_text: string | null
  author: { username: string } | null
}

// A post someone shared in the chat (undefined = loading, null = deleted or hidden)
function SharedPostCard({ post, note, mine }: { post: SharedPost | null | undefined; note: string | null; mine: boolean }) {
  const thumb =
    post && post.kind !== 'voice'
      ? supabase.storage.from('posts').getPublicUrl(post.kind === 'video' ? (post.poster_path ?? '') : post.media_path).data.publicUrl
      : null
  return (
    <div className={`flex w-56 flex-col gap-1 ${mine ? 'items-end' : 'items-start'}`}>
      {post ? (
        <Link to={`/p/${post.id}`} className="w-full overflow-hidden rounded-2xl border border-line bg-card">
          <p className="px-3 py-2 text-xs font-semibold text-ink">@{post.author?.username}</p>
          {thumb ? (
            <img src={thumb} alt="" className="aspect-square w-full object-cover" />
          ) : (
            <div className="flex aspect-[2/1] items-center justify-center bg-brand/15 text-3xl">🎙️</div>
          )}
          {post.caption_text && <p className="line-clamp-2 px-3 py-2 text-xs text-ink">{post.caption_text}</p>}
          {post.kind === 'video' && <p className="px-3 pb-2 text-xs text-muted">▶ Video</p>}
        </Link>
      ) : (
        <span className="rounded-2xl border border-line px-3 py-2 text-xs italic text-muted">
          {post === undefined ? 'Loading post…' : 'This post is no longer available'}
        </span>
      )}
      {note && (
        <span className={`rounded-2xl px-3 py-2 text-sm ${mine ? 'bg-brand text-white' : 'border border-line bg-card text-ink'}`}>
          {note}
        </span>
      )}
    </div>
  )
}

export default function ChatPage({ userId }: { userId: string }) {
  const { conversationId = '' } = useParams()

  const [info, setInfo] = useState<Info | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [people, setPeople] = useState<Record<string, Person>>({})
  const [messages, setMessages] = useState<Message[]>([])
  const [reactions, setReactions] = useState<ReactionMap>({})
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [hasMore, setHasMore] = useState(false)
  // view-once message id -> ids of people who opened it
  const [views, setViews] = useState<Record<string, string[]>>({})
  const [viewing, setViewing] = useState<{ url: string; path: string } | null>(null)
  const [pendingPhoto, setPendingPhoto] = useState<File | null>(null)
  const [pendingUrl, setPendingUrl] = useState<string | null>(null)
  const [photoMode, setPhotoMode] = useState<'keep' | 'once'>('keep')

  const [text, setText] = useState('')
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const [panel, setPanel] = useState<'none' | 'stickers' | 'voice' | 'drawing' | 'more'>('none')
  const [drawing, setDrawing] = useState<HTMLCanvasElement | null>(null)
  const [padKey, setPadKey] = useState(0) // changing it clears the drawing pad
  const [typingIds, setTypingIds] = useState<string[]>([])
  const channelRef = useRef<RealtimeChannel | null>(null)
  const typingTimers = useRef<Record<string, number>>({})
  const lastTypingSent = useRef(0)
  const [recording, setRecording] = useState<Recording | null>(null)
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [showInfo, setShowInfo] = useState(false)
  const [headerMenu, setHeaderMenu] = useState(false)
  const [blockedByMe, setBlockedByMe] = useState(false)
  const [report, setReport] = useState<{ type: ReportTarget; id: string; label: string } | null>(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const urlsRef = useRef(urls)
  urlsRef.current = urls
  const peopleRef = useRef(people)
  peopleRef.current = people
  const lastIdRef = useRef<string | null>(null)

  // ---------- helpers ----------
  const signUrls = useCallback(async (paths: string[]) => {
    const missing = paths.filter((p) => !urlsRef.current[p])
    if (missing.length === 0) return
    const { data } = await supabase.storage.from('messages').createSignedUrls(missing, 3600)
    const next: Record<string, string> = {}
    for (const item of data ?? []) {
      if (item.path && item.signedUrl) next[item.path] = item.signedUrl
    }
    setUrls((prev) => ({ ...prev, ...next }))
  }, [])

  // Senders who already left a group are not in the member list: fetch them
  const ensurePeople = useCallback(async (ids: string[]) => {
    const missing = [...new Set(ids)].filter((id) => !peopleRef.current[id])
    if (missing.length === 0) return
    const { data } = await supabase.from('profiles').select(PERSON_FIELDS).in('id', missing)
    const next: Record<string, Person> = {}
    for (const p of (data ?? []) as Person[]) next[p.id] = p
    setPeople((prev) => ({ ...prev, ...next }))
  }, [])

  // Shared posts and replied-to stories shown inside messages
  const [sharedPosts, setSharedPosts] = useState<Record<string, SharedPost | null>>({})
  const [stories, setStories] = useState<Record<string, string | null>>({})
  const askedRef = useRef<Set<string>>(new Set())

  const loadAttachments = useCallback(async (list: Message[]) => {
    const postIds = [...new Set(list.flatMap((m) => (m.post_id ? [m.post_id] : [])))].filter(
      (id) => !askedRef.current.has(id),
    )
    const storyIds = [...new Set(list.flatMap((m) => (m.story_id ? [m.story_id] : [])))].filter(
      (id) => !askedRef.current.has(id),
    )
    postIds.concat(storyIds).forEach((id) => askedRef.current.add(id))

    if (postIds.length) {
      const { data } = await supabase
        .from('posts')
        .select('id, kind, media_path, poster_path, caption_text, author:profiles!posts_author_id_fkey(username)')
        .in('id', postIds)
      const found: Record<string, SharedPost | null> = Object.fromEntries(postIds.map((id) => [id, null]))
      for (const p of (data ?? []) as unknown as SharedPost[]) found[p.id] = p
      setSharedPosts((prev) => ({ ...prev, ...found }))
    }
    if (storyIds.length) {
      // Stories older than 24 hours aren't visible any more
      const { data } = await supabase.from('stories').select('id, media_path').in('id', storyIds)
      const found: Record<string, string | null> = Object.fromEntries(storyIds.map((id) => [id, null]))
      for (const s of data ?? []) found[s.id as string] = s.media_path as string
      setStories((prev) => ({ ...prev, ...found }))
    }
  }, [])

  const markRead = useCallback(async () => {
    await supabase.rpc('mark_conversation_read', { conv: conversationId })
  }, [conversationId])

  const addMessage = useCallback(
    (m: Message) => {
      setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]))
      signUrls(normalPaths([m]))
      ensurePeople([m.sender_id])
      loadAttachments([m])
    },
    [signUrls, ensurePeople, loadAttachments],
  )

  // Load a page of messages older than `before` (or the newest page)
  const loadMessages = useCallback(
    async (before?: string) => {
      let query = supabase
        .from('messages')
        .select(MESSAGE_FIELDS)
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(PAGE)
      if (before) query = query.lt('created_at', before)

      const { data, error } = await query
      if (error) throw error
      const page = ((data ?? []) as Message[]).reverse()

      const ids = page.map((m) => m.id)
      const { data: reactionRows } = ids.length
        ? await supabase
            .from('message_reactions')
            .select('message_id, user_id, emoji')
            .in('message_id', ids)
        : { data: [] }

      const onceIds = page.filter((m) => m.view_once).map((m) => m.id)
      const { data: viewRows } = onceIds.length
        ? await supabase.from('message_views').select('message_id, user_id').in('message_id', onceIds)
        : { data: [] }

      return {
        page,
        reactionRows: (reactionRows ?? []) as Reaction[],
        viewRows: (viewRows ?? []) as View[],
      }
    },
    [conversationId],
  )

  // ---------- conversation info (name, members) ----------
  const loadInfo = useCallback(async () => {
    const { data, error } = await supabase
      .from('conversations')
      .select(
        `id, is_group, name, members:conversation_members(user_id, role, last_read_at, profile:profiles(${PERSON_FIELDS}))`,
      )
      .eq('id', conversationId)
      .maybeSingle()

    if (error) {
      setError(error.message)
      return
    }
    if (!data) {
      setNotFound(true)
      return
    }
    const loaded = data as unknown as Info
    setInfo(loaded)
    const map: Record<string, Person> = {}
    for (const m of loaded.members) if (m.profile) map[m.user_id] = m.profile
    setPeople((prev) => ({ ...prev, ...map }))
  }, [conversationId])

  // ---------- first load ----------
  useEffect(() => {
    let cancelled = false
    lastIdRef.current = null
    setMessages([])
    setReactions({})
    setViews({})
    setNotFound(false)
    setShowInfo(false)

    async function load() {
      await loadInfo()
      try {
        const { page, reactionRows, viewRows } = await loadMessages()
        if (cancelled) return
        setMessages(page)
        setHasMore(page.length === PAGE)
        setReactions(reactionRows.reduce(applyReaction, {}))
        setViews(viewRows.reduce(addView, {}))
        signUrls(normalPaths(page))
        loadAttachments(page)
        ensurePeople(page.map((m) => m.sender_id))
        markRead()
      } catch (err) {
        if (!cancelled) setError((err as Error).message)
      }
    }
    load()

    return () => {
      cancelled = true
    }
  }, [loadInfo, loadMessages, signUrls, ensurePeople, markRead])

  // ---------- realtime ----------
  useEffect(() => {
    const filter = `conversation_id=eq.${conversationId}`
    const channel = supabase
      .channel(`chat:${conversationId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter }, (payload) => {
        const m = payload.new as Message
        addMessage(m)
        setTypingIds((prev) => prev.filter((x) => x !== m.sender_id))
        if (m.sender_id !== userId) markRead()
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter }, (payload) => {
        const m = payload.new as Message
        setMessages((prev) => prev.map((x) => (x.id === m.id ? m : x)))
        if (m.deleted_at) setReactions((prev) => ({ ...prev, [m.id]: {} }))
      })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'message_reactions', filter },
        (payload) => {
          const r = payload.new as Reaction
          if (r?.message_id) setReactions((prev) => applyReaction(prev, r))
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'message_views', filter },
        (payload) => setViews((prev) => addView(prev, payload.new as View)),
      )
      // "Seen": someone's last_read_at moved forward
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'conversation_members', filter },
        (payload) => {
          const row = payload.new as { user_id: string; last_read_at: string }
          setInfo((prev) =>
            prev
              ? {
                  ...prev,
                  members: prev.members.map((m) =>
                    m.user_id === row.user_id ? { ...m, last_read_at: row.last_read_at } : m,
                  ),
                }
              : prev,
          )
        },
      )
      // "Typing…": short-lived signals, never saved in the database
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        const id = (payload as { user_id?: string })?.user_id
        if (!id || id === userId) return
        setTypingIds((prev) => (prev.includes(id) ? prev : [...prev, id]))
        window.clearTimeout(typingTimers.current[id])
        typingTimers.current[id] = window.setTimeout(() => {
          setTypingIds((prev) => prev.filter((x) => x !== id))
        }, 3500)
      })
      .subscribe()

    channelRef.current = channel
    const timers = typingTimers.current

    return () => {
      channelRef.current = null
      Object.values(timers).forEach((t) => window.clearTimeout(t))
      setTypingIds([])
      supabase.removeChannel(channel)
    }
  }, [conversationId, userId, addMessage, markRead])

  // Scroll to the bottom when a new message arrives (not when loading older ones)
  useLayoutEffect(() => {
    const last = messages[messages.length - 1]
    if (!last || last.id === lastIdRef.current) return
    const first = lastIdRef.current === null
    lastIdRef.current = last.id
    window.scrollTo({ top: document.body.scrollHeight, behavior: first ? 'auto' : 'smooth' })
  }, [messages])

  // 1-to-1 chat: did I block this person?
  const partnerId = info && !info.is_group ? info.members.find((m) => m.user_id !== userId)?.user_id : undefined
  useEffect(() => {
    if (!partnerId) {
      setBlockedByMe(false)
      return
    }
    let cancelled = false
    supabase
      .from('blocks')
      .select('blocked_id')
      .eq('blocker_id', userId)
      .eq('blocked_id', partnerId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setBlockedByMe(!!data)
      })
    return () => {
      cancelled = true
    }
  }, [partnerId, userId])

  async function toggleBlock() {
    setHeaderMenu(false)
    if (!partnerId) return
    try {
      if (blockedByMe) {
        await unblockUser(userId, partnerId)
        setBlockedByMe(false)
      } else {
        if (!window.confirm("Block this account? They won't be able to message you or see your posts.")) return
        await blockUser(userId, partnerId)
        setBlockedByMe(true)
        setPanel('none')
      }
    } catch (err) {
      setError((err as Error).message)
    }
  }

  // Coming back to this tab counts as reading
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === 'visible') markRead()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [markRead])

  function handleTyping(value: string) {
    setText(value)
    const now = Date.now()
    if (!value.trim() || now - lastTypingSent.current < 2000) return
    lastTypingSent.current = now
    channelRef.current?.send({ type: 'broadcast', event: 'typing', payload: { user_id: userId } })
  }

  // Preview of the photo you're about to send
  useEffect(() => {
    if (!pendingPhoto) {
      setPendingUrl(null)
      return
    }
    const url = URL.createObjectURL(pendingPhoto)
    setPendingUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [pendingPhoto])

  async function loadOlder() {
    const oldest = messages[0]
    if (!oldest) return
    try {
      const { page, reactionRows, viewRows } = await loadMessages(oldest.created_at)
      setMessages((prev) => [...page, ...prev])
      setHasMore(page.length === PAGE)
      setReactions((prev) => reactionRows.reduce(applyReaction, prev))
      setViews((prev) => viewRows.reduce(addView, prev))
      signUrls(normalPaths(page))
      loadAttachments(page)
      ensurePeople(page.map((m) => m.sender_id))
    } catch (err) {
      setError((err as Error).message)
    }
  }

  // ---------- sending ----------
  async function insertMessage(fields: Partial<Message>) {
    const { data, error } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_id: userId,
        reply_to_id: replyTo?.id ?? null,
        ...fields,
      })
      .select(MESSAGE_FIELDS)
      .single()
    if (error) throw error
    addMessage(data as Message)
    setReplyTo(null)
  }

  async function uploadFile(blob: Blob, contentType: string, ext: string) {
    const path = `${conversationId}/${userId}/${crypto.randomUUID()}.${ext}`
    const { error } = await supabase.storage.from('messages').upload(path, blob, { contentType })
    if (error) throw error
    return path
  }

  async function send(task: () => Promise<void>) {
    setSending(true)
    setError(null)
    try {
      await task()
    } catch (err) {
      const message = (err as Error).message
      setError(
        message.includes('row-level security') ? "You can't send messages in this chat." : message,
      )
    }
    setSending(false)
  }

  function sendText(e: FormEvent) {
    e.preventDefault()
    const body = text.trim()
    if (!body || sending) return
    send(async () => {
      await insertMessage({ kind: 'text', body })
      setText('')
    })
  }

  function sendSticker(sticker: string) {
    setPanel('none')
    send(() => insertMessage({ kind: 'sticker', body: sticker }))
  }

  // Step 1: pick a photo -> show a preview where you choose "Keep in chat" or "View once"
  function pickPhoto(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // so picking the same photo again still works
    if (!file) return
    setPanel('none')
    setPhotoMode('keep')
    setPendingPhoto(file)
  }

  // Step 2: send it
  function sendPhoto() {
    const file = pendingPhoto
    if (!file) return
    const viewOnce = photoMode === 'once'
    send(async () => {
      const blob = await makePostImage(file, 1280) // also strips GPS location
      const path = await uploadFile(blob, blob.type, blob.type === 'image/webp' ? 'webp' : 'jpg')
      try {
        await insertMessage({ kind: 'image', media_path: path, view_once: viewOnce })
      } catch (err) {
        await supabase.storage.from('messages').remove([path])
        throw err
      }
      setPendingPhoto(null)
    })
  }

  function sendDrawing() {
    const canvas = drawing
    if (!canvas) return
    send(async () => {
      const blob = await encodeCanvas(canvas)
      const path = await uploadFile(blob, blob.type, blob.type === 'image/webp' ? 'webp' : 'jpg')
      try {
        await insertMessage({ kind: 'drawing', media_path: path })
      } catch (err) {
        await supabase.storage.from('messages').remove([path])
        throw err
      }
      setDrawing(null)
      setPadKey((k) => k + 1)
      setPanel('none')
    })
  }

  function sendFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const problem = checkFile(file)
    if (problem) {
      setError(problem)
      return
    }
    send(async () => {
      const path = await uploadFile(file, file.type, fileExtension(file.name))
      try {
        await insertMessage({ kind: 'file', media_path: path, body: file.name.slice(0, 200), file_size: file.size })
      } catch (err) {
        await supabase.storage.from('messages').remove([path])
        throw err
      }
    })
  }

  // ---------- view-once ----------
  async function openViewOnce(m: Message) {
    setError(null)
    const { data, error } = await supabase.rpc('open_view_once', { msg_id: m.id })
    if (error) {
      setError(error.message)
      return
    }
    setViews((prev) => addView(prev, { message_id: m.id, user_id: userId }))
    const path = data as string
    // The link only works for 60 seconds, and the database only allows it for 1 minute
    const { data: signed, error: signError } = await supabase.storage
      .from('messages')
      .createSignedUrl(path, 60)
    if (signError || !signed) {
      setError(signError?.message ?? 'Could not open the photo')
      return
    }
    setViewing({ url: signed.signedUrl, path })
  }

  function closeViewer() {
    const path = viewing?.path
    setViewing(null)
    // If everyone has now seen it, delete the file for good (fails quietly otherwise)
    if (path) supabase.storage.from('messages').remove([path])
  }

  function handleBubbleClick(m: Message) {
    const canOpen =
      m.view_once && !m.deleted_at && m.sender_id !== userId && !(views[m.id] ?? []).includes(userId)
    if (canOpen) openViewOnce(m)
    else setMenuFor(menuFor === m.id ? null : m.id)
  }

  function sendVoice() {
    if (!recording) return
    const rec = recording
    send(async () => {
      const type = rec.blob.type.split(';')[0] || 'audio/webm'
      const path = await uploadFile(rec.blob, type, audioExtension(type))
      try {
        await insertMessage({ kind: 'voice', media_path: path, duration_ms: rec.durationMs })
      } catch (err) {
        await supabase.storage.from('messages').remove([path])
        throw err
      }
      setRecording(null)
      setPanel('none')
    })
  }

  // ---------- reactions, reply, unsend ----------
  async function react(message: Message, emoji: string) {
    setMenuFor(null)
    const current = reactions[message.id]?.[userId]
    const next = current === emoji ? null : emoji
    setReactions((prev) => applyReaction(prev, { message_id: message.id, user_id: userId, emoji: next }))

    const { error } = await supabase.from('message_reactions').upsert(
      {
        message_id: message.id,
        user_id: userId,
        conversation_id: conversationId,
        emoji: next,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'message_id,user_id' },
    )
    if (error) {
      setError(error.message)
      setReactions((prev) =>
        applyReaction(prev, { message_id: message.id, user_id: userId, emoji: current ?? null }),
      )
    }
  }

  async function unsend(message: Message) {
    setMenuFor(null)
    if (!window.confirm('Unsend this message for everyone?')) return
    const { data, error } = await supabase.rpc('unsend_message', { msg_id: message.id })
    if (error) {
      setError(error.message)
      return
    }
    const oldPath = data as string | null
    if (oldPath) await supabase.storage.from('messages').remove([oldPath])
    setMessages((prev) =>
      prev.map((x) =>
        x.id === message.id
          ? { ...x, deleted_at: new Date().toISOString(), body: null, media_path: null, duration_ms: null }
          : x,
      ),
    )
    setReactions((prev) => ({ ...prev, [message.id]: {} }))
  }

  // ---------- render ----------
  if (notFound) {
    return (
      <div className="w-full rounded-2xl border border-line bg-card p-6 text-center">
        <p className="text-ink">This chat doesn't exist or you're no longer in it.</p>
        <Link to="/messages" className="mt-3 inline-block text-sm text-brand">
          Back to messages
        </Link>
      </div>
    )
  }

  const others = (info?.members ?? []).filter((m) => m.user_id !== userId).map((m) => m.profile)
  const title = info
    ? info.is_group
      ? info.name || others.map(personName).join(', ')
      : others[0]
        ? personName(others[0])
        : 'Tonal user'
    : ''
  const byId = new Map(messages.map((m) => [m.id, m]))
  // no display class here, so each button can choose flex / hidden
  const iconBase =
    'h-10 w-10 shrink-0 items-center justify-center rounded-full text-xl hover:bg-page active:scale-90 disabled:opacity-40 transition'
  const iconButton = `flex ${iconBase}`

  return (
    <div className="flex w-full flex-col gap-3">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-line pb-3">
        <Link to="/messages" aria-label="Back" className="text-3xl leading-none text-muted hover:text-ink">
          ‹
        </Link>
        <GroupAvatar people={others} small />
        <div className="min-w-0 flex-1">
          {info && !info.is_group && others[0] ? (
            <Link to={`/u/${others[0].username}`} className="block truncate font-bold text-ink hover:underline">
              {title}
            </Link>
          ) : (
            <p className="truncate font-bold text-ink">{title}</p>
          )}
          {info?.is_group && <p className="text-xs text-muted">{info.members.length} members</p>}
          {info && !info.is_group && others[0] && (
            <p className="truncate text-xs text-muted">@{others[0].username}</p>
          )}
        </div>
        {info?.is_group && (
          <button
            onClick={() => setShowInfo((v) => !v)}
            aria-label="Group info"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-line text-sm text-ink hover:bg-card"
          >
            i
          </button>
        )}
        {info && !info.is_group && partnerId && (
          <div className="relative">
            <button
              onClick={() => setHeaderMenu((v) => !v)}
              aria-label="Chat options"
              className="rounded-full px-2 py-1 text-muted hover:text-ink"
            >
              •••
            </button>
            {headerMenu && (
              <div className="absolute top-9 right-0 z-20 w-48 overflow-hidden rounded-xl border border-line bg-card shadow-lg">
                <button
                  onClick={() => {
                    setHeaderMenu(false)
                    setReport({ type: 'user', id: partnerId, label: `@${others[0]?.username ?? 'user'}` })
                  }}
                  className="block w-full px-4 py-2.5 text-left text-sm font-semibold text-red-500 hover:bg-page"
                >
                  Report
                </button>
                <button
                  onClick={toggleBlock}
                  className="block w-full px-4 py-2.5 text-left text-sm text-red-500 hover:bg-page"
                >
                  {blockedByMe ? 'Unblock' : 'Block'}
                </button>
                <button
                  onClick={() => setHeaderMenu(false)}
                  className="block w-full px-4 py-2.5 text-left text-sm text-ink hover:bg-page"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {report && (
        <ReportDialog
          userId={userId}
          targetType={report.type}
          targetId={report.id}
          label={report.label}
          onClose={() => setReport(null)}
        />
      )}

      {showInfo && info?.is_group && (
        <GroupInfo
          conversationId={conversationId}
          userId={userId}
          name={info.name ?? ''}
          members={info.members}
          onChanged={loadInfo}
          onClose={() => setShowInfo(false)}
        />
      )}

      {hasMore && (
        <button onClick={loadOlder} className="self-center text-sm text-brand hover:underline">
          Load older messages
        </button>
      )}

      {/* Messages */}
      <ul className="flex flex-col gap-1">
        {messages.map((m, i) => {
          const mine = m.sender_id === userId
          const prev = messages[i - 1]
          const firstOfRun = !prev || prev.sender_id !== m.sender_id
          const sender = people[m.sender_id]
          const replied = m.reply_to_id ? byId.get(m.reply_to_id) : undefined
          const myReaction = reactions[m.id]?.[userId]
          const counts = countReactions(reactions[m.id])
          const url = m.media_path ? urls[m.media_path] : undefined
          const bubbleBase = mine
            ? 'bg-brand text-white rounded-br-md'
            : 'bg-card text-ink border border-line rounded-bl-md'

          return (
            <li key={m.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'} ${firstOfRun ? 'mt-2' : ''}`}>
              {!mine && info?.is_group && firstOfRun && sender && (
                <span className="mb-0.5 ml-10 text-xs text-muted">{personName(sender)}</span>
              )}

              <div className={`flex max-w-[80%] items-end gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
                {!mine && (
                  <span className="w-8 shrink-0">
                    {firstOfRun && sender && (
                      <Avatar name={personName(sender)} url={sender.avatar_url} className="h-8 w-8 text-xs" />
                    )}
                  </span>
                )}

                <div className={`flex min-w-0 flex-col ${mine ? 'items-end' : 'items-start'}`}>
                  {m.story_id !== undefined && m.story_id !== null && !m.deleted_at && (
                    <div className={`mb-1 flex items-center gap-2 text-xs text-muted ${mine ? 'flex-row-reverse' : ''}`}>
                      {stories[m.story_id] ? (
                        <img
                          src={supabase.storage.from('stories').getPublicUrl(stories[m.story_id] as string).data.publicUrl}
                          alt="Story"
                          className="h-20 w-12 rounded-lg object-cover"
                        />
                      ) : (
                        <span className="flex h-20 w-12 items-center justify-center rounded-lg bg-page text-center text-[10px]">
                          Story ended
                        </span>
                      )}
                      <span>{mine ? 'You replied to their story' : 'Replied to your story'}</span>
                    </div>
                  )}
                  {m.reply_to_id && !m.deleted_at && (
                    <span className="mb-0.5 max-w-full truncate rounded-xl bg-page px-3 py-1 text-xs text-muted">
                      ↩ {replied ? `${personName(people[replied.sender_id] ?? { id: '', username: 'someone', display_name: null, avatar_url: null })}: ${preview(replied)}` : 'Original message'}
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={() => handleBubbleClick(m)}
                    title={new Date(m.created_at).toLocaleString()}
                    className="max-w-full text-left"
                  >
                    {m.deleted_at ? (
                      <span className="block rounded-2xl border border-line px-3 py-2 text-sm italic text-muted">
                        Message unsent
                      </span>
                    ) : m.kind === 'text' ? (
                      <span className={`block whitespace-pre-wrap break-words rounded-2xl px-3 py-2 ${bubbleBase}`}>
                        {m.body}
                      </span>
                    ) : m.kind === 'sticker' ? (
                      <span className="block text-6xl leading-none transition hover:scale-110">{m.body}</span>
                    ) : m.view_once ? (
                      <ViewOnceBubble
                        mine={mine}
                        openedBy={(views[m.id] ?? []).length}
                        openedByMe={(views[m.id] ?? []).includes(userId)}
                        isGroup={!!info?.is_group}
                      />
                    ) : m.kind === 'image' || m.kind === 'drawing' ? (
                      url ? (
                        <img
                          src={url}
                          alt={m.kind === 'drawing' ? 'Drawing' : 'Photo'}
                          loading="lazy"
                          className={`max-h-80 rounded-2xl object-cover ${m.kind === 'drawing' ? 'w-56 border border-line bg-white' : ''}`}
                        />
                      ) : (
                        <span className="block h-48 w-48 animate-pulse rounded-2xl bg-line" />
                      )
                    ) : null}
                  </button>

                  {/* VoicePlayer is its own button, so keep it outside the bubble button */}
                  {!m.deleted_at && m.kind === 'voice' && (
                    <div className="w-60" onDoubleClick={() => setMenuFor(m.id)}>
                      {url ? (
                        <VoicePlayer src={url} durationMs={m.duration_ms ?? 1} />
                      ) : (
                        <span className="block h-16 animate-pulse rounded-2xl bg-line" />
                      )}
                      <button
                        onClick={() => setMenuFor(menuFor === m.id ? null : m.id)}
                        className="mt-0.5 text-xs text-muted hover:text-ink"
                      >
                        •••
                      </button>
                    </div>
                  )}

                  {!m.deleted_at && m.kind === 'share' && m.post_id && (
                    <SharedPostCard post={sharedPosts[m.post_id]} note={m.body} mine={mine} />
                  )}

                  {!m.deleted_at && m.kind === 'file' && (
                    <div className={`flex w-64 items-center gap-3 rounded-2xl px-3 py-2.5 ${bubbleBase}`}>
                      <span className="text-2xl">📎</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{m.body}</p>
                        <p className={`text-xs ${mine ? 'text-white/80' : 'text-muted'}`}>
                          {m.file_size ? formatSize(m.file_size) : ''}
                        </p>
                      </div>
                      {url && (
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Open ${m.body}`}
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${mine ? 'bg-white/20' : 'bg-page'}`}
                        >
                          Open
                        </a>
                      )}
                      <button
                        onClick={() => setMenuFor(menuFor === m.id ? null : m.id)}
                        aria-label="More"
                        className="text-xs opacity-70"
                      >
                        •••
                      </button>
                    </div>
                  )}

                  {Object.keys(counts).length > 0 && (
                    <div className="-mt-1 flex gap-1">
                      {Object.entries(counts).map(([emoji, count]) => (
                        <button
                          key={emoji}
                          onClick={() => react(m, emoji)}
                          className={`rounded-full border px-1.5 text-xs shadow-sm ${
                            myReaction === emoji ? 'border-brand bg-brand/10' : 'border-line bg-card'
                          }`}
                        >
                          {emoji}
                          {count > 1 && <span className="ml-0.5 text-muted">{count}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {menuFor === m.id && !m.deleted_at && (
                <div className={`mt-1 flex flex-wrap items-center gap-1 rounded-full border border-line bg-card px-2 py-1 shadow-sm animate-fade-up ${mine ? '' : 'ml-10'}`}>
                  {REACTIONS.map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() => react(m, emoji)}
                      className={`rounded-full p-1 text-lg transition hover:scale-125 ${myReaction === emoji ? 'bg-brand/15' : ''}`}
                    >
                      {emoji}
                    </button>
                  ))}
                  <span className="mx-1 h-5 w-px bg-line" />
                  <button
                    onClick={() => {
                      setReplyTo(m)
                      setMenuFor(null)
                    }}
                    className="px-2 text-xs font-medium text-ink hover:text-brand"
                  >
                    Reply
                  </button>
                  {mine ? (
                    <button onClick={() => unsend(m)} className="px-2 text-xs font-medium text-red-500">
                      Unsend
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        setMenuFor(null)
                        setReport({ type: 'message', id: m.id, label: 'message' })
                      }}
                      className="px-2 text-xs font-medium text-red-500"
                    >
                      Report
                    </button>
                  )}
                  <span className="px-1 text-[10px] text-muted">{timeAgo(m.created_at)}</span>
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {/* Seen status under the last message */}
      {(() => {
        const last = messages[messages.length - 1]
        if (!last || last.deleted_at || !info) return null
        const lastTime = new Date(last.created_at).getTime()
        const seenBy = info.members.filter(
          (m) =>
            m.user_id !== userId &&
            m.user_id !== last.sender_id &&
            new Date(m.last_read_at).getTime() >= lastTime,
        )
        if (!info.is_group) {
          if (last.sender_id !== userId) return null
          return (
            <p className="-mt-2 self-end text-xs text-muted">{seenBy.length > 0 ? 'Seen' : 'Sent'}</p>
          )
        }
        if (seenBy.length === 0) return null
        return (
          <div className="-mt-2 flex items-center gap-0.5 self-end" title={`Seen by ${seenBy.map((m) => personName(m.profile)).join(', ')}`}>
            {seenBy.slice(0, 5).map((m) => (
              <Avatar key={m.user_id} name={personName(m.profile)} url={m.profile.avatar_url} className="h-4 w-4 text-[8px]" />
            ))}
            {seenBy.length > 5 && <span className="ml-1 text-xs text-muted">+{seenBy.length - 5}</span>}
          </div>
        )
      })()}

      {/* Someone is typing */}
      {typingIds.length > 0 && (
        <div className="flex items-center gap-2 animate-fade-up">
          {people[typingIds[0]] && (
            <Avatar name={personName(people[typingIds[0]])} url={people[typingIds[0]].avatar_url} className="h-8 w-8 text-xs" />
          )}
          <span className="flex items-center gap-1 rounded-2xl border border-line bg-card px-3 py-3">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted"
                style={{ animationDelay: `${i * 150}ms` }}
              />
            ))}
          </span>
          {info?.is_group && (
            <span className="text-xs text-muted">
              {typingIds.map((id) => (people[id] ? personName(people[id]) : 'Someone')).join(', ')}
            </span>
          )}
        </div>
      )}

      {/* Composer: stays above the phone's bottom nav */}
      <div className="sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-[5] flex flex-col gap-2 rounded-2xl border border-line bg-card p-2 shadow-sm md:bottom-4">
        {replyTo && (
          <div className="flex items-center gap-2 rounded-xl bg-page px-3 py-1.5 text-xs text-muted">
            <span className="min-w-0 flex-1 truncate">
              Replying to{' '}
              <b className="text-ink">
                {replyTo.sender_id === userId ? 'yourself' : personName(people[replyTo.sender_id] ?? { id: '', username: 'someone', display_name: null, avatar_url: null })}
              </b>
              : {preview(replyTo)}
            </span>
            <button onClick={() => setReplyTo(null)} aria-label="Cancel reply" className="text-base">
              ×
            </button>
          </div>
        )}

        {pendingPhoto && (
          <div className="flex flex-col gap-2 p-1">
            {pendingUrl && (
              <img src={pendingUrl} alt="Photo to send" className="max-h-56 self-center rounded-xl object-contain" />
            )}
            <div className="flex gap-1 rounded-full bg-page p-1 text-sm">
              {(['keep', 'once'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setPhotoMode(mode)}
                  className={`flex-1 rounded-full py-1.5 transition ${
                    photoMode === mode ? 'bg-brand font-medium text-white' : 'text-muted hover:text-ink'
                  }`}
                >
                  {mode === 'keep' ? '📷 Keep in chat' : '📸 View once'}
                </button>
              ))}
            </div>
            <p className="text-center text-xs text-muted">
              {photoMode === 'keep'
                ? 'Everyone in the chat can see it any time.'
                : 'Each person can open it one time. Then it disappears.'}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPendingPhoto(null)}
                className="flex-1 rounded-full border border-line py-2 text-sm text-ink hover:bg-page transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={sendPhoto}
                disabled={sending}
                className="flex-1 rounded-full bg-brand py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-40 transition"
              >
                {sending ? 'Sending…' : 'Send'}
              </button>
            </div>
          </div>
        )}

        {panel === 'stickers' && (
          <div className="grid grid-cols-8 gap-1">
            {STICKERS.map((s) => (
              <button key={s} onClick={() => sendSticker(s)} className="rounded-lg p-1 text-3xl transition hover:scale-110 hover:bg-page">
                {s}
              </button>
            ))}
          </div>
        )}

        {panel === 'more' && (
          <div className="flex gap-2 p-1">
            <button
              type="button"
              onClick={() => setPanel('drawing')}
              className="flex flex-1 flex-col items-center gap-1 rounded-xl bg-page py-3 text-sm text-ink"
            >
              <span className="text-2xl">✏️</span>Draw
            </button>
            <label className="flex flex-1 cursor-pointer flex-col items-center gap-1 rounded-xl bg-page py-3 text-sm text-ink">
              <span className="text-2xl">📎</span>File
              <input
                type="file"
                accept={FILE_ACCEPT}
                onChange={(e) => {
                  setPanel('none')
                  sendFile(e)
                }}
                disabled={sending}
                className="hidden"
              />
            </label>
          </div>
        )}

        {panel === 'drawing' && (
          <div className="flex flex-col gap-2 p-1">
            <DrawingPad key={padKey} onChange={setDrawing} />
            <button
              onClick={sendDrawing}
              disabled={!drawing || sending}
              className="rounded-full bg-brand py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-40 transition"
            >
              {sending ? 'Sending…' : 'Send drawing'}
            </button>
          </div>
        )}

        {panel === 'voice' && (
          <div className="flex flex-col gap-2 p-2">
            <VoiceRecorder onChange={setRecording} />
            <button
              onClick={sendVoice}
              disabled={!recording || sending}
              className="rounded-full bg-brand py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-40 transition"
            >
              {sending ? 'Sending…' : 'Send voice message'}
            </button>
          </div>
        )}

        {blockedByMe ? (
          <div className="flex items-center justify-between gap-3 px-2 py-1.5 text-sm">
            <span className="text-muted">You blocked this account.</span>
            <button onClick={toggleBlock} className="font-semibold text-brand">
              Unblock
            </button>
          </div>
        ) : (
        <form onSubmit={sendText} className="flex items-center gap-1">
          <label className={`${iconButton} cursor-pointer`} aria-label="Send a photo">
            📷
            <input type="file" accept="image/*" onChange={pickPhoto} disabled={sending} className="hidden" />
          </label>
          <button
            type="button"
            onClick={() => setPanel(panel === 'voice' ? 'none' : 'voice')}
            aria-label="Voice message"
            className={`${iconButton} ${panel === 'voice' ? 'bg-page' : ''}`}
          >
            🎙️
          </button>
          <button
            type="button"
            onClick={() => setPanel(panel === 'stickers' ? 'none' : 'stickers')}
            aria-label="Stickers"
            className={`${iconButton} ${panel === 'stickers' ? 'bg-page' : ''}`}
          >
            😊
          </button>
          {/* Phone: Draw and File live behind this button to save space */}
          <button
            type="button"
            onClick={() => setPanel(panel === 'more' ? 'none' : 'more')}
            aria-label="More"
            className={`${iconBase} flex sm:hidden ${panel === 'more' ? 'bg-page' : ''}`}
          >
            ＋
          </button>
          <button
            type="button"
            onClick={() => setPanel(panel === 'drawing' ? 'none' : 'drawing')}
            aria-label="Draw"
            className={`${iconBase} hidden sm:flex ${panel === 'drawing' ? 'bg-page' : ''}`}
          >
            ✏️
          </button>
          <label className={`${iconBase} hidden cursor-pointer sm:flex`} aria-label="Send a file">
            📎
            <input type="file" accept={FILE_ACCEPT} onChange={sendFile} disabled={sending} className="hidden" />
          </label>
          <input
            value={text}
            onChange={(e) => handleTyping(e.target.value)}
            maxLength={1000}
            placeholder="Message…"
            className="min-w-0 flex-1 rounded-full bg-page px-4 py-2 text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand"
          />
          <button
            type="submit"
            disabled={!text.trim() || sending}
            className="px-3 font-semibold text-brand disabled:opacity-40"
          >
            Send
          </button>
        </form>
        )}

        {error && <p className="px-2 text-xs text-red-500">{error}</p>}
      </div>

      {/* Full-screen viewer for a view-once photo */}
      {viewing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black select-none"
          onContextMenu={(e) => e.preventDefault()}
        >
          <img
            src={viewing.url}
            alt="View-once photo"
            draggable={false}
            className="max-h-full max-w-full object-contain [-webkit-touch-callout:none]"
          />
          <button
            onClick={closeViewer}
            aria-label="Close"
            className="absolute top-[max(1rem,env(safe-area-inset-top))] right-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-2xl text-white hover:bg-white/30"
          >
            ×
          </button>
          <p className="absolute bottom-[max(1.5rem,env(safe-area-inset-bottom))] text-sm text-white/70">
            View once · closes for good
          </p>
        </div>
      )}
    </div>
  )
}

type ViewOnceProps = {
  mine: boolean
  openedBy: number
  openedByMe: boolean
  isGroup: boolean
}

function ViewOnceBubble({ mine, openedBy, openedByMe, isGroup }: ViewOnceProps) {
  const base = 'flex items-center gap-2 rounded-2xl px-3 py-2 text-sm font-medium'

  if (mine) {
    const status = openedBy === 0 ? 'Delivered' : isGroup ? `Opened by ${openedBy}` : 'Opened'
    return (
      <span className={`${base} border border-line bg-card text-ink`}>
        📸 Photo <span className="font-normal text-muted">· {status}</span>
      </span>
    )
  }

  if (openedByMe) {
    return <span className={`${base} border border-line text-muted`}>📸 Opened</span>
  }

  return <span className={`${base} bg-brand text-white`}>📸 Tap to view</span>
}
