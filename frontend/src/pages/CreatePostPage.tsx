import { useState } from 'react'
import { useNavigate } from 'react-router'
import { supabase } from '../lib/supabase'
import VoiceRecorder from '../components/VoiceRecorder'
import type { Recording } from '../components/VoiceRecorder'

function extensionFor(mime: string) {
  if (mime.includes('mp4')) return 'm4a'
  if (mime.includes('ogg')) return 'ogg'
  return 'webm'
}

export default function CreatePostPage({ userId }: { userId: string }) {
  const navigate = useNavigate()
  const [recording, setRecording] = useState<Recording | null>(null)
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handlePost() {
    if (!recording) return
    setPosting(true)
    setError(null)

    try {
      // "audio/webm;codecs=opus" -> "audio/webm"
      const contentType = recording.blob.type.split(';')[0] || 'audio/webm'
      const path = `${userId}/${crypto.randomUUID()}.${extensionFor(contentType)}`

      // 1. Upload the voice file into my own folder
      const { error: uploadError } = await supabase.storage
        .from('posts')
        .upload(path, recording.blob, { contentType })
      if (uploadError) throw new Error(uploadError.message)

      // 2. Save the post in the database
      const { error: insertError } = await supabase.from('posts').insert({
        author_id: userId,
        kind: 'voice',
        media_path: path,
        duration_ms: recording.durationMs,
      })
      if (insertError) {
        // Don't leave an orphan file behind if saving failed
        await supabase.storage.from('posts').remove([path])
        throw new Error(insertError.message)
      }

      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not post')
    } finally {
      setPosting(false)
    }
  }

  return (
    <div className="flex w-full max-w-sm flex-col gap-5 rounded-2xl border border-line bg-card p-6 shadow-sm animate-fade-up">
      <h2 className="text-xl font-bold text-ink">New post</h2>

      <div className="flex gap-2 rounded-full bg-page p-1 text-sm">
        <span className="flex-1 rounded-full bg-brand py-1.5 text-center font-medium text-white">
          🎙️ Voice
        </span>
        <span className="flex-1 py-1.5 text-center text-muted">🖼️ Image (soon)</span>
      </div>

      <VoiceRecorder onChange={setRecording} />

      {error && <p className="text-sm text-red-500">{error}</p>}

      <button
        onClick={handlePost}
        disabled={!recording || posting}
        className="rounded-full bg-brand py-2.5 font-medium text-white hover:bg-brand-dark active:scale-95 disabled:opacity-40 transition"
      >
        {posting ? 'Posting...' : 'Post'}
      </button>
    </div>
  )
}