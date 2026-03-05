'use client'

import { useState, useEffect } from 'react'
import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import WorkerNav from '@/components/worker/WorkerNav'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAuth } from '@/contexts/AuthContext'
import { useI18n } from '@/contexts/I18nContext'
import { applicationOps, jobOps, workerProfileOps } from '@/lib/api'
import { getRecommendedJobs, getBasicRecommendations, matchJobs } from '@/lib/aiMatching'
import { Application, Job, User, WorkerProfile } from '@/lib/types'
import { Briefcase, MapPin, Clock, IndianRupee, Sparkles, Search, Filter, TrendingUp, Brain, Target, Route, Lightbulb, Shield } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { GeolocationPrompt } from '@/components/ui/geolocation-prompt'
import { Slider } from '@/components/ui/slider'
import { LocationInput } from '@/components/ui/location-input'
import { Skeleton } from '@/components/ui/skeleton'

export default function WorkerJobsPage() {
  const router = useRouter()
  const { user } = useAuth()
  const { t } = useI18n()
  const [jobs, setJobs] = useState<Job[]>([])
  const [matchedJobs, setMatchedJobs] = useState<Array<{ job: Job; score: number }>>([])
  const [workerProfile, setWorkerProfile] = useState<WorkerProfile | null>(null)
  const [workerCoords, setWorkerCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [searchCoords, setSearchCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [applications, setApplications] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [locationFilter, setLocationFilter] = useState('')
  const [payRange, setPayRange] = useState([0, 100000])
  const [experienceFilter, setExperienceFilter] = useState('all')
  const [jobModeFilter, setJobModeFilter] = useState('all')
  const [showGeolocationPrompt, setShowGeolocationPrompt] = useState(true)

  useEffect(() => {
    if (user) {
      loadJobs()
    }
  }, [user])

  const handleLocationGranted = (coords: { lat: number; lng: number }) => {
    setWorkerCoords(coords)
    setShowGeolocationPrompt(false)
  }

  const loadJobs = async () => {
    try {
      const [jobsResult, profileResult, appsResult] = await Promise.allSettled([
        jobOps.getAll(),
        user ? workerProfileOps.findByUserId(user.id) : Promise.resolve(null),
        user ? applicationOps.findByWorkerId(user.id) : Promise.resolve([]),
      ])

      const allJobs = jobsResult.status === 'fulfilled' ? jobsResult.value : []
      const profile = profileResult.status === 'fulfilled' ? profileResult.value : null
      const myApplications = appsResult.status === 'fulfilled' ? (appsResult.value ?? []) : []

      if (jobsResult.status === 'rejected') console.error('Failed to load jobs:', jobsResult.reason)

      const activeJobs = allJobs.filter((j) => j.status === 'active')
      setJobs(activeJobs)
      setWorkerProfile(profile)
      setApplications(myApplications)

      // Use AI matching when available, with fallback logic
      if (user) {
        try {
          const matches = await matchJobs(
            user as User,
            activeJobs,
            workerProfileOps.findByUserId
          )
          setMatchedJobs(matches)
        } catch {
          // Fallback: use local recommendation logic
          if (profile && profile.profileCompleted) {
            const recommended = getRecommendedJobs(profile, activeJobs, 50)
            setMatchedJobs(recommended.map(({ job, matchScore }) => ({ job, score: matchScore })))
          } else if (profile && profile.categories.length > 0) {
            const basic = getBasicRecommendations(profile.categories, activeJobs, 50, profile.skills || [])
            setMatchedJobs(basic.map((job) => ({ job, score: 0 })))
          } else {
            const basic = getBasicRecommendations([], activeJobs, 50)
            setMatchedJobs(basic.map((job) => ({ job, score: 0 })))
          }
        }
      }
    } catch (error) {
      console.error('Failed to load jobs:', error)
      const msg = error instanceof Error ? error.message : ''
      if (msg.includes('401') || msg.includes('Unauthorized') || msg.includes('session')) {
        setAuthError(true)
      }
    } finally {
      setLoading(false)
    }
  }

  // ── Distance helpers (must be before useMemo blocks that use them) ──────
  const activeCoords = workerCoords ?? searchCoords

  const getDistanceKm = (job: Job): number | null => {
    if (!activeCoords || job.latitude === undefined || job.longitude === undefined) return null
    const toRad = (v: number) => (v * Math.PI) / 180
    const dLat = toRad(job.latitude - activeCoords.lat)
    const dLng = toRad(job.longitude - activeCoords.lng)
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(activeCoords.lat)) * Math.cos(toRad(job.latitude)) * Math.sin(dLng / 2) ** 2
    return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  }

  const getDistanceText = (job: Job) => {
    const km = getDistanceKm(job)
    if (km === null) return null
    return km < 1 ? `${Math.round(km * 1000)} ${t('worker.jobs.mAway')}` : `${km.toFixed(1)} ${t('worker.jobs.kmAway')}`
  }

  const isProfileReady = useMemo(() => {
    if (!workerProfile) return false
    return Boolean(
      workerProfile.skills.length > 0 &&
      workerProfile.categories.length > 0 &&
      workerProfile.availability &&
      workerProfile.experience &&
      workerProfile.location
    )
  }, [workerProfile])

  const filteredJobs = useMemo(() => jobs.filter(job => {
    const q = searchQuery.toLowerCase()
    const matchesSearch =
      job.title.toLowerCase().includes(q) ||
      job.description.toLowerCase().includes(q) ||
      job.requiredSkills.some(skill => skill.toLowerCase().includes(q))
    
    const matchesCategory = categoryFilter === 'all' || job.category === categoryFilter
    const matchesLocation = !locationFilter || job.location.toLowerCase().includes(locationFilter.toLowerCase())
    
    const jobPay = job.payAmount || job.pay || 0
    const matchesPay = jobPay >= payRange[0] && jobPay <= payRange[1]
    
    const matchesExperience = experienceFilter === 'all' || job.experienceRequired === experienceFilter
    const matchesJobMode = jobModeFilter === 'all' || job.jobMode === jobModeFilter

    return matchesSearch && matchesCategory && matchesLocation && matchesPay && matchesExperience && matchesJobMode
  }), [jobs, searchQuery, categoryFilter, locationFilter, payRange, experienceFilter, jobModeFilter])

  // Escrow-backed jobs get a small boost (+5) in effective score so they rank higher.
  const ESCROW_BOOST = 5
  const effectiveScore = (m: { job: Job; score: number }) =>
    m.score + (m.job.escrowRequired !== false ? ESCROW_BOOST : 0)

  const filteredMatchedJobs = useMemo(() => {
    const allowedJobIds = new Set(filteredJobs.map((job) => job.id))
    return matchedJobs
      .filter((match) => allowedJobIds.has(match.job.id))
      .sort((a, b) => effectiveScore(b) - effectiveScore(a))
  }, [matchedJobs, filteredJobs])

  const topFiveMatches = useMemo(() => filteredMatchedJobs.slice(0, 5), [filteredMatchedJobs])

  // For "All Jobs" tab, sort by distance when coords available, then escrow, then recency
  const sortedFilteredJobs = useMemo(() => {
    return [...filteredJobs].sort((a, b) => {
      // Distance sort first when location coords are available
      const distA = getDistanceKm(a)
      const distB = getDistanceKm(b)
      if (distA !== null && distB !== null) return distA - distB
      if (distA !== null) return -1
      if (distB !== null) return 1
      // Escrow-backed jobs next
      const aEscrow = a.escrowRequired !== false ? 1 : 0
      const bEscrow = b.escrowRequired !== false ? 1 : 0
      if (aEscrow !== bEscrow) return bEscrow - aEscrow
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })
  }, [filteredJobs, activeCoords])

  const uniqueCategories = useMemo(() => {
    const categories = Array.from(new Set(jobs.map((job) => job.category).filter(Boolean)))
    return categories.sort((a, b) => a.localeCompare(b))
  }, [jobs])

  const missingSkills = useMemo(() => {
    if (!workerProfile) return [] as Array<{ skill: string; count: number }>
    const workerSkills = new Set(workerProfile.skills.map((skill) => skill.trim().toLowerCase()))
    const counts = new Map<string, number>()

    for (const { job } of topFiveMatches) {
      for (const skill of job.requiredSkills) {
        const normalized = skill.trim().toLowerCase()
        if (!normalized || workerSkills.has(normalized)) continue
        counts.set(skill, (counts.get(skill) || 0) + 1)
      }
    }

    return Array.from(counts.entries())
      .map(([skill, count]) => ({ skill, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6)
  }, [workerProfile, topFiveMatches])

  const aiInsights = useMemo(() => {
    const insights: Array<{ title: string; desc: string; color: string }> = []

    if (!isProfileReady) {
      insights.push({
        title: t('worker.jobs.insightCompleteProfile'),
        desc: t('worker.jobs.insightCompleteProfileDesc'),
        color: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100',
      })
    }

    insights.push({
      title: topFiveMatches.length >= 5 ? t('worker.jobs.insightKeepItUp') : t('worker.jobs.insightStayActive'),
      desc: topFiveMatches.length >= 5
        ? t('worker.jobs.insightKeepItUpDesc')
        : t('worker.jobs.insightStayActiveDesc'),
      color: 'border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-100',
    })

    insights.push({
      title: missingSkills.length > 0 ? t('worker.jobs.insightSkillBooster') : t('worker.jobs.insightProfileMomentum'),
      desc: missingSkills.length > 0
        ? t('worker.jobs.insightSkillBoosterDesc', { skills: missingSkills.slice(0, 2).map((s) => s.skill).join(' & ') })
        : t('worker.jobs.insightProfileMomentumDesc'),
      color: 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100',
    })

    return insights.slice(0, 3)
  }, [isProfileReady, topFiveMatches.length, missingSkills, t])

  const getMatchBadgeClass = (score: number) => {
    if (score >= 80) return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'
    if (score >= 60) return 'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200'
    if (score >= 40) return 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200'
    return 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200'
  }

  const JobCard = ({ job, matchScore }: { job: Job; matchScore?: number }) => {
    const hasApplied = applications.some(app => app.jobId === job.id)

    return (
      <Card className="hover:border-primary transition-colors">
        <CardHeader>
          <div className="flex justify-between items-start mb-3">
            <div className="flex-1">
              <CardTitle className="text-xl mb-2" suppressHydrationWarning>{job.title}</CardTitle>
              <p className="text-sm text-muted-foreground" suppressHydrationWarning>
                {t('worker.jobs.company')}
              </p>
            </div>
            {typeof matchScore === 'number' && (
              <Badge className={`gap-1 ${getMatchBadgeClass(matchScore)}`}>
                <Sparkles className="h-3 w-3" />
                <span suppressHydrationWarning>{matchScore}% {t('worker.jobs.match')}</span>
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {job.requiredSkills.slice(0, 3).map((skill) => (
              <Badge key={skill} variant="secondary">{skill}</Badge>
            ))}
            {job.requiredSkills.length > 3 && (
              <Badge variant="secondary">+{job.requiredSkills.length - 3}</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-4 line-clamp-2">{job.description}</p>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            <div className="flex items-center gap-2 text-sm">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <span className="truncate">{job.location}</span>
            </div>
            {getDistanceText(job) ? (
              <div className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 font-medium">
                <Route className="h-4 w-4 shrink-0" />
                <span className="truncate">{getDistanceText(job)}</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-muted-foreground/60">
                <Route className="h-4 w-4 shrink-0" />
                <span className="truncate text-xs" suppressHydrationWarning>{t('worker.jobs.enableLocation')}</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-sm">
              <IndianRupee className="h-4 w-4 text-muted-foreground" />
              <span className="font-semibold truncate" suppressHydrationWarning>₹{job.payAmount}/{job.payType === 'hourly' ? t('worker.jobs.hourly') : t('worker.jobs.fixed')}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span>{job.duration}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Briefcase className="h-4 w-4 text-muted-foreground" />
              <span className="capitalize">{job.experienceRequired}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Shield className={`h-4 w-4 ${job.escrowRequired !== false ? 'text-green-500' : 'text-slate-400'}`} />
              <span className={job.escrowRequired !== false ? 'text-green-600 dark:text-green-400' : 'text-slate-500'} suppressHydrationWarning>
                {job.escrowRequired !== false ? t('worker.jobs.paymentSecured') : t('worker.jobs.noEscrow')}
              </span>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              className="flex-1"
              onClick={() => router.push(`/worker/jobs/${job.id}`)}
              suppressHydrationWarning
            >
              {hasApplied ? t('worker.jobs.viewApplication') : t('worker.jobs.viewDetails')}
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (authError) {
    return (
      <div className="app-surface">
        <WorkerNav />
        <div className="container mx-auto px-4 py-20 text-center">
          <Briefcase className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <h2 className="text-xl font-semibold mb-2" suppressHydrationWarning>{t('worker.jobs.sessionExpired')}</h2>
          <p className="text-muted-foreground mb-6" suppressHydrationWarning>{t('worker.jobs.sessionExpiredDesc')}</p>
          <Button onClick={() => router.push('/login')} suppressHydrationWarning>{t('worker.jobs.logInAgain')}</Button>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="app-surface">
        <WorkerNav />
        <div className="container mx-auto px-4 py-6 md:py-8 pb-28 md:pb-8">
          <div className="mb-6 space-y-2">
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-4 w-64" />
          </div>
          {/* Stats cards skeleton */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="pt-6">
                  <Skeleton className="h-4 w-24 mb-2" />
                  <Skeleton className="h-8 w-16" />
                </CardContent>
              </Card>
            ))}
          </div>
          {/* Search/filter skeleton */}
          <div className="flex gap-2 mb-6">
            <Skeleton className="h-10 flex-1 rounded-md" />
            <Skeleton className="h-10 w-32 rounded-md" />
          </div>
          {/* Job cards skeleton */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i}>
                <CardHeader>
                  <div className="flex justify-between">
                    <div className="space-y-2 flex-1">
                      <Skeleton className="h-5 w-48" />
                      <Skeleton className="h-4 w-32" />
                    </div>
                    <Skeleton className="h-6 w-16 rounded-full" />
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <div className="flex gap-2">
                    {Array.from({ length: 3 }).map((_, j) => <Skeleton key={j} className="h-5 w-20 rounded-full" />)}
                  </div>
                  <Skeleton className="h-9 w-full rounded-md" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="app-surface">
      <WorkerNav />
      
      <main className="container mx-auto px-4 py-6 md:py-8 pb-28 md:pb-8">
        <div className="mb-6 md:mb-8">
          <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-2" suppressHydrationWarning>{t('worker.jobs.title')}</h1>
          <p className="text-sm md:text-base text-muted-foreground" suppressHydrationWarning>{t('worker.jobs.subtitle')}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground" suppressHydrationWarning>{t('worker.jobs.activeJobs')}</div>
              <div className="text-2xl font-bold mt-1" suppressHydrationWarning>{jobs.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground" suppressHydrationWarning>{t('worker.jobs.topMatches')}</div>
              <div className="text-2xl font-bold mt-1" suppressHydrationWarning>{topFiveMatches.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground" suppressHydrationWarning>{t('worker.jobs.applicationsSent')}</div>
              <div className="text-2xl font-bold mt-1" suppressHydrationWarning>{applications.length}</div>
            </CardContent>
          </Card>
        </div>

        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-primary" />
            <span suppressHydrationWarning>{t('worker.jobs.aiInsights')}</span>
          </h2>
          <div className="grid gap-3 grid-cols-1 md:grid-cols-3">
            {aiInsights.map((insight) => (
              <Card key={insight.title} className={insight.color}>
                <CardContent className="pt-6">
                  <p className="font-semibold mb-1" suppressHydrationWarning>{insight.title}</p>
                  <p className="text-sm opacity-90" suppressHydrationWarning>{insight.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
        {showGeolocationPrompt && !workerCoords && (
          <GeolocationPrompt
            onLocationGranted={handleLocationGranted}
            onDismiss={() => setShowGeolocationPrompt(false)}
          />
        )}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Brain className="h-4 w-4 text-primary" />
              <span suppressHydrationWarning>{t('worker.jobs.skillGapTitle')}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {missingSkills.length === 0 ? (
              <p className="text-sm text-muted-foreground" suppressHydrationWarning>
                {t('worker.jobs.skillGapNone')}
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {missingSkills.map(({ skill, count }) => (
                  <Badge key={skill} variant="secondary" className="gap-1">
                    <Target className="h-3 w-3" />
                    <span suppressHydrationWarning>{skill} <span className="text-xs opacity-80">({count} {t('worker.jobs.skillGapJobs')})</span></span>
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex flex-col gap-3">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t('worker.jobs.searchPlaceholder')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger>
                    <Filter className="h-4 w-4 mr-2" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" suppressHydrationWarning>{t('worker.jobs.allCategories')}</SelectItem>
                      {uniqueCategories.map((category) => (
                        <SelectItem key={category} value={category}>{category}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              <LocationInput
                  value={locationFilter}
                  onChange={(value, latLng) => {
                    setLocationFilter(value)
                    if (latLng) setSearchCoords(latLng)
                    else if (!value) setSearchCoords(null)
                  }}
                  placeholder={t('worker.jobs.locationPlaceholder')}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Select value={experienceFilter} onValueChange={setExperienceFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('worker.jobs.experienceLevel')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" suppressHydrationWarning>{t('worker.jobs.allExperience')}</SelectItem>
                    <SelectItem value="entry" suppressHydrationWarning>{t('worker.jobs.entry')}</SelectItem>
                    <SelectItem value="intermediate" suppressHydrationWarning>{t('worker.jobs.intermediate')}</SelectItem>
                    <SelectItem value="expert" suppressHydrationWarning>{t('worker.jobs.expert')}</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={jobModeFilter} onValueChange={setJobModeFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('worker.jobs.workMode')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" suppressHydrationWarning>{t('worker.jobs.allModes')}</SelectItem>
                    <SelectItem value="local" suppressHydrationWarning>{t('worker.jobs.onsite')}</SelectItem>
                    <SelectItem value="remote" suppressHydrationWarning>{t('worker.jobs.remote')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium" suppressHydrationWarning>{t('worker.jobs.payRange')}</label>
                  <span className="text-sm text-muted-foreground" suppressHydrationWarning>₹{payRange[0].toLocaleString('en-IN')} – ₹{payRange[1].toLocaleString('en-IN')}</span>
                </div>
                <Slider
                  min={0}
                  max={100000}
                  step={1000}
                  value={payRange}
                  onValueChange={setPayRange}
                  className="w-full"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="recommended" className="w-full">
          <TabsList className="w-full flex-wrap">
            <TabsTrigger value="recommended" className="gap-2 flex-1 min-w-[140px]">
              <Sparkles className="h-4 w-4" />
              <span className="hidden sm:inline" suppressHydrationWarning>{t('worker.jobs.recommended')}</span><span className="sm:hidden" suppressHydrationWarning>{t('worker.jobs.aiMatch')}</span> <span suppressHydrationWarning>({topFiveMatches.length})</span>
            </TabsTrigger>
            <TabsTrigger value="all" className="flex-1 min-w-[100px]" suppressHydrationWarning>
              {t('worker.jobs.allJobs')} ({filteredJobs.length})
            </TabsTrigger>
          </TabsList>
          {activeCoords && (
            <div className="flex items-center gap-1.5 mt-2 mb-4 text-xs text-blue-600 dark:text-blue-400">
              <Route className="h-3.5 w-3.5" />
              <span suppressHydrationWarning>{t('worker.jobs.sortedByDistance')}</span>
            </div>
          )}
          {!activeCoords && (
            <div className="mt-2 mb-4" />
          )}

          <TabsContent value="recommended">
            {topFiveMatches.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <TrendingUp className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-semibold mb-2" suppressHydrationWarning>{t('worker.jobs.noStrongMatches')}</h3>
                  {isProfileReady ? (
                    <p className="text-muted-foreground mb-4" suppressHydrationWarning>
                      {t('worker.jobs.profileComplete')}
                    </p>
                  ) : (
                    <>
                      <p className="text-muted-foreground mb-4" suppressHydrationWarning>
                        {t('worker.jobs.completeProfilePrompt')}
                      </p>
                      <Button onClick={() => router.push('/worker/profile')} suppressHydrationWarning>
                        {t('worker.jobs.completeProfile')}
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>
            ) : (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {topFiveMatches.map(({ job, score }) => (
                    <JobCard key={job.id} job={job} matchScore={score} />
                  ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="all">
            {sortedFilteredJobs.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Briefcase className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-semibold mb-2" suppressHydrationWarning>{t('worker.jobs.noJobsFound')}</h3>
                  <p className="text-muted-foreground" suppressHydrationWarning>
                    {t('worker.jobs.adjustFilters')}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {sortedFilteredJobs.map((job) => {
                  const match = matchedJobs.find(m => m.job.id === job.id)
                  return <JobCard key={job.id} job={job} matchScore={match?.score} />
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}
