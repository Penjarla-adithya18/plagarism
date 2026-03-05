'use client'

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  BriefcaseBusiness,
  LineChart,
  ShieldCheck,
  MessageCircle,
  Star,
  MapPin,
  Clock3,
  Shield,
  CheckCircle2,
  TrendingUp,
  ArrowRight,
  Zap,
  Globe,
  Check,
} from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import { localeLabels } from '@/i18n';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export default function LandingPage() {
  const { t, locale, setLocale } = useI18n();
  return (
    <div className="app-surface min-h-screen antialiased transition-colors duration-300">

      {/* NAVIGATION */}
      <nav className="glass-nav sticky top-0 z-50">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-blue-600 shadow-md">
              <BriefcaseBusiness className="h-4 w-4 text-white" />
            </div>
            <span className="text-lg font-extrabold tracking-tight gradient-text">HyperLocal Jobs</span>
          </div>
          <div className="hidden items-center gap-8 md:flex">
            {([['landing.nav.features','#features'],['landing.nav.howItWorks','#how-it-works'],['landing.nav.safety','#safety']] as [string,string][]).map(([labelKey,href]) => (
              <Link key={labelKey} href={href} className="text-sm font-medium text-foreground/65 transition-colors hover:text-foreground" suppressHydrationWarning>
                {t(labelKey as any)}
              </Link>
            ))}
          </div>
          <div className="flex items-center gap-3">
            {/* Language Selector */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2" suppressHydrationWarning>
                  <Globe className="h-4 w-4" />
                  <span className="hidden sm:inline">{locale.toUpperCase()}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {(['en', 'hi', 'te'] as const).map((code) => (
                  <DropdownMenuItem
                    key={code}
                    onClick={() => setLocale(code)}
                    className="flex items-center justify-between cursor-pointer"
                  >
                    <span>{localeLabels[code]}</span>
                    {locale === code && <Check className="h-4 w-4" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex" suppressHydrationWarning>
              <Link href="/login">{t('landing.nav.login')}</Link>
            </Button>
            <Button asChild size="sm" className="glow-primary border-0 bg-gradient-to-r from-emerald-500 to-blue-600 px-5 text-white hover:from-emerald-600 hover:to-blue-700" suppressHydrationWarning>
              <Link href="/signup">{t('landing.nav.getStarted')}</Link>
            </Button>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section className="relative overflow-hidden pb-20 pt-24 lg:pt-36">
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div className="animate-orb-1 absolute left-[8%] top-[15%] h-[480px] w-[480px] rounded-full bg-emerald-400/20 blur-3xl dark:bg-emerald-600/10" />
          <div className="animate-orb-2 absolute right-[6%] top-[5%]  h-[420px] w-[420px] rounded-full bg-blue-500/18 blur-3xl dark:bg-blue-700/10" />
          <div className="animate-orb-3 absolute bottom-[5%] left-[40%] h-[320px] w-[320px] rounded-full bg-indigo-400/14 blur-3xl dark:bg-indigo-600/08" />
        </div>

        <div className="mx-auto max-w-5xl px-4 text-center sm:px-6 lg:px-8">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-200/70 bg-white/70 px-4 py-1.5 text-sm font-semibold text-emerald-700 shadow-sm backdrop-blur-sm dark:border-emerald-700/40 dark:bg-slate-900/60 dark:text-emerald-400" suppressHydrationWarning>
            <Sparkles className="h-3.5 w-3.5" />
            {t('landing.hero.badge')}
          </div>
          <h1 className="mb-6 text-5xl font-extrabold leading-[1.06] tracking-tight md:text-7xl" suppressHydrationWarning>
            {t('landing.hero.title1')}<br />
            <span className="gradient-text">{t('landing.hero.title2')}</span>
          </h1>
          <p className="mx-auto mb-10 max-w-xl text-lg leading-relaxed text-foreground/60 md:text-xl" suppressHydrationWarning>
            {t('landing.hero.subtitle')}
          </p>
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Button asChild size="lg" className="glow-primary w-full border-0 bg-gradient-to-r from-emerald-500 to-blue-600 px-8 text-white hover:from-emerald-600 hover:to-blue-700 sm:w-auto" suppressHydrationWarning>
              <Link href="/signup?role=worker" className="flex items-center gap-2">
                {t('landing.hero.findJobs')} <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="glass w-full border-white/50 px-8 sm:w-auto dark:border-white/10" suppressHydrationWarning>
              <Link href="/signup?role=employer">{t('landing.hero.postJob')}</Link>
            </Button>
          </div>
          <p className="mt-5 text-sm text-foreground/40" suppressHydrationWarning>{t('landing.hero.community')}</p>
        </div>

        {/* Floating stat cards */}
        <div className="mx-auto mt-16 max-w-3xl px-4 sm:px-6">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {([['10,000+','landing.stats.activeUsers'],['5,000+','landing.stats.jobsPosted'],['95%','landing.stats.paymentSuccess'],['4.8★','landing.stats.avgRating']] as [string,string][]).map(([val,labelKey]) => (
              <div key={labelKey} className="glass-card rounded-2xl p-5 text-center">
                <div className="text-2xl font-extrabold gradient-text md:text-3xl">{val}</div>
                <div className="mt-1.5 text-xs font-semibold uppercase tracking-widest text-foreground/50" suppressHydrationWarning>{t(labelKey as any)}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="py-20 lg:py-28" id="features">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-14 text-center">
            <span className="inline-flex items-center rounded-full border border-primary/25 bg-primary/5 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-primary" suppressHydrationWarning>{t('landing.features.badge')}</span>
            <h2 className="mt-5 text-4xl font-extrabold tracking-tight md:text-5xl" suppressHydrationWarning>
              {t('landing.features.title').split('HyperLocal Jobs?')[0]}<span className="gradient-text">HyperLocal Jobs?</span>
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-foreground/55 md:text-lg" suppressHydrationWarning>
              {t('landing.features.subtitle')}
            </p>
          </div>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {[
              {icon:LineChart,  titleKey:'landing.features.aiMatching',  descKey:'landing.features.aiMatchingDesc',grad:'from-blue-500 to-cyan-500',   bg:'bg-blue-500/10',   color:'text-blue-600 dark:text-blue-400'},
              {icon:ShieldCheck,titleKey:'landing.features.escrow',        descKey:'landing.features.escrowDesc',             grad:'from-emerald-500 to-teal-500',bg:'bg-emerald-500/10',color:'text-emerald-600 dark:text-emerald-400'},
              {icon:MessageCircle,titleKey:'landing.features.chat',       descKey:'landing.features.chatDesc',                      grad:'from-violet-500 to-indigo-500',bg:'bg-violet-500/10', color:'text-violet-600 dark:text-violet-400'},
              {icon:Star,       titleKey:'landing.features.trustScore',   descKey:'landing.features.trustScoreDesc',                   grad:'from-amber-500 to-orange-500',bg:'bg-amber-500/10',  color:'text-amber-600 dark:text-amber-400'},
              {icon:MapPin,     titleKey:'landing.features.hyperlocal',     descKey:'landing.features.hyperlocalDesc',                          grad:'from-orange-500 to-rose-500', bg:'bg-orange-500/10', color:'text-orange-600 dark:text-orange-400'},
              {icon:Clock3,     titleKey:'landing.features.flexible',        descKey:'landing.features.flexibleDesc',                        grad:'from-cyan-500 to-sky-500',    bg:'bg-cyan-500/10',   color:'text-cyan-600 dark:text-cyan-400'},
            ].map(f => (
              <div key={f.titleKey} className="glass-card group overflow-hidden rounded-2xl transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
                <div className={`h-1 w-full bg-gradient-to-r ${f.grad}`} />
                <div className="p-6">
                  <div className={`mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl ${f.bg} ${f.color}`}>
                    <f.icon className="h-5 w-5" />
                  </div>
                  <h3 className="mb-2 text-lg font-bold" suppressHydrationWarning>{t(f.titleKey as any)}</h3>
                  <p className="text-sm leading-relaxed text-foreground/58" suppressHydrationWarning>{t(f.descKey as any)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="py-20 lg:py-28" id="how-it-works">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-14 text-center">
            <h2 className="text-4xl font-extrabold tracking-tight md:text-5xl" suppressHydrationWarning>{t('landing.howItWorks.title').split(' Works')[0]}<span className="gradient-text"> {t('landing.howItWorks.title').includes('Works') ? 'Works' : t('landing.howItWorks.title').split(' ').slice(-1)}</span></h2>
            <p className="mt-3 text-base text-foreground/55" suppressHydrationWarning>{t('landing.howItWorks.subtitle')}</p>
          </div>
          <div className="grid gap-8 lg:grid-cols-2 lg:gap-10">
            <div className="glass-card rounded-3xl p-8">
              <h3 className="mb-7 flex items-center gap-2.5 text-xl font-bold text-emerald-600 dark:text-emerald-400" suppressHydrationWarning>
                <Zap className="h-5 w-5" /> {t('landing.howItWorks.forWorkers')}
              </h3>
              <div className="space-y-5">
                {(['landing.howItWorks.w1','landing.howItWorks.w2','landing.howItWorks.w3','landing.howItWorks.w4','landing.howItWorks.w5'] as const).map((titleKey,i) => (
                  <div key={titleKey} className="flex items-start gap-4">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 text-sm font-bold text-white shadow-sm">{i+1}</div>
                    <div><p className="font-semibold" suppressHydrationWarning>{t(titleKey)}</p><p className="text-sm text-foreground/55" suppressHydrationWarning>{t(`${titleKey}Desc` as any)}</p></div>
                  </div>
                ))}
              </div>
            </div>
            <div className="glass-card rounded-3xl p-8">
              <h3 className="mb-7 flex items-center gap-2.5 text-xl font-bold text-blue-600 dark:text-blue-400" suppressHydrationWarning>
                <BriefcaseBusiness className="h-5 w-5" /> {t('landing.howItWorks.forEmployers')}
              </h3>
              <div className="space-y-5">
                {(['landing.howItWorks.e1','landing.howItWorks.e2','landing.howItWorks.e3','landing.howItWorks.e4','landing.howItWorks.e5'] as const).map((titleKey,i) => (
                  <div key={titleKey} className="flex items-start gap-4">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 text-sm font-bold text-white shadow-sm">{i+1}</div>
                    <div><p className="font-semibold" suppressHydrationWarning>{t(titleKey)}</p><p className="text-sm text-foreground/55" suppressHydrationWarning>{t(`${titleKey}Desc` as any)}</p></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SAFETY */}
      <section className="py-20 lg:py-28" id="safety">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-14 text-center">
            <div className="mb-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10">
              <Shield className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h2 className="text-4xl font-extrabold tracking-tight md:text-5xl" suppressHydrationWarning>
              {t('landing.safety.title').split('Our Priority')[0]}<span className="gradient-text">{t('landing.safety.title').includes('Priority') ? 'Our Priority' : t('landing.safety.title').split(' ').slice(-2).join(' ')}</span>
            </h2>
            <p className="mt-3 text-base text-foreground/55" suppressHydrationWarning>{t('landing.safety.subtitle')}</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {(['landing.safety.s1','landing.safety.s2','landing.safety.s3','landing.safety.s4','landing.safety.s5','landing.safety.s6'] as const).map((key, idx) => {
              const colors = ['text-blue-600 dark:text-blue-400','text-emerald-600 dark:text-emerald-400','text-violet-600 dark:text-violet-400','text-orange-600 dark:text-orange-400','text-cyan-600 dark:text-cyan-400','text-pink-600 dark:text-pink-400'];
              return (
                <div key={key} className="glass-card flex items-start gap-4 rounded-2xl p-5">
                  <CheckCircle2 className={`mt-0.5 h-5 w-5 shrink-0 ${colors[idx]}`} />
                  <div>
                    <h4 className="mb-1 font-semibold" suppressHydrationWarning>{t(key)}</h4>
                    <p className="text-sm leading-relaxed text-foreground/55" suppressHydrationWarning>{t(`${key}Desc` as any)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 lg:py-28">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-500 via-teal-500 to-blue-600 p-12 text-center text-white shadow-2xl shadow-emerald-500/25">
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              <div className="absolute right-0 top-0 h-56 w-56 translate-x-1/2 -translate-y-1/2 rounded-full bg-white/12 blur-3xl" />
              <div className="absolute bottom-0 left-0 h-56 w-56 -translate-x-1/2 translate-y-1/2 rounded-full bg-white/12 blur-3xl" />
            </div>
            <div className="relative z-10">
              <TrendingUp className="mx-auto mb-5 h-12 w-12 opacity-90" />
              <h2 className="mb-4 text-3xl font-extrabold tracking-tight md:text-4xl" suppressHydrationWarning>{t('landing.cta.title')}</h2>
              <p className="mx-auto mb-8 max-w-lg text-lg opacity-85" suppressHydrationWarning>
                {t('landing.cta.subtitle')}
              </p>
              <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
                <Button asChild size="lg" className="w-full bg-white px-8 font-bold text-emerald-600 shadow-lg hover:bg-white/90 sm:w-auto" suppressHydrationWarning>
                  <Link href="/signup?role=worker">{t('landing.cta.signupWorker')}</Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="w-full border-white/50 bg-white/10 px-8 text-white hover:bg-white/20 sm:w-auto" suppressHydrationWarning>
                  <Link href="/signup?role=employer">{t('landing.cta.signupEmployer')}</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="glass-nav border-t py-8 md:py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8 md:mb-10">
            {/* Logo and Tagline - Full Width on Mobile */}
            <div className="mb-6 md:mb-8">
              <div className="mb-3 flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-blue-600">
                  <BriefcaseBusiness className="h-4 w-4 text-white" />
                </div>
                <span className="font-bold gradient-text">HyperLocal Jobs</span>
              </div>
              <p className="text-sm leading-relaxed text-foreground/50 max-w-md" suppressHydrationWarning>{t('landing.footer.tagline')}</p>
            </div>
            
            {/* Links Grid - Better Mobile Layout */}
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-3 md:gap-8">
              {([
                [t('landing.footer.forWorkers'),[[t('landing.footer.findJobs'),'/signup?role=worker'],[t('landing.nav.howItWorks'),'#how-it-works'],[t('landing.footer.safetyTips'),'#safety']]],
                [t('landing.footer.forEmployers'),[[t('landing.footer.postJobs'),'/signup?role=employer'],[t('pricing.title'),'/pricing'],[t('guidelines.title'),'/guidelines']]],
                [t('landing.footer.support'),[[t('help.title'),'/help-center'],[t('contact.title'),'/contact'],['Terms','/terms'],['Privacy','/privacy']]],
              ] as [string,[string,string][]][]).map(([heading,links]) => (
                <div key={heading}>
                  <h4 className="mb-3 text-sm font-bold" suppressHydrationWarning>{heading}</h4>
                  <ul className="space-y-2">
                    {links.map(([label,href]) => (
                      <li key={label}><Link href={href} className="text-sm text-foreground/50 transition-colors hover:text-primary" suppressHydrationWarning>{label}</Link></li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
          <div className="border-t border-border/40 pt-6 text-center">
            <p className="text-xs text-foreground/35" suppressHydrationWarning>{t('landing.footer.copyright')}</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
