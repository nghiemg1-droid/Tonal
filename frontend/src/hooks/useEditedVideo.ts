import { useEffect } from 'react'
import type { RefObject } from 'react'
import type { VideoEdit } from '../lib/videoEdit'

// Plays a video with its edits: only the trimmed part (looping), at the chosen speed,
// with the chosen sound levels. Background music (if any) follows the video:
// it plays, pauses and restarts together with it.
export function useEditedVideo(
  videoRef: RefObject<HTMLVideoElement | null>,
  musicRef: RefObject<HTMLAudioElement | null>,
  edit: VideoEdit,
) {
  const { start, end, speed, volume, musicVolume } = edit

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const endTime = () => (end !== null && Number.isFinite(video.duration) ? Math.min(end, video.duration) : video.duration)

    function syncMusic() {
      const music = musicRef.current
      if (!music) return
      const offset = Math.max(0, (video!.currentTime - start) / speed)
      music.currentTime = Number.isFinite(music.duration) && music.duration > 0 ? offset % music.duration : offset
    }

    function restart() {
      video!.currentTime = start
      const music = musicRef.current
      if (music) music.currentTime = 0
    }

    function onLoaded() {
      video!.defaultPlaybackRate = speed
      video!.playbackRate = speed
      if (video!.currentTime < start || video!.currentTime > endTime()) video!.currentTime = start
    }

    function onTimeUpdate() {
      if (video!.currentTime >= endTime() - 0.04) {
        restart()
      } else if (video!.currentTime < start - 0.2) {
        video!.currentTime = start
      }
    }

    function onEnded() {
      restart()
      video!.play().catch(() => {})
    }

    function onPlay() {
      video!.playbackRate = speed // some browsers reset it
      const music = musicRef.current
      if (!music) return
      syncMusic()
      music.play().catch(() => {})
    }

    function onPause() {
      musicRef.current?.pause()
    }

    if (video.readyState >= 1) onLoaded()
    video.addEventListener('loadedmetadata', onLoaded)
    video.addEventListener('timeupdate', onTimeUpdate)
    video.addEventListener('ended', onEnded)
    video.addEventListener('play', onPlay)
    video.addEventListener('pause', onPause)
    if (!video.paused) onPlay()
    return () => {
      video.removeEventListener('loadedmetadata', onLoaded)
      video.removeEventListener('timeupdate', onTimeUpdate)
      video.removeEventListener('ended', onEnded)
      video.removeEventListener('play', onPlay)
      video.removeEventListener('pause', onPause)
      musicRef.current?.pause()
    }
  }, [videoRef, musicRef, start, end, speed])

  // Sound levels (phones may ignore volume; a level of 0 also mutes, see the players)
  useEffect(() => {
    if (videoRef.current) videoRef.current.volume = volume
    if (musicRef.current) musicRef.current.volume = musicVolume
  }, [videoRef, musicRef, volume, musicVolume])
}
