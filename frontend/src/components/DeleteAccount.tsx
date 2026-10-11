import { useState } from 'react'
import { supabase } from '../lib/supabase'

// Delete every file in a folder (and one level of sub-folders, e.g. posts/<id>/comments)
async function removeFolder(bucket: string, folder: string, depth = 1): Promise<void> {
  const { data } = await supabase.storage.from(bucket).list(folder, { limit: 1000 })
  const files: string[] = []
  for (const item of data ?? []) {
    if (item.id) files.push(`${folder}/${item.name}`)
    else if (depth > 0) await removeFolder(bucket, `${folder}/${item.name}`, depth - 1)
  }
  for (let i = 0; i < files.length; i += 100) {
    await supabase.storage.from(bucket).remove(files.slice(i, i + 100))
  }
}

export default function DeleteAccount({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function deleteEverything() {
    setBusy(true)
    setError(null)
    try {
      // 1. Files: avatar, posts (and comment files), stories
      await removeFolder('avatars', userId)
      await removeFolder('posts', userId)
      await removeFolder('stories', userId)

      // 2. Files I sent in chats
      const { data } = await supabase
        .from('messages')
        .select('media_path')
        .eq('sender_id', userId)
        .not('media_path', 'is', null)
        .limit(1000)
      const paths = (data ?? []).map((row) => row.media_path as string)
      for (let i = 0; i < paths.length; i += 100) {
        await supabase.storage.from('messages').remove(paths.slice(i, i + 100))
      }

      // 3. The account itself (and all rows, through "on delete cascade")
      const { error } = await supabase.rpc('delete_my_account')
      if (error) throw error

      await supabase.auth.signOut()
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <div className="w-full max-w-sm rounded-2xl border border-red-400/50 bg-card p-5">
      {!open ? (
        <button onClick={() => setOpen(true)} className="w-full text-left font-semibold text-red-500">
          Delete account
        </button>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="font-semibold text-red-500">Delete your account?</p>
          <p className="text-sm text-muted">
            This permanently deletes your profile, posts, comments, stories, messages and files.
            It can't be undone.
          </p>
          <input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder='Type "DELETE" to confirm'
            className="rounded-lg border border-line bg-page px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-red-400"
          />
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={() => {
                setOpen(false)
                setConfirmText('')
              }}
              disabled={busy}
              className="flex-1 rounded-full border border-line py-2 text-sm text-ink hover:bg-page transition"
            >
              Cancel
            </button>
            <button
              onClick={deleteEverything}
              disabled={confirmText !== 'DELETE' || busy}
              className="flex-1 rounded-full bg-red-500 py-2 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-40 transition"
            >
              {busy ? 'Deleting…' : 'Delete forever'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
