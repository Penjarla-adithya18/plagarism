'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Briefcase, ArrowLeft, Loader2, Phone, Mail } from 'lucide-react'
import { sendOTP, verifyOTP, forgotPassword, sendEmailOtp, verifyEmailOtp } from '@/lib/auth'
import { getUserByEmail } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { useI18n } from '@/contexts/I18nContext'

export default function ForgotPasswordPage() {
  const router = useRouter()
  const { toast } = useToast()
  const { t } = useI18n()

  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [loading, setLoading] = useState(false)
  const [method, setMethod] = useState<'phone' | 'email'>('phone')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  // phone number looked up from email (used when method=email to call forgotPassword)
  const [resolvedPhone, setResolvedPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  // ─── Step 1: Send OTP ──────────────────────────────────────────────────────
  const handleSendOtp = async () => {
    if (method === 'phone') {
      if (phone.length !== 10) {
        toast({ title: 'Enter a valid 10-digit phone number', variant: 'destructive' })
        return
      }
      setLoading(true)
      try {
        const res = await sendOTP(phone)
        if (res.success) {
          setStep(2)
          toast({ title: 'OTP sent', description: 'Check your phone for the verification code.' })
        } else {
          toast({ title: res.message, variant: 'destructive' })
        }
      } catch {
        toast({ title: 'Failed to send OTP. Try again.', variant: 'destructive' })
      } finally {
        setLoading(false)
      }
    } else {
      // email path
      if (!email.includes('@')) {
        toast({ title: 'Enter a valid email address', variant: 'destructive' })
        return
      }
      setLoading(true)
      try {
        // verify the email belongs to an account
        const user = await getUserByEmail(email)
        if (!user) {
          toast({ title: 'No account found with this email address', variant: 'destructive' })
          setLoading(false)
          return
        }
        setResolvedPhone(user.phoneNumber)
        const res = await sendEmailOtp(email, 'forgot-password')
        if (res.success) {
          setStep(2)
          toast({ title: 'OTP sent', description: 'Check your email for the verification code.' })
        } else {
          toast({ title: res.message || 'Failed to send OTP', variant: 'destructive' })
        }
      } catch {
        toast({ title: 'Failed to send OTP. Try again.', variant: 'destructive' })
      } finally {
        setLoading(false)
      }
    }
  }

  // ─── Step 2: Verify OTP ────────────────────────────────────────────────────
  const handleVerifyOtp = async () => {
    if (otp.length !== 6) {
      toast({ title: 'Enter the 6-digit OTP', variant: 'destructive' })
      return
    }
    setLoading(true)
    try {
      let success = false
      let message = 'Invalid OTP'

      if (method === 'phone') {
        const res = await verifyOTP(phone, otp)
        success = res.success
        message = res.message || message
      } else {
        const res = await verifyEmailOtp(email, otp)
        success = res.success
        message = res.message || message
      }

      if (success) {
        setStep(3)
        toast({ title: 'Verified', description: 'Now set your new password.' })
      } else {
        toast({ title: message, variant: 'destructive' })
      }
    } catch {
      toast({ title: 'Verification failed. Try again.', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  // ─── Step 3: Reset password ────────────────────────────────────────────────
  const handleResetPassword = async () => {
    if (newPassword.length < 8) {
      toast({ title: 'Password must be at least 8 characters', variant: 'destructive' })
      return
    }
    if (newPassword !== confirmPassword) {
      toast({ title: 'Passwords do not match', variant: 'destructive' })
      return
    }
    setLoading(true)
    try {
      // for email method, use the phone we looked up in step 1
      const targetPhone = method === 'email' ? resolvedPhone : phone
      const res = await forgotPassword(targetPhone, newPassword)
      if (res.success) {
        toast({ title: 'Password reset!', description: 'You can now log in with your new password.' })
        router.push('/login')
      } else {
        toast({ title: res.message || 'Reset failed', variant: 'destructive' })
      }
    } catch {
      toast({ title: 'Something went wrong. Try again.', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  const goBack = () => {
    setStep(1)
    setOtp('')
    setResolvedPhone('')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-800 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <Link href="/login" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary mb-5 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          {t('auth.backHome')}
        </Link>

        <Card className="px-6 py-8 shadow-md border">
          {/* Brand */}
          <div className="flex items-center gap-2 mb-7">
            <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center shrink-0">
              <Briefcase className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="text-lg font-bold text-primary">HyperLocal Jobs</span>
          </div>

          {/* Step progress dots */}
          <div className="flex items-center gap-1.5 mb-7">
            {[1, 2, 3].map((s) => (
              <div key={s} className={`h-1.5 rounded-full transition-all duration-300 ${step >= s ? 'flex-1 bg-primary' : 'w-5 bg-muted'}`} />
            ))}
          </div>

          {step === 1 && (
            <div className="space-y-5">
              <div>
                <h1 className="text-xl font-bold mb-0.5">{t('forgot.title')}</h1>
                <p className="text-sm text-muted-foreground">{t('forgot.subtitle')}</p>
              </div>

              {/* Method toggle */}
              <div className="grid grid-cols-2 gap-1.5 p-1 bg-muted/60 rounded-lg">
                <button
                  type="button"
                  onClick={() => setMethod('phone')}
                  className={`flex items-center justify-center gap-1.5 py-1.5 rounded-md text-sm font-medium transition-all ${method === 'phone' ? 'bg-background shadow-sm text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  <Phone className="w-3.5 h-3.5" />
                  {t('forgot.phoneTab')}
                </button>
                <button
                  type="button"
                  onClick={() => setMethod('email')}
                  className={`flex items-center justify-center gap-1.5 py-1.5 rounded-md text-sm font-medium transition-all ${method === 'email' ? 'bg-background shadow-sm text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  <Mail className="w-3.5 h-3.5" />
                  {t('forgot.emailTab')}
                </button>
              </div>

              {method === 'phone' ? (
                <div className="space-y-2">
                  <Label htmlFor="fp-phone">{t('forgot.phoneLabel')}</Label>
                  <Input
                    id="fp-phone"
                    type="tel"
                    placeholder={t('forgot.phonePh')}
                    maxLength={10}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="fp-email">{t('forgot.emailLabel')}</Label>
                  <Input
                    id="fp-email"
                    type="email"
                    placeholder={t('forgot.emailPh')}
                    value={email}
                    onChange={(e) => setEmail(e.target.value.trim())}
                  />
                </div>
              )}

              <Button onClick={handleSendOtp} disabled={loading} className="w-full mt-1">
                {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t('forgot.sending')}</> : t('forgot.sendOtp')}
              </Button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div>
                <h1 className="text-xl font-bold mb-0.5">Verify OTP</h1>
                <p className="text-sm text-muted-foreground">
                  {method === 'phone'
                    ? `Code sent to +91 ${phone}`
                    : `Code sent to ${email}`}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="fp-otp">Enter 6-digit code</Label>
                <Input
                  id="fp-otp"
                  type="text"
                  inputMode="numeric"
                  placeholder="••••••"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="tracking-widest text-center text-lg"
                />
              </div>
              <Button onClick={handleVerifyOtp} disabled={loading} className="w-full">
                {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Verifying...</> : 'Verify & Continue'}
              </Button>
              <button type="button" onClick={goBack} className="w-full text-center text-sm text-muted-foreground hover:text-primary transition-colors py-1">
                ← {method === 'phone' ? 'Change phone number' : 'Change email address'}
              </button>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <div>
                <h1 className="text-xl font-bold mb-0.5">{t('forgot.resetPassword')}</h1>
                <p className="text-sm text-muted-foreground">Minimum 8 characters</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fp-newpw">{t('forgot.newPassword')}</Label>
                <Input id="fp-newpw" type="password" placeholder="At least 8 characters" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fp-confirmpw">{t('forgot.confirmPassword')}</Label>
                <Input id="fp-confirmpw" type="password" placeholder="Re-enter password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
              </div>
              <Button onClick={handleResetPassword} disabled={loading} className="w-full">
                {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t('forgot.resetting')}</> : t('forgot.resetPassword')}
              </Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
