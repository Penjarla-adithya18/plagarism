import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import {
  createServiceClient,
  createSessionForUser,
  requireAuth,
  revokeTokenHash,
} from '../_shared/auth.ts'
import { hashPassword, verifyPassword } from '../_shared/crypto.ts'

const VERIFY_BASE_URL = 'https://verify.twilio.com/v2'

function getTwilioConfig() {
  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID')?.trim() ?? ''
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN')?.trim() ?? ''
  const serviceSid = Deno.env.get('TWILIO_VERIFY_SERVICE_SID')?.trim() ?? ''
  const defaultCountryCode = Deno.env.get('OTP_DEFAULT_COUNTRY_CODE')?.trim() || '+91'
  return { accountSid, authToken, serviceSid, defaultCountryCode }
}

function normalizePhone(rawPhone: string, defaultCountryCode: string): string {
  const cleaned = rawPhone.replace(/\s+/g, '').trim()
  if (!cleaned) return ''
  if (cleaned.startsWith('+')) return cleaned
  const digits = cleaned.replace(/\D/g, '')
  if (!digits) return ''
  return `${defaultCountryCode}${digits}`
}

function toBasicAuth(accountSid: string, authToken: string): string {
  return btoa(`${accountSid}:${authToken}`)
}

Deno.serve(async (req: Request) => {
  const cors = handleCors(req)
  if (cors) return cors

  const supabase = createServiceClient()

  try {
    const body = await req.json()
    const action = body?.action

    if (action === 'register') {
      const { fullName, phoneNumber, password, role, email, businessName, organizationName } = body
      if (!fullName || !phoneNumber || !password || !role) {
        return errorResponse('Missing required fields', 400)
      }
      if (String(password).length < 8) {
        return errorResponse('Password must be at least 8 characters', 400)
      }

      const normalizedRole = role as 'worker' | 'employer' | 'admin'
      if (!['worker', 'employer'].includes(normalizedRole)) {
        return errorResponse('Invalid role', 400)
      }

      const { data: existing } = await supabase
        .from('users')
        .select('id')
        .eq('phone_number', phoneNumber)
        .maybeSingle()

      if (existing) {
        return jsonResponse({ success: false, message: 'Phone number already registered' })
      }

      // Check email uniqueness if provided
      if (email) {
        const { data: emailExists } = await supabase
          .from('users')
          .select('id')
          .eq('email', email)
          .maybeSingle()
        if (emailExists) {
          return jsonResponse({ success: false, message: 'Email address already registered' })
        }
      }

      const passwordHash = await hashPassword(password)

      const { data: created, error } = await supabase
        .from('users')
        .insert({
          full_name: fullName,
          phone_number: phoneNumber,
          password_hash: passwordHash,
          role: normalizedRole,          email: email || null,          profile_completed: false,
          trust_score: 50,
          trust_level: 'basic',
          is_verified: true,
          company_name: normalizedRole === 'employer' ? (businessName || null) : null,
        })
        .select('*')
        .single()

      if (error) throw error

      if (normalizedRole === 'worker') {
        const { error: profileErr } = await supabase.from('worker_profiles').insert({
          user_id: created.id,
          skills: [],
          availability: '',
          categories: [],
        })
        if (profileErr) console.error('Failed to create worker profile:', profileErr)
      } else if (normalizedRole === 'employer') {
        const { error: profileErr } = await supabase.from('employer_profiles').insert({
          user_id: created.id,
          business_name: businessName || '',
          organization_name: organizationName || null,
        })
        if (profileErr) console.error('Failed to create employer profile:', profileErr)
      }

      const { error: trustErr } = await supabase.from('trust_scores').insert({
        user_id: created.id,
        score: 50,
        level: 'basic',
        job_completion_rate: 0,
        average_rating: 0,
        total_ratings: 0,
        complaint_count: 0,
        successful_payments: 0,
      })
      if (trustErr) console.error('Failed to create trust score:', trustErr)

      // Only clean up expired sessions, not all sessions
      await supabase.from('user_sessions').delete().eq('user_id', created.id).lt('expires_at', new Date().toISOString())
      const session = await createSessionForUser(supabase, created.id)
      return jsonResponse({
        success: true,
        user: mapUser(created),
        token: session.token,
        expiresAt: session.expiresAt,
        message: 'Registration successful',
      })
    }

    if (action === 'login') {
      const { phoneNumber, password } = body
      if (!phoneNumber || !password) {
        return errorResponse('Phone number and password are required', 400)
      }

      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('phone_number', phoneNumber)
        .maybeSingle()

      if (error) throw error
      if (!data) return jsonResponse({ success: false, message: 'User not found' })

      const validPassword = await verifyPassword(password, data.password_hash)
      if (!validPassword) {
        return jsonResponse({ success: false, message: 'Invalid phone number or password' })
      }

      // Only delete expired sessions — keep valid sessions on other devices alive
      await supabase.from('user_sessions').delete().eq('user_id', data.id).lt('expires_at', new Date().toISOString())
      const session = await createSessionForUser(supabase, data.id)
      return jsonResponse({
        success: true,
        user: mapUser(data),
        token: session.token,
        expiresAt: session.expiresAt,
        message: 'Login successful',
      })
    }

    if (action === 'send-otp') {
      const phoneNumber = typeof body?.phoneNumber === 'string' ? body.phoneNumber : ''
      const { accountSid, authToken, serviceSid, defaultCountryCode } = getTwilioConfig()
      if (!accountSid || !authToken || !serviceSid) {
        return jsonResponse({ success: false, message: 'OTP service is not configured on backend.' }, 503)
      }

      const to = normalizePhone(phoneNumber, defaultCountryCode)
      if (!to) {
        return jsonResponse({ success: false, message: 'Invalid phone number.' }, 400)
      }

      const endpoint = `${VERIFY_BASE_URL}/Services/${serviceSid}/Verifications`
      const payload = new URLSearchParams({ To: to, Channel: 'sms' })
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${toBasicAuth(accountSid, authToken)}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: payload,
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        const message = typeof data?.message === 'string' ? data.message : 'Failed to send OTP. Please try again.'
        return jsonResponse({ success: false, message }, response.status)
      }

      return jsonResponse({ success: true, message: 'OTP sent successfully.' })
    }

    if (action === 'verify-otp') {
      const phoneNumber = typeof body?.phoneNumber === 'string' ? body.phoneNumber : ''
      const code = typeof body?.otp === 'string' ? body.otp.trim() : ''

      const { accountSid, authToken, serviceSid, defaultCountryCode } = getTwilioConfig()
      if (!accountSid || !authToken || !serviceSid) {
        return jsonResponse({ success: false, message: 'OTP service is not configured on backend.' }, 503)
      }

      const to = normalizePhone(phoneNumber, defaultCountryCode)
      if (!to || !/^\d{6}$/.test(code)) {
        return jsonResponse({ success: false, message: 'Invalid phone number or OTP.' }, 400)
      }

      const endpoint = `${VERIFY_BASE_URL}/Services/${serviceSid}/VerificationCheck`
      const payload = new URLSearchParams({ To: to, Code: code })
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${toBasicAuth(accountSid, authToken)}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: payload,
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        const message = typeof data?.message === 'string' ? data.message : 'OTP verification failed. Please try again.'
        return jsonResponse({ success: false, message }, response.status)
      }

      if (data?.status !== 'approved') {
        return jsonResponse({ success: false, message: 'Invalid or expired OTP.' }, 400)
      }

      return jsonResponse({ success: true, message: 'OTP verified successfully.' })
    }

    if (action === 'maps-config') {
      const mapsApiKey =
        Deno.env.get('GOOGLE_MAPS_API_KEY')?.trim() ||
        Deno.env.get('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY')?.trim() ||
        ''

      if (!mapsApiKey) {
        return jsonResponse({ success: false, message: 'Google Maps API key is not configured on backend.' }, 503)
      }

      return jsonResponse({ success: true, mapsApiKey })
    }

    if (action === 'reset-password') {
      const auth = await requireAuth(req, supabase)
      if ('error' in auth) return auth.error

      const { currentPassword, newPassword } = body
      if (!currentPassword || !newPassword) {
        return errorResponse('Current and new password are required', 400)
      }
      if (String(newPassword).length < 8) {
        return errorResponse('New password must be at least 8 characters', 400)
      }

      const { data: row, error } = await supabase
        .from('users')
        .select('password_hash')
        .eq('id', auth.user.id)
        .maybeSingle()

      if (error || !row) {
        return errorResponse('User not found', 404)
      }

      const validCurrentPassword = await verifyPassword(currentPassword, row.password_hash)
      if (!validCurrentPassword) {
        return jsonResponse({ success: false, message: 'Current password is incorrect' })
      }

      const newHash = await hashPassword(newPassword)
      const { error: updateError } = await supabase
        .from('users')
        .update({ password_hash: newHash })
        .eq('id', auth.user.id)

      if (updateError) throw updateError
      await supabase.from('user_sessions').delete().eq('user_id', auth.user.id)
      return jsonResponse({ success: true, message: 'Password reset successful' })
    }

    if (action === 'logout') {
      const auth = await requireAuth(req, supabase)
      if ('error' in auth) return auth.error

      await revokeTokenHash(supabase, auth.tokenHash)
      return jsonResponse({ success: true, message: 'Logged out' })
    }

    if (action === 'refresh-session') {
      const auth = await requireAuth(req, supabase)
      if ('error' in auth) return auth.error

      await revokeTokenHash(supabase, auth.tokenHash)
      const session = await createSessionForUser(supabase, auth.user.id)

      const { data: userRow, error: userErr } = await supabase
        .from('users')
        .select('*')
        .eq('id', auth.user.id)
        .maybeSingle()

      if (userErr || !userRow) return errorResponse('Unauthorized', 401)

      return jsonResponse({
        success: true,
        user: mapUser(userRow),
        token: session.token,
        expiresAt: session.expiresAt,
        message: 'Session refreshed',
      })
    }

    // Unauthenticated password reset after OTP verification
    if (action === 'forgot-password') {
      const { phoneNumber, newPassword } = body
      if (!phoneNumber || !newPassword) {
        return errorResponse('phoneNumber and newPassword are required', 400)
      }
      if (String(newPassword).length < 8) {
        return errorResponse('Password must be at least 8 characters', 400)
      }
      const { data: userRow, error: findErr } = await supabase
        .from('users')
        .select('id')
        .eq('phone_number', phoneNumber)
        .maybeSingle()
      if (findErr || !userRow) return errorResponse('No account found with this phone number', 404)

      const newHash = await hashPassword(newPassword)
      const { error: updateErr } = await supabase
        .from('users')
        .update({ password_hash: newHash })
        .eq('id', userRow.id)
      if (updateErr) throw updateErr
      // Invalidate all sessions for this user
      await supabase.from('user_sessions').delete().eq('user_id', userRow.id)
      return jsonResponse({ success: true, message: 'Password reset successful. Please log in.' })
    }

    if (action === 'get-user-by-phone') {
      const auth = await requireAuth(req, supabase)
      if ('error' in auth) return auth.error
      if (auth.user.role !== 'admin') return errorResponse('Forbidden', 403)

      const { phoneNumber } = body
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('phone_number', phoneNumber)
        .maybeSingle()

      if (error) throw error
      return jsonResponse({ data: data ? mapUser(data) : null })
    }

    // Public lookup by email — used for email-based login and forgot-password
    if (action === 'get-user-by-email') {
      const { email } = body
      if (!email || typeof email !== 'string') {
        return errorResponse('email is required', 400)
      }
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('email', email.toLowerCase().trim())
        .maybeSingle()
      if (error) throw error
      return jsonResponse({ data: data ? mapUser(data) : null })
    }

    // Public lookup by phone — used for pre-login existence check
    if (action === 'get-user-by-phone-public') {
      const { phoneNumber } = body
      if (!phoneNumber || typeof phoneNumber !== 'string') {
        return errorResponse('phoneNumber is required', 400)
      }
      const { data, error } = await supabase
        .from('users')
        .select('id, full_name, phone_number, email, role')
        .eq('phone_number', phoneNumber)
        .maybeSingle()
      if (error) throw error
      return jsonResponse({ data: data ? mapUser(data) : null })
    }

    return errorResponse('Unknown action', 400)
  } catch (err) {
    console.error('auth function error:', err)
    return errorResponse(err instanceof Error ? err.message : 'Internal server error')
  }
})

function mapUser(row: Record<string, unknown>) {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email || undefined,
    phone: row.phone_number,
    phoneNumber: row.phone_number,
    role: row.role,
    createdAt: row.created_at,
    profileCompleted: !!row.profile_completed,
    trustScore: Number(row.trust_score ?? 50),
    trustLevel: row.trust_level ?? 'basic',
    isVerified: !!row.is_verified,
    companyName: row.company_name || undefined,
    companyDescription: row.company_description || undefined,
    skills: row.skills || [],
  }
}
