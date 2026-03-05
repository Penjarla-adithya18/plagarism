import { NextRequest, NextResponse } from 'next/server'
import { fetchWithRetry } from '@/lib/fetchRetry'

/**
 * POST /api/ai/skill-video-submit
 *
 * Accepts the worker's recorded video assessment and stores it.
 * Supports both JSON body (small videos) and FormData (large videos).
 */

// Allow longer execution for video upload + AI analysis pipeline
export const maxDuration = 60  // 60s — upload + DB insert only (analysis is fire-and-forget)
export const dynamic = 'force-dynamic'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://yecelpnlaruavifzxunw.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InllY2VscG5sYXJ1YXZpZnp4dW53Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2Njk5MTksImV4cCI6MjA4NzI0NTkxOX0.MaoAJIec30GfrQolYQKJ4dnvmIxTW7t0DbM_tS8xYVk'
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? SUPABASE_ANON_KEY

async function supabaseInsert(table: string, data: Record<string, unknown>) {
  // NOTE: We deliberately omit `Prefer: return=representation` here.
  // With the anon key the INSERT policy passes (sa_insert_any → true),
  // but the implicit SELECT needed to RETURN the row fails because no
  // SELECT policy matches an anonymous caller → 42501.
  // Instead we generate the id client-side and pass it in `data`.
  const res = await fetchWithRetry(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    },
    body: JSON.stringify(data),
  }, { maxAttempts: 3, baseDelayMs: 1500, label: 'SupabaseInsert' })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Supabase insert error: ${res.status} ${err}`)
  }
  // Return the data we sent (id was pre-generated client-side)
  return data
}

async function supabaseUploadVideo(
  workerId: string,
  skillId: string,
  videoInput: string | { buffer: Buffer; mimeType: string },
): Promise<string> {
  let binaryData: Buffer
  let mimeType: string

  if (typeof videoInput !== 'string') {
    // Raw buffer path (from FormData — avoids base64 round-trip)
    binaryData = videoInput.buffer
    mimeType = videoInput.mimeType
  } else {
    // Data URL path (from JSON body)
    const match = videoInput.match(/^data:(video\/\w+);base64,(.+)$/)
    if (!match) {
      return videoInput.substring(0, 200) + '...[truncated]'
    }
    mimeType = match[1]
    binaryData = Buffer.from(match[2], 'base64')
  }

  const ext = mimeType === 'video/webm' ? 'webm' : 'mp4'
  const fileName = `assessments/${workerId}/${skillId.replace(/\s+/g, '_')}_${Date.now()}.${ext}`

  const res = await fetchWithRetry(`${SUPABASE_URL}/storage/v1/object/uploads/${fileName}`, {
    method: 'POST',
    headers: {
      'Content-Type': mimeType,
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    },
    body: binaryData,
  }, { maxAttempts: 3, baseDelayMs: 2000, label: 'StorageUpload' })

  if (res.ok) {
    return `${SUPABASE_URL}/storage/v1/object/public/uploads/${fileName}`
  }

  // If storage upload fails, store as data URL (may be large)
  console.warn('[skill-video-submit] Storage upload failed, storing inline')
  return typeof videoInput === 'string'
    ? videoInput
    : `data:${mimeType};base64,${binaryData.toString('base64')}`
}

export async function POST(req: NextRequest) {
  try {
    // ── Parse request body (handle both JSON and FormData) ──────────────
    let workerId: string, skill: string, question: unknown, expectedAnswer: string
    let videoBase64: string, videoDurationMs: number, audioMetrics: unknown, faceMetrics: unknown
    let language = 'en'  // worker's chosen UI language — passed to Whisper as hint
    let videoRaw: { buffer: Buffer; mimeType: string } | null = null

    const contentType = req.headers.get('content-type') ?? ''

    if (contentType.includes('multipart/form-data')) {
      // FormData upload (for large videos — video sent as File, not base64)
      const form = await req.formData()
      workerId = form.get('workerId') as string
      skill = form.get('skill') as string
      const qRaw = form.get('question') as string || '{}'
      try { question = JSON.parse(qRaw) } catch { question = qRaw }
      expectedAnswer = form.get('expectedAnswer') as string || ''
      language = (form.get('language') as string) || 'en'
      videoDurationMs = Number(form.get('videoDurationMs') || 0)
      const metricsRaw = form.get('audioMetrics') as string || 'null'
      try { audioMetrics = JSON.parse(metricsRaw) } catch { audioMetrics = null }
      const faceRaw = form.get('faceMetrics') as string || 'null'
      try { faceMetrics = JSON.parse(faceRaw) } catch { faceMetrics = null }

      // Convert File/Blob to raw buffer for efficient upload
      const videoFile = form.get('video') as File | null
      if (videoFile) {
        const buf = Buffer.from(await videoFile.arrayBuffer())
        const mime = videoFile.type || 'video/webm'
        videoRaw = { buffer: buf, mimeType: mime }
        // Also create base64 data URL for validation/fallback
        videoBase64 = `data:${mime};base64,${buf.toString('base64')}`
      } else {
        videoBase64 = form.get('videoBase64') as string || ''
      }
    } else {
      // JSON body — read as text first to handle potential truncation
      const rawText = await req.text()
      let body: Record<string, unknown>
      try {
        body = JSON.parse(rawText)
      } catch {
        console.error(`[skill-video-submit] JSON parse failed. Body size: ${rawText.length} chars.`)
        return NextResponse.json(
          { error: 'Request body too large or malformed. Video may exceed size limit.' },
          { status: 413 },
        )
      }
      workerId = body.workerId as string
      skill = body.skill as string
      question = body.question
      expectedAnswer = (body.expectedAnswer as string) || ''
      language = (body.language as string) || 'en'
      videoBase64 = body.videoBase64 as string
      videoDurationMs = (body.videoDurationMs as number) || 0
      audioMetrics = body.audioMetrics
      faceMetrics = body.faceMetrics ?? null
    }

    if (!workerId || !skill || !question || !videoBase64) {
      return NextResponse.json(
        { error: 'workerId, skill, question, and videoBase64 are required' },
        { status: 400 },
      )
    }

    // Upload video (prefer raw buffer if available to avoid base64 round-trip)
    let videoUrl: string
    try {
      videoUrl = await supabaseUploadVideo(workerId, skill.replace(/\s+/g, '_'), videoRaw ?? videoBase64)
    } catch (e) {
      console.warn('[skill-video-submit] Video upload failed, storing inline:', e)
      videoUrl = videoBase64
    }

    // Insert assessment record (ID generated client-side to avoid RETURNING)
    const assessmentId = crypto.randomUUID()
    const record = {
      id: assessmentId,
      worker_id: workerId,
      skill,
      question: typeof question === 'string' ? JSON.parse(question) : question,
      expected_answer: expectedAnswer || '',
      video_url: videoUrl,
      video_duration_ms: videoDurationMs || 0,
      status: 'pending',
      analysis: null,
    }

    let dbInsertOk = false
    try {
      await supabaseInsert('skill_assessments', record)
      dbInsertOk = true
    } catch (e) {
      console.error('[skill-video-submit] DB insert failed:', e)
      return NextResponse.json(
        { error: 'Failed to save assessment. Please try again.', details: String(e) },
        { status: 500 },
      )
    }

    // ── Run analysis pipeline synchronously ──────────────────────────────
    // With Groq LPU as primary, the full pipeline (Whisper + 2× LLM) completes
    // in ~5-10s. We await it so the frontend gets the real verdict immediately.
    let verdict: 'approved' | 'rejected' | 'pending' = 'pending'
    let verdictReason = ''
    let score: number | null = null

    if (dbInsertOk) {
      try {
        const analysisUrl = new URL('/api/ai/analyze-assessment', req.url).toString()
        const analysisRes = await fetch(analysisUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ assessmentId, videoUrl, skill, expectedAnswer, audioMetrics, faceMetrics, question, language }),
          signal: AbortSignal.timeout(55_000), // stay within 60s maxDuration
        })

        if (analysisRes.ok) {
          const analysisData = await analysisRes.json()
          const analysis = analysisData.analysis ?? null
          verdict = analysis?.auto_decision ?? 'pending'
          verdictReason = analysis?.auto_decision_reason ?? ''
          score = analysis?.confidence_score ?? null
        } else {
          console.warn('[skill-video-submit] Analysis returned non-OK:', analysisRes.status)
          verdictReason = 'Analysis pipeline error — needs manual review.'
        }
      } catch (e) {
        console.warn('[skill-video-submit] Analysis pipeline failed:', e)
        verdictReason = 'Analysis timed out — needs manual review.'
      }
    }

    return NextResponse.json({
      success: true,
      assessmentId,
      verdict,
      verdictReason,
      score,
      message:
        verdict === 'approved'
          ? 'Skill verified successfully!'
          : verdict === 'rejected'
            ? `Skill assessment not passed: ${verdictReason}`
            : 'Assessment submitted — awaiting review.',
    })
  } catch (error) {
    console.error('[skill-video-submit] Error:', error)
    return NextResponse.json(
      { error: 'Failed to submit assessment' },
      { status: 500 },
    )
  }
}
