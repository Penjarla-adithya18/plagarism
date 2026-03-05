'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import WorkerNav from '@/components/worker/WorkerNav'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/contexts/AuthContext'
import { applicationOps, jobOps, ratingOps } from '@/lib/api'
import { Application, Job } from '@/lib/types'
import { Briefcase, MapPin, Clock, IndianRupee, Eye, CheckCircle2, Star } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { useI18n } from '@/contexts/I18nContext'

interface RatingTarget {
  jobId: string
  applicationId: string
  employerId: string
  jobTitle: string
}

export default function WorkerApplicationsPage() {
  const router = useRouter()
  const { user } = useAuth()
  const { toast } = useToast()
  const { t } = useI18n()
  const [applications, setApplications] = useState<Application[]>([])
  const [jobsById, setJobsById] = useState<Record<string, Job>>({})
  const [loading, setLoading] = useState(true)

  // Rating dialog state
  const [ratingOpen, setRatingOpen] = useState(false)
  const [ratingTarget, setRatingTarget] = useState<RatingTarget | null>(null)
  const [ratingValue, setRatingValue] = useState(0)
  const [hoverRating, setHoverRating] = useState(0)
  const [ratingFeedback, setRatingFeedback] = useState('')
  const [submittingRating, setSubmittingRating] = useState(false)
  const [ratedJobIds, setRatedJobIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (user) {
      loadApplications()
    }
  }, [user])

  const loadApplications = async () => {
    if (!user) return
    try {
      const workerApplications = await applicationOps.findByWorkerId(user.id)
      setApplications(workerApplications)

      const allJobs = await jobOps.getAll()
      const byId = allJobs.reduce((acc, job) => {
        acc[job.id] = job
        return acc
      }, {} as Record<string, Job>)
      setJobsById(byId)

      // Check which jobs the worker has already rated the employer for
      const completedJobIds = workerApplications
        .filter(a => a.status === 'accepted' && byId[a.jobId]?.status === 'completed')
        .map(a => a.jobId)
      if (completedJobIds.length > 0) {
        const sentRatings = await ratingOps.getSentByUser(user.id).catch(() => [])
        const sentJobIds = new Set(sentRatings.map(r => r.jobId))
        setRatedJobIds(sentJobIds)
      }
    } catch (error) {
      console.error('Failed to load applications:', error)
    } finally {
      setLoading(false)
    }
  }

  const openRatingDialog = (target: RatingTarget) => {
    setRatingTarget(target)
    setRatingValue(0)
    setHoverRating(0)
    setRatingFeedback('')
    setRatingOpen(true)
  }

  const handleSubmitRating = async () => {
    if (!ratingTarget || ratingValue === 0) return
    setSubmittingRating(true)
    try {
      await ratingOps.create({
        jobId: ratingTarget.jobId,
        applicationId: ratingTarget.applicationId,
        toUserId: ratingTarget.employerId,
        rating: ratingValue,
        feedback: ratingFeedback.trim() || undefined,
      })
      setRatedJobIds(prev => new Set([...prev, ratingTarget.jobId]))
      setRatingOpen(false)
      toast({ title: t('worker.applications.ratingSuccess'), description: t('worker.applications.ratingSuccessDesc') })
    } catch (err) {
      toast({
        title: t('worker.applications.ratingFailed'),
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setSubmittingRating(false)
    }
  }

  const pendingApps = applications.filter(a => a.status === 'pending')
  const acceptedApps = applications.filter(a => a.status === 'accepted')
  const rejectedApps = applications.filter(a => a.status === 'rejected')
  const completedApps = applications.filter(a => a.status === 'completed')

  const ApplicationCard = ({ application }: { application: Application }) => {
    const job = jobsById[application.jobId]
    if (!job) return null

    const isCompleted = job.status === 'completed' || job.paymentStatus === 'released'
    const alreadyRated = ratedJobIds.has(job.id)

    return (
      <Card className="hover:border-primary transition-colors">
        <CardHeader>
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <CardTitle className="text-xl mb-2">{job.title}</CardTitle>
              <p className="text-sm text-muted-foreground" suppressHydrationWarning>
                {t('worker.applications.applied')} {new Date(application.createdAt).toLocaleDateString()}
              </p>
            </div>
            <Badge variant={
              application.status === 'accepted' ? 'default' :
              application.status === 'rejected' ? 'destructive' :
              application.status === 'completed' ? 'default' :
              'secondary'
            } className={application.status === 'completed' ? 'bg-green-100 text-green-700 border-green-200' : ''} suppressHydrationWarning>
              {t(`worker.applications.${application.status}`)}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-4 line-clamp-2">{job.description}</p>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            <div className="flex items-center gap-2 text-sm">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <span>{job.location}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <IndianRupee className="h-4 w-4 text-muted-foreground" />
              <span className="font-semibold" suppressHydrationWarning>₹{job.payAmount}/{job.payType === 'hourly' ? t('worker.applications.hourly') : t('worker.applications.fixed')}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span>{job.duration}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Briefcase className="h-4 w-4 text-muted-foreground" />
              <span className="capitalize">{job.experienceRequired}</span>
            </div>
          </div>

          {application.coverLetter && (
            <div className="mb-4 p-3 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground mb-1" suppressHydrationWarning>{t('worker.applications.coverLetter')}</p>
              <p className="text-sm line-clamp-2">{application.coverLetter}</p>
            </div>
          )}

          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => router.push(`/worker/jobs/${job.id}`)}
              suppressHydrationWarning
            >
              <Eye className="h-4 w-4 mr-2" />
              {t('worker.applications.viewJob')}
            </Button>

            {isCompleted && (
              alreadyRated ? (
                <Button variant="ghost" size="sm" disabled className="gap-1 text-yellow-500" suppressHydrationWarning>
                  <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                  {t('worker.applications.rated')}
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1 border-yellow-400 text-yellow-600 hover:bg-yellow-50 dark:hover:bg-yellow-950"
                  onClick={() => openRatingDialog({
                    jobId: job.id,
                    applicationId: application.id,
                    employerId: job.employerId,
                    jobTitle: job.title,
                  })}
                  suppressHydrationWarning
                >
                  <Star className="h-4 w-4" />
                  {t('worker.applications.rateEmployer')}
                </Button>
              )
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (loading) {
    return (
      <div className="app-surface">
        <WorkerNav />
        <div className="container mx-auto px-4 py-6 md:py-8 pb-28 md:pb-8">
          <div className="mb-6 space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
          <div className="flex gap-2 mb-6">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-9 w-24 rounded-md" />)}
          </div>
          <div className="space-y-4">
            {[...Array(4)].map((_, i) => (
              <Card key={i}>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div className="space-y-2">
                      <Skeleton className="h-5 w-48" />
                      <div className="flex gap-2">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-4 w-20" />
                      </div>
                    </div>
                    <Skeleton className="h-6 w-24 rounded-full" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-2">
                    <Skeleton className="h-9 flex-1 rounded-md" />
                    <Skeleton className="h-9 w-9 rounded-md" />
                  </div>
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
          <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-2" suppressHydrationWarning>{t('worker.applications.title')}</h1>
          <p className="text-sm md:text-base text-muted-foreground" suppressHydrationWarning>{t('worker.applications.subtitle')}</p>
        </div>

        <Tabs defaultValue="pending" className="w-full">
          <TabsList className="mb-6 w-full flex-wrap">
            <TabsTrigger value="pending" className="flex-1 min-w-[90px]" suppressHydrationWarning>
              <span className="hidden sm:inline">{t('worker.applications.pending')}</span><span className="sm:hidden">{t('worker.applications.pending')}</span> ({pendingApps.length})
            </TabsTrigger>
            <TabsTrigger value="accepted" className="flex-1 min-w-[90px]" suppressHydrationWarning>
              <span className="hidden sm:inline">{t('worker.applications.accepted')}</span><span className="sm:hidden">{t('worker.applications.accepted')}</span> ({acceptedApps.length})
            </TabsTrigger>
            <TabsTrigger value="rejected" className="flex-1 min-w-[90px]" suppressHydrationWarning>
              <span className="hidden sm:inline">{t('worker.applications.rejected')}</span><span className="sm:hidden">{t('worker.applications.rejected')}</span> ({rejectedApps.length})
            </TabsTrigger>
            <TabsTrigger value="completed" className="flex-1 min-w-[90px]" suppressHydrationWarning>
              <span className="hidden sm:inline">{t('worker.applications.completed')}</span><span className="sm:hidden">{t('worker.applications.completed')}</span> ({completedApps.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pending">
            {pendingApps.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Briefcase className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-semibold mb-2" suppressHydrationWarning>{t('worker.applications.noPending')}</h3>
                  <p className="text-muted-foreground mb-4" suppressHydrationWarning>{t('worker.applications.noPendingDesc')}</p>
                  <Button onClick={() => router.push('/worker/jobs')} suppressHydrationWarning>
                    {t('worker.applications.browseJobs')}
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                {pendingApps.map((app) => (
                  <ApplicationCard key={app.id} application={app} />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="accepted">
            {acceptedApps.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-muted-foreground" suppressHydrationWarning>{t('worker.applications.noAccepted')}</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                {acceptedApps.map((app) => (
                  <ApplicationCard key={app.id} application={app} />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="rejected">
            {rejectedApps.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-muted-foreground" suppressHydrationWarning>{t('worker.applications.noRejected')}</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                {rejectedApps.map((app) => (
                  <ApplicationCard key={app.id} application={app} />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="completed">
            {completedApps.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <CheckCircle2 className="h-12 w-12 mx-auto mb-4 text-green-500" />
                  <h3 className="text-lg font-semibold mb-2" suppressHydrationWarning>{t('worker.applications.noCompleted')}</h3>
                  <p className="text-muted-foreground" suppressHydrationWarning>{t('worker.applications.noCompletedDesc')}</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                {completedApps.map((app) => (
                  <ApplicationCard key={app.id} application={app} />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>

      {/* ── Rate Employer Dialog ── */}
      <Dialog open={ratingOpen} onOpenChange={setRatingOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2" suppressHydrationWarning>
              <Star className="h-5 w-5 text-yellow-500" />
              {t('worker.applications.ratingTitle')}
            </DialogTitle>
            {ratingTarget && (
              <p className="text-sm text-muted-foreground mt-1" suppressHydrationWarning>
                {t('worker.applications.ratingDesc', { jobTitle: ratingTarget.jobTitle })}
              </p>
            )}
          </DialogHeader>

          <div className="py-4 space-y-4">
            {/* Star selector */}
            <div className="flex justify-center gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRatingValue(star)}
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(0)}
                  className="transition-transform hover:scale-110 focus:outline-none"
                >
                  <Star
                    className={`h-9 w-9 ${
                      star <= (hoverRating || ratingValue)
                        ? 'fill-yellow-400 text-yellow-400'
                        : 'text-muted-foreground'
                    }`}
                  />
                </button>
              ))}
            </div>
            <p className="text-center text-sm text-muted-foreground h-4" suppressHydrationWarning>
              {(hoverRating || ratingValue) > 0 && (
                ['', t('worker.applications.ratingPoor'), t('worker.applications.ratingFair'), t('worker.applications.ratingGood'), t('worker.applications.ratingVeryGood'), t('worker.applications.ratingExcellent')][hoverRating || ratingValue]
              )}
            </p>

            {/* Feedback */}
            <Textarea
              placeholder={t('worker.applications.feedbackPlaceholder')}
              value={ratingFeedback}
              onChange={(e) => setRatingFeedback(e.target.value)}
              rows={3}
              maxLength={500}
            />
            <p className="text-xs text-muted-foreground text-right">{ratingFeedback.length}/500</p>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRatingOpen(false)} disabled={submittingRating} suppressHydrationWarning>
              {t('worker.applications.cancel')}
            </Button>
            <Button
              onClick={handleSubmitRating}
              disabled={ratingValue === 0 || submittingRating}
              className="gap-1"
              suppressHydrationWarning
            >
              <Star className="h-4 w-4" />
              {submittingRating ? t('worker.applications.submitting') : t('worker.applications.submitRating')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
