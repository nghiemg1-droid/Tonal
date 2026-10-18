import { useEffect, useState } from 'react'
import type { ChangeEvent } from 'react'
import { useNavigate } from 'react-router'
import { supabase } from '../lib/supabase'
import { makeAvatar } from '../lib/image'
import Avatar from './Avatar'
import StreakBean from './StreakBean'
import PushToggle from './PushToggle'

type Person = { id: string; username: string; display_name: string | null; avatar_url: string | null }

const TOUR = [
  { emoji: '🎥', title: 'Clips', text: 'Record short videos right in the app, add free music, filters and text.' },
  { emoji: '🍽️', title: 'Line Check', text: 'See how long the dining hall line is right now — and report it anonymously.' },
  { emoji: '⚡', title: 'Campus Drop', text: 'Once a day at a surprise time, everyone shows what they’re doing. 5 minutes, no retakes.' },
  { emoji: '🫘', title: 'Streaks & merch', text: 'Post every day to grow your streak bean. Invite friends to earn free Tonal merch.' },
]

// First-time welcome: photo & name → follow a few people → quick tour → notifications
export default function Onboarding({ userId, onDone }: { userId: string; onDone: () => void }) {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [avatar, setAvatar] = useState<string | null>(null)
  const [username, setUsername] = useState('')
  const [uploading, setUploading] = useState(false)
  const [people, setPeople] = useState<Person[]>([])
  const [followed, setFollowed] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('profiles')
      .select('username, display_name, avatar_url')
      .eq('id', userId)
      .single()
      .then(({ data }) => {
        if (!data) return
        setUsername(data.username)
        setName(data.display_name ?? '')
        setAvatar(data.avatar_url)
      })
    // Public accounts to follow: the Tonal team first, then the newest people
    ;(async () => {
      const { data: mine } = await supabase.from('follows').select('following_id').eq('follower_id', userId)
      const already = new Set((mine ?? []).map((r) => r.following_id as string))
      const { data } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .eq('is_private', false)
        .is('banned_at', null)
        .neq('id', userId)
        .order('created_at', { ascending: false })
        .limit(30)
      const list = ((data ?? []) as Person[]).filter((p) => !already.has(p.id))
      const team = ['tonal', 'tonal_music', 'denison_eats']
      list.sort((a, b) => Number(team.includes(b.username)) - Number(team.includes(a.username)))
      setPeople(list.slice(0, 8))
    })()
  }, [userId])

  async function pickPhoto(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !file.type.startsWith('image/')) return
    setUploading(true)
    setError(null)
    try {
      const blob = await makeAvatar(file)
      const path = `${userId}/avatar-${Date.now()}.${blob.type === 'image/webp' ? 'webp' : 'jpg'}`
      const { error: upErr } = await supabase.storage.from('avatars').upload(path, blob, { contentType: blob.type })
      if (upErr) throw new Error(upErr.message)
      const url = supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl
      const { error: dbErr } = await supabase.from('profiles').update({ avatar_url: url }).eq('id', userId)
      if (dbErr) throw new Error(dbErr.message)
      setAvatar(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  async function saveName() {
    const clean = name.trim().slice(0, 50)
    if (clean) await supabase.from('profiles').update({ display_name: clean }).eq('id', userId)
    setStep(2)
  }

  async function follow(p: Person) {
    const on = followed.has(p.id)
    const { error } = on
      ? await supabase.from('follows').delete().eq('follower_id', userId).eq('following_id', p.id)
      : await supabase.from('follows').insert({ follower_id: userId, following_id: p.id })
    if (!error) {
      const next = new Set(followed)
      if (on) next.delete(p.id)
      else next.add(p.id)
      setFollowed(next)
    }
  }

  async function finish(goRecord: boolean) {
    await supabase.from('profiles').update({ onboarded_at: new Date().toISOString() }).eq('id', userId)
    onDone()
    if (goRecord) navigate('/new?record=1')
  }

  const steps = 5
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-page/95 p-4 backdrop-blur">
      <div className="flex max-h-[95dvh] w-full max-w-sm flex-col gap-4 overflow-y-auto rounded-3xl border border-line bg-card p-6 shadow-2xl animate-fade-up">
        {/* progress dots */}
        <div className="flex justify-center gap-1.5">
          {Array.from({ length: steps }).map((_, i) => (
            <span key={i} className={`h-1.5 rounded-full transition-all ${i === step ? 'w-6 bg-brand' : 'w-1.5 bg-line'}`} />
          ))}
        </div>

        {step === 0 && (
          <div className="flex flex-col items-center gap-3 text-center">
            <StreakBean days={14} size={110} bounce />
            <h2 className="text-2xl font-extrabold text-ink">Welcome to Tonal 👋</h2>
            <p className="text-muted">Voice notes, photos with music and short clips — from your campus, for your campus.</p>
            <button onClick={() => setStep(1)} className="mt-2 w-full rounded-full bg-brand py-3 font-bold text-white">
              Let’s go
            </button>
          </div>
        )}

        {step === 1 && (
          <div className="flex flex-col items-center gap-3 text-center">
            <h2 className="text-xl font-bold text-ink">Add a photo & your name</h2>
            <label className="relative cursor-pointer">
              <Avatar name={name || username || '?'} url={avatar} className="h-24 w-24 text-4xl" />
              <span className="absolute -right-1 -bottom-1 flex h-9 w-9 items-center justify-center rounded-full border-2 border-card bg-brand text-lg text-white">
                {uploading ? '…' : '📷'}
              </span>
              <input type="file" accept="image/*" onChange={pickPhoto} className="sr-only" />
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={50}
              placeholder="Your name (what friends call you)"
              className="w-full rounded-lg border border-line bg-page px-3 py-2 text-center text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand"
            />
            <p className="text-xs text-muted">@{username}</p>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <button onClick={saveName} disabled={uploading} className="w-full rounded-full bg-brand py-3 font-bold text-white disabled:opacity-50">
              Next
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-3">
            <h2 className="text-center text-xl font-bold text-ink">Follow a few people</h2>
            <p className="text-center text-sm text-muted">Their posts and clips will show up on your Home.</p>
            <div className="flex flex-col gap-2">
              {people.length === 0 && <p className="text-center text-sm text-muted">You're early! Invite friends later from 🎁 Invite.</p>}
              {people.map((p) => (
                <div key={p.id} className="flex items-center gap-3">
                  <Avatar name={p.display_name || p.username} url={p.avatar_url} className="h-10 w-10 text-base" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">{p.display_name || p.username}</p>
                    <p className="truncate text-xs text-muted">@{p.username}</p>
                  </div>
                  <button
                    onClick={() => follow(p)}
                    className={`rounded-full px-3 py-1 text-xs font-bold ${followed.has(p.id) ? 'border border-line text-ink' : 'bg-brand text-white'}`}
                  >
                    {followed.has(p.id) ? 'Following' : 'Follow'}
                  </button>
                </div>
              ))}
            </div>
            <button onClick={() => setStep(3)} className="w-full rounded-full bg-brand py-3 font-bold text-white">
              {followed.size ? 'Next' : 'Skip for now'}
            </button>
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-3">
            <h2 className="text-center text-xl font-bold text-ink">What you can do</h2>
            {TOUR.map((t) => (
              <div key={t.title} className="flex gap-3 rounded-2xl bg-page p-3">
                <span className="text-3xl">{t.emoji}</span>
                <div>
                  <p className="font-semibold text-ink">{t.title}</p>
                  <p className="text-sm text-muted">{t.text}</p>
                </div>
              </div>
            ))}
            <button onClick={() => setStep(4)} className="w-full rounded-full bg-brand py-3 font-bold text-white">
              Next
            </button>
          </div>
        )}

        {step === 4 && (
          <div className="flex flex-col gap-3 text-center">
            <span className="text-5xl">🔔</span>
            <h2 className="text-xl font-bold text-ink">Don’t miss Campus Drop</h2>
            <p className="text-sm text-muted">Get a notification when the Drop starts, when friends message you, and before your streak ends.</p>
            <PushToggle />
            <button onClick={() => finish(true)} className="w-full rounded-full bg-brand py-3 font-bold text-white">
              🎥 Record my first clip
            </button>
            <button onClick={() => finish(false)} className="text-sm text-muted">
              Maybe later — take me Home
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
