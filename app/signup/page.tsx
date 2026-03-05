'use client';

import { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { User, Briefcase, Loader2, Phone, ShieldCheck, Lock, Building2, Store, CreditCard, CheckCircle2, XCircle, AlertTriangle, Mail } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { sendOTP, verifyOTP, registerUser, setUserPassword, sendEmailOtp, verifyEmailOtp } from '@/lib/auth';
import { useToast } from '@/hooks/use-toast';
import { useI18n } from '@/contexts/I18nContext';

function SignupPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();
  const { toast } = useToast();
  const { t } = useI18n();
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

  // PAN KYC state
  const [panNumber, setPanNumber] = useState('');
  const [panVerified, setPanVerified] = useState(false);
  const [panVerifying, setPanVerifying] = useState(false);
  const [bypassPanVerification, setBypassPanVerification] = useState(false);
  const [panResult, setPanResult] = useState<{
    verified: boolean;
    panName?: string;
    nameMatch?: boolean;
    similarity?: number;
    message?: string;
  } | null>(null);

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
        title: t('auth.signup.toast.invalidPhone'),
        description: t('auth.signup.toast.invalidPhoneDesc'),
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
          title: t('auth.signup.toast.otpSent'),
          description: result.message,
        });
      } else {
        toast({
          title: t('auth.signup.toast.otpSendFailed'),
          description: result.message || t('auth.signup.toast.otpSendFailedDesc'),
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: t('auth.signup.toast.error'),
        description: t('auth.signup.toast.otpSendError'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    if (!formData.otp || formData.otp.length !== 6) {
      toast({
        title: t('auth.signup.toast.invalidOtp'),
        description: t('auth.signup.toast.invalidOtpDesc'),
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
          title: t('auth.signup.toast.phoneVerified'),
          description: t('auth.signup.toast.phoneVerifiedDesc'),
        });
      } else {
        toast({
          title: t('auth.signup.toast.verificationFailed'),
          description: result.message,
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: t('auth.signup.toast.error'),
        description: t('auth.signup.toast.verifyOtpError'),
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
        title: t('auth.signup.toast.invalidEmail'),
        description: t('auth.signup.toast.invalidEmailDesc'),
        variant: 'destructive',
      });
      return;
    }
    setLoading(true);
    try {
      const result = await sendEmailOtp(formData.email, 'signup');
      if (result.success) {
        setEmailOtpSent(true);
        toast({ title: t('auth.signup.toast.emailCodeSent'), description: t('auth.signup.toast.emailCodeSentDesc') });
      } else {
        toast({ title: t('auth.signup.toast.emailCodeSendFailed'), description: result.message, variant: 'destructive' });
      }
    } catch {
      toast({ title: t('auth.signup.toast.error'), description: t('auth.signup.toast.emailSendError'), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyEmailOtp = async () => {
    if (!emailOtpInput || emailOtpInput.length !== 6) {
      toast({ title: t('auth.signup.toast.invalidEmailCode'), description: t('auth.signup.toast.invalidEmailCodeDesc'), variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const result = await verifyEmailOtp(formData.email, emailOtpInput);
      if (result.success) {
        setEmailOtpVerified(true);
        toast({ title: t('auth.signup.toast.emailVerified'), description: t('auth.signup.toast.emailVerifiedDesc') });
        // If this is the step-1 email signup path, advance to step 2
        if (signupMethod === 'email' && step === 1) {
          setStep(2);
        }
      } else {
        toast({ title: t('auth.signup.toast.verificationFailed'), description: result.message, variant: 'destructive' });
      }
    } catch {
      toast({ title: t('auth.signup.toast.error'), description: t('auth.signup.toast.emailVerifyError'), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  // ── PAN KYC Verification ──────────────────────────────────────────────
  const handleVerifyPAN = async () => {
    const pan = panNumber.toUpperCase().trim();
    if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) {
      toast({
        title: t('auth.signup.toast.invalidPan'),
        description: t('auth.signup.toast.invalidPanDesc'),
        variant: 'destructive',
      });
      return;
    }

    if (!formData.fullName || formData.fullName.length < 3) {
      toast({
        title: t('auth.signup.toast.nameRequired'),
        description: t('auth.signup.toast.nameRequiredDesc'),
        variant: 'destructive',
      });
      return;
    }

    setPanVerifying(true);
    setPanResult(null);
    try {
      const res = await fetch('/api/kyc/verify-pan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pan, fullName: formData.fullName }),
      });
      const data = await res.json();
      setPanResult(data);

      if (data.verified && data.nameMatch) {
        setPanVerified(true);
        toast({
          title: t('auth.signup.toast.panVerified'),
          description: t('auth.signup.toast.panVerifiedDesc', { name: data.panName }),
        });
      } else if (data.verified && !data.nameMatch) {
        setPanVerified(false);
        toast({
          title: t('auth.signup.toast.panNameMismatch'),
          description: data.message || t('auth.signup.toast.panNameMismatchDesc'),
          variant: 'destructive',
        });
      } else {
        setPanVerified(false);
        toast({
          title: t('auth.signup.toast.panVerifyFailed'),
          description: data.message || t('auth.signup.toast.panVerifyFailedDesc'),
          variant: 'destructive',
        });
      }
    } catch (err) {
      setPanVerified(false);
      toast({
        title: t('auth.signup.toast.error'),
        description: t('auth.signup.toast.panServiceError'),
        variant: 'destructive',
      });
    } finally {
      setPanVerifying(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!agreeToTerms) {
      toast({
        title: t('auth.signup.toast.termsRequired'),
        description: t('auth.signup.toast.termsRequiredDesc'),
        variant: 'destructive',
      });
      return;
    }

    if (!formData.fullName || formData.fullName.length < 3) {
      toast({
        title: t('auth.signup.toast.invalidName'),
        description: t('auth.signup.toast.invalidNameDesc'),
        variant: 'destructive',
      });
      return;
    }

    if (!panVerified && !bypassPanVerification) {
      toast({
        title: t('auth.signup.toast.panRequired'),
        description: t('auth.signup.toast.panRequiredDesc'),
        variant: 'destructive',
      });
      return;
    }


    if (formData.password.length < 8) {
      toast({
        title: t('auth.signup.toast.weakPassword'),
        description: t('auth.signup.toast.weakPasswordDesc'),
        variant: 'destructive',
      });
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      toast({
        title: t('auth.signup.toast.passwordMismatch'),
        description: t('auth.signup.toast.passwordMismatchDesc'),
        variant: 'destructive',
      });
      return;
    }

    if (role === 'employer' && !formData.businessName) {
      toast({
        title: t('auth.signup.toast.businessNameRequired'),
        description: t('auth.signup.toast.businessNameRequiredDesc'),
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
        if (panVerified && !bypassPanVerification) {
          // Attach PAN KYC data to user
          result.user.panNumber = panNumber.toUpperCase().trim();
          result.user.panVerified = true;
          result.user.panName = panResult?.panName ?? formData.fullName;
          result.user.panVerifiedAt = new Date().toISOString();
          result.user.isVerified = true;
        }

        // Store password for mock auth
        setUserPassword(formData.phoneNumber, formData.password);

        login(result.user);
        toast({
          title: t('auth.signup.toast.registrationSuccess'),
          description: t('auth.signup.toast.registrationSuccessDesc'),
        });

        // Redirect based on role
        if (role === 'worker') {
          router.push('/worker/dashboard');
        } else {
          router.push('/employer/dashboard');
        }
      } else {
        toast({
          title: t('auth.signup.toast.registrationFailed'),
          description: result.message,
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: t('auth.signup.toast.error'),
        description: t('auth.signup.toast.registrationError'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleContinueToSecurity = () => {
    if (!formData.fullName || formData.fullName.length < 3) {
      toast({
        title: t('auth.signup.toast.invalidName'),
        description: t('auth.signup.toast.invalidNameDesc'),
        variant: 'destructive',
      });
      return;
    }

    // Email-signup path: phone number is required (no OTP — can verify from profile later)
    if (signupMethod === 'email') {
      if (!formData.phoneNumber || formData.phoneNumber.length !== 10) {
        toast({
          title: t('auth.signup.toast.phoneRequired'),
          description: t('auth.signup.toast.phoneRequiredDesc'),
          variant: 'destructive',
        });
        return;
      }
    }

    if (role === 'employer' && !formData.businessName) {
      toast({
        title: t('auth.signup.toast.businessNameRequired'),
        description: t('auth.signup.toast.businessNameRequiredDesc'),
        variant: 'destructive',
      });
      return;
    }

    if (!panVerified && !bypassPanVerification) {
      toast({
        title: t('auth.signup.toast.panRequired'),
        description: t('auth.signup.toast.panRequiredStep2Desc'),
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
              {t('auth.signup.hero.joinYour')} <br />
              {t('auth.signup.hero.local')} <br />
              <span className="relative inline-block text-emerald-500 dark:text-emerald-400">
                {t('auth.signup.hero.workforce')}
                <svg className="absolute -bottom-1 left-0 -z-10 h-3 w-full text-blue-200 dark:text-blue-900/70" viewBox="0 0 100 10" preserveAspectRatio="none">
                  <path d="M0 5 Q 50 10 100 5" fill="none" stroke="currentColor" strokeWidth="8" />
                </svg>
              </span>{' '}
              {t('auth.signup.hero.network')}
            </h1>
            <p className="mb-10 text-lg leading-relaxed text-slate-700 dark:text-slate-300">
              {t('auth.signup.hero.description')}
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
            {t('auth.signup.backToHome')}
          </Link>
          <div className="w-full max-w-md space-y-5 py-1 sm:space-y-6 md:py-4">
            <div className="space-y-2">
              <h2 className="text-3xl font-bold text-gray-900 dark:text-white">{t('auth.signup.title')}</h2>
              <p className="text-sm text-gray-500 dark:text-slate-400">{t('auth.signup.subtitle')}</p>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                  step === 1
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                    : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                }`}>
                  {t('auth.signup.step1Label')}
                </span>
                <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                  step === 2
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                    : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                }`}>
                  {t('auth.signup.step2Label')}
                </span>
                <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                  step === 3
                    ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300'
                    : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                }`}>
                  {t('auth.signup.step3Label')}
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
                {t('auth.signup.roleWorker')}
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
                {t('auth.signup.roleEmployer')}
              </button>
            </div>

            {step === 1 ? (
              <div className="space-y-5 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 sm:p-5 dark:border-slate-700 dark:bg-slate-900/50">
                <p className="text-sm text-gray-500 dark:text-slate-400">
                  {t('auth.signup.step1.description')}
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
                      <Phone className="h-4 w-4" /> {t('auth.signup.step1.methodPhone')}
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
                      <Mail className="h-4 w-4" /> {t('auth.signup.step1.methodEmail')}
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
                        placeholder={t('auth.signup.step1.phonePlaceholder')}
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
                          {loading ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" />{t('auth.signup.step1.sendingOtp')}</> : <><ShieldCheck className="mr-2 h-5 w-5" />{t('auth.signup.step1.sendOtpButton')}</>}
                        </button>
                        <p className="text-center text-sm text-gray-500 dark:text-slate-400">
                          {t('auth.signup.step1.alreadyHaveAccount')}{' '}
                          <Link className="font-medium text-emerald-500 hover:text-blue-500" href="/login">{t('auth.signup.step1.loginLink')}</Link>
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
                          {loading ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" />{t('auth.signup.step1.verifyingOtp')}</> : t('auth.signup.step1.verifyOtpButton')}
                        </button>
                        <button type="button" onClick={() => { setOtpSent(false); setFormData({ ...formData, otp: '' }); }} className="w-full text-center text-sm text-gray-400 hover:text-emerald-500 transition-colors py-1">
                          {t('auth.signup.step1.changePhoneNumber')}
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
                        id="email" type="email" placeholder={t('auth.signup.step1.emailPlaceholder')}
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
                          {loading ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" />{t('auth.signup.step1.sendingOtp')}</> : <><Mail className="mr-2 h-5 w-5" />{t('auth.signup.step1.sendEmailCodeButton')}</>}
                        </button>
                        <p className="text-center text-sm text-gray-500 dark:text-slate-400">
                          {t('auth.signup.step1.alreadyHaveAccount')}{' '}
                          <Link className="font-medium text-emerald-500 hover:text-blue-500" href="/login">{t('auth.signup.step1.loginLink')}</Link>
                        </p>
                      </>
                    )}

                    {emailOtpSent && !emailOtpVerified && (
                      <>
                        <p className="text-xs text-gray-500 dark:text-slate-400">{t('auth.signup.step1.codeSentTo')} <strong>{formData.email}</strong></p>
                        <div className="group relative rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950">
                          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                            <ShieldCheck className="h-5 w-5 text-gray-400 group-focus-within:text-blue-400" />
                          </div>
                          <input
                            id="emailOtp" type="text" inputMode="numeric" placeholder={t('auth.signup.step1.emailOtpPlaceholder')}
                            value={emailOtpInput}
                            onChange={(e) => setEmailOtpInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            maxLength={6}
                            className="relative block w-full appearance-none border-0 bg-transparent px-3 py-2 pl-10 text-base tracking-widest text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-0 dark:text-slate-100 dark:placeholder:text-slate-500"
                          />
                        </div>
                        <div className="flex gap-2">
                          <button type="button" onClick={handleVerifyEmailOtp} disabled={loading || emailOtpInput.length !== 6}
                            className="flex flex-1 justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-500 px-4 py-3 text-sm font-bold text-white shadow transition hover:from-blue-600 hover:to-indigo-600 disabled:cursor-not-allowed disabled:opacity-70">
                            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} {t('auth.signup.step1.verifyButton')}
                          </button>
                          <button type="button" onClick={() => { setEmailOtpSent(false); setEmailOtpInput(''); }}
                            className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-gray-500 hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-950">
                            {t('auth.signup.step1.resendButton')}
                          </button>
                        </div>
                        <button type="button" onClick={() => { setEmailOtpSent(false); setEmailOtpInput(''); setEmailOtpVerified(false); }}
                          className="w-full text-center text-sm text-gray-400 hover:text-blue-500 transition-colors py-1">
                          {t('auth.signup.step1.changeEmailAddress')}
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
                <p className="text-sm text-gray-500 dark:text-slate-400">{t('auth.signup.step2.description')}</p>

                <div className="space-y-4">
                  <div className="group relative rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                      <User className="h-5 w-5 text-gray-400 transition-colors group-focus-within:text-emerald-500" />
                    </div>
                    <input
                      id="fullName"
                      type="text"
                      placeholder={t('auth.signup.step2.fullNamePlaceholder')}
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
                          <Mail className="h-3.5 w-3.5" /> {t('auth.signup.step2.emailLabel')}
                        </div>
                        {emailOtpVerified
                          ? <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" />{t('auth.signup.step2.verifiedLabel')}</span>
                          : <span className="text-xs text-slate-400">{t('auth.signup.step2.optionalAddLater')}</span>}
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
                              id="email" type="email" placeholder={t('auth.signup.step2.emailPlaceholderOptional')}
                              value={formData.email}
                              onChange={(e) => { setFormData({ ...formData, email: e.target.value }); setEmailOtpSent(false); setEmailOtpInput(''); }}
                              disabled={emailOtpSent}
                              className="relative block w-full appearance-none border-0 bg-transparent px-3 py-2 pl-10 text-base text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-0 dark:text-slate-100 dark:placeholder:text-slate-500"
                            />
                          </div>
                          {formData.email && !emailOtpSent && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email) && (
                            <button type="button" onClick={handleSendEmailOtp} disabled={loading}
                              className="flex w-full items-center justify-center gap-2 rounded-xl border border-blue-300 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-700 transition hover:bg-blue-100 disabled:opacity-50 dark:border-blue-700 dark:bg-blue-950/30 dark:text-blue-400">
                              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />} {t('auth.signup.step2.verifyEmailButton')}
                            </button>
                          )}
                          {emailOtpSent && (
                            <div className="space-y-2">
                              <p className="text-xs text-gray-500">{t('auth.signup.step1.codeSentTo')} <strong>{formData.email}</strong></p>
                              <div className="group relative rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
                                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                                  <ShieldCheck className="h-5 w-5 text-gray-400 group-focus-within:text-blue-400" />
                                </div>
                                <input id="emailOtp" type="text" inputMode="numeric" placeholder={t('auth.signup.step2.emailOtpPlaceholder')}
                                  value={emailOtpInput} onChange={(e) => setEmailOtpInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                  maxLength={6}
                                  className="relative block w-full appearance-none border-0 bg-transparent px-3 py-2 pl-10 text-base tracking-widest text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-0 dark:text-slate-100 dark:placeholder:text-slate-500" />
                              </div>
                              <div className="flex gap-2">
                                <button type="button" onClick={handleVerifyEmailOtp} disabled={loading || emailOtpInput.length !== 6}
                                  className="flex flex-1 justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-500 px-4 py-2.5 text-sm font-bold text-white shadow transition disabled:opacity-50">
                                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} {t('auth.signup.step1.verifyButton')}
                                </button>
                                <button type="button" onClick={() => { setEmailOtpSent(false); setEmailOtpInput(''); }}
                                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-gray-500 hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-950">{t('auth.signup.step1.resendButton')}</button>
                              </div>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-2 dark:bg-emerald-950/30">
                          <span className="text-sm text-emerald-700 dark:text-emerald-300">{formData.email}</span>
                          <button type="button" onClick={() => { setEmailOtpVerified(false); setEmailOtpSent(false); setEmailOtpInput(''); }}
                            className="text-xs text-gray-400 hover:text-gray-600 underline">{t('auth.signup.step2.changeButton')}</button>
                        </div>
                      )}
                      <p className="text-xs text-gray-400 dark:text-slate-500">{t('auth.signup.step2.emailPurpose')}</p>
                    </div>
                  )}

                  {/* ── Email signup: required phone input (no OTP, can verify later) ── */}
                  {signupMethod === 'email' && (
                    <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-950">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                          <Phone className="h-3.5 w-3.5" /> {t('auth.signup.step2.phoneLabel')}
                        </div>
                        <span className="text-xs text-rose-500 font-medium">{t('auth.signup.step2.requiredLabel')}</span>
                      </div>
                      <div className="group relative rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
                        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                          <Phone className="h-5 w-5 text-gray-400 group-focus-within:text-emerald-500" />
                        </div>
                        <input
                          id="phoneNumber" type="tel" placeholder={t('auth.signup.step2.phonePlaceholder')}
                          value={formData.phoneNumber}
                          onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                          maxLength={10}
                          className="relative block w-full appearance-none border-0 bg-transparent px-3 py-2 pl-10 text-base text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-0 dark:text-slate-100 dark:placeholder:text-slate-500"
                        />
                      </div>
                      <p className="text-xs text-gray-400 dark:text-slate-500">{t('auth.signup.step2.phoneHelperText')}</p>
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
                          placeholder={t('auth.signup.step2.businessNamePlaceholder')}
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
                          placeholder={t('auth.signup.step2.organizationNamePlaceholder')}
                          value={formData.organizationName}
                          onChange={(e) => setFormData({ ...formData, organizationName: e.target.value })}
                          className="relative block w-full appearance-none border-0 bg-transparent px-3 py-2 pl-10 text-base text-gray-900 placeholder-gray-400 transition-colors focus:outline-none focus:ring-0 dark:text-slate-100 dark:placeholder:text-slate-500"
                        />
                      </div>
                    </>
                  )}

                  {/* ── PAN Card KYC Verification ── */}
                  <div className="space-y-4 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 sm:p-5 dark:border-slate-700 dark:bg-slate-900/50">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                        <CreditCard className="h-3.5 w-3.5" />
                        {t('auth.signup.step2.panHeading')}
                      </div>
                      <p className="text-xs text-gray-500 dark:text-slate-400">
                        {t('auth.signup.step2.panDescription')}
                      </p>
                    </div>

                    <div className={`group relative rounded-xl border bg-white px-3 py-2 dark:bg-slate-950 ${
                      panVerified
                        ? 'border-emerald-300 dark:border-emerald-700'
                        : 'border-slate-200 dark:border-slate-700'
                    }`}>
                      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                        <CreditCard
                          className={`h-5 w-5 transition-colors ${
                            panVerified
                              ? 'text-emerald-500'
                              : 'text-gray-400 group-focus-within:text-emerald-500'
                          }`}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          id="panNumber"
                          type="text"
                          placeholder={t('auth.signup.step2.panPlaceholder')}
                          value={panNumber}
                          onChange={(e) => {
                            const v = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
                            setPanNumber(v);
                            if (panVerified) {
                              setPanVerified(false);
                              setPanResult(null);
                            }
                          }}
                          disabled={panVerified}
                          maxLength={10}
                          className="relative block w-full appearance-none border-0 bg-transparent px-3 py-2 pl-10 text-base text-gray-900 placeholder-gray-400 transition-colors focus:outline-none focus:ring-0 dark:text-slate-100 dark:placeholder:text-slate-500"
                        />
                        {panVerified && <CheckCircle2 className="mr-1 h-5 w-5 shrink-0 text-emerald-500" />}
                      </div>
                    </div>

                    {!panVerified && (
                      <button
                        type="button"
                        onClick={handleVerifyPAN}
                        disabled={panVerifying || panNumber.length !== 10 || !formData.fullName}
                        className="flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 dark:hover:bg-emerald-950/50"
                      >
                        {panVerifying ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            {t('auth.signup.step2.verifyingPan')}
                          </>
                        ) : (
                          <>
                            <ShieldCheck className="h-4 w-4" />
                            {t('auth.signup.step2.verifyPanButton')}
                          </>
                        )}
                      </button>
                    )}

                    {panResult && (
                      <div
                        className={`rounded-xl border p-3 text-sm ${
                          panResult.verified && panResult.nameMatch
                            ? 'border-emerald-200 bg-emerald-50/80 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                            : panResult.verified && !panResult.nameMatch
                              ? 'border-amber-200 bg-amber-50/80 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
                              : 'border-red-200 bg-red-50/80 text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300'
                        }`}
                      >
                        <div className="flex items-start gap-2.5">
                          {panResult.verified && panResult.nameMatch ? (
                            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                          ) : panResult.verified && !panResult.nameMatch ? (
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                          ) : (
                            <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                          )}
                          <div className="space-y-1">
                            <p className="font-medium leading-relaxed">{panResult.message}</p>
                            {panResult.panName && (
                              <p className="text-xs opacity-80">
                                {t('auth.signup.step2.panRegisteredTo')} <strong>{panResult.panName}</strong>
                                {panResult.similarity !== undefined && ` (${panResult.similarity}% {t('auth.signup.step2.match')})`}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {panVerified && (
                      <button
                        type="button"
                        onClick={() => {
                          setPanVerified(false);
                          setPanResult(null);
                          setPanNumber('');
                        }}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-900"
                      >
                        {t('auth.signup.step2.changePanButton')}
                      </button>
                    )}

                    <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-950">
                      <Checkbox
                        id="bypassPan"
                        checked={bypassPanVerification}
                        onCheckedChange={(checked) => setBypassPanVerification(checked === true)}
                        className="mt-0.5"
                      />
                      <label htmlFor="bypassPan" className="cursor-pointer text-sm leading-relaxed text-gray-600 dark:text-slate-400">
                        {t('auth.signup.step2.bypassPanCheckbox')}
                      </label>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-600 transition hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    {t('auth.signup.step2.backButton')}
                  </button>
                  <button
                    type="button"
                    onClick={handleContinueToSecurity}
                    className="w-full rounded-xl border border-transparent bg-gradient-to-r from-emerald-500 to-blue-500 px-4 py-3 text-sm font-bold text-white shadow-md transition hover:from-emerald-600 hover:to-blue-600"
                  >
                    {t('auth.signup.step2.continueButton')}
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleRegister} className="space-y-6 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 sm:p-5 dark:border-slate-700 dark:bg-slate-900/50">
                <p className="text-sm text-gray-500 dark:text-slate-400">{t('auth.signup.step3.description')}</p>

                <div className="space-y-4">
                  <div className="group relative rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                      <Lock className="h-5 w-5 text-gray-400 transition-colors group-focus-within:text-emerald-500" />
                    </div>
                    <input
                      id="password"
                      type="password"
                      placeholder={t('auth.signup.step3.passwordPlaceholder')}
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
                      placeholder={t('auth.signup.step3.confirmPasswordPlaceholder')}
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
                    {t('auth.signup.step3.agreePrefix')}{' '}
                    <Link href="/terms" target="_blank" className="text-emerald-500 hover:text-emerald-600 font-medium underline">
                      {t('auth.signup.step3.termsLink')}
                    </Link>{' '}
                    {t('auth.signup.step3.andText')}{' '}
                    <Link href="/privacy" target="_blank" className="text-emerald-500 hover:text-emerald-600 font-medium underline">
                      {t('auth.signup.step3.privacyLink')}
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
                      {t('auth.signup.step3.creatingAccount')}
                    </>
                  ) : (
                    t('auth.signup.step3.createAccountButton')
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-600 transition hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  {t('auth.signup.step3.backButton')}
                </button>
              </form>
            )}

            <p className="text-center text-xs leading-relaxed text-gray-500 dark:text-slate-400">
              {t('auth.signup.step3.footerDisclaimer')}
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
