'use client'

import React, { useState, useCallback, useEffect, useRef } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { supabase } from '@/lib/supabase/client'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Card } from '@/components/ui/card'
import {
  Loader2,
  Video,
  VideoOff,
  Clock,
  Eye,
  Shield,
  AlertTriangle,
  CheckCircle2,
  Mic,
  MicOff,
  Camera,
  Send,
  Globe,
  ArrowRight,
  SkipForward,
  Users,
  Volume2,
  Scan,
  UserCheck,
  XCircle,
  UserX,
  FileWarning,
  MonitorX,
  Smartphone,
  Wifi,
} from 'lucide-react'
import {
  loadFaceModels,
  extractFaceDescriptor,
  extractFaceFromUrl,
  extractFaceFromVideo,
  compareFaceDescriptors,
  getVerificationMessage,
  type FaceDescriptor,
  type FaceMatchResult,
} from '@/lib/faceVerification'
import Editor from '@monaco-editor/react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface MultilingualQuestion {
  en: string
  hi: string
  te: string
}

export interface VideoAssessmentResult {
  skill: string
  submitted: boolean
  assessmentId?: string
  verdict?: 'approved' | 'rejected' | 'pending'
  verdictReason?: string
  score?: number
  // Verification failure details
  verificationFailure?: {
    type: 'face_mismatch' | 'multiple_faces' | 'no_face' | 'plagiarism' | 'wrong_answer' | 'other'
    message: string
    timestamp?: string
  }
}

interface VideoSkillAssessmentProps {
  skills: string[]
  workerId: string
  profilePictureUrl?: string | null  // Optional profile picture for verification
  onComplete: (results: VideoAssessmentResult[]) => void
  onCancel: () => void
  open: boolean
}

type Phase = 'selfie-verification' | 'intro' | 'loading' | 'read-question' | 'recording' | 'submitting' | 'skill-done' | 'coding-challenge' | 'all-done'
type Language = 'en' | 'hi' | 'te'

const LANG_LABELS: Record<Language, string> = {
  en: '🇬🇧 English',
  hi: '🇮🇳 हिन्दी',
  te: '🇮🇳 తెలుగు',
}

const QUESTION_READ_TIME_S = 30  // 30 seconds to read question
const RECORDING_TIME_S = 60      // 1 minute to record answer
const MAX_VIDEO_SIZE_MB = 8      // Keep under Next.js body limit (base64 adds ~33%)

// ── Audio Analysis Helpers ────────────────────────────────────────────────────

interface AudioMetrics {
  avgVolume: number
  volumeVariance: number
  silenceRatio: number
  peakCount: number
  zeroCrossings: number
  speechRateVariance: number
}

class AudioAnalyzer {
  private audioContext: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private volumes: number[] = []
  private silentFrames = 0
  private totalFrames = 0
  private peaks = 0
  private lastVolume = 0
  private intervalId: ReturnType<typeof setInterval> | null = null

  start(stream: MediaStream) {
    try {
      this.audioContext = new AudioContext()
      this.analyser = this.audioContext.createAnalyser()
      this.analyser.fftSize = 2048
      this.source = this.audioContext.createMediaStreamSource(stream)
      this.source.connect(this.analyser)

      const dataArray = new Uint8Array(this.analyser.frequencyBinCount)

      this.intervalId = setInterval(() => {
        if (!this.analyser) return
        this.analyser.getByteTimeDomainData(dataArray)

        // Calculate RMS volume
        let sum = 0
        let zeroCrossings = 0
        for (let i = 0; i < dataArray.length; i++) {
          const val = (dataArray[i] - 128) / 128
          sum += val * val
          if (i > 0) {
            const prev = (dataArray[i - 1] - 128) / 128
            if ((val >= 0 && prev < 0) || (val < 0 && prev >= 0)) {
              zeroCrossings++
            }
          }
        }
        const rms = Math.sqrt(sum / dataArray.length)
        this.volumes.push(rms)
        this.totalFrames++

        if (rms < 0.02) this.silentFrames++

        // Detect peaks (emphasis)
        if (rms > this.lastVolume + 0.05 && rms > 0.05) this.peaks++
        this.lastVolume = rms
      }, 100) // Sample every 100ms
    } catch (e) {
      console.warn('AudioAnalyzer: Failed to start', e)
    }
  }

  stop(): AudioMetrics {
    if (this.intervalId) clearInterval(this.intervalId)
    if (this.source) this.source.disconnect()
    if (this.audioContext) this.audioContext.close()

    const avgVolume = this.volumes.length > 0
      ? this.volumes.reduce((a, b) => a + b, 0) / this.volumes.length
      : 0

    const volumeVariance = this.volumes.length > 1
      ? this.volumes.reduce((sum, v) => sum + Math.pow(v - avgVolume, 2), 0) / this.volumes.length
      : 0

    // Calculate speech rate variance using windowed averages
    const windowSize = 10
    const windowAvgs: number[] = []
    for (let i = 0; i + windowSize <= this.volumes.length; i += windowSize) {
      const windowSlice = this.volumes.slice(i, i + windowSize)
      windowAvgs.push(windowSlice.reduce((a, b) => a + b, 0) / windowSize)
    }
    const avgRate = windowAvgs.length > 0
      ? windowAvgs.reduce((a, b) => a + b, 0) / windowAvgs.length
      : 0
    const speechRateVariance = windowAvgs.length > 1
      ? windowAvgs.reduce((sum, v) => sum + Math.pow(v - avgRate, 2), 0) / windowAvgs.length
      : 0

    return {
      avgVolume,
      volumeVariance,
      silenceRatio: this.totalFrames > 0 ? this.silentFrames / this.totalFrames : 0,
      peakCount: this.peaks,
      zeroCrossings: 0, // Simplified — full calculation would need more data
      speechRateVariance,
    }
  }
}

// ── Face Detection Helper ─────────────────────────────────────────────────────
// Uses Google MediaPipe Vision (WASM) for reliable face detection in all browsers.
// Model + WASM runtime are loaded from CDN on first use (~2 MB one-time download).

class FaceMonitor {
  private detector: any = null
  private timerId: ReturnType<typeof setTimeout> | null = null
  private onMultipleFaces: (count: number) => void
  private onNoFace?: () => void
  private running = false
  private lastAlertTime = 0
  private noFaceStreakStart = 0
  private noFaceAlerted = false
  private static ALERT_COOLDOWN_MS = 3000
  private static NO_FACE_ALERT_MS = 2000  // alert after 2 s with no face

  // Eye-contact tracking
  private framesChecked = 0
  private framesWithFace = 0

  constructor(onMultipleFaces: (count: number) => void, onNoFace?: () => void) {
    this.onMultipleFaces = onMultipleFaces
    this.onNoFace = onNoFace
  }

  getStats(): { eyeContactPercent: number; framesChecked: number } {
    if (this.framesChecked === 0) return { eyeContactPercent: 100, framesChecked: 0 }
    return {
      eyeContactPercent: Math.round((this.framesWithFace / this.framesChecked) * 100),
      framesChecked: this.framesChecked,
    }
  }

  async start(videoEl: HTMLVideoElement) {
    try {
      // Dynamically import MediaPipe Vision to keep the initial bundle lean
      const { FaceDetector, FilesetResolver } = await import('@mediapipe/tasks-vision')

      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
      )

      this.detector = await FaceDetector.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite',
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
      })

      this.running = true
      console.log('[FaceMonitor] MediaPipe face detector loaded ✓')
      this.loop(videoEl)
    } catch (e) {
      console.warn('FaceMonitor: Failed to initialise MediaPipe', e)
      this.running = false
    }
  }

  private loop(videoEl: HTMLVideoElement) {
    if (!this.running || !this.detector) return

    const detect = () => {
      if (!this.running || !this.detector) return
      try {
        // MediaPipe VIDEO mode needs monotonically-increasing timestamps
        const nowMs = performance.now()
        const result = this.detector.detectForVideo(videoEl, nowMs)
        const faceCount = result?.detections?.length ?? 0
        this.framesChecked++

        if (faceCount >= 1) {
          this.framesWithFace++
          this.noFaceStreakStart = 0
          this.noFaceAlerted = false
        } else {
          if (this.noFaceStreakStart === 0) this.noFaceStreakStart = Date.now()
          const absentMs = Date.now() - this.noFaceStreakStart
          if (absentMs >= FaceMonitor.NO_FACE_ALERT_MS && !this.noFaceAlerted) {
            this.noFaceAlerted = true
            this.onNoFace?.()
          }
        }

        if (faceCount > 1) {
          const now = Date.now()
          if (now - this.lastAlertTime > FaceMonitor.ALERT_COOLDOWN_MS) {
            this.lastAlertTime = now
            this.onMultipleFaces(faceCount)
          }
        }
      } catch {
        // Frame detection error — skip
      }
      // Run at ~3 fps to keep CPU usage low
      if (this.running) {
        this.timerId = setTimeout(() => {
          requestAnimationFrame(() => detect())
        }, 333)
      }
    }

    detect()
  }

  stop() {
    this.running = false
    if (this.timerId != null) {
      clearTimeout(this.timerId)
      this.timerId = null
    }
    if (this.detector) {
      try { this.detector.close() } catch { /* ignore */ }
      this.detector = null
    }
  }
}

// ── Noise Detection Helper ────────────────────────────────────────────────────
// Monitors frequency spectrum during recording. Detects:
//  1. Sudden loud non-speech noise spikes (e.g. banging, shouting from others)
//  2. Persistent background noise (e.g. traffic, music)
// Human speech is concentrated in 300 Hz – 3400 Hz. Energy outside that range
// that exceeds a threshold triggers a noise alert.

class NoiseMonitor {
  private analyser: AnalyserNode | null = null
  private audioContext: AudioContext | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private intervalId: ReturnType<typeof setInterval> | null = null
  private onNoiseDetected: (type: 'spike' | 'background') => void
  private lastAlertTime = 0
  private static ALERT_COOLDOWN_MS = 4000

  // Tuneable thresholds
  private static SPIKE_THRESHOLD = 0.25       // RMS spike detection
  private static BG_NOISE_THRESHOLD = 0.08    // Persistent non-speech energy
  private bgNoiseWindowCount = 0
  private bgNoiseWindowTotal = 0
  private static BG_WINDOW_SIZE = 20          // ~2 seconds at 100ms intervals

  constructor(onNoiseDetected: (type: 'spike' | 'background') => void) {
    this.onNoiseDetected = onNoiseDetected
  }

  start(stream: MediaStream) {
    try {
      this.audioContext = new AudioContext()
      this.analyser = this.audioContext.createAnalyser()
      this.analyser.fftSize = 2048
      this.source = this.audioContext.createMediaStreamSource(stream)
      this.source.connect(this.analyser)

      const freqData = new Uint8Array(this.analyser.frequencyBinCount)
      const sampleRate = this.audioContext.sampleRate
      const binSize = sampleRate / this.analyser.fftSize // Hz per bin

      // Speech band bins (300 Hz – 3400 Hz)
      const speechLow = Math.floor(300 / binSize)
      const speechHigh = Math.ceil(3400 / binSize)

      this.intervalId = setInterval(() => {
        if (!this.analyser) return
        this.analyser.getByteFrequencyData(freqData)

        // Compute energy in speech band vs. non-speech band
        let speechEnergy = 0
        let nonSpeechEnergy = 0
        let speechBins = 0
        let nonSpeechBins = 0

        for (let i = 0; i < freqData.length; i++) {
          const normalised = freqData[i] / 255
          if (i >= speechLow && i <= speechHigh) {
            speechEnergy += normalised * normalised
            speechBins++
          } else {
            nonSpeechEnergy += normalised * normalised
            nonSpeechBins++
          }
        }

        const speechRms = speechBins > 0 ? Math.sqrt(speechEnergy / speechBins) : 0
        const nonSpeechRms = nonSpeechBins > 0 ? Math.sqrt(nonSpeechEnergy / nonSpeechBins) : 0
        const totalRms = Math.sqrt((speechEnergy + nonSpeechEnergy) / (speechBins + nonSpeechBins))

        const now = Date.now()

        // 1. Sudden spike: total volume is very high and non-speech dominates
        if (totalRms > NoiseMonitor.SPIKE_THRESHOLD &&
          nonSpeechRms > speechRms * 1.5 &&
          now - this.lastAlertTime > NoiseMonitor.ALERT_COOLDOWN_MS) {
          this.lastAlertTime = now
          this.onNoiseDetected('spike')
        }

        // 2. Persistent background noise: track non-speech energy over a window
        this.bgNoiseWindowCount++
        this.bgNoiseWindowTotal += nonSpeechRms

        if (this.bgNoiseWindowCount >= NoiseMonitor.BG_WINDOW_SIZE) {
          const avgBgNoise = this.bgNoiseWindowTotal / this.bgNoiseWindowCount
          if (avgBgNoise > NoiseMonitor.BG_NOISE_THRESHOLD &&
            now - this.lastAlertTime > NoiseMonitor.ALERT_COOLDOWN_MS) {
            this.lastAlertTime = now
            this.onNoiseDetected('background')
          }
          this.bgNoiseWindowCount = 0
          this.bgNoiseWindowTotal = 0
        }
      }, 100) // 10 Hz monitoring
    } catch (e) {
      console.warn('NoiseMonitor: Failed to start', e)
    }
  }

  stop() {
    if (this.intervalId) clearInterval(this.intervalId)
    if (this.source) this.source.disconnect()
    if (this.audioContext) this.audioContext.close().catch(() => {})
    this.analyser = null
    this.audioContext = null
    this.source = null
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function VideoSkillAssessment({
  skills,
  workerId,
  profilePictureUrl,
  onComplete,
  onCancel,
  open,
}: VideoSkillAssessmentProps) {
  const [phase, setPhase] = useState<Phase>('selfie-verification')
  const [currentSkillIdx, setCurrentSkillIdx] = useState(0)
  const [language, setLanguage] = useState<Language>('en')
  const [question, setQuestion] = useState<MultilingualQuestion | null>(null)
  const [expectedAnswer, setExpectedAnswer] = useState('')
  const [timer, setTimer] = useState(0)
  const [results, setResults] = useState<VideoAssessmentResult[]>([])
  const [error, setError] = useState('')

  // ── Face Verification State ────────────────────────────────────────────────
  const [selfieDescriptor, setSelfieDescriptor] = useState<FaceDescriptor | null>(null)
  const [selfieCaptured, setSelfieCaptured] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [verificationError, setVerificationError] = useState('')
  const [selfieCameraActive, setSelfieCameraActive] = useState(false)
  const [verificationResult, setVerificationResult] = useState<FaceMatchResult | null>(null)
  const [faceMatchMonitor, setFaceMatchMonitor] = useState<{ lastCheck: number; failureCount: number }>({ lastCheck: 0, failureCount: 0 })
  const [faceVerificationFailure, setFaceVerificationFailure] = useState<{ type: string; message: string } | null>(null)
  const selfieVideoRef = useRef<HTMLVideoElement>(null)
  const selfieStreamRef = useRef<MediaStream | null>(null)
  const frameCheckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Webcam & recording
  const videoRef = useRef<HTMLVideoElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const audioAnalyzerRef = useRef<AudioAnalyzer | null>(null)
  const audioMetricsRef = useRef<AudioMetrics | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Face & noise monitoring
  const faceMonitorRef = useRef<FaceMonitor | null>(null)
  const noiseMonitorRef = useRef<NoiseMonitor | null>(null)
  const faceMetricsRef = useRef<{ eyeContactPercent: number; framesChecked: number } | null>(null)
  const [faceAlert, setFaceAlert] = useState<{ visible: boolean; count: number }>({ visible: false, count: 0 })
  const [noFaceAlert, setNoFaceAlert] = useState(false)
  const [noiseAlert, setNoiseAlert] = useState<{ visible: boolean; type: 'spike' | 'background' | null }>({ visible: false, type: null })

  // ── Tab Switch Proctoring State ─────────────────────────────────────────────
  const [tabSwitchCount, setTabSwitchCount] = useState(0)
  const [tabSwitchWarning, setTabSwitchWarning] = useState(false)
  const tabSwitchCountRef = useRef(0)
  const phaseRef = useRef<Phase>('selfie-verification')

  // ── Dual Camera (Environment Cam) State ────────────────────────────────
  const [envCamSessionId, setEnvCamSessionId] = useState('')
  const [envCamQrUrl, setEnvCamQrUrl] = useState('')
  const [envCamConnected, setEnvCamConnected] = useState(false)
  const [envCamSkipped, setEnvCamSkipped] = useState(false)
  const [envVideoUrl, setEnvVideoUrl] = useState('')
  const envChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const envVideoUrlRef = useRef('')

  // Refs to avoid stale closures in recording pipeline
  const currentSkillRef = useRef('')
  const questionRef = useRef<MultilingualQuestion | null>(null)
  const expectedAnswerRef = useRef('')
  const languageRef = useRef<Language>('en')
  const submitRecordingRef = useRef<() => Promise<void>>(async () => {})

  // ── Coding Challenge State ─────────────────────────────────────────────────
  const [codeChallenge, setCodeChallenge] = useState<{
    question: string; starterCode: string; exampleInput: string;
    exampleOutput: string; language: string
  } | null>(null)
  const [userCode, setUserCode] = useState('')
  const [codeTimer, setCodeTimer] = useState(60)
  const [codeResult, setCodeResult] = useState<{ passed: boolean; score: number; feedback: string } | null>(null)
  const [codeSubmitting, setCodeSubmitting] = useState(false)
  const codeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const submitCodeRef = useRef<() => void>(() => {})

  const currentSkill = skills[currentSkillIdx] ?? ''

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopStream()
      if (timerRef.current) clearInterval(timerRef.current)
      if (codeTimerRef.current) clearInterval(codeTimerRef.current)
    }
  }, [])

  // Keep refs in sync with state (avoids stale closures in intervals/callbacks)
  useEffect(() => { phaseRef.current = phase }, [phase])
  useEffect(() => { currentSkillRef.current = currentSkill }, [currentSkill])
  useEffect(() => { questionRef.current = question }, [question])
  useEffect(() => { expectedAnswerRef.current = expectedAnswer }, [expectedAnswer])
  useEffect(() => { languageRef.current = language }, [language])

  // Reset when dialog opens
  useEffect(() => {
    if (open) {
      setPhase('selfie-verification')
      setCurrentSkillIdx(0)
      setResults([])
      setError('')
      setTimer(0)
      setSelfieDescriptor(null)
      setSelfieCaptured(false)
      setVerifying(false)
      setVerificationError('')
      setVerificationResult(null)
      setSelfieCameraActive(false)
      setFaceMatchMonitor({ lastCheck: 0, failureCount: 0 })
      setFaceVerificationFailure(null)
      setTabSwitchCount(0)
      tabSwitchCountRef.current = 0
      setTabSwitchWarning(false)
      setEnvCamConnected(false)
      setEnvCamSkipped(false)
      setEnvVideoUrl('')
      envVideoUrlRef.current = ''
    }
  }, [open])

  // ── Dual Camera: Supabase Realtime channel (primary device) ──────────────────
  useEffect(() => {
    if (!open) {
      if (envChannelRef.current) {
        supabase.removeChannel(envChannelRef.current)
        envChannelRef.current = null
      }
      return
    }
    // Generate a unique session token for this assessment
    const sessionId = `${workerId}-${Date.now()}`
    setEnvCamSessionId(sessionId)
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
    const qrUrl = `${baseUrl}/worker/assessment/env-cam?session=${encodeURIComponent(sessionId)}&skill=${encodeURIComponent(skills[0] ?? '')}&workerid=${encodeURIComponent(workerId)}`
    setEnvCamQrUrl(qrUrl)

    const channel = supabase.channel(`env-cam:${sessionId}`, {
      config: { broadcast: { self: false } },
    })
    channel
      .on('broadcast', { event: 'env-cam-ready' }, () => {
        console.log('[dual-cam] Secondary device connected and ready')
        setEnvCamConnected(true)
      })
      .on('broadcast', { event: 'env-video-uploaded' }, (msg: { payload?: { url?: string } }) => {
        const url = msg.payload?.url ?? ''
        console.log('[dual-cam] Environment video URL received:', url)
        setEnvVideoUrl(url)
        envVideoUrlRef.current = url
      })
      .subscribe()
    envChannelRef.current = channel

    return () => {
      supabase.removeChannel(channel)
      envChannelRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, workerId])

  // ── Selfie Verification Functions ────────────────────────────────────────────

  const startSelfieCapture = useCallback(async () => {
    setVerificationError('')
    setVerifying(true)
    try {
      // Load face-api models first
      await loadFaceModels()

      // Start webcam for selfie
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      })
      selfieStreamRef.current = stream
      setSelfieCameraActive(true)

      // Wait for React to render the video element, then set stream
      await new Promise(resolve => setTimeout(resolve, 100))

      if (selfieVideoRef.current) {
        console.log('[Selfie] Setting video srcObject and playing...')
        selfieVideoRef.current.srcObject = stream
        try {
          await selfieVideoRef.current.play()
          console.log('[Selfie] ✓ Video playing')
        } catch (playError) {
          console.error('[Selfie] Play error:', playError)
          // Try again after a short delay
          setTimeout(async () => {
            if (selfieVideoRef.current) {
              await selfieVideoRef.current.play().catch(e => console.error('[Selfie] Retry play failed:', e))
            }
          }, 500)
        }
      } else {
        console.error('[Selfie] Video element ref is null!')
      }

      setVerifying(false)
    } catch (e) {
      console.error('Failed to start selfie camera:', e)
      setVerificationError('Camera access denied. Please allow camera permission.')
      setVerifying(false)
      setSelfieCameraActive(false)
    }
  }, [])

  const captureSelfie = useCallback(async () => {
    if (!selfieVideoRef.current) {
      setVerificationError('Camera not ready. Please try again.')
      return
    }

    setVerifying(true)
    setVerificationError('')

    try {
      // Extract face from current video frame
      const faceDesc = await extractFaceFromVideo(selfieVideoRef.current)

      if (!faceDesc) {
        setVerificationError('No face detected. Please ensure good lighting and face the camera directly.')
        setVerifying(false)
        return
      }

      if (faceDesc.faceCount > 1) {
        setVerificationError('Multiple faces detected. Please ensure only you are in the frame.')
        setVerifying(false)
        return
      }

      // If profile picture exists, verify against it
      let matchResult: FaceMatchResult | null = null
      if (profilePictureUrl) {
        console.log('[Selfie Verification] Comparing with profile picture...')
        const profileFace = await extractFaceFromUrl(profilePictureUrl)

        if (!profileFace) {
          console.warn('[Selfie Verification] Could not extract face from profile picture')
          // Continue anyway - profile picture might be outdated or low quality
          matchResult = {
            isMatch: true,
            similarity: 0,
            distance: 0,
            confidence: 'low',
            threshold: 0.6,
          }
        } else {
          matchResult = compareFaceDescriptors(faceDesc.descriptor, profileFace.descriptor)
          console.log('[Selfie Verification] Profile match:', matchResult)

          if (!matchResult.isMatch) {
            setVerificationError(`Face does not match your profile picture (${matchResult.similarity}% similarity). Please ensure you are the registered user.`)
            setVerifying(false)
            return
          }
        }
      } else {
        // No profile picture - just confirm face detected
        matchResult = {
          isMatch: true,
          similarity: 100,
          distance: 0,
          confidence: 'high',
          threshold: 0.6,
        }
      }

      // Store results
      setSelfieDescriptor(faceDesc)
      setVerificationResult(matchResult)
      setSelfieCaptured(true)

      // Capture the frame as blob for storage
      const canvas = document.createElement('canvas')
      canvas.width = selfieVideoRef.current.videoWidth
      canvas.height = selfieVideoRef.current.videoHeight
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.drawImage(selfieVideoRef.current, 0, 0, canvas.width, canvas.height)
        canvas.toBlob(async (blob) => {
          if (blob) {
            // Upload to Supabase with 30-day TTL
            await uploadSelfieToStorage(blob)
          }
        }, 'image/jpeg', 0.9)
      }

      // Stop selfie stream
      if (selfieStreamRef.current) {
        selfieStreamRef.current.getTracks().forEach(t => t.stop())
        selfieStreamRef.current = null
      }

      setVerifying(false)
      // Don't auto-advance to intro - let user see verification result
    } catch (e) {
      console.error('[Selfie Verification] Failed:', e)
      setVerificationError('Face verification failed. Please try again.')
      setVerifying(false)
    }
  }, [profilePictureUrl])

  const uploadSelfieToStorage = async (blob: Blob) => {
    try {
      const formData = new FormData()
      formData.append('file', blob, `verification-${workerId}-${Date.now()}.jpg`)
      formData.append('workerId', workerId)
      formData.append('ttlDays', '30')

      const res = await fetch('/api/upload-verification-selfie', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        console.warn('[Selfie Verification] Upload failed:', await res.text())
      } else {
        console.log('[Selfie Verification] ✓ Selfie uploaded to storage with 30-day TTL')
      }
    } catch (e) {
      console.warn('[Selfie Verification] Upload error (non-critical):', e)
    }
  }

  const stopSelfieStream = useCallback(() => {
    if (selfieStreamRef.current) {
      selfieStreamRef.current.getTracks().forEach(t => t.stop())
      selfieStreamRef.current = null
    }
    setSelfieCameraActive(false)
  }, [])

  // Continuous frame matching during recording
  const startContinuousFrameCheck = useCallback(() => {
    if (!selfieDescriptor || !videoRef.current) return

    console.log('[Face Verification] Starting continuous frame monitoring...')
    let checkCount = 0

    frameCheckIntervalRef.current = setInterval(async () => {
      checkCount++
      if (!videoRef.current || !selfieDescriptor) {
        if (frameCheckIntervalRef.current) {
          clearInterval(frameCheckIntervalRef.current)
          frameCheckIntervalRef.current = null
        }
        return
      }

      try {
        const frameFace = await extractFaceFromVideo(videoRef.current)

        if (!frameFace) {
          console.warn(`[Face Verification] Check #${checkCount}: No face detected in frame`)
          setFaceMatchMonitor(prev => {
            const newFailureCount = prev.failureCount + 1
            if (newFailureCount >= 3) {
              // 3 consecutive failures - stop recording and reject
              console.error('[Face Verification] Too many failures - face not visible')
              setFaceVerificationFailure({
                type: 'no_face',
                message: `Face not visible during recording (${newFailureCount} consecutive checks failed)`,
              })
              finishRecording()
              setError('Face not visible during recording. Assessment terminated.')
            }
            return { lastCheck: Date.now(), failureCount: newFailureCount }
          })
          return
        }

        // Compare with selfie
        const matchResult = compareFaceDescriptors(selfieDescriptor.descriptor, frameFace.descriptor)
        console.log(`[Face Verification] Check #${checkCount}: ${matchResult.similarity}% match (${matchResult.isMatch ? 'PASS' : 'FAIL'})`)

        if (!matchResult.isMatch) {
          // Face mismatch - stop recording immediately
          console.error(`[Face Verification] Face mismatch detected! Similarity: ${matchResult.similarity}%`)
          setFaceVerificationFailure({
            type: 'face_mismatch',
            message: `Different person detected during recording. Similarity: ${matchResult.similarity}% (required: 70%+). Verification check #${checkCount}.`,
          })
          if (frameCheckIntervalRef.current) {
            clearInterval(frameCheckIntervalRef.current)
            frameCheckIntervalRef.current = null
          }
          finishRecording()
          setError(`Face verification failed during recording. Different person detected (${matchResult.similarity}% match). Assessment terminated.`)
        } else {
          // Reset failure count on success
          setFaceMatchMonitor(prev => ({ lastCheck: Date.now(), failureCount: 0 }))
        }
      } catch (e) {
        console.warn(`[Face Verification] Check #${checkCount} failed:`, e)
      }
    }, 5000) // Check every 5 seconds during recording
  }, [selfieDescriptor])

  const stopContinuousFrameCheck = useCallback(() => {
    if (frameCheckIntervalRef.current) {
      clearInterval(frameCheckIntervalRef.current)
      frameCheckIntervalRef.current = null
      console.log('[Face Verification] Stopped continuous frame monitoring')
    }
  }, [])

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    if (selfieStreamRef.current) {
      selfieStreamRef.current.getTracks().forEach(t => t.stop())
      selfieStreamRef.current = null
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    if (audioAnalyzerRef.current) {
      audioMetricsRef.current = audioAnalyzerRef.current.stop()
      audioAnalyzerRef.current = null
    }
    if (faceMonitorRef.current) {
      faceMonitorRef.current.stop()
      faceMonitorRef.current = null
    }
    if (noiseMonitorRef.current) {
      noiseMonitorRef.current.stop()
      noiseMonitorRef.current = null
    }
    if (frameCheckIntervalRef.current) {
      clearInterval(frameCheckIntervalRef.current)
      frameCheckIntervalRef.current = null
    }
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    setFaceAlert({ visible: false, count: 0 })
    setNoFaceAlert(false)
    setNoiseAlert({ visible: false, type: null })
  }, [])

  // ── Phase: Load question ────────────────────────────────────────────────────
  const loadQuestion = useCallback(async () => {
    setPhase('loading')
    setError('')
    try {
      const res = await fetch('/api/ai/skill-question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skill: currentSkill }),
      })
      if (!res.ok) throw new Error('Failed to generate question')
      const data = await res.json()
      setQuestion(data.question)
      setExpectedAnswer(data.expected_answer)
      startQuestionPhase()
    } catch (e) {
      setError('Failed to load question. Please try again.')
      setPhase('intro')
    }
  }, [currentSkill])

  // ── Phase: Show question for 1 minute ───────────────────────────────────────
  const startQuestionPhase = useCallback(() => {
    setPhase('read-question')
    setTimer(QUESTION_READ_TIME_S)
    timerRef.current = setInterval(() => {
      setTimer(prev => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current)
          timerRef.current = null
          return 0 // useEffect handles startRecording transition
        }
        return prev - 1
      })
    }, 1000)
  }, [])

  // ── Phase: Record video for 1 minute ────────────────────────────────────────
  const startRecording = useCallback(async () => {
    setPhase('recording')
    setTimer(RECORDING_TIME_S)
    chunksRef.current = []

    // Signal secondary (environment) camera to start recording
    envChannelRef.current?.send({
      type: 'broadcast',
      event: 'start-recording',
      payload: { session: envCamSessionId },
    })

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 320 }, height: { ideal: 240 } },
        audio: true,
      })
      streamRef.current = stream

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()

        // Start continuous face matching against selfie (after video has started)
        setTimeout(() => startContinuousFrameCheck(), 1000)
      }

      // Start audio analysis
      const analyzer = new AudioAnalyzer()
      analyzer.start(stream)
      audioAnalyzerRef.current = analyzer

      // Start face detection (multi-person monitoring + eye-contact tracking)
      // Wait a tick so the <video> has rendered at least one frame for MediaPipe
      const faceMonitor = new FaceMonitor(
        (count) => {
          setFaceAlert({ visible: true, count })
          setTimeout(() => setFaceAlert(prev => prev.count === count ? { visible: false, count: 0 } : prev), 4000)
        },
        () => {
          // No face detected for 2+ seconds — prompt worker to face camera
          setNoFaceAlert(true)
          setTimeout(() => setNoFaceAlert(false), 4000)
        },
      )
      faceMonitorRef.current = faceMonitor
      if (videoRef.current) {
        const vidEl = videoRef.current
        // Small delay ensures the video element has produced at least one frame
        setTimeout(() => faceMonitor.start(vidEl), 500)
      }

      // Start noise detection
      const noiseMonitor = new NoiseMonitor((type) => {
        setNoiseAlert({ visible: true, type })
        // Auto-hide after 4 seconds
        setTimeout(() => setNoiseAlert(prev => prev.type === type ? { visible: false, type: null } : prev), 4000)
      })
      noiseMonitor.start(stream)
      noiseMonitorRef.current = noiseMonitor

      // Start recording
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
        ? 'video/webm;codecs=vp9,opus'
        : MediaRecorder.isTypeSupported('video/webm')
          ? 'video/webm'
          : 'video/mp4'

      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 250_000,  // 250 kbps — keeps 1 min video under 3 MB
        audioBitsPerSecond: 32_000,   // 32 kbps audio
      })
      mediaRecorderRef.current = recorder

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.onstop = () => {
        // Recording finished — handled in submitRecording
      }

      recorder.start(1000) // Collect data every second

      // Timer countdown — only decrements, useEffect handles finishRecording
      timerRef.current = setInterval(() => {
        setTimer(prev => {
          if (prev <= 1) {
            if (timerRef.current) clearInterval(timerRef.current)
            timerRef.current = null
            return 0 // useEffect handles finishRecording transition
          }
          return prev - 1
        })
      }, 1000)
    } catch (e) {
      console.error('Failed to start camera:', e)
      setError('Camera access denied. Please allow camera and microphone permissions.')
      setPhase('intro')
    }
  }, [])

  // ── Stop recording & submit ─────────────────────────────────────────────────
  const finishRecording = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }

    // Stop continuous face matching
    stopContinuousFrameCheck()

    // Stop audio analyzer to get metrics
    if (audioAnalyzerRef.current) {
      audioMetricsRef.current = audioAnalyzerRef.current.stop()
      audioAnalyzerRef.current = null
    }

    // Stop face & noise monitors — save eye-contact stats before stopping
    if (faceMonitorRef.current) {
      faceMetricsRef.current = faceMonitorRef.current.getStats()
      faceMonitorRef.current.stop()
      faceMonitorRef.current = null
    }
    if (noiseMonitorRef.current) {
      noiseMonitorRef.current.stop()
      noiseMonitorRef.current = null
    }
    setFaceAlert({ visible: false, count: 0 })
    setNoFaceAlert(false)
    setNoiseAlert({ visible: false, type: null })

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }

    // Stop camera after a brief delay to let final data chunk flush
    setTimeout(() => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop())
        streamRef.current = null
      }
      submitRecordingRef.current() // Use ref to always get latest submitRecording
    }, 500)
  }, [stopContinuousFrameCheck])

  const submitRecording = useCallback(async () => {
    setPhase('submitting')

    // Read from refs to avoid stale closures
    const skill = currentSkillRef.current
    const q = questionRef.current
    const ea = expectedAnswerRef.current

    try {
      const blob = new Blob(chunksRef.current, { type: 'video/webm' })

      if (blob.size < 1000) {
        console.warn('[submit] Recording blob too small:', blob.size, 'bytes')
      }

      const sizeMB = blob.size / (1024 * 1024)
      console.log(`[submit] Video blob: ${sizeMB.toFixed(2)} MB`)

      // Always use FormData — avoids 33% base64 overhead that caused 10MB limit errors
      const fd = new FormData()
      fd.append('video', blob, `assessment-${Date.now()}.webm`)
      fd.append('workerId', workerId)
      fd.append('skill', skill)
      fd.append('question', typeof q === 'string' ? q : JSON.stringify(q))
      fd.append('expectedAnswer', ea)
      fd.append('language', languageRef.current)  // worker's chosen language → Whisper hint
      fd.append('videoDurationMs', String(RECORDING_TIME_S * 1000))
      fd.append('audioMetrics', JSON.stringify(audioMetricsRef.current))
      fd.append('faceMetrics', JSON.stringify(faceMetricsRef.current ?? { eyeContactPercent: 100, framesChecked: 0 }))
      fd.append('tabSwitchCount', String(tabSwitchCountRef.current))
      if (envVideoUrlRef.current) {
        fd.append('envVideoUrl', envVideoUrlRef.current)
      }

      const res = await fetch('/api/ai/skill-video-submit', {
        method: 'POST',
        body: fd, // Browser sets multipart boundary automatically
      })

      const data = await res.json()

      const result: VideoAssessmentResult = {
        skill,
        submitted: res.ok,
        assessmentId: data.assessmentId,
        verdict: data.verdict ?? 'pending',
        verdictReason: data.verdictReason ?? (data.error || ''),
        score: data.score ?? undefined,
      }

      // Add face verification failure if it occurred
      if (faceVerificationFailure) {
        result.verificationFailure = {
          type: faceVerificationFailure.type as any,
          message: faceVerificationFailure.message,
          timestamp: new Date().toISOString(),
        }
        // Override verdict if face verification failed
        if (res.ok && result.verdict === 'approved') {
          result.verdict = 'rejected'
          result.verdictReason = `Face verification failed: ${faceVerificationFailure.message}`
        }
      }

      setResults(prev => [...prev, result])

      setPhase('skill-done')
    } catch (e) {
      console.error('Submit error:', e)
      setResults(prev => [...prev, {
        skill,
        submitted: false,
        verdict: 'pending',
        verdictReason: 'Submission failed — will be retried.',
      }])
      setPhase('skill-done')
    }
  }, [workerId])

  // Keep submitRecordingRef in sync (finishRecording uses this ref)
  useEffect(() => { submitRecordingRef.current = submitRecording }, [submitRecording])

  // ── Timer-expired phase transitions ─────────────────────────────────────────
  // Clean separation: intervals ONLY count down, useEffect fires side effects.
  // Guard: only transition when timer counts DOWN to 0 (timerRef was active),
  // not when timer is already 0 from init/reset.
  const timerExpiredRef = useRef(false)
  useEffect(() => {
    // Mark that a timer is actively counting (set by startQuestionPhase / startRecording)
    if (timer > 0) {
      timerExpiredRef.current = true
    }
    // Only fire transitions when timer was actively counting and just hit 0
    if (timer === 0 && timerExpiredRef.current) {
      timerExpiredRef.current = false
      if (phase === 'read-question') {
        startRecording()
      } else if (phase === 'recording') {
        finishRecording()
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timer, phase]) // startRecording & finishRecording are stable ([] deps)

  // ── Tab Switch / Window Focus Proctoring ────────────────────────────────────
  // Detects if user hides the tab during read-question or recording phases.
  // 3 strikes → auto-terminates with plagiarism flag.
  useEffect(() => {
    const monitored = phase === 'read-question' || phase === 'recording'
    if (!monitored) return

    const handleVisibilityChange = () => {
      if (!document.hidden) return // only fire when tab becomes hidden
      const newCount = tabSwitchCountRef.current + 1
      tabSwitchCountRef.current = newCount
      setTabSwitchCount(newCount)
      setTabSwitchWarning(true)
      setTimeout(() => setTabSwitchWarning(false), 3500)

      if (newCount >= 3) {
        setFaceVerificationFailure({
          type: 'plagiarism',
          message: `Window switched away ${newCount} times during assessment. Auto-terminated for suspected plagiarism.`,
        })
        if (phaseRef.current === 'recording') {
          finishRecording()
        } else {
          // In read-question phase: inject rejected result directly
          setResults(prev => [...prev, {
            skill: currentSkillRef.current,
            submitted: false,
            verdict: 'rejected',
            verdictReason: `Tab switching detected ${newCount} times during question-read phase. Suspected plagiarism.`,
          }])
          if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
          setPhase('skill-done')
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => { document.removeEventListener('visibilitychange', handleVisibilityChange) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]) // finishRecording is stable ([] deps via useCallback)

  // ── Move to next skill ──────────────────────────────────────────────────────
  const nextSkill = useCallback(() => {
    if (currentSkillIdx + 1 < skills.length) {
      setCurrentSkillIdx(prev => prev + 1)
      setQuestion(null)
      setExpectedAnswer('')
      setTimer(0)
      setPhase('intro')
    } else {
      setPhase('all-done')
    }
  }, [currentSkillIdx, skills.length])

  // ── Coding Challenge ────────────────────────────────────────────────────────
  const startCodingChallenge = useCallback(async () => {
    setPhase('coding-challenge')
    setCodeChallenge(null)
    setCodeResult(null)
    setUserCode('')
    setCodeTimer(60)
    if (codeTimerRef.current) { clearInterval(codeTimerRef.current); codeTimerRef.current = null }
    try {
      const res = await fetch('/api/ai/code-challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skill: currentSkillRef.current, action: 'generate' }),
      })
      const data = await res.json()
      setCodeChallenge(data)
      setUserCode(data.starterCode ?? '')
      setCodeTimer(60)
      codeTimerRef.current = setInterval(() => {
        setCodeTimer(prev => {
          if (prev <= 1) {
            clearInterval(codeTimerRef.current!); codeTimerRef.current = null
            submitCodeRef.current()
            return 0
          }
          return prev - 1
        })
      }, 1000)
    } catch {
      // If challenge fetch fails, just move to next skill
      nextSkill()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextSkill])

  const submitCode = useCallback(async () => {
    if (codeTimerRef.current) { clearInterval(codeTimerRef.current); codeTimerRef.current = null }
    setCodeSubmitting(true)
    try {
      const res = await fetch('/api/ai/code-challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skill: currentSkillRef.current,
          action: 'evaluate',
          code: userCode,
          question: codeChallenge?.question,
        }),
      })
      const data = await res.json()
      setCodeResult(data)
    } catch {
      setCodeResult({ passed: false, score: 0, feedback: 'Evaluation failed. Please try again.' })
    }
    setCodeSubmitting(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userCode, codeChallenge])

  // Keep submitCodeRef in sync so the timer callback always calls latest version
  useEffect(() => { submitCodeRef.current = submitCode }, [submitCode])

  // ── Format timer ────────────────────────────────────────────────────────────
  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { stopStream(); stopSelfieStream(); onCancel() } }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">

        {/* ── SELFIE VERIFICATION ───────────────────────────────────────────── */}
        {phase === 'selfie-verification' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Scan className="w-5 h-5 text-primary" />
                Face Verification Required
              </DialogTitle>
              <DialogDescription>
                Prevent impersonation — verify your identity before starting the skill test
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {!selfieCaptured ? (
                <>
                  <Card className="p-4 bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800">
                    <h3 className="font-semibold mb-2 flex items-center gap-2">
                      <UserCheck className="w-4 h-4" /> Identity Verification
                    </h3>
                    <ul className="text-sm space-y-2 text-muted-foreground">
                      <li>• Take a selfie to verify your identity</li>
                      {profilePictureUrl && <li>• Your selfie will be matched with your profile picture (70% threshold)</li>}
                      <li>• Your face will be continuously monitored during the test</li>
                      <li>• The selfie will be stored for 30 days for dispute resolution</li>
                      <li>• Ensure good lighting and face the camera directly</li>
                      <li>• Only your face should be visible (no multiple people)</li>
                    </ul>
                  </Card>

                  {/* Webcam preview for selfie capture */}
                  {selfieCameraActive ? (
                    <div className="relative rounded-xl overflow-hidden bg-black aspect-video">
                      <video
                        ref={selfieVideoRef}
                        autoPlay
                        muted
                        playsInline
                        className="w-full h-full object-cover mirror"
                        style={{ transform: 'scaleX(-1)' }}
                      />
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="w-64 h-64 border-4 border-primary rounded-full opacity-50"></div>
                      </div>
                      <div className="absolute bottom-3 left-1/2 -translate-x-1/2">
                        <Badge className="bg-black/70 text-white border-0">
                          <Camera className="w-3 h-3 mr-1" /> Position your face in the circle
                        </Badge>
                      </div>
                    </div>
                  ) : (
                    <Card className="p-8 text-center bg-muted/50">
                      <Camera className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">
                        Click below to start your webcam for selfie capture
                      </p>
                    </Card>
                  )}

                  {verificationError && (
                    <Card className="p-4 bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800">
                      <div className="flex items-center gap-2 mb-2">
                        <AlertTriangle className="w-5 h-5 text-red-600" />
                        <span className="font-semibold text-red-700 dark:text-red-400">Verification Failed</span>
                      </div>
                      <p className="text-sm text-red-700 dark:text-red-300">{verificationError}</p>
                    </Card>
                  )}
                </>
              ) : (
                <Card className="p-4 bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800">
                  <div className="flex items-center gap-2 mb-3">
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                    <span className="font-semibold text-green-700 dark:text-green-400">Identity Verified ✓</span>
                  </div>
                  <p className="text-sm text-green-700 dark:text-green-300 mb-3">
                    Your identity has been verified successfully. Your face will be monitored throughout the assessment.
                  </p>
                  {verificationResult && (
                    <div className="bg-white/50 dark:bg-black/20 rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-green-700 dark:text-green-400">Match Score:</span>
                        <Badge variant="default" className="bg-green-600 text-white">
                          {verificationResult.similarity.toFixed(1)}% {verificationResult.isMatch ? '✓' : '✗'}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-green-700 dark:text-green-400">Confidence:</span>
                        <Badge variant="outline" className="text-xs capitalize">
                          {verificationResult.confidence}
                        </Badge>
                      </div>
                      {profilePictureUrl ? (
                        <p className="text-xs text-green-600 dark:text-green-400">
                          ✓ Selfie matched with your profile picture
                        </p>
                      ) : (
                        <p className="text-xs text-green-600 dark:text-green-400">
                          ✓ Face detected successfully (no profile picture to compare)
                        </p>
                      )}
                    </div>
                  )}
                </Card>
              )}
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => { stopSelfieStream(); onCancel() }}>Cancel</Button>
              {!selfieCameraActive && !selfieCaptured ? (
                <Button onClick={startSelfieCapture} disabled={verifying} className="gap-2">
                  {verifying ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Loading Models...
                    </>
                  ) : (
                    <>
                      <Camera className="w-4 h-4" /> Start Camera
                    </>
                  )}
                </Button>
              ) : !selfieCaptured ? (
                <Button onClick={captureSelfie} disabled={verifying} className="gap-2">
                  {verifying ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Verifying...
                    </>
                  ) : (
                    <>
                      <Scan className="w-4 h-4" /> Capture & Verify
                    </>
                  )}
                </Button>
              ) : currentSkill.toLowerCase().includes('java') ? (
                <div className="flex flex-col gap-2 w-full sm:flex-row sm:justify-end">
                  <Button
                    variant="outline"
                    onClick={() => setPhase('intro')}
                    className="gap-2"
                  >
                    <Video className="w-4 h-4" /> Video Assessment
                  </Button>
                  <Button
                    onClick={() => {
                      setResults(prev => [...prev, {
                        skill: currentSkill,
                        submitted: false,
                        verdict: 'pending' as const,
                        verdictReason: 'Video assessment skipped — coding challenge only',
                        score: undefined,
                      }])
                      startCodingChallenge()
                    }}
                    className="gap-2"
                  >
                    <ArrowRight className="w-4 h-4" /> Skip to Coding Challenge
                  </Button>
                </div>
              ) : (
                <Button onClick={() => setPhase('intro')} className="gap-2">
                  <ArrowRight className="w-4 h-4" /> Continue to Assessment
                </Button>
              )}
            </DialogFooter>
          </>
        )}

        {/* ── INTRO ─────────────────────────────────────────────────────────── */}
        {phase === 'intro' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-primary" />
                Skill Verification — {currentSkill}
              </DialogTitle>
              <DialogDescription>
                Video-based skill assessment ({currentSkillIdx + 1} of {skills.length})
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <Card className="p-4 bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800">
                <h3 className="font-semibold mb-2 flex items-center gap-2">
                  <Eye className="w-4 h-4" /> How it works
                </h3>
                <ol className="text-sm space-y-2 list-decimal list-inside text-muted-foreground">
                  <li><strong>Read the question</strong> — A practical scenario will appear for 1 minute. Read and think about your answer.</li>
                  <li><strong>Record your answer</strong> — Your webcam turns on and records for 1 minute. Explain your answer verbally.</li>
                  <li><strong>Instant result</strong> — AI analyzes your answer and verifies your skill automatically.</li>
                </ol>
              </Card>

              <Card className="p-4 bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800">
                <h3 className="font-semibold mb-2 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600" /> Important
                </h3>
                <ul className="text-sm space-y-1 text-muted-foreground">
                  <li>• Your video and audio will be analyzed for authenticity</li>
                  <li>• Do NOT read from a screen, phone, or script</li>
                  <li>• Do NOT use AI voice tools (e.g., Parrot.ai)</li>
                  <li>• Answer in your own words from your experience</li>
                  <li>• You need camera & microphone permission</li>
                  <li>• <strong>Only you should be visible</strong> — multiple faces will trigger an alert</li>
                  <li>• <strong>Ensure a quiet environment</strong> — background noise will be flagged</li>
                  <li>• <strong>Do NOT switch tabs or minimize</strong> — window changes are tracked (3 strikes = auto-fail)</li>
                </ul>
              </Card>

              {/* ── Dual Camera QR Code ───────────────────────────────────────── */}
              <Card className={`p-4 border-2 ${
                envCamConnected
                  ? 'border-green-500 bg-green-50 dark:bg-green-950/30'
                  : 'border-blue-300 bg-blue-50 dark:bg-blue-950/20'
              }`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <h3 className="font-semibold text-sm flex items-center gap-2 mb-1">
                      <Smartphone className="w-4 h-4" />
                      Environment Camera
                      {envCamConnected && (
                        <Badge className="bg-green-600 text-white text-xs">Connected ✓</Badge>
                      )}
                    </h3>
                    {envCamConnected ? (
                      <p className="text-xs text-green-700 dark:text-green-400">
                        Secondary device is ready. It will record automatically when the assessment starts.
                      </p>
                    ) : envCamSkipped ? (
                      <p className="text-xs text-slate-500">Skipped — single-camera mode.</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Scan with a second phone and place it to your side to record the workspace environment.
                        <span className="block mt-1 text-slate-400">(Optional — skip if you only have one device)</span>
                      </p>
                    )}
                    {!envCamConnected && !envCamSkipped && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-2 h-7 text-xs text-muted-foreground px-2"
                        onClick={() => setEnvCamSkipped(true)}
                      >
                        Skip → Single camera only
                      </Button>
                    )}
                  </div>
                  {!envCamConnected && !envCamSkipped && envCamQrUrl && (
                    <div className="flex-shrink-0 bg-white p-2 rounded-lg border">
                      <QRCodeSVG value={envCamQrUrl} size={80} />
                    </div>
                  )}
                  {envCamConnected && (
                    <div className="flex-shrink-0">
                      <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/50 flex items-center justify-center">
                        <Wifi className="w-5 h-5 text-green-600" />
                      </div>
                    </div>
                  )}
                </div>
              </Card>

              {/* Language selector */}
              <div>
                <label className="text-sm font-medium mb-2 block flex items-center gap-1">
                  <Globe className="w-4 h-4" /> Question Language
                </label>
                <div className="flex gap-2">
                  {(Object.entries(LANG_LABELS) as [Language, string][]).map(([code, label]) => (
                    <Button
                      key={code}
                      type="button"
                      variant={language === code ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setLanguage(code)}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              </div>

              {error && (
                <p className="text-sm text-destructive bg-destructive/10 p-3 rounded-lg">{error}</p>
              )}
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={onCancel}>Cancel</Button>
              <Button onClick={loadQuestion} className="gap-2">
                <ArrowRight className="w-4 h-4" /> Start Assessment
              </Button>
            </DialogFooter>
          </>
        )}

        {/* ── LOADING ───────────────────────────────────────────────────────── */}
        {phase === 'loading' && (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <Loader2 className="w-10 h-10 animate-spin text-primary" />
            <p className="text-lg font-medium">Generating question for <strong>{currentSkill}</strong>...</p>
            <p className="text-sm text-muted-foreground">AI is creating a practical scenario in multiple languages</p>
          </div>
        )}

        {/* ── READ QUESTION (1 minute) ──────────────────────────────────────── */}
        {phase === 'read-question' && question && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Eye className="w-5 h-5 text-blue-500" />
                Read & Prepare — {currentSkill}
              </DialogTitle>
              <DialogDescription>
                Read the scenario below. Your camera will turn on in {formatTime(timer)}.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Tab switch strike warning */}
              {tabSwitchWarning && (
                <div className="flex items-center gap-3 bg-orange-500 text-white px-4 py-3 rounded-xl animate-in slide-in-from-top duration-300">
                  <MonitorX className="w-5 h-5 flex-shrink-0 animate-pulse" />
                  <div>
                    <p className="font-bold text-sm">Tab Switch Detected! Strike {tabSwitchCount}/3</p>
                    <p className="text-xs opacity-90">
                      {tabSwitchCount >= 3
                        ? 'Assessment auto-terminated for suspected plagiarism.'
                        : `${3 - tabSwitchCount} strike${3 - tabSwitchCount !== 1 ? 's' : ''} remaining before auto-fail.`}
                    </p>
                  </div>
                </div>
              )}
              {tabSwitchCount > 0 && !tabSwitchWarning && (
                <div className="flex items-center justify-between text-xs text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/30 px-3 py-1.5 rounded-lg">
                  <span className="flex items-center gap-1.5"><MonitorX className="w-3.5 h-3.5" /> Tab switch on record</span>
                  <Badge variant="outline" className="border-orange-400 text-orange-600 dark:text-orange-400 text-xs">{tabSwitchCount}/3 strikes</Badge>
                </div>
              )}

              {/* Timer bar */}
              <div className="flex items-center gap-3">
                <Clock className="w-5 h-5 text-blue-500" />
                <Progress value={(timer / QUESTION_READ_TIME_S) * 100} className="flex-1" />
                <Badge variant="secondary" className="text-lg font-mono min-w-[60px] justify-center">
                  {formatTime(timer)}
                </Badge>
              </div>

              {/* Language tabs */}
              <div className="flex gap-2 border-b pb-2">
                {(Object.entries(LANG_LABELS) as [Language, string][]).map(([code, label]) => (
                  <button
                    key={code}
                    type="button"
                    className={`px-3 py-1.5 text-sm rounded-t-lg transition-colors ${
                      language === code
                        ? 'bg-primary text-primary-foreground font-medium'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                    onClick={() => setLanguage(code)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Question display */}
              <Card className="p-6 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border-blue-200 dark:border-blue-800">
                <p className="text-lg leading-relaxed font-medium">
                  {question[language] || question.en}
                </p>
              </Card>

              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Camera className="w-4 h-4" />
                <span>Camera will automatically turn on when time is up. Prepare your answer.</span>
              </div>

              {/* Skip to recording button */}
              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={() => {
                  // Stop the read-question timer
                  if (timerRef.current) {
                    clearInterval(timerRef.current)
                    timerRef.current = null
                  }
                  timerExpiredRef.current = false
                  // Jump straight to recording
                  startRecording()
                }}
              >
                <SkipForward className="w-4 h-4" />
                Skip to Recording
              </Button>
            </div>
          </>
        )}

        {/* ── RECORDING (1 minute) ──────────────────────────────────────────── */}
        {phase === 'recording' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                Recording — {currentSkill}
              </DialogTitle>
              <DialogDescription>
                Explain your answer. Speak clearly and naturally.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Timer bar */}
              <div className="flex items-center gap-3">
                <Video className="w-5 h-5 text-red-500" />
                <Progress value={(timer / RECORDING_TIME_S) * 100} className="flex-1 [&>div]:bg-red-500" />
                <Badge variant="destructive" className="text-lg font-mono min-w-[60px] justify-center animate-pulse">
                  {formatTime(timer)}
                </Badge>
              </div>

              {/* Tab switch persistent strike indicator */}
              {tabSwitchCount > 0 && (
                <div className={`flex items-center justify-between text-xs px-3 py-1.5 rounded-lg ${
                  tabSwitchWarning
                    ? 'bg-orange-500 text-white'
                    : 'text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/30'
                }`}>
                  <span className="flex items-center gap-1.5 font-medium">
                    <MonitorX className="w-3.5 h-3.5" />
                    {tabSwitchWarning ? `⚠ Tab switch detected! Strike ${tabSwitchCount}/3` : 'Window switch on record'}
                  </span>
                  {!tabSwitchWarning && (
                    <Badge variant="outline" className="border-orange-400 text-orange-600 dark:text-orange-400 text-xs">{tabSwitchCount}/3 strikes</Badge>
                  )}
                </div>
              )}

              {/* Video preview */}
              <div className="relative rounded-xl overflow-hidden bg-black aspect-video">
                <video
                  ref={videoRef}
                  muted
                  playsInline
                  className="w-full h-full object-cover mirror"
                  style={{ transform: 'scaleX(-1)' }}
                />
                <div className="absolute top-3 left-3 flex items-center gap-2">
                  <div className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
                  <span className="text-white text-xs font-medium bg-black/50 px-2 py-0.5 rounded">
                    REC {formatTime(timer)}
                  </span>
                </div>
                <div className="absolute bottom-3 left-3">
                  <Badge className="bg-black/50 text-white border-0">
                    <Mic className="w-3 h-3 mr-1" /> Audio recording
                  </Badge>
                </div>

                {/* ── No face / look at camera alert ───────────────────── */}
                {noFaceAlert && (
                  <div className="absolute inset-0 flex items-center justify-center bg-yellow-500/20 backdrop-blur-[2px] animate-in fade-in duration-300 z-10">
                    <div className="bg-yellow-600 text-white rounded-xl px-5 py-4 shadow-2xl flex items-center gap-3 max-w-[90%]">
                      <Camera className="w-7 h-7 flex-shrink-0 animate-pulse" />
                      <div>
                        <p className="font-bold text-sm">Face Not Detected!</p>
                        <p className="text-xs opacity-90">Please face the camera directly and ensure good lighting.</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Multiple faces alert overlay ──────────────────────────── */}
                {faceAlert.visible && (
                  <div className="absolute inset-0 flex items-center justify-center bg-red-500/20 backdrop-blur-[2px] animate-in fade-in duration-300 z-10">
                    <div className="bg-red-600 text-white rounded-xl px-5 py-4 shadow-2xl flex items-center gap-3 max-w-[90%]">
                      <Users className="w-7 h-7 flex-shrink-0 animate-bounce" />
                      <div>
                        <p className="font-bold text-sm">Multiple People Detected!</p>
                        <p className="text-xs opacity-90">
                          {faceAlert.count} faces found. Only the worker should be in frame during the assessment.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Tab switch warning overlay ──────────────────────────── */}
                {tabSwitchWarning && (
                  <div className="absolute inset-0 flex items-center justify-center bg-orange-500/25 backdrop-blur-[2px] animate-in fade-in duration-300 z-20">
                    <div className="bg-orange-600 text-white rounded-xl px-5 py-4 shadow-2xl flex items-center gap-3 max-w-[90%]">
                      <MonitorX className="w-7 h-7 flex-shrink-0 animate-pulse" />
                      <div>
                        <p className="font-bold text-sm">Tab Switch Detected! Strike {tabSwitchCount}/3</p>
                        <p className="text-xs opacity-90">
                          {tabSwitchCount >= 3
                            ? 'Assessment auto-terminated for suspected plagiarism.'
                            : `${3 - tabSwitchCount} strike${3 - tabSwitchCount !== 1 ? 's' : ''} remaining. Do NOT switch windows.`}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Noise alert overlay ──────────────────────────────────── */}
                {noiseAlert.visible && (
                  <div className="absolute inset-0 flex items-end justify-center pb-14 z-10 pointer-events-none">
                    <div className="bg-amber-600 text-white rounded-xl px-5 py-3 shadow-2xl flex items-center gap-3 max-w-[90%] animate-in slide-in-from-bottom duration-300">
                      <Volume2 className="w-6 h-6 flex-shrink-0 animate-pulse" />
                      <div>
                        <p className="font-bold text-sm">
                          {noiseAlert.type === 'spike' ? 'Loud Noise Detected!' : 'Background Noise Detected!'}
                        </p>
                        <p className="text-xs opacity-90">
                          {noiseAlert.type === 'spike'
                            ? 'A sudden loud sound was detected. Please ensure a quiet environment.'
                            : 'Persistent background noise detected. Please reduce surrounding noise.'}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Quick reference of the question */}
              <Card className="p-3 bg-muted/50">
                <p className="text-xs text-muted-foreground mb-1">Question:</p>
                <p className="text-sm">{question?.[language] || question?.en}</p>
              </Card>

              <Button
                variant="destructive"
                onClick={finishRecording}
                className="w-full gap-2"
              >
                <Send className="w-4 h-4" /> Finish & Submit Early
              </Button>
            </div>
          </>
        )}

        {/* ── SUBMITTING ────────────────────────────────────────────────────── */}
        {phase === 'submitting' && (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <Loader2 className="w-10 h-10 animate-spin text-primary" />
            <p className="text-lg font-medium">Analyzing your answer...</p>
            <p className="text-sm text-muted-foreground">Uploading video → Transcribing audio → Checking answer → Auto-verifying skill</p>
            <p className="text-xs text-muted-foreground">This may take 15–30 seconds</p>
          </div>
        )}

        {/* ── SKILL DONE ────────────────────────────────────────────────────── */}
        {phase === 'skill-done' && (() => {
          const latestResult = results[results.length - 1]
          const v = latestResult?.verdict
          return (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {v === 'approved' && <CheckCircle2 className="w-5 h-5 text-green-500" />}
                {v === 'rejected' && <AlertTriangle className="w-5 h-5 text-red-500" />}
                {v === 'pending' && <Clock className="w-5 h-5 text-amber-500" />}
                {v === 'approved' ? 'Skill Verified!' : v === 'rejected' ? 'Assessment Not Passed' : 'Under Review'} — {currentSkill}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Final Score Display */}
              {latestResult?.score !== undefined && (
                <Card className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border-blue-200 dark:border-blue-800">
                  <div className="text-center">
                    <div className="text-5xl font-bold mb-2" style={{
                      color: latestResult.score >= 70 ? '#16a34a' : latestResult.score >= 50 ? '#eab308' : '#dc2626'
                    }}>
                      {latestResult.score}
                      <span className="text-2xl text-muted-foreground">/100</span>
                    </div>
                    <p className="text-sm font-medium text-muted-foreground">
                      Final Assessment Score
                    </p>
                    <div className="mt-2 flex items-center justify-center gap-2">
                      {latestResult.score >= 70 && (
                        <Badge className="bg-green-600">Excellent</Badge>
                      )}
                      {latestResult.score >= 50 && latestResult.score < 70 && (
                        <Badge className="bg-yellow-600">Good</Badge>
                      )}
                      {latestResult.score < 50 && (
                        <Badge variant="destructive">Below Threshold</Badge>
                      )}
                    </div>
                  </div>
                </Card>
              )}

              {v === 'approved' && (
                <Card className="p-4 bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                    <span className="font-semibold text-green-700 dark:text-green-400">Skill Verified ✓</span>
                  </div>
                  <p className="text-sm text-green-700 dark:text-green-300">
                    Your <strong>{currentSkill}</strong> skill has been verified automatically.
                    It will now appear as &quot;Verified&quot; on your profile.
                  </p>
                </Card>
              )}
              {v === 'rejected' && (
                <>
                  <Card className="p-4 bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle className="w-5 h-5 text-red-600" />
                      <span className="font-semibold text-red-700 dark:text-red-400">Not Passed</span>
                    </div>
                    <p className="text-sm text-red-700 dark:text-red-300">
                      {latestResult?.verdictReason || 'Your answer did not meet the required criteria.'}
                    </p>
                    <p className="text-xs text-muted-foreground mt-2">
                      You can retry this assessment later from your profile.
                    </p>
                  </Card>

                  {/* Verification Failure Breakdown */}
                  {latestResult?.verificationFailure && (
                    <Card className="p-4 bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800">
                      <div className="flex items-center gap-2 mb-3">
                        <AlertTriangle className="w-5 h-5 text-orange-600" />
                        <span className="font-semibold text-orange-700 dark:text-orange-400">Verification Details</span>
                      </div>
                      
                      <div className="space-y-3">
                        {/* Failure Type */}
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5">
                            {latestResult.verificationFailure.type === 'face_mismatch' && (
                              <XCircle className="w-5 h-5 text-red-500" />
                            )}
                            {latestResult.verificationFailure.type === 'no_face' && (
                              <UserX className="w-5 h-5 text-red-500" />
                            )}
                            {latestResult.verificationFailure.type === 'multiple_faces' && (
                              <Users className="w-5 h-5 text-red-500" />
                            )}
                            {latestResult.verificationFailure.type === 'plagiarism' && (
                              <FileWarning className="w-5 h-5 text-red-500" />
                            )}
                            {latestResult.verificationFailure.type === 'wrong_answer' && (
                              <XCircle className="w-5 h-5 text-red-500" />
                            )}
                            {latestResult.verificationFailure.type === 'other' && (
                              <AlertTriangle className="w-5 h-5 text-red-500" />
                            )}
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-medium text-orange-800 dark:text-orange-300">
                              {latestResult.verificationFailure.type === 'face_mismatch' && 'Face Mismatch Detected'}
                              {latestResult.verificationFailure.type === 'no_face' && 'Face Not Detected'}
                              {latestResult.verificationFailure.type === 'multiple_faces' && 'Multiple Faces Detected'}
                              {latestResult.verificationFailure.type === 'plagiarism' && 'Non-Original Response Detected'}
                              {latestResult.verificationFailure.type === 'wrong_answer' && 'Answer Incorrect'}
                              {latestResult.verificationFailure.type === 'other' && 'Verification Failed'}
                            </p>
                            <p className="text-xs text-orange-700 dark:text-orange-400 mt-1">
                              {latestResult.verificationFailure.message}
                            </p>
                          </div>
                        </div>

                        {/* Selfie Match Score (if available) */}
                        {verificationResult && (
                          <div className="flex items-center gap-3 pt-2 border-t border-orange-200 dark:border-orange-800">
                            <Camera className="w-4 h-4 text-orange-600" />
                            <div className="flex-1">
                              <p className="text-xs font-medium text-orange-800 dark:text-orange-300">
                                Initial Selfie Match: {verificationResult.similarity.toFixed(1)}%
                              </p>
                              <p className="text-xs text-orange-600 dark:text-orange-400">
                                Confidence: {verificationResult.confidence}
                              </p>
                            </div>
                          </div>
                        )}

                        {/* Timestamp */}
                        {latestResult.verificationFailure.timestamp && (
                          <div className="flex items-center gap-2 pt-2 border-t border-orange-200 dark:border-orange-800">
                            <Clock className="w-4 h-4 text-orange-600" />
                            <p className="text-xs text-orange-600 dark:text-orange-400">
                              Failed at: {new Date(latestResult.verificationFailure.timestamp).toLocaleString()}
                            </p>
                          </div>
                        )}

                        {/* Tips for next attempt */}
                        <div className="pt-2 border-t border-orange-200 dark:border-orange-800">
                          <p className="text-xs font-medium text-orange-800 dark:text-orange-300 mb-1">
                            💡 Tips for next attempt:
                          </p>
                          <ul className="text-xs text-orange-700 dark:text-orange-400 space-y-1 ml-4 list-disc">
                            {latestResult.verificationFailure.type === 'face_mismatch' && (
                              <>
                                <li>Ensure good lighting on your face</li>
                                <li>Look directly at the camera</li>
                                <li>Remove sunglasses or face coverings</li>
                                <li>Make sure you are the profile owner</li>
                              </>
                            )}
                            {latestResult.verificationFailure.type === 'no_face' && (
                              <>
                                <li>Stay visible in the camera frame</li>
                                <li>Ensure adequate lighting</li>
                                <li>Position camera at eye level</li>
                                <li>Don't cover your face</li>
                              </>
                            )}
                            {latestResult.verificationFailure.type === 'multiple_faces' && (
                              <>
                                <li>Take the test alone</li>
                                <li>Ensure no one is visible in the background</li>
                                <li>Disable virtual backgrounds</li>
                              </>
                            )}
                            {latestResult.verificationFailure.type === 'plagiarism' && (
                              <>
                                <li>Answer in your own words</li>
                                <li>Speak naturally, not from memory</li>
                                <li>Don't read from scripts or prompts</li>
                                <li>Be genuine in your response</li>
                              </>
                            )}
                            {latestResult.verificationFailure.type === 'wrong_answer' && (
                              <>
                                <li>Review the skill requirements carefully</li>
                                <li>Provide specific examples from experience</li>
                                <li>Speak clearly and confidently</li>
                              </>
                            )}
                          </ul>
                        </div>
                      </div>
                    </Card>
                  )}
                </>
              )}
              {v === 'pending' && (
                <Card className="p-4 bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="w-5 h-5 text-amber-600" />
                    <span className="font-semibold text-amber-700 dark:text-amber-400">Under Review</span>
                  </div>
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    Your answer for <strong>{currentSkill}</strong> needs additional review.
                    An admin will check it shortly.
                  </p>
                </Card>
              )}

              {currentSkillIdx + 1 < skills.length && (
                <p className="text-sm text-muted-foreground">
                  Next skill: <strong>{skills[currentSkillIdx + 1]}</strong> ({currentSkillIdx + 2} of {skills.length})
                </p>
              )}
            </div>

            <DialogFooter>
              {currentSkillIdx + 1 < skills.length ? (
                <Button onClick={startCodingChallenge} className="gap-2">
                  <ArrowRight className="w-4 h-4" /> Next: Coding Challenge
                </Button>
              ) : (
                <Button onClick={startCodingChallenge} className="gap-2">
                  <CheckCircle2 className="w-4 h-4" /> Final: Coding Challenge
                </Button>
              )}
            </DialogFooter>
          </>
          )
        })()}

        {/* ── CODING CHALLENGE ──────────────────────────────────────────────── */}
        {phase === 'coding-challenge' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-blue-500" />
                💻 Coding Challenge — {currentSkill}
              </DialogTitle>
              <DialogDescription>
                Demonstrate your technical skills with a quick coding question
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Timer badge */}
              {!codeResult && (
                <div className="flex justify-end">
                  <Badge
                    className={`text-base px-3 py-1 font-mono ${
                      codeTimer <= 10
                        ? 'bg-red-600 text-white animate-pulse'
                        : codeTimer <= 30
                          ? 'bg-amber-500 text-white'
                          : 'bg-slate-700 text-white'
                    }`}
                  >
                    <Clock className="w-4 h-4 mr-1 inline" />
                    {codeTimer}s
                  </Badge>
                </div>
              )}

              {/* Loading state */}
              {!codeChallenge && !codeResult && (
                <div className="flex flex-col items-center justify-center py-8 gap-3">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">Generating personalized challenge…</p>
                </div>
              )}

              {/* Challenge content */}
              {codeChallenge && !codeResult && (
                <>
                  {/* Question card */}
                  <Card className="p-4 bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800">
                    <h3 className="font-semibold mb-2 text-blue-800 dark:text-blue-300">Question</h3>
                    <p className="text-sm whitespace-pre-wrap">{codeChallenge.question}</p>
                    {(codeChallenge.exampleInput || codeChallenge.exampleOutput) && (
                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                        {codeChallenge.exampleInput && (
                          <div className="bg-slate-100 dark:bg-slate-800 rounded p-2">
                            <span className="font-medium block mb-1 text-muted-foreground">Input:</span>
                            <code className="text-green-700 dark:text-green-400">{codeChallenge.exampleInput}</code>
                          </div>
                        )}
                        {codeChallenge.exampleOutput && (
                          <div className="bg-slate-100 dark:bg-slate-800 rounded p-2">
                            <span className="font-medium block mb-1 text-muted-foreground">Expected Output:</span>
                            <code className="text-blue-700 dark:text-blue-400">{codeChallenge.exampleOutput}</code>
                          </div>
                        )}
                      </div>
                    )}
                  </Card>

                  {/* Monaco Editor */}
                  <div className="rounded-md overflow-hidden border border-slate-600">
                    <Editor
                      height="280px"
                      language={codeChallenge.language}
                      value={userCode}
                      onChange={(v) => setUserCode(v ?? '')}
                      theme="vs-dark"
                      options={{
                        fontSize: 13,
                        minimap: { enabled: false },
                        scrollBeyondLastLine: false,
                        wordWrap: 'on',
                        lineNumbers: 'on',
                        tabSize: 2,
                      }}
                    />
                  </div>

                  <Button
                    onClick={submitCode}
                    disabled={codeSubmitting || !userCode.trim()}
                    className="w-full gap-2"
                  >
                    {codeSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    {codeSubmitting ? 'Evaluating…' : 'Submit Code'}
                  </Button>
                </>
              )}

              {/* Result */}
              {codeResult && (
                <div className="space-y-4">
                  <Card className={`p-4 ${
                    codeResult.passed
                      ? 'bg-green-50 dark:bg-green-950/30 border-green-300 dark:border-green-700'
                      : 'bg-red-50 dark:bg-red-950/30 border-red-300 dark:border-red-700'
                  }`}>
                    <div className="flex items-center gap-3 mb-3">
                      {codeResult.passed
                        ? <CheckCircle2 className="w-6 h-6 text-green-600" />
                        : <XCircle className="w-6 h-6 text-red-600" />}
                      <div>
                        <p className={`font-bold text-lg ${codeResult.passed ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}`}>
                          {codeResult.passed ? '✅ Passed!' : '❌ Not Passed'}
                        </p>
                        <p className="text-sm text-muted-foreground">Score: {codeResult.score}/100</p>
                      </div>
                    </div>
                    <p className="text-sm leading-relaxed">{codeResult.feedback}</p>
                  </Card>

                  <Button onClick={nextSkill} className="w-full gap-2">
                    {currentSkillIdx + 1 < skills.length ? (
                      <><ArrowRight className="w-4 h-4" /> Continue to Next Skill</>
                    ) : (
                      <><CheckCircle2 className="w-4 h-4" /> View Final Summary</>
                    )}
                  </Button>
                </div>
              )}
            </div>
          </>
        )}

        {/* ── ALL DONE ──────────────────────────────────────────────────────── */}
        {phase === 'all-done' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-primary" />
                Assessment Complete
              </DialogTitle>
              <DialogDescription>
                {results.filter(r => r.verdict === 'approved').length} of {results.length} skills verified
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-4">
              {results.map((r, i) => (
                <Card key={i} className={`p-3 flex items-center justify-between ${
                  r.verdict === 'approved'
                    ? 'border-green-200 dark:border-green-800'
                    : r.verdict === 'rejected'
                      ? 'border-red-200 dark:border-red-800'
                      : 'border-amber-200 dark:border-amber-800'
                }`}>
                  <div className="flex items-center gap-2">
                    {r.verdict === 'approved' && <CheckCircle2 className="w-5 h-5 text-green-500" />}
                    {r.verdict === 'rejected' && <AlertTriangle className="w-5 h-5 text-red-500" />}
                    {r.verdict === 'pending' && <Clock className="w-5 h-5 text-amber-500" />}
                    {!r.submitted && <AlertTriangle className="w-5 h-5 text-gray-400" />}
                    <div>
                      <span className="font-medium">{r.skill}</span>
                      {r.verdict === 'rejected' && r.verdictReason && (
                        <p className="text-xs text-red-600 dark:text-red-400 mt-0.5 max-w-[280px] truncate">
                          {r.verdictReason}
                        </p>
                      )}
                    </div>
                  </div>
                  <Badge variant={
                    r.verdict === 'approved' ? 'default'
                      : r.verdict === 'rejected' ? 'destructive'
                        : 'secondary'
                  } className={r.verdict === 'approved' ? 'bg-green-600' : undefined}>
                    {r.verdict === 'approved' ? '✓ Verified' : r.verdict === 'rejected' ? '✗ Not Passed' : r.submitted ? 'Under Review' : 'Failed'}
                  </Badge>
                </Card>
              ))}

              {results.some(r => r.verdict === 'rejected') && (
                <Card className="p-4 bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800">
                  <p className="text-sm text-red-700 dark:text-red-300">
                    Skills that were not passed can be retried later from your profile.
                  </p>
                </Card>
              )}

              {results.some(r => r.verdict === 'approved') && (
                <Card className="p-4 bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800">
                  <p className="text-sm text-green-700 dark:text-green-300">
                    Verified skills are now visible on your profile and help you get better job matches!
                  </p>
                </Card>
              )}
            </div>

            <DialogFooter>
              <Button onClick={() => onComplete(results)} className="gap-2">
                <CheckCircle2 className="w-4 h-4" /> Done
              </Button>
            </DialogFooter>
          </>
        )}

      </DialogContent>
    </Dialog>
  )
}
