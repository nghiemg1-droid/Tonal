import { useEffect, useState } from 'react'
import type { ChangeEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { supabase } from '../lib/supabase'
import { encodeCanvas, makePostImage } from '../lib/image'
import VoiceRecorder from '../components/VoiceRecorder'
import type { Recording } from '../components/VoiceRecorder'
import DrawingPad from '../components/DrawingPad'
import MusicPicker from '../components/MusicPicker'
import MusicCredit from '../components/MusicCredit'
import { trackToColumns } from '../lib/music'
import { checkVideoFile, MAX_VIDEO_MS, readVideo, videoExtension } from '../lib/video'
import { track } from '../lib/analytics'
import type { Track } from '../lib/music'

type Mode = 'voice' | 'image' | 'video'
type CaptionMode = 'none' | 'text' | 'drawing' | 'voice'

const CAPTION_MAX = 300

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
  const [params] = useSearchParams()
  const prompt = params.get('prompt') // "Question of the day" answer
  const [mode, setMode] = useState<Mode>('voice')
  const [voiceCaption, setVoiceCaption] = useState(prompt ? `${prompt} #qotd` : '')

  // Voice post
  const [recording, setRecording] = useState<Recording | null>(null)

  // Image post
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [imageAudio, setImageAudio] = useState<Recording | null>(null)
  const [soundMode, setSoundMode] = useState<'none' | 'music' | 'voice'>('none')
  const [music, setMusic] = useState<Track | null>(null)
  const [pickingMusic, setPickingMusic] = useState(false)

  // Caption (image posts only)
  const [captionMode, setCaptionMode] = useState<CaptionMode>('none')
  const [captionInput, setCaptionInput] = useState('')
  const [drawingCanvas, setDrawingCanvas] = useState<HTMLCanvasElement | null>(null)
  const [captionVoice, setCaptionVoice] = useState<Recording | null>(null)

  // Video post
  const [videoFile, setVideoFile] = useState<File | null>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [videoCaption, setVideoCaption] = useState('')

  const [posting, setPosting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Free the preview image from memory when it's replaced
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  // Preview link for the chosen video
  useEffect(() => {
    if (!videoFile) {
      setVideoUrl(null)
      return
    }
    const url = URL.createObjectURL(videoFile)
    setVideoUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [videoFile])

  function handleVideoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const problem = checkVideoFile(file)
    if (problem) {
      setError(problem)
      return
    }
    setError(null)
    setVideoFile(file)
  }

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

    async function upload(blob: Blob, contentType: string, ext: string) {
      const path = `${userId}/${crypto.randomUUID()}.${ext}`
      const { error } = await supabase.storage.from('posts').upload(path, blob, { contentType })
      if (error) throw new Error(error.message)
      uploaded.push(path)
      return path
    }

    try {
      let mediaPath: string
      let audioPath: string | null = null
      let durationMs: number | null = null
      let captionKind: Exclude<CaptionMode, 'none'> | null = null
      let captionText: string | null = null
      let captionPath: string | null = null
      let captionDurationMs: number | null = null
      let posterPath: string | null = null

      if (mode === 'video') {
        if (!videoFile) return
        // Length check + a still picture for the feed, made in the browser
        const { durationMs: length, poster } = await readVideo(videoFile)
        if (length > MAX_VIDEO_MS + 500) throw new Error('Videos can be up to 60 seconds. Try trimming it first.')
        durationMs = Math.min(length, MAX_VIDEO_MS)
        mediaPath = await upload(videoFile, videoFile.type, videoExtension(videoFile.type))
        posterPath = await upload(poster, poster.type, poster.type === 'image/webp' ? 'webp' : 'jpg')
        const text = videoCaption.trim()
        if (text) {
          captionKind = 'text'
          captionText = text
        }
      } else if (mode === 'voice') {
        if (!recording) return
        const type = baseType(recording.blob, 'audio/webm')
        mediaPath = await upload(recording.blob, type, audioExtension(type))
        durationMs = recording.durationMs
        const text = voiceCaption.trim()
        if (text) {
          captionKind = 'text'
          captionText = text
        }
      } else {
        if (!imageFile) return

        // 1. The photo (shrunk, GPS removed)
        const photo = await makePostImage(imageFile)
        mediaPath = await upload(photo, photo.type, photo.type === 'image/webp' ? 'webp' : 'jpg')

        // 2. Optional background sound
        if (soundMode === 'voice' && imageAudio) {
          const type = baseType(imageAudio.blob, 'audio/webm')
          audioPath = await upload(imageAudio.blob, type, audioExtension(type))
          durationMs = imageAudio.durationMs
        }

        // 3. Optional caption
        const text = captionInput.trim()
        if (captionMode === 'text' && text) {
          captionKind = 'text'
          captionText = text
        } else if (captionMode === 'drawing' && drawingCanvas) {
          const drawing = await encodeCanvas(drawingCanvas)
          captionKind = 'drawing'
          captionPath = await upload(
            drawing,
            drawing.type,
            drawing.type === 'image/webp' ? 'webp' : 'jpg',
          )
        } else if (captionMode === 'voice' && captionVoice) {
          const type = baseType(captionVoice.blob, 'audio/webm')
          captionKind = 'voice'
          captionPath = await upload(captionVoice.blob, type, audioExtension(type))
          captionDurationMs = captionVoice.durationMs
        }
      }

      // 4. Save the post in the database
      const { error: insertError } = await supabase.from('posts').insert({
        author_id: userId,
        kind: mode,
        media_path: mediaPath,
        audio_path: audioPath,
        duration_ms: durationMs,
        caption_kind: captionKind,
        caption_text: captionText,
        caption_path: captionPath,
        caption_duration_ms: captionDurationMs,
        transcript: mode === 'voice' ? (recording?.transcript ?? null) : null,
        poster_path: posterPath,
        ...trackToColumns(mode === 'image' && soundMode === 'music' ? music : null),
      })
      if (insertError) throw new Error(insertError.message)

      track('post_created', { kind: mode, qotd: !!prompt })
      navigate('/')
    } catch (err) {
      // Don't leave orphan files behind if something failed
      if (uploaded.length > 0) await supabase.storage.from('posts').remove(uploaded)
      setError(err instanceof Error ? err.message : 'Could not post')
    } finally {
      setPosting(false)
    }
  }

  const canPost =
    mode === 'voice' ? recording !== null : mode === 'video' ? videoFile !== null : imageFile !== null
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
        <button type="button" onClick={() => setMode('video')} className={tabClass(mode === 'video')}>
          🎬 Video
        </button>
      </div>

      <div className={mode === 'video' ? 'flex flex-col items-center gap-3' : 'hidden'}>
        {videoUrl ? (
          <>
            <video src={videoUrl} controls playsInline className="max-h-96 w-full rounded-xl bg-black" />
            <label className="cursor-pointer rounded-full border border-line px-4 py-1.5 text-sm text-ink hover:bg-page active:scale-95 transition">
              Choose another
              <input type="file" accept="video/mp4,video/quicktime,video/webm" onChange={handleVideoChange} className="sr-only" />
            </label>
            <textarea
              value={videoCaption}
              onChange={(e) => setVideoCaption(e.target.value)}
              maxLength={300}
              rows={2}
              placeholder="Write a caption… use #hashtags and @mentions (optional)"
              className="w-full resize-none rounded-lg border border-line bg-page px-3 py-2 text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </>
        ) : (
          <label className="flex h-40 w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line text-muted hover:border-brand hover:text-brand transition">
            <span className="text-4xl">🎬</span>
            Tap to choose a video
            <span className="text-xs">Up to 60 seconds · 50 MB</span>
            <input type="file" accept="video/mp4,video/quicktime,video/webm" onChange={handleVideoChange} className="sr-only" />
          </label>
        )}
      </div>

      {/* Everything stays mounted so switching tabs doesn't lose your work */}
      <div className={mode === 'voice' ? '' : 'hidden'}>
        {prompt && (
          <p className="mb-3 rounded-xl bg-brand/10 p-3 text-center text-sm font-medium text-ink">
            💬 {prompt}
          </p>
        )}
        <VoiceRecorder onChange={setRecording} />
        <textarea
          value={voiceCaption}
          onChange={(e) => setVoiceCaption(e.target.value)}
          maxLength={300}
          rows={2}
          placeholder="Add a caption… use #hashtags and @mentions (optional)"
          className="mt-3 w-full resize-none rounded-lg border border-line bg-page px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand"
        />
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

            {/* Background sound: music from the library, or your own recording */}
            <div className="mt-2 flex w-full flex-col gap-3 border-t border-line pt-4">
              <p className="text-center text-sm text-muted">
                Sound <span className="opacity-70">(optional, plays while the photo is on screen)</span>
              </p>
              <div className="flex gap-1 rounded-full bg-page p-1 text-sm">
                <button type="button" onClick={() => setSoundMode('none')} className={tabClass(soundMode === 'none')}>
                  None
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSoundMode('music')
                    if (!music) setPickingMusic(true)
                  }}
                  className={tabClass(soundMode === 'music')}
                >
                  🎵 Music
                </button>
                <button type="button" onClick={() => setSoundMode('voice')} className={tabClass(soundMode === 'voice')}>
                  🎙️ Record
                </button>
              </div>

              {soundMode === 'music' && music && (
                <div className="flex items-center gap-3 rounded-xl bg-page px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <MusicCredit track={music} />
                  </div>
                  <button
                    type="button"
                    onClick={() => setPickingMusic(true)}
                    className="text-sm font-medium text-brand"
                  >
                    Change
                  </button>
                </div>
              )}
              <div className={soundMode === 'voice' ? '' : 'hidden'}>
                <VoiceRecorder onChange={setImageAudio} />
              </div>
            </div>

            {pickingMusic && (
              <MusicPicker
                onSelect={(track) => {
                  setMusic(track)
                  setSoundMode('music')
                  setPickingMusic(false)
                }}
                onClose={() => {
                  setPickingMusic(false)
                  if (!music) setSoundMode('none')
                }}
              />
            )}

            {/* Caption */}
            <div className="mt-2 flex w-full flex-col gap-3 border-t border-line pt-4">
              <p className="text-center text-sm text-muted">
                Caption <span className="opacity-70">(optional)</span>
              </p>

              <div className="flex gap-1 rounded-full bg-page p-1 text-sm">
                <button type="button" onClick={() => setCaptionMode('none')} className={tabClass(captionMode === 'none')}>
                  None
                </button>
                <button type="button" onClick={() => setCaptionMode('text')} className={tabClass(captionMode === 'text')}>
                  Aa
                </button>
                <button type="button" onClick={() => setCaptionMode('drawing')} className={tabClass(captionMode === 'drawing')}>
                  ✏️
                </button>
                <button type="button" onClick={() => setCaptionMode('voice')} className={tabClass(captionMode === 'voice')}>
                  🎙️
                </button>
              </div>

              <div className={captionMode === 'text' ? '' : 'hidden'}>
                <textarea
                  value={captionInput}
                  onChange={(e) => setCaptionInput(e.target.value)}
                  maxLength={CAPTION_MAX}
                  rows={3}
                  placeholder="Write a caption… use #hashtags and @mentions"
                  className="w-full resize-none rounded-lg border border-line bg-page px-3 py-2 text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand"
                />
                <p className="text-right text-xs text-muted">
                  {captionInput.length}/{CAPTION_MAX}
                </p>
              </div>

              <div className={captionMode === 'drawing' ? '' : 'hidden'}>
                <DrawingPad onChange={setDrawingCanvas} />
              </div>

              <div className={captionMode === 'voice' ? '' : 'hidden'}>
                <VoiceRecorder onChange={setCaptionVoice} />
              </div>
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
        {posting ? (mode === 'video' ? 'Uploading video…' : 'Posting...') : 'Post'}
      </button>
    </div>
  )
}