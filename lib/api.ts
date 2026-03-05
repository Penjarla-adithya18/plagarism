// lib/api.ts
// Client-side API layer calling Supabase Edge Functions.
// Exports the same interface as the old mockDb so all pages
// only need to change their import path.

import {
  User,
  WorkerProfile,
  EmployerProfile,
  Job,
  Application,
  ChatConversation,
  ChatMessage,
  TrustScore,
  Report,
  EscrowTransaction,
  Notification,
  JobStatus,
  ApplicationStatus,
} from './types'

// ─── Edge-function caller ──────────────────────────────────────────────────

const SUPABASE_FALLBACK_URL = 'https://yecelpnlaruavifzxunw.supabase.co'

function getEnv() {
  // Use env var when available; fall back to hardcoded URL so that a
  // relative-path fetch (/functions/v1/…) is avoided — the relative path
  // would resolve against localhost:3000 and hit the Next.js server instead
  // of Supabase. The next.config.mjs rewrite also proxies /functions/v1/*
  // as a secondary safety net.
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL || SUPABASE_FALLBACK_URL,
    key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  }
}

const SESSION_TOKEN_KEY = 'sessionToken'
const SESSION_EXPIRES_AT_KEY = 'sessionExpiresAt'
const SESSION_REFRESHED_AT_KEY = 'sessionRefreshedAt'
/** Persists the real wall-clock time the session token was stored — survives page reloads */
const SESSION_SET_AT_KEY = 'sessionSetAt'
let sessionRefreshInFlight: Promise<void> | null = null

/**
 * Timestamp (Date.now()) of when the session token was last set.
 * Used to prevent a 401 handler from clearing a token that was
 * JUST obtained by a concurrent login/register call.
 *
 * On module init we restore the real set-time from localStorage so that stale
 * tokens that survived a page reload are recognised as old (tokenAge > 5s) and
 * properly cleared by the 401 handler instead of being treated as fresh.
 * Previously this was always set to Date.now() on reload, which masked invalid
 * sessions and left users stuck in a 401 loop.
 */
let _sessionSetAt: number = (() => {
  try {
    if (typeof window !== 'undefined' && localStorage.getItem(SESSION_TOKEN_KEY)) {
      const stored = localStorage.getItem(SESSION_SET_AT_KEY)
      // Use the real stored timestamp so stale tokens are detected correctly.
      // Fall back to 60 s ago — old enough that a 401 will clear the session.
      return stored ? Number(stored) : Date.now() - 60_000
    }
  } catch { /* storage may be blocked in private-browsing */ }
  return 0
})()

/** Pending redirect timer — stored so it can be cancelled if a new login succeeds */
let _pendingRedirectTimer: ReturnType<typeof setTimeout> | null = null

function getSessionToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(SESSION_TOKEN_KEY)
}

function getSessionExpiresAt(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(SESSION_EXPIRES_AT_KEY)
}

function setSessionToken(token: string | null): void {
  if (typeof window === 'undefined') return
  if (token) {
    localStorage.setItem(SESSION_TOKEN_KEY, token)
    _sessionSetAt = Date.now()
    // Persist the actual set-time so page reloads can restore the real tokenAge
    localStorage.setItem(SESSION_SET_AT_KEY, String(_sessionSetAt))
    // Cancel any pending redirect since we just got a fresh session
    if (_pendingRedirectTimer) {
      clearTimeout(_pendingRedirectTimer)
      _pendingRedirectTimer = null
    }
  } else {
    localStorage.removeItem(SESSION_TOKEN_KEY)
    localStorage.removeItem(SESSION_EXPIRES_AT_KEY)
    localStorage.removeItem(SESSION_REFRESHED_AT_KEY)
    localStorage.removeItem(SESSION_SET_AT_KEY)
  }
}

function setSessionExpiry(expiresAt: string | null): void {
  if (typeof window === 'undefined') return
  if (expiresAt) localStorage.setItem(SESSION_EXPIRES_AT_KEY, expiresAt)
  else localStorage.removeItem(SESSION_EXPIRES_AT_KEY)
}

async function refreshSessionIfNeeded(): Promise<void> {
  if (sessionRefreshInFlight) {
    await sessionRefreshInFlight
    return
  }

  if (typeof window === 'undefined') return
  const token = getSessionToken()
  const expiresAt = getSessionExpiresAt()
  if (!token || !expiresAt) return

  const expiryMs = new Date(expiresAt).getTime()
  if (!Number.isFinite(expiryMs)) return

  const now = Date.now()
  const refreshWindowMs = 24 * 60 * 60 * 1000
  if (expiryMs - now > refreshWindowMs) return

  const lastRefreshedAtRaw = localStorage.getItem(SESSION_REFRESHED_AT_KEY)
  const lastRefreshedAt = lastRefreshedAtRaw ? Number(lastRefreshedAtRaw) : 0
  const refreshThrottleMs = 5 * 60 * 1000
  if (lastRefreshedAt && now - lastRefreshedAt < refreshThrottleMs) return

  const { url, key } = getEnv()
  const endpoint = `${url}/functions/v1/auth`

  sessionRefreshInFlight = (async () => {
    // Mark early to throttle concurrent callers in the same tick
    localStorage.setItem(SESSION_REFRESHED_AT_KEY, String(now))

    const res = await fetchWithTimeout(
      endpoint,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          apikey: key,
        },
        body: JSON.stringify({ action: 'refresh-session' }),
      },
      REQUEST_TIMEOUT_MS
    )

    if (!res.ok) {
      if (res.status === 401) {
        console.warn('Session refresh failed - token may be invalid')
        // Server rejected the refresh — token is stale.
        // Only clear if the token hasn't been freshly set by a concurrent login.
        const tokenAge = Date.now() - _sessionSetAt
        if (tokenAge > 5000) {
          setSessionToken(null)
          if (typeof window !== 'undefined') {
            localStorage.removeItem('currentUser')
          }
        }
      }
      return
    }

    const data = (await res.json()) as { success?: boolean; token?: string; expiresAt?: string }
    if (data?.success && data.token && data.expiresAt) {
      setSessionToken(data.token)
      setSessionExpiry(data.expiresAt)
      localStorage.setItem(SESSION_REFRESHED_AT_KEY, String(now))
    }
  })()

  try {
    await sessionRefreshInFlight
  } finally {
    sessionRefreshInFlight = null
  }
}

/** Default request timeout in milliseconds */
const REQUEST_TIMEOUT_MS = 20_000 // 20s — Supabase edge functions can cold-start in 10-15s
/** Max retries on network / 5xx errors */
const MAX_RETRIES = 1
/** Base delay between retries (doubles each attempt) */
const RETRY_BASE_MS = 1_500

/**
 * Internal fetch wrapper with timeout via AbortController.
 * Throws a descriptive error on timeout instead of hanging forever.
 */
async function fetchWithTimeout(
  endpoint: string,
  init: RequestInit,
  timeoutMs: number = REQUEST_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(endpoint, { ...init, signal: controller.signal })
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs / 1000}s — the server may be unavailable. Please try again.`)
    }
    // Network failure (offline, DNS, connection refused/timed out)
    throw new Error(
      'Network error — unable to reach the server. Please check your internet connection and try again.'
    )
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Core edge-function caller with timeout + retry.
 * Retries once on network errors or 5xx responses with exponential back-off.
 */
async function call<T>(
  fn: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET',
  params: Record<string, string> = {},
  body?: unknown
): Promise<T> {
  await refreshSessionIfNeeded().catch(() => {})

  const { url, key } = getEnv()
  const token = getSessionToken()
  const qs = new URLSearchParams(params).toString()
  const endpoint = `${url}/functions/v1/${fn}${qs ? `?${qs}` : ''}`

  const init: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token || key}`,
      apikey: key,
    },
    body: method !== 'GET' && body !== undefined ? JSON.stringify(body) : undefined,
  }

  let lastError: Error | null = null

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const latestToken = getSessionToken()
      const attemptInit: RequestInit = {
        ...init,
        headers: {
          ...(init.headers as Record<string, string>),
          Authorization: `Bearer ${latestToken || key}`,
          apikey: key,
        },
      }

      const res = await fetchWithTimeout(endpoint, attemptInit)

      if (!res.ok) {
        if (res.status === 401) {
          // Handle unauthorized — a single 401 can happen during token rotation
          // or transient edge auth issues.
          const currentToken = getSessionToken()
          const tokenUsed = latestToken || null
          if (currentToken && tokenUsed && currentToken !== tokenUsed && attempt < MAX_RETRIES) {
            continue
          }
          // If we sent the anon key (no session token at call time) but there is NOW a
          // real session token, a login may have just completed concurrently — retry once.
          if (!tokenUsed && currentToken && attempt < MAX_RETRIES) {
            await new Promise((r) => setTimeout(r, 200))
            continue
          }

          const text = await res.text()
          // Never redirect on auth calls — login/register send anon key and 401
          // is a normal "bad credentials" response, not a stale session.
          const isAuthCall = fn === 'auth'
          if (!isAuthCall && typeof window !== 'undefined') {
            const storedToken = getSessionToken()
            const tokenAge = Date.now() - _sessionSetAt
            // Only clear + redirect if the session is GENUINELY expired.
            // A 401 from a cold-starting edge function or a transient network
            // issue must NOT log the user out of a still-valid session.
            const expiresAt = getSessionExpiresAt()
            const isGenuinelyExpired = expiresAt
              ? new Date(expiresAt).getTime() <= Date.now()
              : tokenAge > 7 * 24 * 60 * 60 * 1000 // fallback: 7 days
            if (storedToken && tokenAge > 5000 && isGenuinelyExpired) {
              setSessionToken(null)
              localStorage.removeItem('currentUser')
              localStorage.removeItem(SESSION_TOKEN_KEY)
              localStorage.removeItem(SESSION_EXPIRES_AT_KEY)
              localStorage.removeItem(SESSION_REFRESHED_AT_KEY)
              if (!_pendingRedirectTimer) {
                _pendingRedirectTimer = setTimeout(() => {
                  _pendingRedirectTimer = null
                  if (!getSessionToken()) {
                    window.location.href = '/login?reason=session_expired'
                  }
                }, 500)
              }
            }
            // Session not expired — just throw; the caller will handle the error
            // without kicking the user out (likely a transient edge-function error).
          } else if (!currentToken && typeof window !== 'undefined') {
            localStorage.removeItem('currentUser')
            localStorage.removeItem(SESSION_TOKEN_KEY)
            localStorage.removeItem(SESSION_EXPIRES_AT_KEY)
            localStorage.removeItem(SESSION_REFRESHED_AT_KEY)
          }
          throw new Error(`Edge function ${fn} error 401: ${text}`)
        }
        // 403 from Supabase Edge Functions = "Invalid JWT" (expired/bad token)
        // Treat identically to 401: clear session and redirect to login.
        if (res.status === 403) {
          const text = await res.text()
          const isAuthCall = fn === 'auth'
          if (!isAuthCall && typeof window !== 'undefined') {
            const storedToken = getSessionToken()
            const tokenAge = Date.now() - _sessionSetAt
            const expiresAt = getSessionExpiresAt()
            const isGenuinelyExpired = expiresAt
              ? new Date(expiresAt).getTime() <= Date.now()
              : tokenAge > 7 * 24 * 60 * 60 * 1000
            if (storedToken && tokenAge > 5000 && isGenuinelyExpired) {
              setSessionToken(null)
              localStorage.removeItem('currentUser')
              localStorage.removeItem(SESSION_TOKEN_KEY)
              localStorage.removeItem(SESSION_EXPIRES_AT_KEY)
              localStorage.removeItem(SESSION_REFRESHED_AT_KEY)
              if (!_pendingRedirectTimer) {
                _pendingRedirectTimer = setTimeout(() => {
                  _pendingRedirectTimer = null
                  if (!getSessionToken()) {
                    window.location.href = '/login?reason=session_expired'
                  }
                }, 500)
              }
            }
          }
          throw new Error(`Edge function ${fn} error 403: ${text}`)
        }
        // Retry on 5xx server errors
        if (res.status >= 500 && attempt < MAX_RETRIES) {
          lastError = new Error(`Edge function ${fn} error ${res.status}`)
          await new Promise((r) => setTimeout(r, RETRY_BASE_MS * (attempt + 1)))
          continue
        }
        const contentType = res.headers.get('content-type') || ''
        let detail = ''
        if (contentType.includes('application/json')) {
          const body = (await res.json().catch(() => ({}))) as { message?: string; error?: string }
          detail = body?.message || body?.error || ''
        } else {
          detail = await res.text()
        }
        throw new Error(`Edge function ${fn} error ${res.status}: ${detail || 'Request failed'}`)
      }

      return res.json() as Promise<T>
    } catch (err: unknown) {
      lastError = err instanceof Error ? err : new Error(String(err))
      // Retry on network errors (timeout, DNS, connection refused)
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, RETRY_BASE_MS * (attempt + 1)))
        continue
      }
    }
  }

  throw lastError ?? new Error(`Failed to call ${fn}`)
}

// ─── Type helpers ──────────────────────────────────────────────────────────

type R<T> = { data: T }
type SR = { success: boolean; message: string }
type SRU = { success: boolean; user?: User; token?: string; expiresAt?: string; message: string }

// ─── Auth ──────────────────────────────────────────────────────────────────

export async function registerUser(data: {
  fullName: string
  phoneNumber: string
  password: string
  role: User['role']
  email?: string
  businessName?: string
  organizationName?: string
}): Promise<{ success: boolean; user?: User; message: string }> {
  const res = await call<SRU>('auth', 'POST', {}, { action: 'register', ...data })
  if (res.success && (!res.token || !res.user)) {
    setSessionToken(null)
    setSessionExpiry(null)
    return { success: false, message: 'Registration completed but no session was created. Please try again.' }
  }
  if (res.success && res.token) {
    setSessionToken(res.token)
    setSessionExpiry(res.expiresAt ?? null)
  }
  if (!res.success) {
    setSessionToken(null)
    setSessionExpiry(null)
  }
  return { success: res.success, user: res.user, message: res.message }
}

export async function loginUser(
  phoneNumber: string,
  password: string
): Promise<{ success: boolean; user?: User; message: string }> {
  const res = await call<SRU>('auth', 'POST', {}, { action: 'login', phoneNumber, password })
  if (res.success && (!res.token || !res.user)) {
    setSessionToken(null)
    setSessionExpiry(null)
    return { success: false, message: 'Login failed to establish a valid session. Please try again.' }
  }
  if (res.success && res.token) {
    setSessionToken(res.token)
    setSessionExpiry(res.expiresAt ?? null)
  }
  if (!res.success) {
    setSessionToken(null)
    setSessionExpiry(null)
  }
  return { success: res.success, user: res.user, message: res.message }
}

export async function resetPassword(
  currentPassword: string,
  newPassword: string
): Promise<{ success: boolean; message: string }> {
  const res = await call<SR>('auth', 'POST', {}, { action: 'reset-password', currentPassword, newPassword })
  // Do NOT clear session — user stays logged in after changing password
  return res
}

export async function forgotPasswordReset(
  phoneNumber: string,
  newPassword: string
): Promise<{ success: boolean; message: string }> {
  const res = await call<SR>('auth', 'POST', {}, { action: 'forgot-password', phoneNumber, newPassword })
  return res
}

export async function sendOtpRequest(
  phoneNumber: string
): Promise<{ success: boolean; message: string }> {
  try {
    const base = typeof window !== 'undefined' ? '' : (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000')
    const response = await fetchWithTimeout(
      `${base}/api/auth/send-otp`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber }),
      },
      10_000
    )
    const data = (await response.json().catch(() => ({}))) as { success?: boolean; message?: string }
    return {
      success: !!data.success,
      message: data.message || (data.success ? 'OTP sent successfully.' : 'Failed to send OTP. Please try again.'),
    }
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : 'Failed to send OTP. Please try again.',
    }
  }
}

export async function verifyOtpRequest(
  phoneNumber: string,
  otp: string
): Promise<{ success: boolean; message: string }> {
  try {
    const base = typeof window !== 'undefined' ? '' : (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000')
    const response = await fetchWithTimeout(
      `${base}/api/auth/verify-otp`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber, otp }),
      },
      10_000
    )
    const data = (await response.json().catch(() => ({}))) as { success?: boolean; message?: string }
    return {
      success: !!data.success,
      message: data.message || (data.success ? 'OTP verified successfully.' : 'OTP verification failed. Please try again.'),
    }
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : 'OTP verification failed. Please try again.',
    }
  }
}

export async function getUserByPhone(phoneNumber: string): Promise<User | null> {
  try {
    const res = await call<R<User | null>>('auth', 'POST', {}, { action: 'get-user-by-phone-public', phoneNumber })
    return res.data
  } catch {
    return null
  }
}

export async function getUserByEmail(email: string): Promise<User | null> {
  try {
    const res = await call<R<User | null>>('auth', 'POST', {}, { action: 'get-user-by-email', email })
    return res.data
  } catch {
    return null
  }
}

// ─── Session helpers (localStorage, unchanged) ─────────────────────────────

export function getCurrentUser(): User | null {
  if (typeof window === 'undefined') return null
  try { return JSON.parse(localStorage.getItem('currentUser') ?? 'null') } catch { return null }
}
export function setCurrentUser(user: User | null): void {
  if (typeof window === 'undefined') return
  user ? localStorage.setItem('currentUser', JSON.stringify(user)) : localStorage.removeItem('currentUser')
}
export function logout(): void {
  const token = getSessionToken()
  if (token) {
    call<SR>('auth', 'POST', {}, { action: 'logout' }).catch(() => {})
  }
  setCurrentUser(null)
  setSessionToken(null)
}
export function isAuthenticated(): boolean { return getCurrentUser() !== null }
export function getUserPassword(phone: string): string | null {
  void phone
  return null
}
export function setUserPassword(phone: string, password: string): void {
  void phone
  void password
}

// ─── Users ─────────────────────────────────────────────────────────────────

export const userOps = {
  getAll: async (): Promise<User[]> => {
    const res = await call<R<User[]>>('users')
    _usersCache = res.data || []
    return res.data
  },
  findByPhone: async (phoneNumber: string): Promise<User | null> => {
    return getUserByPhone(phoneNumber)
  },
  findById: async (id: string): Promise<User | null> => {
    const res = await call<R<User | null>>('users', 'GET', { id })
    if (res.data) upsertUserCache(res.data)
    return res.data
  },
  update: async (id: string, updates: Partial<User>): Promise<User | null> => {
    const res = await call<R<User | null>>('users', 'PATCH', { id }, updates)
    if (res.data) upsertUserCache(res.data)
    return res.data
  },
  delete: async (id: string): Promise<void> => {
    await call<{ success: boolean }>('users', 'DELETE', { id })
    _usersCache = _usersCache.filter((u) => u.id !== id)
  },
}

// ───Worker Profiles ───────────────────────────────────────────────────────

export const workerProfileOps = {
  findByUserId: async (userId: string): Promise<WorkerProfile | null> => {
    const res = await call<R<WorkerProfile | null>>('profiles', 'GET', { userId, role: 'worker' })
    return res.data
  },
  create: async (profile: WorkerProfile): Promise<WorkerProfile> => {
    const res = await call<R<WorkerProfile>>('profiles', 'POST', {}, { ...profile, role: 'worker' })
    return res.data
  },
  update: async (userId: string, updates: Partial<WorkerProfile>): Promise<WorkerProfile | null> => {
    const res = await call<R<WorkerProfile | null>>('profiles', 'PATCH', { userId, role: 'worker' }, updates)
    return res.data
  },
  /** Fetch all worker profiles on the platform (employer-accessible) */
  getAll: async (): Promise<WorkerProfile[]> => {
    try {
      const res = await call<R<WorkerProfile[]>>('profiles', 'GET', { role: 'worker' })
      return res.data || []
    } catch {
      return []
    }
  },
}

// ─── Employer Profiles ─────────────────────────────────────────────────────

export const employerProfileOps = {
  findByUserId: async (userId: string): Promise<EmployerProfile | null> => {
    const res = await call<R<EmployerProfile | null>>('profiles', 'GET', { userId, role: 'employer' })
    return res.data
  },
  create: async (profile: EmployerProfile): Promise<EmployerProfile> => {
    const res = await call<R<EmployerProfile>>('profiles', 'POST', {}, { ...profile, role: 'employer' })
    return res.data
  },
  update: async (userId: string, updates: Partial<EmployerProfile>): Promise<EmployerProfile | null> => {
    const res = await call<R<EmployerProfile | null>>('profiles', 'PATCH', { userId, role: 'employer' }, updates)
    return res.data
  },
  getAll: async (): Promise<EmployerProfile[]> => {
    return []
  },
}

// ─── Jobs ──────────────────────────────────────────────────────────────────

export const jobOps = {
  findById: async (id: string): Promise<Job | null> => {
    const res = await call<R<Job | null>>('jobs', 'GET', { id })
    return res.data
  },
  findByEmployerId: async (employerId: string): Promise<Job[]> => {
    const res = await call<R<Job[]>>('jobs', 'GET', { employerId })
    return res.data
  },
  getAll: async (filters?: { status?: JobStatus; category?: string; location?: string }): Promise<Job[]> => {
    const params: Record<string, string> = {}
    if (filters?.status) params.status = filters.status
    if (filters?.category) params.category = filters.category
    if (filters?.location) params.location = filters.location
    const res = await call<R<Job[]>>('jobs', 'GET', params)
    return res.data
  },
  create: async (job: Omit<Job, 'id' | 'createdAt' | 'updatedAt'>): Promise<Job> => {
    const res = await call<R<Job>>('jobs', 'POST', {}, job)
    return res.data
  },
  update: async (id: string, updates: Partial<Job>): Promise<Job | null> => {
    const res = await call<R<Job | null>>('jobs', 'PATCH', { id }, updates)
    return res.data
  },
  delete: async (id: string): Promise<boolean> => {
    await call<{ success: boolean }>('jobs', 'DELETE', { id })
    return true
  },
}

// ─── Applications ──────────────────────────────────────────────────────────

export const applicationOps = {
  /** Fetch a single application by ID (server-filtered, not client-side scan) */
  findById: async (id: string): Promise<Application | null> => {
    const res = await call<R<Application | null>>('applications', 'GET', { id })
    return res.data
  },
  findByJobId: async (jobId: string): Promise<Application[]> => {
    const res = await call<R<Application[]>>('applications', 'GET', { jobId })
    return res.data
  },
  findByWorkerId: async (workerId: string): Promise<Application[]> => {
    const res = await call<R<Application[]>>('applications', 'GET', { workerId })
    return res.data
  },
  create: async (application: Omit<Application, 'id' | 'createdAt' | 'updatedAt'>): Promise<Application> => {
    const res = await call<R<Application>>('applications', 'POST', {}, application)
    return res.data
  },
  update: async (id: string, updates: Partial<Application>): Promise<Application | null> => {
    const res = await call<R<Application | null>>('applications', 'PATCH', { id }, updates)
    return res.data
  },
}

// ─── Trust Scores ──────────────────────────────────────────────────────────

export const trustScoreOps = {
  findByUserId: async (userId: string): Promise<TrustScore | null> => {
    const res = await call<R<TrustScore | null>>('trust-scores', 'GET', { userId })
    return res.data
  },
  update: async (userId: string, updates: Partial<TrustScore>): Promise<TrustScore | null> => {
    const res = await call<R<TrustScore | null>>('trust-scores', 'PATCH', { userId }, updates)
    return res.data
  },
}

// ─── Reports ───────────────────────────────────────────────────────────────

export const reportOps = {
  create: async (report: Omit<Report, 'id' | 'createdAt'>): Promise<Report> => {
    const res = await call<R<Report>>('reports', 'POST', {}, report)
    return res.data
  },
  getAll: async (): Promise<Report[]> => {
    const res = await call<R<Report[]>>('reports')
    return res.data
  },
  update: async (id: string, updates: Partial<Report>): Promise<Report | null> => {
    const res = await call<R<Report | null>>('reports', 'PATCH', { id }, updates)
    return res.data
  },
  /** Admin: deduct trust score, increment complaint count, resolve report, notify user. */
  penalize: async (
    reportId: string,
    penalty: number,
    resolution: string
  ): Promise<{ newScore: number; newLevel: string; newComplaintCount: number } | null> => {
    // Call through the Next.js proxy route which forwards to the edge function.
    // The edge function uses service-role key (bypasses RLS) and validates
    // the session token via our custom user_sessions table.
    const token = getSessionToken()
    const { key } = getEnv()
    const res = await fetch('/api/admin/penalize', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token ?? key}`,
      },
      body: JSON.stringify({ reportId, penalty, resolution }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string }
      throw new Error(body.error ?? `Penalize failed: ${res.status}`)
    }
    const json = (await res.json()) as { data?: { newScore: number; newLevel: string; newComplaintCount: number } }
    return json.data ?? null
  },
}

// ─── Notifications ───────────────────────────────────────────────────────────

export const notificationOps = {
  create: async (notification: Omit<Notification, 'id' | 'createdAt'>): Promise<Notification> => {
    const res = await call<R<Notification>>('notifications', 'POST', {}, notification)
    return res.data
  },
  findByUserId: async (userId: string): Promise<Notification[]> => {
    // JWT identifies the user; userId param is forwarded for admin use-cases
    const res = await call<R<Notification[]>>('notifications', 'GET', { userId })
    return res.data || []
  },
  markAsRead: async (id: string): Promise<boolean> => {
    await call<R<Notification>>('notifications', 'PATCH', { id })
    return true
  },
  markAllRead: async (): Promise<void> => {
    await call<R<{ ok: boolean }>>('notifications', 'DELETE')
  },
}

// ─── Push Notifications ──────────────────────────────────────────────────────

export const pushOps = {
  /** Save a Web Push subscription for the current user. */
  subscribe: async (endpoint: string, p256dh: string, auth: string): Promise<boolean> => {
    await call<R<{ ok: boolean }>>('push', 'POST', { action: 'subscribe' }, { endpoint, p256dh, auth })
    return true
  },
  /** Remove all push subscriptions for the current user. */
  unsubscribe: async (): Promise<boolean> => {
    await call<R<{ ok: boolean }>>('push', 'DELETE', { action: 'unsubscribe' })
    return true
  },
}

// ─── Chat (session-based ops kept for backward compat) ─────────────────────

export const chatOps = {
  findSessionsByUserId: async (userId: string) => {
    const res = await call<R<ChatConversation[]>>('chat', 'GET', { type: 'conversations', userId })
    return res.data
  },
  getMessages: async (sessionId: string) => {
    const res = await call<R<ChatMessage[]>>('chat', 'GET', { type: 'messages', conversationId: sessionId })
    return res.data
  },
  sendMessage: async (msg: { 
    sessionId?: string; 
    conversationId?: string; 
    senderId: string; 
    message: string;
    attachmentUrl?: string;
    attachmentName?: string;
    attachmentType?: string;
    attachmentSize?: number;
  }) => {
    const conversationId = msg.conversationId ?? msg.sessionId ?? ''
    const res = await call<R<ChatMessage>>('chat', 'POST', {}, {
      type: 'message',
      conversationId,
      senderId: msg.senderId,
      message: msg.message,
      ...(msg.attachmentUrl && {
        attachmentUrl: msg.attachmentUrl,
        attachmentName: msg.attachmentName,
        attachmentType: msg.attachmentType,
        attachmentSize: msg.attachmentSize,
      }),
    })
    return res.data
  },
  createSession: async (session: {
    applicationId: string
    workerId: string
    employerId: string
    jobId: string
    isActive: boolean
  }) => {
    const res = await call<R<ChatConversation>>('chat', 'POST', {}, {
      type: 'conversation',
      participants: [session.workerId, session.employerId],
      workerId: session.workerId,
      employerId: session.employerId,
      jobId: session.jobId,
      applicationId: session.applicationId,
    })
    return res.data
  },
  /** Start a direct conversation between two users (e.g. admin ↔ user). */
  startDirectConversation: async (participants: string[]): Promise<ChatConversation> => {
    const res = await call<R<ChatConversation>>('chat', 'POST', {}, { type: 'conversation', participants })
    return res.data
  },
  /** Find conversation by applicationId — sends param to server for direct lookup
   *  instead of fetching all conversations and filtering client-side. */
  findSessionByApplicationId: async (applicationId: string) => {
    const res = await call<R<ChatConversation[]>>('chat', 'GET', { type: 'conversations', applicationId })
    return res.data?.[0] ?? null
  },
}

// ─── Escrow ────────────────────────────────────────────────────────────────

export const escrowOps = {
  create: async (transaction: Omit<EscrowTransaction, 'id' | 'createdAt'>): Promise<EscrowTransaction> => {
    const res = await call<R<EscrowTransaction>>('escrow', 'POST', {}, transaction)
    return res.data
  },
  getAll: async (): Promise<EscrowTransaction[]> => {
    const res = await call<R<EscrowTransaction[]>>('escrow')
    return res.data
  },
  /** Fetch escrow by jobId — avoids fetching all and filtering client-side. */
  findByJobId: async (jobId: string): Promise<EscrowTransaction | null> => {
    const res = await call<R<EscrowTransaction[]>>('escrow', 'GET', { jobId })
    return res.data?.[0] ?? null
  },
  update: async (id: string, updates: Partial<EscrowTransaction>): Promise<EscrowTransaction | null> => {
    const res = await call<R<EscrowTransaction | null>>('escrow', 'PATCH', { id }, updates)
    return res.data
  },
  /** Fetch escrow transactions for a specific user. Passes userId + role so the
   *  edge function can filter appropriately instead of returning everything. */
  findByUser: async (userId: string, role: 'worker' | 'employer'): Promise<EscrowTransaction[]> => {
    const res = await call<R<EscrowTransaction[]>>('escrow', 'GET', { userId, role })
    return res.data || []
  },
}

// ─── Ratings ───────────────────────────────────────────────────────────────

export interface Rating {
  id: string
  jobId: string
  applicationId?: string
  fromUserId: string
  toUserId: string
  rating: number
  feedback?: string
  createdAt: string
}

export interface RatingResult {
  rating: Rating
  trustScore: { newScore: number; newLevel: string; averageRating: number; totalRatings: number }
}

export const ratingOps = {
  /** Submit a rating. Recalculates trust score server-side. */
  create: async (payload: {
    jobId: string
    applicationId?: string
    toUserId: string
    rating: number
    feedback?: string
  }): Promise<RatingResult> => {
    const token = getSessionToken()
    const { key } = getEnv()
    const res = await fetch('/api/ratings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token ?? key}`,
      },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string }
      throw new Error(body.error ?? `Rating submission failed: ${res.status}`)
    }
    const json = (await res.json()) as { data: RatingResult }
    return json.data
  },

  /** Get all ratings received by a user (for profile display). Public — no auth required. */
  getByUser: async (userId: string): Promise<Rating[]> => {
    const res = await fetch(`/api/ratings?userId=${encodeURIComponent(userId)}`)
    if (!res.ok) return []
    const json = (await res.json()) as { data?: Rating[] }
    return json.data ?? []
  },

  /** Get all ratings sent by a user (to check what they've already rated). Public — no auth required. */
  getSentByUser: async (fromUserId: string): Promise<Rating[]> => {
    const res = await fetch(`/api/ratings?fromUserId=${encodeURIComponent(fromUserId)}`)
    if (!res.ok) return []
    const json = (await res.json()) as { data?: Rating[] }
    return json.data ?? []
  },
}

// ─── WATI WhatsApp Notifications ──────────────────────────────────────────

/** All supported WATI notification templates */
export type WATITemplate =
  | 'application_accepted'
  | 'application_rejected'
  | 'new_application'
  | 'job_posted'
  | 'job_completed'
  | 'escrow_locked'
  | 'escrow_released'
  | 'trust_score_update'

/**
 * Send an SMS notification via Twilio for key platform events.
 * Silently fails — never blocks the main action.
 *
 * @param template - One of the notification template keys
 * @param phoneNumber - Worker/employer phone (will be normalised server-side)
 * @param params - Ordered params array matching the template (e.g. [workerName, jobTitle])
 */
export async function sendWATIAlert(
  template: WATITemplate,
  phoneNumber: string,
  params: string[] = [],
): Promise<void> {
  try {
    if (!phoneNumber) {
      console.warn(`[Twilio] sendWATIAlert skipped — no phone number (template=${template})`)
      return
    }
    console.log(`[Twilio] sendNotification → template=${template}  phone=${phoneNumber}  params=${JSON.stringify(params)}`)
    const base = typeof window !== 'undefined' ? '' : (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000')
    const res = await fetch(`${base}/api/notifications/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template, phoneNumber, params }),
    })
    console.log('[Twilio] sendNotification response:', res.status)
  } catch (err) {
    console.error('[Twilio] sendNotification failed:', err)
    // Fire-and-forget: never block the UI for notification failures
  }
}


// ─── Database operations (Supabase-backed API) ────────────────────────────

function upsertUserCache(user: User): void {
  const index = _usersCache.findIndex((item) => item.id === user.id)
  if (index === -1) _usersCache.push(user)
  else _usersCache[index] = { ..._usersCache[index], ...user }
}

// Minimal cache for sync methods only
let _usersCache: User[] = []
let _applicationsCache: Application[] = []
let _reportsCache: Report[] = []
let _escrowCache: EscrowTransaction[] = []

export const db = {
  async getAllUsers(): Promise<User[]> {
    const users = await userOps.getAll()
    _usersCache = users
    return users
  },

  getUserById(userId: string): User | null {
    return _usersCache.find((u) => u.id === userId) ?? null
  },

  async updateUser(userId: string, updates: Partial<User>): Promise<User | null> {
    return userOps.update(userId, updates)
  },

  async getAllJobs(): Promise<Job[]> {
    return jobOps.getAll()
  },

  async getJobsByEmployer(employerId: string): Promise<Job[]> {
    return jobOps.findByEmployerId(employerId)
  },

  async getJobById(jobId: string): Promise<Job | null> {
    return jobOps.findById(jobId)
  },

  async createJob(payload: Record<string, unknown>): Promise<Job> {
    return jobOps.create(payload as unknown as Omit<Job, 'id' | 'createdAt' | 'updatedAt'>)
  },

  async deleteJob(jobId: string): Promise<boolean> {
    return jobOps.delete(jobId)
  },

  async updateJob(jobId: string, updates: Partial<Job>): Promise<Job | null> {
    return jobOps.update(jobId, updates)
  },

  async getAllApplications(): Promise<Application[]> {
    const res = await call<R<Application[]>>('applications', 'GET', {})
    _applicationsCache = res.data || []
    return res.data
  },

  getApplicationsByJob(jobId: string): Application[] {
    // sync version – callers should await getAllApplications first
    return _applicationsCache.filter((application) => application.jobId === jobId)
  },

  async getApplicationsByWorker(workerId: string): Promise<Application[]> {
    return applicationOps.findByWorkerId(workerId)
  },

  async createApplication(payload: Record<string, unknown>): Promise<Application> {
    return applicationOps.create(payload as unknown as Omit<Application, 'id' | 'createdAt' | 'updatedAt'>)
  },

  async getConversationsByUser(userId: string): Promise<ChatConversation[]> {
    const res = await call<R<ChatConversation[]>>('chat', 'GET', { type: 'conversations', userId })
    return res.data
  },

  async getMessagesByConversation(conversationId: string): Promise<ChatMessage[]> {
    const res = await call<R<ChatMessage[]>>('chat', 'GET', { type: 'messages', conversationId })
    return res.data
  },

  async sendMessage(payload: { 
    conversationId: string; 
    senderId: string; 
    message: string;
    attachmentUrl?: string;
    attachmentName?: string;
    attachmentType?: string;
    attachmentSize?: number;
  }): Promise<ChatMessage> {
    const res = await call<R<ChatMessage>>('chat', 'POST', {}, { type: 'message', ...payload })
    return res.data
  },

  async createConversation(data: {
    workerId: string
    employerId: string
    jobId: string
    applicationId?: string
    participants: string[]
  }): Promise<ChatConversation> {
    const res = await call<R<ChatConversation>>('chat', 'POST', {}, { type: 'conversation', ...data })
    return res.data
  },

  async findConversationByJob(userId: string, jobId: string): Promise<ChatConversation | null> {
    try {
      const convs = await this.getConversationsByUser(userId)
      return convs.find(c => c.jobId === jobId) ?? null
    } catch { return null }
  },

  async findConversationByApplicationId(userId: string, applicationId: string): Promise<ChatConversation | null> {
    try {
      const res = await call<R<ChatConversation[]>>('chat', 'GET', {
        type: 'conversations',
        userId,
        applicationId,
      })
      return res.data?.[0] ?? null
    } catch {
      return null
    }
  },

  async deleteAccount(userId: string): Promise<void> {
    await call<{ success: boolean }>('users', 'DELETE', { id: userId })
  },

  async getAllReports(): Promise<Report[]> {
    const reports = await reportOps.getAll()
    _reportsCache = reports || []
    return reports
  },

  getReportById(reportId: string): Report | null {
    return _reportsCache.find((report) => report.id === reportId) ?? null
  },

  async updateReport(reportId: string, updates: Partial<Report>): Promise<Report | null> {
    return reportOps.update(reportId, updates)
  },

  /** Create escrow transaction — now properly async.
   *  Previously fire-and-forgot the API call, which could silently fail. */
  async createEscrowTransaction(transaction: Omit<EscrowTransaction, 'id' | 'createdAt'>): Promise<EscrowTransaction> {
    const res = await call<R<EscrowTransaction>>('escrow', 'POST', {}, transaction)
    return res.data
  },

  getEscrowTransactionById(_id: string): EscrowTransaction | null {
    return _escrowCache.find((transaction) => transaction.id === _id) ?? null
  },

  getAllEscrowTransactions(): EscrowTransaction[] {
    return [..._escrowCache]
  },

  async getAllEscrowTransactionsAsync(): Promise<EscrowTransaction[]> {
    const res = await call<R<EscrowTransaction[]>>('escrow')
    _escrowCache = res.data || []
    return res.data
  },

  // Admin stats
  async getAdminStats() {
    const res = await call<R<Record<string, number>>>('admin', 'GET', { type: 'stats' })
    return res.data
  },
}

