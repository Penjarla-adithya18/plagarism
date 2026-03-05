'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2, Phone, Lock, Store, LogIn, Eye, EyeOff, Mail } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { loginUser } from '@/lib/auth';
import { getUserByPhone, getUserByEmail } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { useI18n } from '@/contexts/I18nContext';

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const { toast } = useToast();
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  // Avoid SSR/client mismatch on theme-sensitive backdrop styles
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true)
    // Show toast if redirected here due to session expiry
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      if (params.get('reason') === 'session_expired') {
        setTimeout(() => toast({
          title: t('auth.login.toast.sessionExpired'),
          description: t('auth.login.toast.sessionExpiredDesc'),
          variant: 'destructive',
        }), 200)
      }
    }
  }, []);
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    identifier: '', // phone number OR email address
    password: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const identifier = formData.identifier.trim();
    const isEmail = identifier.includes('@');
    const isPhone = /^\d{10}$/.test(identifier);

    if (!isEmail && !isPhone) {
      toast({
        title: t('auth.login.toast.invalidCredentials'),
        description: t('auth.login.toast.invalidCredentialsDesc'),
        variant: 'destructive',
      });
      return;
    }

    if (!formData.password) {
      toast({
        title: t('auth.login.toast.passwordRequired'),
        description: t('auth.login.toast.passwordRequiredDesc'),
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      let phoneNumber: string;
      let userEmail: string | undefined;
      let userFullName: string | undefined;

      if (isEmail) {
        // Email-based login: look up the user to get their phone number
        const emailUser = await getUserByEmail(identifier);
        if (!emailUser) {
          toast({
            title: t('auth.login.toast.accountNotFound'),
            description: t('auth.login.toast.emailNotFound'),
            variant: 'destructive',
          });
          return;
        }
        phoneNumber = emailUser.phoneNumber;
        userEmail = identifier;
        userFullName = emailUser.fullName;
      } else {
        // Phone-based login: validate account exists
        let existingUser: Awaited<ReturnType<typeof getUserByPhone>> | undefined;
        try {
          existingUser = await getUserByPhone(identifier);
        } catch {
          existingUser = undefined;
        }
        if (existingUser === null) {
          toast({
            title: t('auth.login.toast.accountNotFound'),
            description: t('auth.login.toast.phoneNotFound'),
            variant: 'destructive',
          });
          return;
        }
        phoneNumber = identifier;
        userEmail = existingUser?.email || undefined;
        userFullName = existingUser?.fullName || undefined;
      }

      const result = await loginUser(phoneNumber, formData.password, userEmail, userFullName);

      if (result.success && result.user) {
        // Save user to context and localStorage
        login(result.user);
        
        toast({
          title: t('auth.login.toast.loginSuccess'),
          description: t('auth.login.toast.welcomeBack', { name: result.user.fullName }),
        });

        // Small delay to ensure state is persisted before navigation
        await new Promise(resolve => setTimeout(resolve, 100));

        // Redirect based on role
        if (result.user.role === 'worker') {
          router.push('/worker/dashboard');
        } else if (result.user.role === 'employer') {
          router.push('/employer/dashboard');
        } else if (result.user.role === 'admin') {
          router.push('/admin/dashboard');
        }
      } else {
        const message = (result.message || '').toLowerCase();
        if (
          message.includes('not found') ||
          message.includes('no user') ||
          message.includes('does not exist')
        ) {
          toast({
            title: t('auth.login.toast.accountNotFound'),
            description: t('auth.login.toast.phoneNotFound'),
            variant: 'destructive',
          });
          return;
        }

        toast({
          title: t('auth.login.toast.loginFailed'),
          description: result.message,
          variant: 'destructive',
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Something went wrong. Please try again.';
      toast({
        title: t('auth.login.toast.error'),
        description: message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-start justify-center overflow-y-auto bg-gradient-to-br from-emerald-50 via-sky-50 to-indigo-100 p-3 py-6 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950 sm:items-center sm:p-4 md:p-6">
      {/* Animated orbs */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute left-[10%] top-[20%] h-[400px] w-[400px] rounded-full bg-emerald-400/20 blur-3xl animate-orb-1 dark:bg-emerald-600/10" />
        <div className="absolute right-[8%] bottom-[15%] h-[350px] w-[350px] rounded-full bg-blue-500/18 blur-3xl animate-orb-2 dark:bg-blue-700/10" />
      </div>
      <div suppressHydrationWarning className="flex w-full max-w-6xl flex-col overflow-hidden rounded-2xl shadow-2xl shadow-emerald-500/10 sm:rounded-3xl md:h-[90vh] md:flex-row">
        <section
          suppressHydrationWarning
          className="relative hidden h-full w-full flex-col items-center justify-start p-7 pt-16 text-slate-900 md:flex md:w-1/2 md:items-start md:p-10 md:pt-16 lg:w-5/12 lg:p-12 lg:pt-16 dark:text-slate-100 bg-gradient-to-br from-emerald-50/80 via-sky-50/80 to-blue-50/80 dark:from-emerald-950/30 dark:via-slate-900/90 dark:to-blue-950/30 border-r border-white/30 dark:border-slate-700/50"
          style={mounted ? { backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)' } : undefined}
        >
          <div className="absolute left-8 top-8 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-bl-none rounded-lg rounded-tr-none bg-gradient-to-r from-emerald-500 to-blue-500 text-xl font-bold text-white shadow-sm">
              H
            </div>
            <span className="text-lg font-bold tracking-wide">HyperLocal</span>
          </div>

          <div className="z-10 mt-4 max-w-md md:mt-0">
            <h1 className="mb-6 text-5xl font-bold leading-[1.05] text-slate-900 md:text-6xl dark:text-white">
              {t('auth.login.leftTitle')}
            </h1>
            <p className="mb-10 text-lg leading-relaxed text-slate-700 dark:text-slate-300">
              {t('auth.login.leftSubtitle')}
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

        <section
          suppressHydrationWarning
          className="relative z-20 flex w-full flex-col items-center justify-center bg-white/90 p-5 pt-6 dark:bg-slate-950/90 sm:p-6 md:w-1/2 md:rounded-l-[2.5rem] md:p-10 md:shadow-none lg:w-7/12 lg:p-14"
          style={mounted ? { backdropFilter: 'blur(24px) saturate(180%)', WebkitBackdropFilter: 'blur(24px) saturate(180%)' } : undefined}
        >
          <Link href="/" className="mb-4 inline-flex items-center self-start text-sm font-medium text-slate-500 transition-colors hover:text-emerald-500 dark:text-slate-400 dark:hover:text-emerald-400 md:absolute md:left-8 md:top-8 md:mb-0">
            ← {t('auth.backHome')}
          </Link>
          <div className="w-full max-w-sm space-y-6 sm:space-y-7">
            <div>
              <h2 className="text-3xl font-bold text-gray-900 dark:text-white">{t('auth.login.title')}</h2>
            </div>

            <form onSubmit={handleSubmit} className="mt-8 space-y-6">
              <div className="space-y-6">
                <div>
                  <label className="sr-only" htmlFor="identifier">{t('auth.login.identifier')}</label>
                  <div className="group relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                      {formData.identifier.includes('@')
                        ? <Mail className="h-5 w-5 text-gray-400 transition-colors group-focus-within:text-emerald-500" />
                        : <Phone className="h-5 w-5 text-gray-400 transition-colors group-focus-within:text-emerald-500" />}
                    </div>
                    <input
                      id="identifier"
                      type="text"
                      name="identifier"
                      placeholder={t('auth.login.identifier')}
                      value={formData.identifier}
                      onChange={(e) => setFormData({ ...formData, identifier: e.target.value })}
                      className="relative block w-full appearance-none border-0 border-b-2 border-gray-200 bg-transparent px-3 py-4 pl-10 text-gray-900 placeholder-gray-400 transition-colors focus:z-10 focus:border-emerald-500 focus:outline-none focus:ring-0 sm:text-lg dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-500"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="sr-only" htmlFor="password">{t('auth.passwordLabel')}</label>
                  <div className="group relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                      <Lock className="h-5 w-5 text-gray-400 transition-colors group-focus-within:text-emerald-500" />
                    </div>
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      name="password"
                      placeholder={t('auth.passwordPh')}
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      className="relative block w-full appearance-none border-0 border-b-2 border-gray-200 bg-transparent px-3 py-4 pl-10 text-gray-900 placeholder-gray-400 transition-colors focus:z-10 focus:border-emerald-500 focus:outline-none focus:ring-0 sm:text-lg dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-500"
                      required
                    />
                    <button
                      type="button"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute inset-y-0 right-0 flex items-center pr-1 text-gray-400 transition-colors hover:text-emerald-500"
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <input className="h-4 w-4 cursor-pointer rounded border-gray-300 text-emerald-500 focus:ring-emerald-500" id="remember-me" name="remember-me" type="checkbox" />
                  <label className="ml-2 block cursor-pointer text-sm text-gray-600 dark:text-slate-300" htmlFor="remember-me">
                    {t('auth.login.rememberMe')}
                  </label>
                </div>
                <div className="text-sm">
                  <Link className="font-medium text-gray-500 transition-colors hover:text-emerald-500 dark:text-slate-400" href="/forgot-password">
                    {t('auth.login.forgotPw')}
                  </Link>
                </div>
              </div>

              <div>
                <button
                  type="submit"
                  disabled={loading}
                  className="group relative flex w-full transform justify-center rounded-xl border border-transparent bg-gradient-to-r from-emerald-500 to-blue-500 px-4 py-4 text-sm font-bold text-white shadow-lg transition-all hover:-translate-y-0.5 hover:from-emerald-600 hover:to-blue-600 hover:shadow-emerald-500/30 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                    {loading ? (
                      <Loader2 className="h-5 w-5 animate-spin text-emerald-100" />
                    ) : (
                      <LogIn className="h-5 w-5 text-emerald-100 group-hover:text-white" />
                    )}
                  </span>
                  {loading ? t('auth.login.loading') : t('auth.login.btn')}
                </button>
              </div>

              <p className="text-center text-sm text-gray-500 dark:text-slate-400">
                {t('auth.login.newUser')}{' '}
                <Link className="font-medium text-emerald-500 transition-colors hover:text-blue-500" href="/signup">
                  {t('auth.login.createAccount')}
                </Link>
              </p>
            </form>

            <div className="mt-8 border-t border-gray-100 pt-6 text-xs text-gray-400 dark:border-slate-800 dark:text-slate-500">
              <h3 className="mb-2 font-bold uppercase tracking-widest text-gray-300 dark:text-slate-600">{t('auth.login.demo')}</h3>
              <div className="flex flex-wrap gap-4">
                <button
                  type="button"
                  className="cursor-pointer transition-colors hover:text-emerald-500"
                  title="Use 9876543210 / Password@123"
                  onClick={() => setFormData({ identifier: '9876543210', password: 'Password@123' })}
                >
                  {t('auth.login.demoWorker')}: 9876543210
                </button>
                <button
                  type="button"
                  className="cursor-pointer transition-colors hover:text-emerald-500"
                  title="Use 9876543212 / Password@123"
                  onClick={() => setFormData({ identifier: '9876543212', password: 'Password@123' })}
                >
                  {t('auth.login.demoEmployer')}: 9876543212
                </button>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">{t('auth.login.demoPassword')}: Password@123</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
