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
  Video,
  WifiOff,
  AlertTriangle,
  Upload,
} from 'lucide-react'

// ── Constants ─────────────────────────────────────────────────────────────────
const RECORDING_TIME_S = 65 // slightly longer than primary (60s) to ensure full coverage
const SUPABASE_URL = 'https://yecelpnlaruavifzxunw.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InllY2VscG5sYXJ1YXZpZnp4dW53Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2Njk5MTksImV4cCI6MjA4NzI0NTkxOX0.MaoAJIec30GfrQolYQKJ4dnvmIxTW7t0DbM_tS8xYVk'

type Status =
  | 'connecting'
  | 'waiting-camera'
  | 'camera-ready'
  | 'waiting-start'
  | 'recording'
  | 'uploading'
  | 'done'
  | 'error'

function EnvCamContent() {
  const params = useSearchParams()
  const session = params.get('session') ?? ''
  const skill = params.get('skill') ?? 'Assessment'
  const workerId = params.get('workerid') ?? ''

  const [status, setStatus] = useState<Status>('connecting')
  const [timer, setTimer] = useState(RECORDING_TIME_S)
  const [error, setError] = useState('')
  const [envVideoUrl, setEnvVideoUrl] = useState('')

  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  // ── Start rear camera ──────────────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    setStatus('waiting-camera')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' }, // rear camera
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false, // env cam is video-only; primary handles audio
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        // play() may throw on strict autoplay policy — onCanPlay will retry
        videoRef.current.play().catch(() => {})
      }
      setStatus('camera-ready')

      // Broadcast to primary that this device is ready
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
  }, [session])

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
          setEnvVideoUrl(data.url)
          // Broadcast video URL to primary device
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
  }, [session, workerId, skill])

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
        if (mediaRecorderRef.current?.state === 'recording') {
          mediaRecorderRef.current.stop()
          if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
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
      mediaRecorderRef.current?.stop()
      streamRef.current?.getTracks().forEach(t => t.stop())
      supabase.removeChannel(channel)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session])

  // ── Keep startRecording ref fresh ─────────────────────────────────────────
  const startRecordingRef = useRef(startRecording)
  useEffect(() => { startRecordingRef.current = startRecording }, [startRecording])

  // ── UI ────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 gap-4">
      {/* Header */}
      <div className="flex items-center gap-2 text-white">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-r from-emerald-500 to-blue-500 text-xl font-bold text-white">
          H
        </div>
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
        {(status === 'error') && (
          <div className="flex items-center gap-2 text-sm text-red-400">
            <AlertTriangle className="w-4 h-4" />
            {error}
          </div>
        )}
      </Card>

      {/* Camera preview */}
      {(status === 'waiting-start' || status === 'recording') && (
        <div className="w-full max-w-sm relative rounded-xl overflow-hidden bg-black aspect-video border border-slate-700">
          {/* video must be absolute so aspect-ratio drives height on all mobile browsers */}
          <video
            ref={videoRef}
            muted
            playsInline
            autoPlay
            onCanPlay={() => { videoRef.current?.play().catch(() => {}) }}
            className="absolute inset-0 w-full h-full object-cover"
          />
          {status === 'waiting-start' && (
            <div className="absolute inset-0 flex items-end justify-center pb-4 bg-black/30">
              <div className="text-center text-white space-y-1 bg-black/60 rounded-xl px-4 py-2">
                <p className="text-sm font-medium flex items-center gap-2 justify-center">
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                  Waiting for assessment to start...
                </p>
                <p className="text-xs text-slate-400">Keep this screen open and pointed at the workspace</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Instructions */}
      {status === 'waiting-start' && (
        <Card className="w-full max-w-sm p-4 bg-slate-900 border-slate-700">
          <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
            <Camera className="w-4 h-4 text-emerald-400" /> Setup Instructions
          </h3>
          <ol className="text-xs text-slate-400 space-y-1.5 list-decimal list-inside">
            <li>Place this phone to the <strong className="text-white">side or behind</strong> the worker</li>
            <li>Ensure the <strong className="text-white">desk and hands</strong> are visible</li>
            <li>Recording starts <strong className="text-white">automatically</strong> when the test begins</li>
            <li>Do <strong className="text-white">not</strong> touch or move this phone during the test</li>
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
    done:           { label: '✓ Done',           className: 'bg-green-900 text-green-300' },
    error:          { label: 'Error',            className: 'bg-red-900 text-red-300' },
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
