import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { GIFTS, SHIRT_SIZES, inviteLink } from '../lib/rewards'
import type { GiftId } from '../lib/rewards'
import Avatar from '../components/Avatar'
import SchoolVerify, { useSchoolStatus } from '../components/SchoolVerify'

type Reward = {
  reward: GiftId
  kind: 'invites' | 'streak'
  needed: number
  progress: number
  stock_left: number | null
  verified: boolean
  claimed: boolean
  status: 'pending' | 'shipped' | null
}
type Invite = { username: string; avatar_url: string | null; verified: boolean; active_days: number; qualified: boolean }

// Invite friends, track progress, and claim Tonal gifts (mailed to your campus mailbox)
export default function InvitePage({ userId }: { userId: string }) {
  const { domain, reload: reloadSchool } = useSchoolStatus()
  const [username, setUsername] = useState('')
  const [rewards, setRewards] = useState<Reward[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [copied, setCopied] = useState(false)
  const [claiming, setClaiming] = useState<Reward | null>(null)

  const load = useCallback(async () => {
    const [{ data: me }, { data: r }, { data: inv }] = await Promise.all([
      supabase.from('profiles').select('username').eq('id', userId).single(),
      supabase.rpc('my_rewards'),
      supabase.rpc('my_invites'),
    ])
    setUsername(me?.username ?? '')
    setRewards((r ?? []) as Reward[])
    setInvites((inv ?? []) as Invite[])
  }, [userId])

  useEffect(() => {
    load()
  }, [load])

  const link = username ? inviteLink(username) : ''
  const qualified = invites.filter((i) => i.qualified).length

  async function copy() {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // copying blocked: the link is shown on screen
    }
  }

  async function share() {
    try {
      await navigator.share({ title: 'Join me on Tonal', text: 'Join me on Tonal — voice, photos & clips from Denison 🎙️', url: link })
    } catch {
      // closed the share sheet
    }
  }

  return (
    <div className="flex w-full max-w-sm flex-col gap-5 animate-fade-up">
      <div>
        <h2 className="text-2xl font-bold text-ink">🎁 Invite & Rewards</h2>
        <p className="text-sm text-muted">Bring your friends to Tonal and earn real Tonal merch, mailed to your campus mailbox.</p>
      </div>

      {/* School email check */}
      <div className={`rounded-2xl border p-4 ${domain ? 'border-green-400/50 bg-green-50 dark:bg-green-950/20' : 'border-amber-400 bg-amber-50 dark:bg-amber-950/20'}`}>
        {domain === undefined ? (
          <p className="text-sm text-muted">Checking…</p>
        ) : domain ? (
          <p className="text-sm font-semibold text-ink">🎓 School email verified ({domain}) — your invites and gifts count.</p>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold text-ink">🎓 Verify your school email to count invites and claim gifts</p>
            <p className="text-xs text-muted">One school email = one account, so rewards go to real students. Your friends verify too.</p>
            <SchoolVerify
              onVerified={() => {
                reloadSchool()
                load()
              }}
            />
          </div>
        )}
      </div>

      {/* Invite link */}
      <div className="flex flex-col gap-2 rounded-2xl border border-line bg-card p-4">
        <p className="font-semibold text-ink">Your invite link</p>
        <p className="truncate rounded-lg bg-page px-3 py-2 text-sm text-ink">{link || '…'}</p>
        <div className="flex gap-2">
          <button onClick={copy} className="flex-1 rounded-full bg-brand py-2 text-sm font-semibold text-white">
            {copied ? 'Copied ✓' : '🔗 Copy link'}
          </button>
          {typeof navigator.share === 'function' && (
            <button onClick={share} className="flex-1 rounded-full border border-line py-2 text-sm font-semibold text-ink">
              ↗ Share
            </button>
          )}
        </div>
        <p className="text-xs text-muted">
          A friend counts when they sign up with your link, verify a school (.edu) email and post on 3 different days.
        </p>
      </div>

      {/* Gifts */}
      <div className="flex flex-col gap-2">
        <p className="font-semibold text-ink">Gifts</p>
        {rewards.map((r) => {
          const gift = GIFTS[r.reward]
          const ready = r.progress >= r.needed
          const soldOut = r.stock_left !== null && r.stock_left <= 0
          return (
            <div key={r.reward} className="flex items-center gap-3 rounded-2xl border border-line bg-card p-3">
              <span className="text-4xl">{gift.emoji}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-ink">{gift.name}</p>
                <p className="text-xs text-muted">
                  {gift.how(r.needed)}
                  {r.stock_left !== null && ` · ${r.stock_left} left`}
                </p>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line">
                  <div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, (r.progress / r.needed) * 100)}%` }} />
                </div>
                <p className="mt-0.5 text-[11px] text-muted">
                  {Math.min(r.progress, r.needed)} / {r.needed} {r.kind === 'invites' ? 'friends' : 'days'}
                </p>
              </div>
              {r.claimed ? (
                <span className="text-xs font-semibold text-green-600">{r.status === 'shipped' ? 'Sent 📬' : 'Claimed ✓'}</span>
              ) : (
                <button
                  disabled={!ready || soldOut || !r.verified}
                  onClick={() => setClaiming(r)}
                  className="rounded-full bg-brand px-3 py-1.5 text-xs font-bold text-white disabled:bg-line disabled:text-muted"
                >
                  {soldOut ? 'Gone' : 'Claim'}
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* Friends I invited */}
      <div className="flex flex-col gap-2">
        <p className="font-semibold text-ink">
          Friends you invited · {qualified} counted
        </p>
        {invites.length === 0 && <p className="text-sm text-muted">Nobody yet. Send your link to a friend!</p>}
        {invites.map((i) => (
          <div key={i.username} className="flex items-center gap-3 rounded-xl bg-card px-3 py-2">
            <Avatar name={i.username} url={i.avatar_url} className="h-8 w-8 text-sm" />
            <span className="min-w-0 flex-1 truncate text-sm text-ink">{i.username}</span>
            <span className="text-xs text-muted">
              {i.qualified ? '✅ counted' : `${i.verified ? '🎓✓' : '🎓…'} · posted ${i.active_days}/3 days`}
            </span>
          </div>
        ))}
      </div>

      <details className="rounded-2xl border border-line bg-card p-4 text-xs text-muted">
        <summary className="cursor-pointer font-semibold text-ink">Rules</summary>
        <ul className="mt-2 list-disc space-y-1 pl-4">
          <li>Free to join. Nothing to buy. Everyone who meets a goal can claim that gift — no luck involved.</li>
          <li>One of each gift per person. Shirts and plushies: first 20 claims each, while they last.</li>
          <li>Open to students with a school email ending in .edu (any school).</li>
          <li>A friend counts once: they sign up with your link (within their first 7 days), verify a school email and post on 3 different days.</li>
          <li>One school email per account. Extra or clone accounts are fine for posting but don't count for rewards; fake accounts can lose their gifts.</li>
          <li>Gifts are mailed to a campus mailbox. Your name and mailbox are seen only by the Tonal team and are deleted once the gift is sent.</li>
          <li>Gifts are Tonal-branded. Tonal is a student project and is not affiliated with Denison University.</li>
          <li>The program can change or end at any time; gifts already claimed will still be sent.</li>
        </ul>
      </details>

      {claiming && (
        <ClaimSheet
          reward={claiming}
          onClose={() => setClaiming(null)}
          onDone={() => {
            setClaiming(null)
            load()
          }}
        />
      )}
    </div>
  )
}

function ClaimSheet({ reward, onClose, onDone }: { reward: Reward; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState('')
  const [box, setBox] = useState('')
  const [size, setSize] = useState<string>('M')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const gift = GIFTS[reward.reward]

  async function submit() {
    setBusy(true)
    setError(null)
    const { error } = await supabase.rpc('claim_reward', {
      gift: reward.reward,
      name,
      box,
      size: reward.reward === 'shirt' ? size : null,
    })
    setBusy(false)
    if (error) return setError(error.message)
    onDone()
  }

  const field = 'rounded-lg border border-line bg-page px-3 py-2 text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand'
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={onClose}>
      <div className="flex w-full max-w-sm flex-col gap-3 rounded-t-2xl bg-card p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl animate-fade-up sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-ink">
            {gift.emoji} Claim: {gift.name}
          </h3>
          <button onClick={onClose} aria-label="Close" className="text-2xl leading-none text-muted">
            ×
          </button>
        </div>
        <input value={name} onChange={(e) => setName(e.target.value.slice(0, 80))} placeholder="Name on your mailbox" className={field} />
        <input value={box} onChange={(e) => setBox(e.target.value.slice(0, 60))} placeholder="Campus mailbox (e.g. Slayter Box 1234)" className={field} />
        {reward.reward === 'shirt' && (
          <div className="flex gap-2">
            {SHIRT_SIZES.map((s) => (
              <button key={s} onClick={() => setSize(s)} className={`flex-1 rounded-full py-1.5 text-sm ${size === s ? 'bg-brand font-bold text-white' : 'bg-page text-ink'}`}>
                {s}
              </button>
            ))}
          </div>
        )}
        <p className="text-xs text-muted">
          Only your campus mailbox — please don't enter a home address. Only the Tonal team sees this, and it's deleted once your gift is sent.
        </p>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button
          onClick={submit}
          disabled={busy || !name.trim() || !box.trim()}
          className="rounded-full bg-brand py-2.5 font-bold text-white disabled:opacity-40"
        >
          {busy ? 'Sending…' : 'Claim my gift 🎁'}
        </button>
      </div>
    </div>
  )
}
