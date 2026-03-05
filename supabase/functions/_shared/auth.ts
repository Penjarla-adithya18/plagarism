import { createClient } from 'npm:@supabase/supabase-js@2'
import { errorResponse } from './cors.ts'
import { randomBase64Url, sha256Base64Url } from './crypto.ts'

export type UserRole = 'worker' | 'employer' | 'admin'

export interface AuthUser {
  id: string
  role: UserRole
  phoneNumber: string
}

type AuthResult = { user: AuthUser; tokenHash: string } | { error: Response }

export function createServiceClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )
}

function getBearerToken(req: Request): string | null {
  const header = req.headers.get('authorization') || req.headers.get('Authorization')
  if (!header) return null
  const [scheme, value] = header.split(' ')
  if (!scheme || !value) return null
  if (scheme.toLowerCase() !== 'bearer') return null
  return value.trim()
}

export async function requireAuth(req: Request, supabase: ReturnType<typeof createServiceClient>): Promise<AuthResult> {
  const token = getBearerToken(req)
  if (!token) {
    return { error: errorResponse('Unauthorized', 401) }
  }

  const tokenHash = await sha256Base64Url(token)

  const { data: session, error: sessionError } = await supabase
    .from('user_sessions')
    .select('user_id, expires_at')
    .eq('token', tokenHash)
    .maybeSingle()

  if (sessionError || !session) {
    return { error: errorResponse('Unauthorized', 401) }
  }

  if (new Date(session.expires_at).getTime() <= Date.now()) {
    await supabase.from('user_sessions').delete().eq('token', tokenHash)
    return { error: errorResponse('Session expired', 401) }
  }

  const { data: user, error: userError } = await supabase
    .from('users')
    .select('id, role, phone_number')
    .eq('id', session.user_id)
    .maybeSingle()

  if (userError || !user) {
    return { error: errorResponse('Unauthorized', 401) }
  }

  return {
    user: {
      id: user.id,
      role: user.role as UserRole,
      phoneNumber: user.phone_number,
    },
    tokenHash,
  }
}

export function requireRole(user: AuthUser, roles: UserRole[]): Response | null {
  if (!roles.includes(user.role)) {
    return errorResponse('Forbidden', 403)
  }
  return null
}

export async function createSessionForUser(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  validDays = 30
): Promise<{ token: string; expiresAt: string }> {
  const token = randomBase64Url(32)
  const tokenHash = await sha256Base64Url(token)
  const expiresAt = new Date(Date.now() + validDays * 24 * 60 * 60 * 1000).toISOString()

  const { error } = await supabase.from('user_sessions').insert({
    user_id: userId,
    token: tokenHash,
    expires_at: expiresAt,
  })
  if (error) throw error

  return { token, expiresAt }
}

export async function revokeTokenHash(
  supabase: ReturnType<typeof createServiceClient>,
  tokenHash: string
): Promise<void> {
  await supabase.from('user_sessions').delete().eq('token', tokenHash)
}
