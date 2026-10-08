import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'

type Profile = {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
}

const USERNAME_RULE = /^[a-z0-9_]{3,20}$/

export default function ProfileEditor({ userId }: { userId: string }) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [editing, setEditing] = useState(false)
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load my profile
  useEffect(() => {
    supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url')
      .eq('id', userId)
      .single()
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setProfile(data)
      })
  }, [userId])

  function startEditing() {
    if (!profile) return
    setUsername(profile.username)
    setDisplayName(profile.display_name ?? '')
    setError(null)
    setEditing(true)
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    const cleanUsername = username.trim().toLowerCase()

    if (!USERNAME_RULE.test(cleanUsername)) {
      setError('Username must be 3–20 characters: lowercase letters, numbers or _')
      return
    }

    setSaving(true)
    setError(null)

    const { data, error } = await supabase
      .from('profiles')
      .update({ username: cleanUsername, display_name: displayName.trim() || null })
      .eq('id', userId)
      .select('id, username, display_name, avatar_url')
      .single()

    setSaving(false)

    if (error) {
      // 23505 = unique violation: someone already has this username
      setError(error.code === '23505' ? 'That username is already taken' : error.message)
      return
    }

    setProfile(data)
    setEditing(false)
  }

  if (!profile) {
    return error ? <p className="text-sm text-red-500">{error}</p> : null
  }

  const name = profile.display_name || profile.username
  const inputClass =
    'rounded-lg border border-line bg-page px-3 py-2 text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand'

  return (
    <div className="w-full max-w-sm rounded-2xl border border-line bg-card p-6 shadow-sm animate-fade-up [animation-delay:150ms]">
      {editing ? (
        <form onSubmit={handleSave} className="flex flex-col gap-3">
          <h2 className="text-xl font-bold text-ink">Edit profile</h2>

          <label className="flex flex-col gap-1 text-sm text-muted">
            Username
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className={inputClass}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm text-muted">
            Display name
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={50}
              placeholder="Your name"
              className={inputClass}
            />
          </label>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-full bg-brand py-2 font-medium text-white hover:bg-brand-dark active:scale-95 disabled:opacity-50 transition"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="flex-1 rounded-full border border-line py-2 text-ink hover:bg-page active:scale-95 transition"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand text-2xl font-bold text-white">
            {name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-ink">{name}</p>
            <p className="truncate text-sm text-muted">@{profile.username}</p>
          </div>
          <button
            onClick={startEditing}
            className="rounded-full border border-line px-4 py-1.5 text-sm text-ink hover:bg-page active:scale-95 transition"
          >
            Edit
          </button>
        </div>
      )}
    </div>
  )
}