import { useEffect, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { makeAvatar } from '../lib/image'
import Avatar from './Avatar'

type Profile = {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
}

type Props = {
  userId: string
  refreshKey?: number
}

const USERNAME_RULE = /^[a-z0-9_]{3,20}$/
const PROFILE_FIELDS = 'id, username, display_name, avatar_url'

export default function ProfileEditor({ userId, refreshKey }: Props) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [counts, setCounts] = useState({ followers: 0, following: 0 })
  const [editing, setEditing] = useState(false)
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load my profile
  useEffect(() => {
    supabase
      .from('profiles')
      .select(PROFILE_FIELDS)
      .eq('id', userId)
      .single()
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setProfile(data)
      })
  }, [userId])

  // Load follower / following counts
  useEffect(() => {
    Promise.all([
      supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('following_id', userId),
      supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('follower_id', userId),
    ]).then(([followers, following]) => {
      setCounts({ followers: followers.count ?? 0, following: following.count ?? 0 })
    })
  }, [userId, refreshKey])

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
      .select(PROFILE_FIELDS)
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

  async function handleAvatarChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow picking the same file again later
    if (!file || !profile) return

    if (!file.type.startsWith('image/')) {
      setError('Please choose an image')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('Image is too large (max 10 MB)')
      return
    }

    setUploading(true)
    setError(null)

    try {
      // 1. Crop, shrink and strip EXIF in the browser
      const blob = await makeAvatar(file)
      const ext = blob.type === 'image/webp' ? 'webp' : 'jpg'
      const path = `${userId}/avatar-${Date.now()}.${ext}`

      // 2. Upload to the avatars bucket, inside my own folder
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, blob, { contentType: blob.type })
      if (uploadError) throw new Error(uploadError.message)

      // 3. Save the public link on my profile
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path)
      const { data, error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: urlData.publicUrl })
        .eq('id', userId)
        .select(PROFILE_FIELDS)
        .single()
      if (updateError) throw new Error(updateError.message)

      // 4. Delete the old photo so it doesn't waste storage
      const oldPath = profile.avatar_url?.split('/avatars/')[1]
      if (oldPath) await supabase.storage.from('avatars').remove([oldPath])

      setProfile(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
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
        <>
          <div className="flex items-center gap-4">
            {/* Tap the photo to change it */}
            <label className="relative shrink-0 cursor-pointer" title="Change photo">
              <Avatar name={name} url={profile.avatar_url} className="h-16 w-16 text-2xl" />
              <span className="absolute -right-1 -bottom-1 flex h-6 w-6 items-center justify-center rounded-full border border-line bg-card text-xs">
                📷
              </span>
              {uploading && (
                <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 text-xs text-white">
                  ...
                </span>
              )}
              <input
                type="file"
                accept="image/*"
                onChange={handleAvatarChange}
                disabled={uploading}
                className="sr-only"
              />
            </label>

            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-ink">{name}</p>
              <p className="truncate text-sm text-muted">@{profile.username}</p>
              <p className="mt-1 text-sm text-muted">
                <span className="font-semibold text-ink">{counts.followers}</span> followers ·{' '}
                <span className="font-semibold text-ink">{counts.following}</span> following
              </p>
            </div>

            <button
              onClick={startEditing}
              className="rounded-full border border-line px-4 py-1.5 text-sm text-ink hover:bg-page active:scale-95 transition"
            >
              Edit
            </button>
          </div>

          {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
        </>
      )}
    </div>
  )
}