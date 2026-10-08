import { useEffect, useState } from 'react'
import type { ChangeEvent } from 'react'
import { useNavigate } from 'react-router'
import { supabase } from '../lib/supabase'
import { makePostImage } from '../lib/image'
import VoiceRecorder from '../components/VoiceRecorder'
import type { Recording } from '../components/VoiceRecorder'

type Mode = 'voice' | 'image'

function audioExtension(mime: string) {
  if (mime.includes('mp4')) return 'm4a'
  if (mime.includes('ogg')) return 'ogg'
  return 'webm'
}

// "audio/webm;codecs=opus" -> "audio/webm"
function baseType(blob: Blob, fallback: string) {
  return blob.type.split(';')[0] || fallback
}

export default function CreatePostPage({ userId }: { userId: string }) {
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('voice')
  const [recording, setRecording] = useState<Recording | null>(null)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imageAudio, setImageAudio] = useState<Recording | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Free the preview image from memory when it's replaced
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  function handleImageChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setError('Please choose an image')
      return
    }
    if (file.size > 20 * 1024 * 1024) {
      setError('Image is too large (max 20 MB)')
      return
    }

    setError(null)
    setImageFile(file)
    setPreviewUrl(URL.createObjectURL(file))
  }

  async function handlePost() {
    setPosting(true)
    setError(null)
    const uploaded: string[] = [] // so we can clean up if something fails

    try {
      let mainBlob: Blob
      let mainType: string
      let mainExt: string
      let audioPath: string | null = null
      let durationMs: number | null = null

      if (mode === 'voice') {
        if (!recording) return
        mainBlob = recording.blob
        mainType = baseType(mainBlob, 'audio/webm')
        mainExt = audioExtension(mainType)
        durationMs = recording.durationMs
      } else {
        if (!imageFile) return
        mainBlob = await makePostImage(imageFile) // shrink + strip GPS
        mainType = mainBlob.type
        mainExt = mainType === 'image/webp' ? 'webp' : 'jpg'
      }

      // 1. Upload the main file (voice or photo)
      const mainPath = `${userId}/${crypto.randomUUID()}.${mainExt}`
      const { error: mainError } = await supabase.storage
        .from('posts')
        .upload(mainPath, mainBlob, { contentType: mainType })
      if (mainError) throw new Error(mainError.message)
      uploaded.push(mainPath)

      // 2. Photo with sound: upload the sound too
      if (mode === 'image' && imageAudio) {
        const audioType = baseType(imageAudio.blob, 'audio/webm')
        audioPath = `${userId}/${crypto.randomUUID()}.${audioExtension(audioType)}`
        const { error: audioError } = await supabase.storage
          .from('posts')
          .upload(audioPath, imageAudio.blob, { contentType: audioType })
        if (audioError) throw new Error(audioError.message)
        uploaded.push(audioPath)
        durationMs = imageAudio.durationMs
      }

      // 3. Save the post in the database
      const { error: insertError } = await supabase.from('posts').insert({
        author_id: userId,
        kind: mode,
        media_path: mainPath,
        audio_path: audioPath,
        duration_ms: durationMs,
      })
      if (insertError) throw new Error(insertError.message)

      navigate('/')
    } catch (err) {
      // Don't leave orphan files behind if something failed
      if (uploaded.length > 0) await supabase.storage.from('posts').remove(uploaded)
      setError(err instanceof Error ? err.message : 'Could not post')
    } finally {
      setPosting(false)
    }
  }

  const canPost = mode === 'voice' ? recording !== null : imageFile !== null
  const tabClass = (active: boolean) =>
    `flex-1 rounded-full py-1.5 text-center transition ${
      active ? 'bg-brand font-medium text-white' : 'text-muted hover:text-ink'
    }`

  return (
    <div className="flex w-full max-w-sm flex-col gap-5 rounded-2xl border border-line bg-card p-6 shadow-sm animate-fade-up">
      <h2 className="text-xl font-bold text-ink">New post</h2>

      <div className="flex gap-2 rounded-full bg-page p-1 text-sm">
        <button type="button" onClick={() => setMode('voice')} className={tabClass(mode === 'voice')}>
          🎙️ Voice
        </button>
        <button type="button" onClick={() => setMode('image')} className={tabClass(mode === 'image')}>
          🖼️ Image
        </button>
      </div>

      {/* Both stay mounted so switching tabs doesn't lose your recording or photo */}
      <div className={mode === 'voice' ? '' : 'hidden'}>
        <VoiceRecorder onChange={setRecording} />
      </div>

      <div className={mode === 'image' ? 'flex flex-col items-center gap-3' : 'hidden'}>
        {previewUrl ? (
          <>
            <img
              src={previewUrl}
              alt="Selected photo preview"
              className="max-h-80 w-full rounded-xl object-cover"
            />
            <label className="cursor-pointer rounded-full border border-line px-4 py-1.5 text-sm text-ink hover:bg-page active:scale-95 transition">
              Choose another
              <input type="file" accept="image/*" onChange={handleImageChange} className="sr-only" />
            </label>

            <div className="mt-2 w-full border-t border-line pt-4">
              <p className="mb-3 text-center text-sm text-muted">
                Add your voice or a song you made <span className="opacity-70">(optional)</span>
              </p>
              <VoiceRecorder onChange={setImageAudio} />
            </div>
          </>
        ) : (
          <label className="flex h-40 w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line text-muted hover:border-brand hover:text-brand transition">
            <span className="text-4xl">🖼️</span>
            Tap to choose a photo
            <input type="file" accept="image/*" onChange={handleImageChange} className="sr-only" />
          </label>
        )}
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <button
        onClick={handlePost}
        disabled={!canPost || posting}
        className="rounded-full bg-brand py-2.5 font-medium text-white hover:bg-brand-dark active:scale-95 disabled:opacity-40 transition"
      >
        {posting ? 'Posting...' : 'Post'}
      </button>
    </div>
  )
}