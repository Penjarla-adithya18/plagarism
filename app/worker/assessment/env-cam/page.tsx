'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import {
  Camera,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  Upload,
  Users,
  MonitorOff,
  UserX,
  ShieldCheck,
} from 'lucide-react'

// ── Constants ─────────────────────────────────────────────────────────────────
const RECORDING_TIME_S = 65
const DETECT_INTERVAL_MS = 2500

type Status =
  | 'connecting'
  | 'waiting-camera'
  | 'camera-ready'
  | 'waiting-start'
  | 'recording'
  | 'uploading'
  | 'done'
  | 'assessment-ended'
  | 'error'

type DetectionState = 'loading' | 'ok' | 'no-person' | 'multiple' | 'no-laptop' | 'neither'

const DETECTION_UI: Record<DetectionState, { color: string; icon: React.ReactNode; text: string; sub: string } | null> = {
  loading: null,
  ok: null,
  'no-person': {
    color: 'bg-red-600/90',
    icon: <UserX className="w-4 h-4 text-white flex-shrink-0" />,
    text: '⚠️ Only laptop detected — no person in frame!',
    sub: 'Move so your upper body is clearly visible.',
  },
  multiple: {
    color: 'bg-red-700/90',
    icon: <Users className="w-4 h-4 text-white flex-shrink-0" />,
    text: '🚫 Multiple people detected!',
    sub: 'Only ONE person is allowed during the assessment.',
  },
  'no-laptop': {
    color: 'bg-amber-500/90',
    icon: <MonitorOff className="w-4 h-4 text-white flex-shrink-0" />,
    text: '⚠️ Laptop not visible in frame',
    sub: 'Adjust so the laptop screen is clearly visible.',
  },
  neither: {
    color: 'bg-orange-600/90',
    icon: <AlertTriangle className="w-4 h-4 text-white flex-shrink-0" />,
    text: '⚠️ Nothing detected — adjust camera angle',
    sub: 'Ensure laptop screen AND person upper body are in view.',
  },
}

function EnvCamContent() {
  const params = useSearchParams()
  const session = params.get('session') ?? ''
  const skill = params.get('skill') ?? 'Assessment'
  const workerId = params.get('workerid') ?? ''

  const [status, setStatus] = useState<Status>('connecting')
  const [timer, setTimer] = useState(RECORDING_TIME_S)
  const [error, setError] = useState('')
  const [detection, setDetection] = useState<DetectionState>('loading')

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const detectorRef = useRef<any>(null)
  const detectIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  // ── Load MediaPipe ObjectDetector (≈ 5 MB model from CDN) ─────────────────
  const loadDetector = useCallback(async () => {
    try {
      const { FilesetResolver, ObjectDetector } = await import('@mediapipe/tasks-vision')
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.32/wasm'
      )
      detectorRef.current = await ObjectDetector.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite',
          delegate: 'GPU',
        },
        scoreThreshold: 0.38,
        runningMode: 'IMAGE',
        maxResults: 10,
      })
      console.log('[env-cam] ObjectDetector ready')
      // Run first detection immediately after model loads
      setTimeout(runDetectionRef.current, 300)
    } catch (e) {
      console.warn('[env-cam] ObjectDetector failed to load:', e)
    }
  }, [])

  // ── Run one detection frame ───────────────────────────────────────────────
  const runDetection = useCallback(() => {
    const video = videoRef.current
    const detector = detectorRef.current
    const canvas = canvasRef.current
    if (!video || !detector || !canvas || video.readyState < 2) return
    try {
      const w = video.videoWidth || 640
      const h = video.videoHeight || 480
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.drawImage(video, 0, 0, w, h)
      const result = detector.detect(canvas)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const labels: string[] = result.detections.map((d: any) => (d.categories[0]?.categoryName ?? '').toLowerCase())
      const personCount = labels.filter(l => l === 'person').length
      const hasLaptop = labels.some(l => l === 'laptop')
      let next: DetectionState
      if (personCount >= 2)                        next = 'multiple'
      else if (personCount === 1 && hasLaptop)     next = 'ok'
      else if (personCount === 1 && !hasLaptop)    next = 'no-laptop'
      else if (personCount === 0 && hasLaptop)     next = 'no-person'
      else                                         next = 'neither'
      setDetection(next)
    } catch (e) {
      console.warn('[env-cam] Detection error:', e)
    }
  }, [])

  const runDetectionRef = useRef(runDetection)
  useEffect(() => { runDetectionRef.current = runDetection }, [runDetection])

  // ── Detection loop control ───────────────────────────────────────────────
  const startDetectionLoop = useCallback(() => {
    if (detectIntervalRef.current) return
    detectIntervalRef.current = setInterval(() => runDetectionRef.current(), DETECT_INTERVAL_MS)
  }, [])

  const stopDetectionLoop = useCallback(() => {
    if (detectIntervalRef.current) { clearInterval(detectIntervalRef.current); detectIntervalRef.current = null }
  }, [])

  // ── Start rear camera ─────────────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    setStatus('waiting-camera')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play().catch(() => {})
      }
      // Load detector in background (non-blocking)
      loadDetector()
      channelRef.current?.send({
        type: 'broadcast',
        event: 'env-cam-ready',
        payload: { session },
      })
      setStatus('waiting-start')
    } catch (e) {
      console.error('[env-cam] Camera error:', e)
      setError('Camera access denied. Allow camera permission and reload.')
      setStatus('error')
    }
  }, [session, loadDetector])

  // ── Detect best supported MIME type ─────────────────────────────────────
  const getBestMimeType = () => {
    const candidates = [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
      'video/mp4;codecs=h264',
      'video/mp4',
    ]
    for (const t of candidates) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) return t
    }
    return '' // let the browser decide
  }

  // ── Record video and upload ────────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    if (!streamRef.current) return
    setStatus('recording')
    chunksRef.current = []

    const mimeType = getBestMimeType()
    const mr = mimeType
      ? new MediaRecorder(streamRef.current, { mimeType })
      : new MediaRecorder(streamRef.current)
    mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
    mr.onstop = async () => {
      setStatus('uploading')
      try {
        const usedMime = mediaRecorderRef.current?.mimeType || 'video/webm'
        const blob = new Blob(chunksRef.current, { type: usedMime })
        const fd = new FormData()
        fd.append('video', blob, `env-${Date.now()}.webm`)
        fd.append('session', session)
        fd.append('workerId', workerId)
        fd.append('skill', skill)

        const res = await fetch('/api/assessment/upload-env-video', {
          method: 'POST',
          body: fd,
        })
        const data = await res.json()
        if (res.ok && data.url) {
          channelRef.current?.send({
            type: 'broadcast',
            event: 'env-video-uploaded',
            payload: { session, url: data.url },
          })
          setStatus('done')
        } else {
          throw new Error(data.error || 'Upload failed')
        }
      } catch (e) {
        console.error('[env-cam] Upload error:', e)
        setError('Failed to upload environment video. Assessment still continues.')
        setStatus('error')
      }
      // Stop stream tracks
      streamRef.current?.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }

    mediaRecorderRef.current = mr
    mr.start(1000)

    // Countdown timer
    setTimer(RECORDING_TIME_S)
    timerRef.current = setInterval(() => {
      setTimer(prev => {
        if (prev <= 1) {
          if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
          mr.stop()
          return 0
        }
        return prev - 1
      })
    }, 1000)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, workerId, skill, startDetectionLoop, stopDetectionLoop])

  // ── Start detection loop when camera is live (waiting or recording) ──────
  useEffect(() => {
    if (status === 'waiting-start') {
      const t = setTimeout(() => startDetectionLoop(), 1500)
      return () => clearTimeout(t)
    }
    if (status !== 'recording') stopDetectionLoop()
  }, [status, startDetectionLoop, stopDetectionLoop])

  // ── Supabase Realtime: subscribe to primary device signals ────────────────
  useEffect(() => {
    if (!session) {
      setError('Invalid session URL. Scan the QR code again.')
      setStatus('error')
      return
    }

    const channel = supabase.channel(`env-cam:${session}`, {
      config: { broadcast: { self: false } },
    })

    channel
      .on('broadcast', { event: 'start-recording' }, () => {
        console.log('[env-cam] Received start-recording signal')
        startRecording()
      })
      .on('broadcast', { event: 'stop-recording' }, () => {
        console.log('[env-cam] Received stop-recording signal')
        stopDetectionLoop()
        if (mediaRecorderRef.current?.state === 'recording') {
          mediaRecorderRef.current.stop()
          if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
        } else {
          streamRef.current?.getTracks().forEach(t => t.stop())
          streamRef.current = null
          setStatus('assessment-ended')
        }
      })
      .subscribe((s) => {
        console.log('[env-cam] Channel status:', s)
        if (s === 'SUBSCRIBED') {
          channelRef.current = channel
          startCamera()
        } else if (s === 'CHANNEL_ERROR') {
          setError('Connection to assessment server failed.')
          setStatus('error')
        }
      })

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      stopDetectionLoop()
      detectorRef.current?.close?.()
      mediaRecorderRef.current?.stop()
      streamRef.current?.getTracks().forEach(t => t.stop())
      supabase.removeChannel(channel)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session])

  // ── Keep startRecording ref fresh ─────────────────────────────────────────
  const startRecordingRef = useRef(startRecording)
  useEffect(() => { startRecordingRef.current = startRecording }, [startRecording])

  // ── Re-attach stream whenever the video element mounts into the DOM ───────
  // startCamera() may run before the <video> element is rendered (status is
  // 'waiting-camera' at that time), so videoRef.current is null there.
  // This effect fires after every status change; once the element is in the
  // DOM and we have a stream, we attach it.
  useEffect(() => {
    if (videoRef.current && streamRef.current && !videoRef.current.srcObject) {
      videoRef.current.srcObject = streamRef.current
      videoRef.current.play().catch(() => {})
    }
  }, [status])

  // ── Derived UI helpers ────────────────────────────────────────────────────
  const showCamera = ['waiting-camera', 'camera-ready', 'waiting-start', 'recording'].includes(status)
  const showDetection = ['waiting-start', 'recording'].includes(status)
  const detUI = DETECTION_UI[detection]
  const isWarning = detection !== 'loading' && detection !== 'ok'
  const bracketColor = detection === 'ok' ? 'border-emerald-400' : 'border-amber-400'

  // ── UI ────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 gap-4">
      {/* Header */}
      <div className="flex items-center gap-2 text-white">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-r from-emerald-500 to-blue-500 text-xl font-bold text-white">H</div>
        <span className="font-bold text-lg">HyperLocal</span>
        <Badge variant="outline" className="border-blue-400 text-blue-300 ml-2">Environment Camera</Badge>
      </div>

      {/* Status card */}
      <Card className="w-full max-w-sm p-4 bg-slate-900 border-slate-700 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-400">Skill</span>
          <Badge>{skill}</Badge>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-400">Status</span>
          <StatusBadge status={status} />
        </div>

        {/* Live frame-check badge */}
        {showDetection && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-400">Frame Check</span>
            {detection === 'loading' && <span className="flex items-center gap-1 text-xs text-slate-400"><Loader2 className="w-3 h-3 animate-spin" /> Loading AI...</span>}
            {detection === 'ok'      && <span className="flex items-center gap-1 text-xs text-emerald-400 font-semibold"><ShieldCheck className="w-3 h-3" /> Frame OK</span>}
            {isWarning               && <span className="flex items-center gap-1 text-xs text-red-400 font-semibold animate-pulse"><AlertTriangle className="w-3 h-3" /> Fix frame!</span>}
          </div>
        )}
        {status === 'recording' && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="flex items-center gap-1">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                Recording environment
              </span>
              <span className="font-mono text-red-400">{formatTime(timer)}</span>
            </div>
            <Progress value={(timer / RECORDING_TIME_S) * 100} className="[&>div]:bg-red-500" />
          </div>
        )}
        {status === 'uploading' && (
          <div className="flex items-center gap-2 text-sm text-blue-300">
            <Upload className="w-4 h-4 animate-pulse" />
            Uploading environment video...
          </div>
        )}
        {status === 'done' && (
          <div className="flex items-center gap-2 text-sm text-green-400">
            <CheckCircle2 className="w-4 h-4" />
            Environment video uploaded. You can close this tab.
          </div>
        )}
        {status === 'assessment-ended' && (
          <div className="flex items-center gap-2 text-sm text-slate-300">
            <CheckCircle2 className="w-4 h-4 text-slate-400" />
            Assessment has ended on the primary device. You can close this tab.
          </div>
        )}
        {(status === 'error') && (
          <div className="flex items-center gap-2 text-sm text-red-400">
            <AlertTriangle className="w-4 h-4" />
            {error}
          </div>
        )}
      </Card>

      {/* Camera preview */}
      {showCamera && (
        <div className="w-full max-w-sm relative rounded-xl overflow-hidden bg-black aspect-video border-2 border-slate-700">
          <video
            ref={videoRef}
            muted
            playsInline
            autoPlay
            onCanPlay={() => { videoRef.current?.play().catch(() => {}) }}
            className="absolute inset-0 w-full h-full object-cover"
          />
          {/* Hidden canvas for frame capture */}
          <canvas ref={canvasRef} className="hidden" />

          {showDetection && (
            <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-2">
              {/* Top row */}
              <div className="flex justify-between items-start">
                <div className={`w-7 h-7 border-t-2 border-l-2 rounded-tl transition-colors ${bracketColor}`} />
                {status === 'recording'
                  ? <span className="flex items-center gap-1 bg-red-600/80 rounded-full px-2 py-0.5 text-[10px] font-bold text-white"><span className="w-2 h-2 bg-white rounded-full animate-pulse" /> REC</span>
                  : <span className="flex items-center gap-1 bg-black/60 rounded-full px-2 py-0.5 text-[10px] text-emerald-300"><Loader2 className="w-3 h-3 animate-spin" /> Waiting...</span>
                }
                <div className={`w-7 h-7 border-t-2 border-r-2 rounded-tr transition-colors ${bracketColor}`} />
              </div>

              {/* Bottom row: banner + corners */}
              <div className="flex flex-col gap-1">
                {isWarning && detUI && (
                  <div className={`${detUI.color} rounded-lg px-3 py-2 flex items-start gap-2`}>
                    {detUI.icon}
                    <div>
                      <p className="text-white text-[12px] font-bold leading-tight">{detUI.text}</p>
                      <p className="text-white/80 text-[10px] leading-tight mt-0.5">{detUI.sub}</p>
                    </div>
                  </div>
                )}
                {detection === 'ok' && (
                  <div className="bg-emerald-600/80 rounded-lg px-3 py-1.5 flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-white flex-shrink-0" />
                    <p className="text-white text-[11px] font-semibold">✓ Laptop + 1 person visible — frame looks good</p>
                  </div>
                )}
                {detection === 'loading' && (
                  <div className="bg-black/60 rounded-lg px-3 py-1.5 flex items-center gap-2">
                    <Loader2 className="w-3 h-3 text-slate-300 animate-spin flex-shrink-0" />
                    <p className="text-slate-300 text-[11px]">AI loading — will check frame shortly...</p>
                  </div>
                )}
                <div className="flex justify-between items-end">
                  <div className={`w-7 h-7 border-b-2 border-l-2 rounded-bl transition-colors ${bracketColor}`} />
                  <div className={`w-7 h-7 border-b-2 border-r-2 rounded-br transition-colors ${bracketColor}`} />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Setup instructions */}
      {status === 'waiting-start' && (
        <Card className="w-full max-w-sm p-4 bg-slate-900 border-slate-700">
          <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
            <Camera className="w-4 h-4 text-emerald-400" /> Setup Instructions
          </h3>
          <ol className="text-xs text-slate-400 space-y-1.5 list-decimal list-inside">
            <li>Place this phone at a <strong className="text-white">45° angle to the side</strong> of the worker</li>
            <li>Frame so <strong className="text-white">laptop screen AND person&apos;s upper body</strong> are visible</li>
            <li>Wait for the <strong className="text-emerald-400">green “Frame OK”</strong> banner — AI is checking live</li>
            <li>Recording starts <strong className="text-white">automatically</strong> when the test begins</li>
            <li>This screen updates automatically when the assessment <strong className="text-white">ends or is stopped</strong></li>
          </ol>
        </Card>
      )}

      {(status === 'connecting' || status === 'waiting-camera') && (
        <div className="flex items-center gap-2 text-slate-400 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" />
          {status === 'connecting' ? 'Connecting to session...' : 'Starting camera...'}
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: Status }) {
  const map: Record<Status, { label: string; className: string }> = {
    connecting:     { label: 'Connecting',      className: 'bg-slate-700 text-slate-300' },
    'waiting-camera': { label: 'Starting Camera', className: 'bg-blue-900 text-blue-300' },
    'camera-ready': { label: 'Camera Ready',    className: 'bg-blue-900 text-blue-300' },
    'waiting-start': { label: 'Waiting',         className: 'bg-amber-900 text-amber-300' },
    recording:      { label: '● Recording',     className: 'bg-red-900 text-red-300' },
    uploading:      { label: 'Uploading',        className: 'bg-blue-900 text-blue-300' },
        done:              { label: '✓ Done',            className: 'bg-green-900 text-green-300' },
        'assessment-ended': { label: 'Ended',            className: 'bg-slate-700 text-slate-300' },
        error:              { label: 'Error',            className: 'bg-red-900 text-red-300' },
  }
  const { label, className } = map[status]
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${className}`}>{label}</span>
}

export default function EnvCamPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
      </div>
    }>
      <EnvCamContent />
    </Suspense>
  )
}
