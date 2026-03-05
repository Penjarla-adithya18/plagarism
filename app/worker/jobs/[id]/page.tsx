'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import WorkerNav from '@/components/worker/WorkerNav'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'
import { applicationOps, db, jobOps, reportOps, notificationOps, userOps, workerProfileOps } from '@/lib/api'
import { Job, User, Application, WorkerProfile } from '@/lib/types'
import { calculateMatchScore, explainJobMatch, generateMatchExplanationWithAI } from '@/lib/aiMatching'
import { translateDynamic, SupportedLocale } from '@/lib/gemini'
import { 
  Briefcase, MapPin, Clock, IndianRupee, Calendar, 
  Building2, Star, Shield, ChevronLeft, Send, CheckCircle2, Sparkles, AlertTriangle, Flag, MessageCircle, FileText, Upload, Loader2, X
} from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { useI18n } from '@/contexts/I18nContext'
import { Skeleton } from '@/components/ui/skeleton'

export default function JobDetailsPage() {
  const router = useRouter()
  const params = useParams()
  const { user, loading: authLoading } = useAuth()
  const { toast } = useToast()
  const { t, locale } = useI18n()
  const [job, setJob] = useState<Job | null>(null)
  const [employer, setEmployer] = useState<User | null>(null)
  const [application, setApplication] = useState<Application | null>(null)
  const [workerProfile, setWorkerProfile] = useState<WorkerProfile | null>(null)
  const [matchScore, setMatchScore] = useState<number | null>(null)
  const [matchExplanation, setMatchExplanation] = useState<string | null>(null)
  // Translated title/description for non-English locales
  const [displayTitle, setDisplayTitle] = useState<string | null>(null)
  const [displayDescription, setDisplayDescription] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [applying, setApplying] = useState(false)
  const [showApplicationForm, setShowApplicationForm] = useState(false)
  const [coverLetter, setCoverLetter] = useState('')
  // Report job state
  const [reportOpen, setReportOpen] = useState(false)
  const [reportReason, setReportReason] = useState('fake_job')
  const [reportDesc, setReportDesc] = useState('')
  const [submittingReport, setSubmittingReport] = useState(false)
  const [isReported, setIsReported] = useState(false)
  // Resume for application
  const [resumeFile, setResumeFile] = useState<File | null>(null)
  const [resumeUploading, setResumeUploading] = useState(false)

  // Load reported state from localStorage
  useEffect(() => {
    if (user && params.id) {
      const key = `reported_jobs_${user.id}`
      const stored = localStorage.getItem(key)
      if (stored) {
        const ids: string[] = JSON.parse(stored)
        setIsReported(ids.includes(params.id as string))
      }
    }
  }, [user, params.id])

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      setLoading(false)
      router.replace('/login')
      return
    }
    loadJobDetails()
  }, [params.id, user, authLoading, router])

  // Translate job title + description when locale changes (hi/te)
  useEffect(() => {
    if (!job || locale === 'en') {
      setDisplayTitle(null)
      setDisplayDescription(null)
      return
    }
    const titleKey = `ai_title_${job.id}_${locale}`
    const descKey  = `ai_desc_${job.id}_${locale}`
    const cachedTitle = sessionStorage.getItem(titleKey)
    const cachedDesc  = sessionStorage.getItem(descKey)
    if (cachedTitle && cachedDesc) {
      setDisplayTitle(cachedTitle)
      setDisplayDescription(cachedDesc)
      return
    }
    let cancelled = false
    const lang = locale as SupportedLocale
    Promise.all([
      translateDynamic(job.title, lang).catch(() => job.title),
      translateDynamic(job.description, lang).catch(() => job.description),
    ]).then(([title, desc]) => {
      if (!cancelled) {
        setDisplayTitle(title)
        setDisplayDescription(desc)
        sessionStorage.setItem(titleKey, title)
        sessionStorage.setItem(descKey,  desc)
      }
    })
    return () => { cancelled = true }
  }, [job, locale])

  const loadJobDetails = async () => {
    try {
      const jobData = await jobOps.findById(params.id as string)
      if (jobData) {
        setJob(jobData)
        const employerData = await userOps.findById(jobData.employerId)
        setEmployer(employerData)

        if (user) {
          const [workerApplications, profile] = await Promise.all([
            applicationOps.findByWorkerId(user.id),
            workerProfileOps.findByUserId(user.id).catch(() => null),
          ])
          const existingApplication = workerApplications
            .find(app => app.jobId === jobData.id)
          setApplication(existingApplication || null)
          if (profile) {
            setWorkerProfile(profile)
            const score = calculateMatchScore(profile, jobData)
            setMatchScore(score)
            // sessionStorage cache — avoids re-calling Gemini on every navigation
            const expCacheKey = `ai_exp_${jobData.id}_${user?.id}`
            const cachedExp = sessionStorage.getItem(expCacheKey)
            if (cachedExp) {
              setMatchExplanation(cachedExp)
            } else {
              // Show deterministic explanation immediately, then upgrade with Gemini
              setMatchExplanation(explainJobMatch(profile, jobData, score))
              generateMatchExplanationWithAI(profile, jobData, score)
                .then((exp) => {
                  if (exp) {
                    setMatchExplanation(exp)
                    sessionStorage.setItem(expCacheKey, exp)
                  }
                })
                .catch(() => { /* deterministic fallback already shown */ })
            }
          }
        }
      }
    } catch (error) {
      if (error instanceof Error && error.message.toLowerCase().includes('unauthorized')) {
        toast({
          title: t('worker.jobDetails.sessionExpired'),
          description: t('worker.jobDetails.sessionExpiredDesc'),
          variant: 'destructive',
        })
        router.replace('/login')
        return
      }
      toast({
        title: t('worker.jobDetails.error'),
        description: t('worker.jobDetails.errorDesc'),
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  const handleApply = async () => {
    if (!user || !job) return

    // Duplicate application guard (in case state is stale)
    if (application) {
      toast({ title: t('worker.jobDetails.alreadyApplied'), description: t('worker.jobDetails.alreadyAppliedDesc') })
      return
    }

    setApplying(true)

    // ── Attach resume as data URL (no AI parsing) ─────────────────────────────
    let attachedResumeUrl: string | undefined = workerProfile?.resumeUrl
    if (resumeFile) {
      setResumeUploading(true)
      try {
        attachedResumeUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = (ev) => resolve(ev.target?.result as string)
          reader.onerror = reject
          reader.readAsDataURL(resumeFile)
        })
      } catch {
        toast({
          title: t('worker.jobDetails.resumeNote'),
          description: t('worker.jobDetails.resumeNoteDesc'),
        })
      } finally {
        setResumeUploading(false)
      }
    }

    try {
      const newApplication = await db.createApplication({
        jobId: job.id,
        workerId: user.id,
        coverLetter: coverLetter.trim() || undefined,
        resumeUrl: attachedResumeUrl,
        status: 'pending',
        matchScore: matchScore ?? 0,
      })

      setApplication(newApplication)
      setShowApplicationForm(false)

      // Create a conversation so employer can chat with the worker
      await db.createConversation({
        workerId: user.id,
        employerId: job.employerId,
        jobId: job.id,
        applicationId: newApplication.id,
        participants: [user.id, job.employerId]
      }).catch(() => {})

      // Notify employer about new application
      try {
        await notificationOps.create({
          userId: job.employerId,
          type: 'application',
          title: 'New Application Received!',
          message: `${user.fullName} applied for "${job.title}" with ${matchScore ?? 0}% match score.`,
          isRead: false,
          link: `/employer/jobs/${job.id}`,
        })
      } catch (e) { console.error('Notification failed', e) }

      toast({
        title: t('worker.jobDetails.success'),
        description: t('worker.jobDetails.successDesc'),
      })
    } catch (error) {
      toast({
        title: t('worker.jobDetails.error'),
        description: t('worker.jobDetails.errorDesc'),
        variant: 'destructive'
      })
    } finally {
      setApplying(false)
    }
  }

  const handleReportJob = async () => {
    if (!user || !job) return
    setSubmittingReport(true)
    try {
      await reportOps.create({
        reporterId: user.id,
        reportedJobId: job.id,
        type: 'fake_job',
        reason: reportReason,
        description: reportDesc || reportReason,
        status: 'pending',
      })
      toast({ title: t('worker.jobDetails.reportSubmitted'), description: t('worker.jobDetails.reportSubmittedDesc') })
      setReportOpen(false)
      setReportDesc('')
      setIsReported(true)
      // Persist reported state so the job stays marked even after navigation
      if (user && job) {
        const key = `reported_jobs_${user.id}`
        const stored = localStorage.getItem(key)
        const ids: string[] = stored ? JSON.parse(stored) : []
        if (!ids.includes(job.id)) {
          localStorage.setItem(key, JSON.stringify([...ids, job.id]))
        }
      }
    } catch {
      toast({ title: t('worker.jobDetails.reportFailed'), variant: 'destructive' })
    } finally {
      setSubmittingReport(false)
    }
  }

  if (loading) {
    return (
      <div className="app-surface">
        <WorkerNav />
        <div className="container mx-auto px-4 py-6 pb-28 md:pb-8 max-w-4xl">
          <Skeleton className="h-4 w-24 mb-6" />
          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div className="space-y-2 flex-1">
                      <Skeleton className="h-7 w-56" />
                      <div className="flex gap-2">
                        <Skeleton className="h-5 w-20 rounded-full" />
                        <Skeleton className="h-5 w-24 rounded-full" />
                      </div>
                    </div>
                    <Skeleton className="h-8 w-28 rounded-md" />
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-4 w-36" />)}
                  </div>
                  <Skeleton className="h-px w-full" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-20 w-full" />
                  <div className="flex gap-2 flex-wrap">
                    {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-6 w-20 rounded-full" />)}
                  </div>
                </CardContent>
              </Card>
            </div>
            <div className="space-y-4">
              <Card>
                <CardContent className="pt-6 space-y-3">
                  {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-4 w-full" />)}
                  <Skeleton className="h-10 w-full rounded-md" />
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!job) {
    return (
      <div className="app-surface">
        <WorkerNav />
        <div className="container mx-auto px-4 py-8">
          <Card>
            <CardContent className="py-12 text-center">
              <h3 className="text-lg font-semibold mb-2" suppressHydrationWarning>{t('worker.jobDetails.jobNotFound')}</h3>
              <Button onClick={() => router.push('/worker/jobs')}>
                {t('worker.jobDetails.browseJobs')}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="app-surface">
      <WorkerNav />
      
      <main className="container mx-auto px-4 py-8 max-w-5xl">
        <Button
          variant="ghost"
          className="mb-6"
          onClick={() => router.back()}
        >
          <ChevronLeft className="h-4 w-4 mr-2" />
          {t('worker.jobDetails.backToJobs')}
        </Button>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <div className="mb-4 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-start">
                  <div>
                    <CardTitle className="mb-2 text-xl sm:text-2xl">{displayTitle || job.title}</CardTitle>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Building2 className="h-4 w-4" />
                      <span suppressHydrationWarning>{employer?.companyName || t('worker.jobDetails.company')}</span>
                    </div>
                  </div>
                  <Badge variant={job.status === 'active' ? 'default' : 'outline'}>
                    {job.status}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-2">
                  {job.requiredSkills.map((skill) => (
                    <Badge key={skill} variant="secondary">{skill}</Badge>
                  ))}
                  {job.jobMode && (
                    <Badge variant={job.jobMode === 'remote' ? 'default' : 'outline'} className={job.jobMode === 'remote' ? 'bg-blue-600' : ''} suppressHydrationWarning>
                      {job.jobMode === 'remote' ? `🏠 ${t('worker.jobDetails.remote')}` : `📍 ${t('worker.jobDetails.onsite')}`}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <IndianRupee className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground" suppressHydrationWarning>{t('worker.jobDetails.payment')}</p>
                      <p className="font-semibold" suppressHydrationWarning>₹{job.payAmount}/{job.payType === 'hourly' ? t('worker.jobDetails.hourly') : t('worker.jobDetails.fixed')}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <MapPin className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground" suppressHydrationWarning>{t('worker.jobDetails.location')}</p>
                      <p className="font-semibold">{job.location}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Clock className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground" suppressHydrationWarning>{t('worker.jobDetails.duration')}</p>
                      <p className="font-semibold">{job.duration}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Briefcase className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground" suppressHydrationWarning>{t('worker.jobDetails.experience')}</p>
                      <p className="font-semibold capitalize">{job.experienceRequired}</p>
                    </div>
                  </div>
                </div>

                {job.escrowRequired && (
                  <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 rounded-lg">
                    <Shield className="h-5 w-5 text-green-600 dark:text-green-400" />
                    <span className="text-sm text-green-700 dark:text-green-300" suppressHydrationWarning>
                      {t('worker.jobDetails.escrowSecured')}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle suppressHydrationWarning>{t('worker.jobDetails.description')}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground whitespace-pre-line">{displayDescription || job.description}</p>
              </CardContent>
            </Card>

            {job.requirements && (
              <Card>
                <CardHeader>
                  <CardTitle suppressHydrationWarning>{t('worker.jobDetails.requirements')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground whitespace-pre-line">{job.requirements}</p>
                </CardContent>
              </Card>
            )}

            {job.benefits && (
              <Card>
                <CardHeader>
                  <CardTitle suppressHydrationWarning>{t('worker.jobDetails.benefits')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground whitespace-pre-line">{job.benefits}</p>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="space-y-6">
            {matchScore !== null && (
              <Card className={`border-2 ${matchScore >= 70 ? 'border-green-300 bg-green-50/50' : matchScore >= 40 ? 'border-blue-200 bg-blue-50/50' : 'border-border'}`}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base" suppressHydrationWarning>
                    <Sparkles className="w-5 h-5 text-primary" /> {t('worker.jobDetails.aiMatchAnalysis')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 bg-muted rounded-full h-3 overflow-hidden">
                      <div
                        className={`h-3 rounded-full transition-all ${matchScore >= 70 ? 'bg-green-500' : matchScore >= 40 ? 'bg-blue-500' : 'bg-amber-500'}`}
                        style={{ width: `${matchScore}%` }}
                      />
                    </div>
                    <span className={`text-lg font-bold ${matchScore >= 70 ? 'text-green-700' : matchScore >= 40 ? 'text-blue-700' : 'text-amber-600'}`}>
                      {matchScore}%
                    </span>
                  </div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide" suppressHydrationWarning>
                    {matchScore >= 70 ? `🌟 ${t('worker.jobDetails.strongMatch')}` : matchScore >= 40 ? `👍 ${t('worker.jobDetails.goodMatch')}` : `📋 ${t('worker.jobDetails.possibleMatch')}`}
                  </p>
                  {matchExplanation && (
                    <p className="text-sm text-muted-foreground leading-relaxed border-l-2 border-primary/30 pl-3">
                      {matchExplanation}
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            {employer && (
              <Card>
                <CardHeader>
                  <CardTitle suppressHydrationWarning>{t('worker.jobDetails.aboutEmployer')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-12 w-12">
                      <AvatarFallback className="bg-primary text-primary-foreground">
                        {employer.companyName?.charAt(0) || 'E'}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-semibold">{employer.companyName}</p>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                        <span suppressHydrationWarning>{employer.trustScore.toFixed(1)} {t('worker.jobDetails.trustScore')}</span>
                      </div>
                    </div>
                  </div>
                  {employer.companyDescription && (
                    <p className="text-sm text-muted-foreground">{employer.companyDescription}</p>
                  )}
                </CardContent>
              </Card>
            )}

            {application ? (
              <Card>
                <CardHeader>
                  <CardTitle suppressHydrationWarning>{t('worker.jobDetails.yourApplication')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                    <span className="font-medium" suppressHydrationWarning>{t('worker.jobDetails.applicationSubmitted')}</span>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-2" suppressHydrationWarning>{t('worker.jobDetails.status')}</p>
                    <Badge variant={
                      application.status === 'accepted' ? 'default' :
                      application.status === 'rejected' ? 'destructive' :
                      'secondary'
                    }>
                      {application.status}
                    </Badge>
                  </div>
                  {application.coverLetter && (
                    <div>
                      <p className="text-sm text-muted-foreground mb-2" suppressHydrationWarning>{t('worker.jobDetails.coverLetter')}</p>
                      <div className="rounded-md border bg-muted/40 p-3">
                        <p className="text-sm leading-6 whitespace-pre-wrap break-words">{application.coverLetter}</p>
                      </div>
                    </div>
                  )}
                  <Button
                    className="w-full mt-4"
                    variant="outline"
                    onClick={() => {
                      // Set sessionStorage so worker chat page opens the right conversation
                      if (application) {
                        sessionStorage.setItem('targetChatConvId', application.id)
                        sessionStorage.setItem('targetChatEmployerId', job!.employerId)
                        sessionStorage.setItem('targetChatJobId', job!.id)
                      }
                      router.push('/worker/chat')
                    }}
                  >
                    <MessageCircle className="h-4 w-4 mr-2" />
                    {t('worker.jobDetails.messageEmployer')}
                  </Button>
                </CardContent>
              </Card>
            ) : showApplicationForm ? (
              <Card>
                <CardHeader>
                  <CardTitle suppressHydrationWarning>{t('worker.jobDetails.applyForJob')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="coverLetter" suppressHydrationWarning>{t('worker.jobDetails.coverLetterOptional')}</Label>
                    <Textarea
                      id="coverLetter"
                      placeholder={t('worker.jobDetails.coverLetterPlaceholder')}
                      rows={6}
                      value={coverLetter}
                      onChange={(e) => setCoverLetter(e.target.value)}
                    />
                    <p className="text-xs leading-5 text-muted-foreground text-left" suppressHydrationWarning>
                      {t('worker.jobDetails.coverLetterHint')}
                    </p>
                  </div>

                  {/* Resume Upload */}
                  <div className="space-y-2">
                    <Label suppressHydrationWarning>{t(job?.jobNature === 'technical' ? 'worker.jobDetails.resumeRecommended' : 'worker.jobDetails.resumeOptional')}</Label>
                    {resumeFile ? (
                      <div className="flex items-center gap-3 rounded-md border bg-muted/30 px-3 py-2">
                        <FileText className="h-5 w-5 text-green-600 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{resumeFile.name}</p>
                          <p className="text-xs text-muted-foreground">{(resumeFile.size / (1024 * 1024)).toFixed(1)} MB</p>
                        </div>
                        <Button type="button" variant="ghost" size="sm" onClick={() => setResumeFile(null)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : workerProfile?.resumeUrl ? (
                      <div className="flex items-center gap-3 rounded-md border bg-green-50 dark:bg-green-950/30 px-3 py-2">
                        <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
                        <div className="flex-1">
                          <p className="text-sm font-medium" suppressHydrationWarning>{t('worker.jobDetails.resumeAttached')}</p>
                          <p className="text-xs text-muted-foreground" suppressHydrationWarning>{t('worker.jobDetails.resumeReplace')}</p>
                        </div>
                        <input type="file" accept=".pdf,.doc,.docx,.txt" id="app-resume-input" className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f && f.size <= 5 * 1024 * 1024) setResumeFile(f);
                            else if (f) toast({ title: t('worker.jobDetails.fileTooLarge'), description: t('worker.jobDetails.fileTooLargeDesc'), variant: 'destructive' });
                          }}
                        />
                        <label htmlFor="app-resume-input">
                          <Button type="button" variant="outline" size="sm" asChild>
                            <span className="cursor-pointer">{t('worker.jobDetails.replace')}</span>
                          </Button>
                        </label>
                      </div>
                    ) : (
                      <div>
                        <input type="file" accept=".pdf,.doc,.docx,.txt" id="app-resume-input" className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f && f.size <= 5 * 1024 * 1024) setResumeFile(f);
                            else if (f) toast({ title: t('worker.jobDetails.fileTooLarge'), description: t('worker.jobDetails.fileTooLargeDesc'), variant: 'destructive' });
                          }}
                        />
                        <label htmlFor="app-resume-input">
                          <Button type="button" variant="outline" size="sm" asChild>
                            <span className="cursor-pointer flex items-center gap-1.5">
                              <Upload className="w-4 h-4" />
                              {t('worker.jobDetails.uploadResume')}
                            </span>
                          </Button>
                        </label>
                        <p className="text-xs text-muted-foreground mt-1" suppressHydrationWarning>{t('worker.jobDetails.resumeFormat')}</p>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button
                      className="w-full sm:flex-1"
                      onClick={handleApply}
                      disabled={applying || resumeUploading}
                    >
                      {(applying || resumeUploading) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      {!applying && !resumeUploading && <Send className="h-4 w-4 mr-2" />}
                      {resumeUploading ? t('worker.jobDetails.parsingResume') : applying ? t('worker.jobDetails.submitting') : t('worker.jobDetails.submitApplication')}
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full sm:w-auto"
                      onClick={() => setShowApplicationForm(false)}
                    >
                      {t('worker.jobDetails.cancel')}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="pt-6 space-y-3">
                  <Button
                    className="w-full"
                    size="lg"
                    onClick={() => setShowApplicationForm(true)}
                    disabled={job.status !== 'active'}
                  >
                    {t('worker.jobDetails.applyNow')}
                  </Button>
                  {job.status !== 'active' && (
                    <p className="text-sm text-center text-muted-foreground" suppressHydrationWarning>
                      {t('worker.jobDetails.jobInactive')}
                    </p>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className={`w-full ${isReported ? 'text-orange-500 cursor-default' : 'text-muted-foreground hover:text-destructive'}`}
                    onClick={() => !isReported && setReportOpen(true)}
                    disabled={isReported}
                  >
                    <Flag className="h-4 w-4 mr-2" />
                    <span suppressHydrationWarning>{isReported ? `✓ ${t('worker.jobDetails.jobReported')}` : t('worker.jobDetails.reportJob')}</span>
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>

      {/* Report Job Dialog */}
      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2" suppressHydrationWarning>
              <Flag className="h-5 w-5 text-destructive" />
              {t('worker.jobDetails.reportThisJob')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-sm font-medium mb-3 block" suppressHydrationWarning>{t('worker.jobDetails.reportReason')}</Label>
              <RadioGroup value={reportReason} onValueChange={setReportReason} className="space-y-2">
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="fake_job" id="rj-fake" />
                  <Label htmlFor="rj-fake" suppressHydrationWarning>{t('worker.jobDetails.reportFake')}</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="payment_issue" id="rj-pay" />
                  <Label htmlFor="rj-pay" suppressHydrationWarning>{t('worker.jobDetails.reportPayment')}</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="misleading" id="rj-mislead" />
                  <Label htmlFor="rj-mislead" suppressHydrationWarning>{t('worker.jobDetails.reportMisleading')}</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="illegal" id="rj-illegal" />
                  <Label htmlFor="rj-illegal" suppressHydrationWarning>{t('worker.jobDetails.reportIllegal')}</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="spam" id="rj-spam" />
                  <Label htmlFor="rj-spam" suppressHydrationWarning>{t('worker.jobDetails.reportSpam')}</Label>
                </div>
              </RadioGroup>
            </div>
            <div>
              <Label htmlFor="report-job-desc" className="text-sm font-medium mb-1 block" suppressHydrationWarning>
                {t('worker.jobDetails.reportDetails')} <span className="text-muted-foreground">({t('worker.jobDetails.reportDetailsOptional')})</span>
              </Label>
              <Textarea
                id="report-job-desc"
                placeholder={t('worker.jobDetails.reportPlaceholder')}
                rows={3}
                value={reportDesc}
                onChange={e => setReportDesc(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReportOpen(false)}>{t('worker.jobDetails.cancel')}</Button>
            <Button variant="destructive" onClick={handleReportJob} disabled={submittingReport}>
              {submittingReport ? t('worker.jobDetails.submittingReport') : t('worker.jobDetails.submitReport')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
