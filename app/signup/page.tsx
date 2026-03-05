'use client';

import { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { User, Briefcase, Loader2, Phone, ShieldCheck, Lock, Building2, Store, Fingerprint, CheckCircle2, Mail } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { sendOTP, verifyOTP, registerUser, setUserPassword, sendEmailOtp, verifyEmailOtp } from '@/lib/auth';
import { useToast } from '@/hooks/use-toast';

function SignupPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();
  const { toast } = useToast();
  const [mounted, setMounted] = useState(false);
  const [role, setRole] = useState<'worker' | 'employer'>(
    (searchParams.get('role') as 'worker' | 'employer') || 'worker'
  );

  // Form state
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    fullName: '',
    phoneNumber: '',
    password: '',
    confirmPassword: '',
    businessName: '',
    organizationName: '',
    otp: '',
    email: '',
  });

  const [otpSent, setOtpSent] = useState(false);
  const [agreeToTerms, setAgreeToTerms] = useState(false);
  // Whether user chose phone or email for step 1 identity verification
  const [signupMethod, setSignupMethod] = useState<'phone' | 'email'>('phone');

  // Aadhaar KYC state
  const [aadhaarNumber, setAadhaarNumber] = useState('');
  const [aadhaarVerified, setAadhaarVerified] = useState(false);

  // Email OTP state
  const [emailOtpSent, setEmailOtpSent] = useState(false);
  const [emailOtpVerified, setEmailOtpVerified] = useState(false);
  const [emailOtpInput, setEmailOtpInput] = useState('');

  useEffect(() => {
    setMounted(true);
    const roleParam = searchParams.get('role');
    if (roleParam === 'worker' || roleParam === 'employer') {
      setRole(roleParam);
    }
  }, [searchParams]);

  if (!mounted) {
    return <div className="app-surface min-h-screen" />;
  }

  const handleSendOTP = async () => {
    if (!formData.phoneNumber || formData.phoneNumber.length !== 10) {
      toast({
        title: 'Invalid Phone Number',
        description: 'Please enter a valid 10-digit phone number',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const result = await sendOTP(formData.phoneNumber);
      if (result.success) {
        setOtpSent(true);
        toast({
          title: 'OTP Sent',
          description: result.message,
        });
      } else {
        toast({
          title: 'Failed to Send OTP',
          description: result.message || 'Unable to send OTP right now. Please try again.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to send OTP. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    if (!formData.otp || formData.otp.length !== 6) {
      toast({
        title: 'Invalid OTP',
        description: 'Please enter the 6-digit OTP',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const result = await verifyOTP(formData.phoneNumber, formData.otp);
      if (result.success) {
        setStep(2);
        toast({
          title: 'OTP Verified',
          description: 'Phone number verified successfully',
        });
      } else {
        toast({
          title: 'Verification Failed',
          description: result.message,
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to verify OTP. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // ── Email OTP ──────────────────────────────────────────────────────────
  const handleSendEmailOtp = async () => {
    if (!formData.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      toast({
        title: 'Invalid Email',
        description: 'Please enter a valid email address',
        variant: 'destructive',
      });
      return;
    }
    setLoading(true);
    try {
      const result = await sendEmailOtp(formData.email, 'signup');
      if (result.success) {
        setEmailOtpSent(true);
        toast({ title: 'Code Sent', description: 'A 6-digit code has been sent to your email.' });
      } else {
        toast({ title: 'Failed to Send', description: result.message, variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to send email OTP. Please try again.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyEmailOtp = async () => {
    if (!emailOtpInput || emailOtpInput.length !== 6) {
      toast({ title: 'Invalid Code', description: 'Please enter the 6-digit code from your email', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const result = await verifyEmailOtp(formData.email, emailOtpInput);
      if (result.success) {
        setEmailOtpVerified(true);
        toast({ title: 'Email Verified ✓', description: 'Your email address has been verified.' });
        // If this is the step-1 email signup path, advance to step 2
        if (signupMethod === 'email' && step === 1) {
          setStep(2);
        }
      } else {
        toast({ title: 'Verification Failed', description: result.message, variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to verify email OTP. Please try again.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  // ── Aadhaar KYC Verification ─────────────────────────────────────────
  const handleAadhaarChange = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 12);
    setAadhaarNumber(digits);
    if (digits.length === 12) {
      setAadhaarVerified(true);
      toast({
        title: 'Aadhaar Verified ✓',
        description: 'Your Aadhaar number has been accepted.',
      });
    } else {
      setAadhaarVerified(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!agreeToTerms) {
      toast({
        title: 'Terms Required',
        description: 'Please accept the Terms and Conditions to continue',
        variant: 'destructive',
      });
      return;
    }

    if (!formData.fullName || formData.fullName.length < 3) {
      toast({
        title: 'Invalid Name',
        description: 'Please enter your full name (minimum 3 characters)',
        variant: 'destructive',
      });
      return;
    }

    if (!aadhaarVerified) {
      toast({
        title: 'Aadhaar Verification Required',
        description: 'Please enter your 12-digit Aadhaar number to complete registration',
        variant: 'destructive',
      });
      return;
    }

    if (formData.password.length < 8) {
      toast({
        title: 'Weak Password',
        description: 'Password must be at least 8 characters long',
        variant: 'destructive',
      });
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      toast({
        title: 'Password Mismatch',
        description: 'Passwords do not match',
        variant: 'destructive',
      });
      return;
    }

    if (role === 'employer' && !formData.businessName) {
      toast({
        title: 'Business Name Required',
        description: 'Please enter your business or shop name',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const result = await registerUser({
        fullName: formData.fullName,
        phoneNumber: formData.phoneNumber,
        password: formData.password,
        role: role,
        email: formData.email || undefined,
        businessName: formData.businessName,
        organizationName: formData.organizationName,
      });

      if (result.success && result.user) {
        if (aadhaarVerified) {
          // Attach Aadhaar KYC data to user
          result.user.aadhaarNumber = aadhaarNumber;
          result.user.aadhaarVerified = true;
          result.user.aadhaarVerifiedAt = new Date().toISOString();
          result.user.isVerified = true;
        }

        // Store password for mock auth
        setUserPassword(formData.phoneNumber, formData.password);

        login(result.user);
        toast({
          title: 'Registration Successful',
          description: `Welcome to HyperLocal Jobs!`,
        });

        // Redirect based on role
        if (role === 'worker') {
          router.push('/worker/dashboard');
        } else {
          router.push('/employer/dashboard');
        }
      } else {
        toast({
          title: 'Registration Failed',
          description: result.message,
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Something went wrong. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleContinueToSecurity = () => {
    if (!formData.fullName || formData.fullName.length < 3) {
      toast({
        title: 'Invalid Name',
        description: 'Please enter your full name (minimum 3 characters)',
        variant: 'destructive',
      });
      return;
    }

    // Email-signup path: phone number is required (no OTP — can verify from profile later)
    if (signupMethod === 'email') {
      if (!formData.phoneNumber || formData.phoneNumber.length !== 10) {
        toast({
          title: 'Phone Number Required',
          description: 'Please enter your 10-digit mobile number to continue',
          variant: 'destructive',
        });
        return;
      }
    }

    if (role === 'employer' && !formData.businessName) {
      toast({
        title: 'Business Name Required',
        description: 'Please enter your business or shop name',
        variant: 'destructive',
      });
      return;
    }

    if (!aadhaarVerified) {
      toast({
        title: 'Aadhaar Verification Required',
        description: 'Please enter your 12-digit Aadhaar number to continue',
        variant: 'destructive',
      });
      return;
    }

    setStep(3);
  };

  return (
    <div className="flex min-h-screen items-center justify-center overflow-y-auto bg-gradient-to-br from-emerald-50 via-sky-50 to-blue-100 p-3 py-5 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 sm:p-4 md:p-6">
      <div className="flex w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-slate-200/70 bg-blue-50/95 shadow-2xl sm:rounded-3xl md:h-[82vh] md:max-w-6xl md:flex-row md:items-stretch md:overflow-hidden dark:border-slate-700 dark:bg-slate-900/90">
        <section className="relative hidden h-full w-full flex-col items-center justify-start bg-emerald-50 p-7 pt-16 text-slate-900 md:flex md:w-5/12 md:items-start md:p-10 md:pt-16 dark:bg-slate-900 dark:text-slate-100">
          <div className="absolute left-8 top-8 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-bl-none rounded-lg rounded-tr-none bg-gradient-to-r from-emerald-500 to-blue-500 text-xl font-bold text-white shadow-sm">
              H
            </div>
            <span className="text-lg font-bold tracking-wide">HyperLocal</span>
          </div>

          <div className="z-10 mt-4 max-w-md md:mt-0">
            <h1 className="mb-6 text-5xl font-bold leading-[1.05] text-slate-900 md:text-6xl dark:text-white">
              Join your <br />
              local <br />
              <span className="relative inline-block text-emerald-500 dark:text-emerald-400">
                workforce
                <svg className="absolute -bottom-1 left-0 -z-10 h-3 w-full text-blue-200 dark:text-blue-900/70" viewBox="0 0 100 10" preserveAspectRatio="none">
                  <path d="M0 5 Q 50 10 100 5" fill="none" stroke="currentColor" strokeWidth="8" />
                </svg>
              </span>{' '}
              network.
            </h1>
            <p className="mb-10 text-lg leading-relaxed text-slate-700 dark:text-slate-300">
              Create your account to discover nearby opportunities, connect with trusted people,
              and grow in your community.
            </p>

            <div className="relative mt-8 hidden h-56 w-full md:block">
              <div className="absolute left-1/2 top-1/2 h-56 w-56 -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-100 dark:bg-slate-800/80" />
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-emerald-500 dark:text-emerald-400">
                <Store className="h-[124px] w-[124px]" strokeWidth={2.1} />
              </div>
              <div className="absolute right-10 top-10 h-4 w-4 rounded-full bg-slate-700 opacity-20" />
              <div className="absolute bottom-12 left-12 h-6 w-6 rounded-full bg-emerald-400 opacity-40" />
              <div className="absolute right-4 top-1/2 h-3 w-3 rotate-45 bg-blue-500 opacity-30" />
            </div>
          </div>
        </section>

        <section className="relative z-20 flex w-full flex-col items-center justify-start overflow-y-auto bg-white p-5 pt-6 shadow-2xl sm:p-7 md:h-[82vh] md:w-7/12 md:justify-start md:rounded-l-[2.5rem] md:p-8 md:pt-16 md:shadow-none lg:p-10 dark:bg-slate-950">
          <Link href="/" className="mb-4 inline-flex items-center self-start text-sm font-medium text-slate-500 transition-colors hover:text-emerald-500 dark:text-slate-400 dark:hover:text-emerald-400 md:absolute md:left-8 md:top-8 md:mb-0">
            ← Back to Home
          </Link>
          <div className="w-full max-w-md space-y-5 py-1 sm:space-y-6 md:py-4">
            <div className="space-y-2">
              <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Sign up</h2>
              <p className="text-sm text-gray-500 dark:text-slate-400">Create your account in 2 quick steps.</p>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                  step === 1
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                    : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                }`}>
                  Step 1: Verify identity
                </span>
                <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                  step === 2
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                    : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                }`}>
                  Step 2: Profile & KYC
                </span>
                <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                  step === 3
                    ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300'
                    : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                }`}>
                  Step 3: Security
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setRole('worker')}
                className={`inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold transition ${
                  role === 'worker'
                    ? 'border-transparent bg-gradient-to-r from-emerald-500 to-blue-500 text-white shadow-md'
                    : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
              >
                <User className="h-4 w-4" />
                Worker
              </button>
              <button
                type="button"
                onClick={() => setRole('employer')}
                className={`inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold transition ${
                  role === 'employer'
                    ? 'border-transparent bg-gradient-to-r from-emerald-500 to-blue-500 text-white shadow-md'
                    : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
              >
                <Briefcase className="h-4 w-4" />
                Employer
              </button>
            </div>

            {step === 1 ? (
              <div className="space-y-5 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 sm:p-5 dark:border-slate-700 dark:bg-slate-900/50">
                <p className="text-sm text-gray-500 dark:text-slate-400">
                  Sign up using your phone number or email address.
                </p>

                {/* Method toggle */}
                {!otpSent && !emailOtpSent && (
                  <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-slate-200/60 p-1 dark:bg-slate-800">
                    <button
                      type="button"
                      onClick={() => { setSignupMethod('phone'); setFormData({ ...formData, email: '', otp: '' }); setEmailOtpSent(false); setEmailOtpVerified(false); setEmailOtpInput(''); }}
                      className={`flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold transition-all ${
                        signupMethod === 'phone'
                          ? 'bg-white shadow text-emerald-600 dark:bg-slate-900 dark:text-emerald-400'
                          : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
                      }`}
                    >
                      <Phone className="h-4 w-4" /> Phone
                    </button>
                    <button
                      type="button"
                      onClick={() => { setSignupMethod('email'); setFormData({ ...formData, phoneNumber: '', otp: '' }); setOtpSent(false); }}
                      className={`flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold transition-all ${
                        signupMethod === 'email'
                          ? 'bg-white shadow text-blue-600 dark:bg-slate-900 dark:text-blue-400'
                          : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
                      }`}
                    >
                      <Mail className="h-4 w-4" /> Email
                    </button>
                  </div>
                )}

                {/* ── Phone path ── */}
                {signupMethod === 'phone' && (
                  <div className="space-y-4">
                    <div className="group relative rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950">
                      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                        <Phone className="h-5 w-5 text-gray-400 transition-colors group-focus-within:text-emerald-500" />
                      </div>
                      <input
                        id="phoneNumber"
                        type="tel"
                        placeholder="10-digit phone number"
                        value={formData.phoneNumber}
                        onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                        disabled={otpSent}
                        maxLength={10}
                        className="relative block w-full appearance-none border-0 bg-transparent px-3 py-2 pl-10 text-base text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-0 dark:text-slate-100 dark:placeholder:text-slate-500"
                      />
                    </div>

                    {!otpSent ? (
                      <>
                        <button onClick={handleSendOTP} disabled={loading} className="group relative flex w-full justify-center rounded-xl border border-transparent bg-gradient-to-r from-emerald-500 to-blue-500 px-4 py-3.5 text-sm font-bold text-white shadow-lg transition-all hover:-translate-y-0.5 hover:from-emerald-600 hover:to-blue-600 disabled:cursor-not-allowed disabled:opacity-70">
                          {loading ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" />Sending...</> : <><ShieldCheck className="mr-2 h-5 w-5" />Send OTP</>}
                        </button>
                        <p className="text-center text-sm text-gray-500 dark:text-slate-400">
                          Already have an account?{' '}
                          <Link className="font-medium text-emerald-500 hover:text-blue-500" href="/login">Log in</Link>
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-xs text-gray-500 dark:text-slate-400">Code sent to <strong>+91 {formData.phoneNumber}</strong></p>
                        <div className="group relative rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950">
                          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                            <ShieldCheck className="h-5 w-5 text-gray-400 group-focus-within:text-emerald-500" />
                          </div>
                          <input
                            id="otp" type="text" inputMode="numeric" placeholder="6-digit OTP"
                            value={formData.otp}
                            onChange={(e) => setFormData({ ...formData, otp: e.target.value.replace(/\D/g, '').slice(0, 6) })}
                            maxLength={6}
                            className="relative block w-full appearance-none border-0 bg-transparent px-3 py-2 pl-10 text-base tracking-widest text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-0 dark:text-slate-100 dark:placeholder:text-slate-500"
                          />
                        </div>
                        <button onClick={handleVerifyOTP} disabled={loading} className="flex w-full justify-center rounded-xl bg-gradient-to-r from-emerald-500 to-blue-500 px-4 py-3.5 text-sm font-bold text-white shadow transition-all hover:-translate-y-0.5 hover:from-emerald-600 hover:to-blue-600 disabled:cursor-not-allowed disabled:opacity-70">
                          {loading ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" />Verifying...</> : 'Verify OTP'}
                        </button>
                        <button type="button" onClick={() => { setOtpSent(false); setFormData({ ...formData, otp: '' }); }} className="w-full text-center text-sm text-gray-400 hover:text-emerald-500 transition-colors py-1">
                          ← Change phone number
                        </button>
                      </>
                    )}
                  </div>
                )}

                {/* ── Email path ── */}
                {signupMethod === 'email' && (
                  <div className="space-y-4">
                    <div className={`group relative rounded-xl border bg-white px-3 py-2 dark:bg-slate-950 ${
                      emailOtpVerified ? 'border-emerald-300 dark:border-emerald-700' : formData.email ? 'border-blue-300 dark:border-blue-700' : 'border-slate-200 dark:border-slate-700'
                    }`}>
                      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                        <Mail className={`h-5 w-5 transition-colors ${
                          emailOtpVerified ? 'text-emerald-500' : formData.email ? 'text-blue-400' : 'text-gray-400 group-focus-within:text-blue-400'
                        }`} />
                      </div>
                      <input
                        id="email" type="email" placeholder="your@email.com"
                        value={formData.email}
                        onChange={(e) => { setFormData({ ...formData, email: e.target.value }); if (emailOtpSent) { setEmailOtpSent(false); setEmailOtpInput(''); setEmailOtpVerified(false); } }}
                        disabled={emailOtpSent}
                        className="relative block w-full appearance-none border-0 bg-transparent px-3 py-2 pl-10 text-base text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-0 dark:text-slate-100 dark:placeholder:text-slate-500"
                      />
                    </div>

                    {!emailOtpSent && (
                      <>
                        <button
                          type="button" onClick={handleSendEmailOtp}
                          disabled={loading || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)}
                          className="flex w-full justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-500 px-4 py-3.5 text-sm font-bold text-white shadow transition-all hover:-translate-y-0.5 hover:from-blue-600 hover:to-indigo-600 disabled:cursor-not-allowed disabled:opacity-70"
                        >
                          {loading ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" />Sending...</> : <><Mail className="mr-2 h-5 w-5" />Send Verification Code</>}
                        </button>
                        <p className="text-center text-sm text-gray-500 dark:text-slate-400">
                          Already have an account?{' '}
                          <Link className="font-medium text-emerald-500 hover:text-blue-500" href="/login">Log in</Link>
                        </p>
                      </>
                    )}

                    {emailOtpSent && !emailOtpVerified && (
                      <>
                        <p className="text-xs text-gray-500 dark:text-slate-400">Code sent to <strong>{formData.email}</strong></p>
                        <div className="group relative rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950">
                          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                            <ShieldCheck className="h-5 w-5 text-gray-400 group-focus-within:text-blue-400" />
                          </div>
                          <input
                            id="emailOtp" type="text" inputMode="numeric" placeholder="6-digit code"
                            value={emailOtpInput}
                            onChange={(e) => setEmailOtpInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            maxLength={6}
                            className="relative block w-full appearance-none border-0 bg-transparent px-3 py-2 pl-10 text-base tracking-widest text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-0 dark:text-slate-100 dark:placeholder:text-slate-500"
                          />
                        </div>
                        <div className="flex gap-2">
                          <button type="button" onClick={handleVerifyEmailOtp} disabled={loading || emailOtpInput.length !== 6}
                            className="flex flex-1 justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-500 px-4 py-3 text-sm font-bold text-white shadow transition hover:from-blue-600 hover:to-indigo-600 disabled:cursor-not-allowed disabled:opacity-70">
                            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Verify
                          </button>
                          <button type="button" onClick={() => { setEmailOtpSent(false); setEmailOtpInput(''); }}
                            className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-gray-500 hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-950">
                            Resend
                          </button>
                        </div>
                        <button type="button" onClick={() => { setEmailOtpSent(false); setEmailOtpInput(''); setEmailOtpVerified(false); }}
                          className="w-full text-center text-sm text-gray-400 hover:text-blue-500 transition-colors py-1">
                          ← Change email address
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            ) : step === 2 ? (
              <div className="space-y-6 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 sm:p-5 dark:border-slate-700 dark:bg-slate-900/50">
                {/* Verified identity summary */}
                <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm dark:bg-emerald-950/30">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                  <span className="text-emerald-700 dark:text-emerald-300">
                    {signupMethod === 'phone'
                      ? <>Phone <strong>+91 {formData.phoneNumber}</strong> verified</>
                      : <>Email <strong>{formData.email}</strong> verified</>}
                  </span>
                </div>
                <p className="text-sm text-gray-500 dark:text-slate-400">Add your profile details. You can add the other contact method later from your profile.</p>

                <div className="space-y-4">
                  <div className="group relative rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                      <User className="h-5 w-5 text-gray-400 transition-colors group-focus-within:text-emerald-500" />
                    </div>
                    <input
                      id="fullName"
                      type="text"
                      placeholder="Full Name"
                      value={formData.fullName}
                      onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                      className="relative block w-full appearance-none border-0 bg-transparent px-3 py-2 pl-10 text-base text-gray-900 placeholder-gray-400 transition-colors focus:outline-none focus:ring-0 dark:text-slate-100 dark:placeholder:text-slate-500"
                      required
                    />
                  </div>

                  {/* ── Phone signup: optional email field ── */}
                  {signupMethod === 'phone' && (
                    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-950">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                          <Mail className="h-3.5 w-3.5" /> Email Address
                        </div>
                        {emailOtpVerified
                          ? <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" />Verified</span>
                          : <span className="text-xs text-slate-400">Optional — add later</span>}
                      </div>
                      {!emailOtpVerified ? (
                        <>
                          <div className={`group relative rounded-xl border bg-slate-50 px-3 py-2 dark:bg-slate-900 ${
                            formData.email ? 'border-blue-300 dark:border-blue-700' : 'border-slate-200 dark:border-slate-700'
                          }`}>
                            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                              <Mail className={`h-5 w-5 transition-colors ${formData.email ? 'text-blue-400' : 'text-gray-400 group-focus-within:text-blue-400'}`} />
                            </div>
                            <input
                              id="email" type="email" placeholder="your@email.com (optional)"
                              value={formData.email}
                              onChange={(e) => { setFormData({ ...formData, email: e.target.value }); setEmailOtpSent(false); setEmailOtpInput(''); }}
                              disabled={emailOtpSent}
                              className="relative block w-full appearance-none border-0 bg-transparent px-3 py-2 pl-10 text-base text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-0 dark:text-slate-100 dark:placeholder:text-slate-500"
                            />
                          </div>
                          {formData.email && !emailOtpSent && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email) && (
                            <button type="button" onClick={handleSendEmailOtp} disabled={loading}
                              className="flex w-full items-center justify-center gap-2 rounded-xl border border-blue-300 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-700 transition hover:bg-blue-100 disabled:opacity-50 dark:border-blue-700 dark:bg-blue-950/30 dark:text-blue-400">
                              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />} Verify Email
                            </button>
                          )}
                          {emailOtpSent && (
                            <div className="space-y-2">
                              <p className="text-xs text-gray-500">Code sent to <strong>{formData.email}</strong></p>
                              <div className="group relative rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
                                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                                  <ShieldCheck className="h-5 w-5 text-gray-400 group-focus-within:text-blue-400" />
                                </div>
                                <input id="emailOtp" type="text" inputMode="numeric" placeholder="6-digit code"
                                  value={emailOtpInput} onChange={(e) => setEmailOtpInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                  maxLength={6}
                                  className="relative block w-full appearance-none border-0 bg-transparent px-3 py-2 pl-10 text-base tracking-widest text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-0 dark:text-slate-100 dark:placeholder:text-slate-500" />
                              </div>
                              <div className="flex gap-2">
                                <button type="button" onClick={handleVerifyEmailOtp} disabled={loading || emailOtpInput.length !== 6}
                                  className="flex flex-1 justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-500 px-4 py-2.5 text-sm font-bold text-white shadow transition disabled:opacity-50">
                                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Verify
                                </button>
                                <button type="button" onClick={() => { setEmailOtpSent(false); setEmailOtpInput(''); }}
                                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-gray-500 hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-950">Resend</button>
                              </div>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-2 dark:bg-emerald-950/30">
                          <span className="text-sm text-emerald-700 dark:text-emerald-300">{formData.email}</span>
                          <button type="button" onClick={() => { setEmailOtpVerified(false); setEmailOtpSent(false); setEmailOtpInput(''); }}
                            className="text-xs text-gray-400 hover:text-gray-600 underline">Change</button>
                        </div>
                      )}
                      <p className="text-xs text-gray-400 dark:text-slate-500">For job alerts and account security.</p>
                    </div>
                  )}

                  {/* ── Email signup: required phone input (no OTP, can verify later) ── */}
                  {signupMethod === 'email' && (
                    <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-950">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                          <Phone className="h-3.5 w-3.5" /> Phone Number
                        </div>
                        <span className="text-xs text-rose-500 font-medium">Required</span>
                      </div>
                      <div className="group relative rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
                        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                          <Phone className="h-5 w-5 text-gray-400 group-focus-within:text-emerald-500" />
                        </div>
                        <input
                          id="phoneNumber" type="tel" placeholder="10-digit mobile number"
                          value={formData.phoneNumber}
                          onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                          maxLength={10}
                          className="relative block w-full appearance-none border-0 bg-transparent px-3 py-2 pl-10 text-base text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-0 dark:text-slate-100 dark:placeholder:text-slate-500"
                        />
                      </div>
                      <p className="text-xs text-gray-400 dark:text-slate-500">Used for account access. You can verify it later from your profile.</p>
                    </div>
                  )}

                  {role === 'employer' && (
                    <>
                      <div className="group relative rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950">
                        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                          <Store className="h-5 w-5 text-gray-400 transition-colors group-focus-within:text-emerald-500" />
                        </div>
                        <input
                          id="businessName"
                          type="text"
                          placeholder="Business / Shop Name"
                          value={formData.businessName}
                          onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
                          className="relative block w-full appearance-none border-0 bg-transparent px-3 py-2 pl-10 text-base text-gray-900 placeholder-gray-400 transition-colors focus:outline-none focus:ring-0 dark:text-slate-100 dark:placeholder:text-slate-500"
                          required
                        />
                      </div>

                      <div className="group relative rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950">
                        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                          <Building2 className="h-5 w-5 text-gray-400 transition-colors group-focus-within:text-emerald-500" />
                        </div>
                        <input
                          id="organizationName"
                          type="text"
                          placeholder="Organization Name (Optional)"
                          value={formData.organizationName}
                          onChange={(e) => setFormData({ ...formData, organizationName: e.target.value })}
                          className="relative block w-full appearance-none border-0 bg-transparent px-3 py-2 pl-10 text-base text-gray-900 placeholder-gray-400 transition-colors focus:outline-none focus:ring-0 dark:text-slate-100 dark:placeholder:text-slate-500"
                        />
                      </div>
                    </>
                  )}

                  {/* ── Aadhaar KYC Verification ── */}
                  <div className="space-y-4 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 sm:p-5 dark:border-slate-700 dark:bg-slate-900/50">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                        <Fingerprint className="h-3.5 w-3.5" />
                        Aadhaar Verification (KYC)
                      </div>
                      <p className="text-xs text-gray-500 dark:text-slate-400">
                        Enter your 12-digit Aadhaar number. It will be verified automatically.
                      </p>
                    </div>

                    <div className={`group relative rounded-xl border bg-white px-3 py-2 dark:bg-slate-950 ${
                      aadhaarVerified
                        ? 'border-emerald-300 dark:border-emerald-700'
                        : 'border-slate-200 dark:border-slate-700'
                    }`}>
                      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                        <Fingerprint
                          className={`h-5 w-5 transition-colors ${
                            aadhaarVerified
                              ? 'text-emerald-500'
                              : 'text-gray-400 group-focus-within:text-emerald-500'
                          }`}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          id="aadhaarNumber"
                          type="text"
                          inputMode="numeric"
                          placeholder="12-digit Aadhaar number"
                          value={aadhaarNumber}
                          onChange={(e) => handleAadhaarChange(e.target.value)}
                          disabled={aadhaarVerified}
                          maxLength={12}
                          className="relative block w-full appearance-none border-0 bg-transparent px-3 py-2 pl-10 text-base text-gray-900 placeholder-gray-400 transition-colors focus:outline-none focus:ring-0 dark:text-slate-100 dark:placeholder:text-slate-500"
                        />
                        {aadhaarVerified && <CheckCircle2 className="mr-1 h-5 w-5 shrink-0 text-emerald-500" />}
                      </div>
                    </div>

                    {aadhaarVerified && (
                      <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/80 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                        <span>Aadhaar number verified successfully.</span>
                        <button
                          type="button"
                          onClick={() => { setAadhaarVerified(false); setAadhaarNumber(''); }}
                          className="ml-auto text-xs text-gray-400 underline hover:text-gray-600"
                        >
                          Change
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-600 transition hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={handleContinueToSecurity}
                    className="w-full rounded-xl border border-transparent bg-gradient-to-r from-emerald-500 to-blue-500 px-4 py-3 text-sm font-bold text-white shadow-md transition hover:from-emerald-600 hover:to-blue-600"
                  >
                    Continue
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleRegister} className="space-y-6 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 sm:p-5 dark:border-slate-700 dark:bg-slate-900/50">
                <p className="text-sm text-gray-500 dark:text-slate-400">Set your password and complete registration.</p>

                <div className="space-y-4">
                  <div className="group relative rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                      <Lock className="h-5 w-5 text-gray-400 transition-colors group-focus-within:text-emerald-500" />
                    </div>
                    <input
                      id="password"
                      type="password"
                      placeholder="Password (minimum 8 characters)"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      minLength={8}
                      className="relative block w-full appearance-none border-0 bg-transparent px-3 py-2 pl-10 text-base text-gray-900 placeholder-gray-400 transition-colors focus:outline-none focus:ring-0 dark:text-slate-100 dark:placeholder:text-slate-500"
                      required
                    />
                  </div>

                  <div className="group relative rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                      <Lock className="h-5 w-5 text-gray-400 transition-colors group-focus-within:text-emerald-500" />
                    </div>
                    <input
                      id="confirmPassword"
                      type="password"
                      placeholder="Confirm Password"
                      value={formData.confirmPassword}
                      onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                      className="relative block w-full appearance-none border-0 bg-transparent px-3 py-2 pl-10 text-base text-gray-900 placeholder-gray-400 transition-colors focus:outline-none focus:ring-0 dark:text-slate-100 dark:placeholder:text-slate-500"
                      required
                    />
                  </div>
                </div>

                <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-950">
                  <Checkbox
                    id="terms"
                    checked={agreeToTerms}
                    onCheckedChange={(checked) => setAgreeToTerms(checked === true)}
                    className="mt-1"
                  />
                  <label htmlFor="terms" className="text-sm text-gray-600 dark:text-slate-400 leading-relaxed cursor-pointer">
                    I agree to the{' '}
                    <Link href="/terms" target="_blank" className="text-emerald-500 hover:text-emerald-600 font-medium underline">
                      Terms and Conditions
                    </Link>{' '}
                    and{' '}
                    <Link href="/privacy" target="_blank" className="text-emerald-500 hover:text-emerald-600 font-medium underline">
                      Privacy Policy
                    </Link>
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={loading || !agreeToTerms}
                  className="group relative flex w-full transform justify-center rounded-xl border border-transparent bg-gradient-to-r from-emerald-500 to-blue-500 px-4 py-4 text-sm font-bold text-white shadow-lg transition-all hover:-translate-y-0.5 hover:from-emerald-600 hover:to-blue-600 hover:shadow-emerald-500/30 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin text-emerald-100" />
                      Creating Account...
                    </>
                  ) : (
                    'CREATE ACCOUNT'
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-600 transition hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Back
                </button>
              </form>
            )}

            <p className="text-center text-xs leading-relaxed text-gray-500 dark:text-slate-400">
              By signing up, you agree to our Terms of Service and Privacy Policy
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={<div className="app-surface" />}>
      <SignupPageContent />
    </Suspense>
  );
}
