// Live speech-to-text using the browser's built-in speech service (e.g. Google's in Chrome). Free; the audio goes to that service, not to Tonal's servers.
// If the browser can't do it, voice clips simply have no transcript.

type Result = { 0: { transcript: string }; isFinal: boolean }
type RecognitionEvent = { resultIndex: number; results: ArrayLike<Result> }

type Recognition = {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((e: RecognitionEvent) => void) | null
  onerror: (() => void) | null
  start: () => void
  stop: () => void
}

type RecognitionClass = new () => Recognition

function getRecognitionClass(): RecognitionClass | null {
  const w = window as unknown as { SpeechRecognition?: RecognitionClass; webkitSpeechRecognition?: RecognitionClass }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

// Starts listening; call the returned function to stop and get the text
export function startTranscript(): () => string {
  const Klass = getRecognitionClass()
  // On iPhone/iPad, listening and recording at the same time can break the recording, so skip it there
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  if (!Klass || isIos) return () => ''

  let finalText = ''
  const recognition = new Klass()
  recognition.continuous = true
  recognition.interimResults = false
  recognition.lang = navigator.language || 'en-US'
  recognition.onresult = (e) => {
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) finalText += e.results[i][0].transcript + ' '
    }
  }
  recognition.onerror = () => {}
  try {
    recognition.start()
  } catch {
    return () => ''
  }

  return () => {
    try {
      recognition.stop()
    } catch {
      // already stopped
    }
    return finalText.trim().slice(0, 2000)
  }
}
