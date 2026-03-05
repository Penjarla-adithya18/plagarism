'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import EmployerNav from '@/components/employer/EmployerNav'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/contexts/AuthContext'
import { jobOps } from '@/lib/api'
import { Job } from '@/lib/types'
import { Briefcase, MapPin, Clock, IndianRupee, Users, Plus, Eye, Edit, Trash2, Lock, AlertCircle } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/hooks/use-toast'
import { Skeleton } from '@/components/ui/skeleton'
import { useI18n } from '@/contexts/I18nContext'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

export default function EmployerJobsPage() {
  const router = useRouter()
  const { user } = useAuth()
  const { toast } = useToast()
  const { t } = useI18n()
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [pendingDeleteJobId, setPendingDeleteJobId] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    let cancelled = false

    async function loadJobs() {
      try {
        const employerJobs = await jobOps.findByEmployerId(user!.id)
        if (!cancelled) setJobs(employerJobs)
      } catch {
        toast({ title: t('common.error'), description: t('employer.jobs.toast.loadFailed'), variant: 'destructive' })
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadJobs()
    return () => { cancelled = true }
  }, [user])

  const handleDeleteJob = useCallback(async (jobId: string) => {
    try {
      await jobOps.delete(jobId)
      // Remove locally instead of full re-fetch
      setJobs((prev) => prev.filter((j) => j.id !== jobId))
      toast({ title: t('common.success'), description: t('employer.jobs.toast.deleteSuccess') })
    } catch {
      toast({ title: t('common.error'), description: t('employer.jobs.toast.deleteFailed'), variant: 'destructive' })
    }
  }, [t, toast])

  // Memoized status-filtered arrays
  const draftJobs = useMemo(() => jobs.filter((j) => j.status === 'draft'), [jobs])
  const activeJobs = useMemo(() => jobs.filter((j) => j.status === 'active'), [jobs])
  const completedJobs = useMemo(() => jobs.filter((j) => j.status === 'completed'), [jobs])
  const cancelledJobs = useMemo(() => jobs.filter((j) => j.status === 'cancelled'), [jobs])

  const JobCard = ({ job }: { job: Job }) => {
    const applicationsCount = job.applicationCount ?? 0

    return (
      <Card className="hover:border-primary transition-colors">
        <CardHeader>
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <CardTitle className="text-xl mb-2">{job.title}</CardTitle>
              <div className="flex flex-wrap gap-2 mb-3">
                {job.requiredSkills.slice(0, 3).map((skill) => (
                  <Badge key={skill} variant="secondary">{skill}</Badge>
                ))}
                {job.requiredSkills.length > 3 && (
                  <Badge variant="secondary">+{job.requiredSkills.length - 3} {t('common.more')}</Badge>
                )}
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <Badge variant={
                job.status === 'active' ? 'default' :
                job.status === 'draft' ? 'secondary' :
                job.status === 'completed' ? 'outline' :
                'destructive'
              }>
                {job.status === 'draft' ? t('employer.jobs.status.pendingPayment') : t(`status.${job.status}`)}
              </Badge>
              {job.status !== 'draft' && (
                <span className="text-xs flex items-center gap-1">
                  {job.escrowRequired === false ? (
                    <><AlertCircle className="w-3 h-3 text-slate-400" /><span className="text-slate-500">{t('employer.jobs.noEscrow')}</span></>
                  ) : job.paymentStatus === 'locked' ? (
                    <><Lock className="w-3 h-3 text-green-500" /><span className="text-green-600">{t('employer.jobs.escrowSecured')}</span></>
                  ) : (
                    <><AlertCircle className="w-3 h-3 text-amber-500" /><span className="text-amber-600">{t('employer.jobs.escrowPending')}</span></>
                  )}
                </span>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-4 line-clamp-2">{job.description}</p>
          
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="flex items-center gap-2 text-sm">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <span className="truncate">{job.location}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <IndianRupee className="h-4 w-4 text-muted-foreground" />
              <span>₹{job.payAmount}/{job.payType === 'hourly' ? t('common.hourShort') : t('common.fixed')}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span>{job.duration}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span>{applicationsCount} {t('employer.jobs.applications')}</span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            {job.status === 'draft' ? (
              <Button
                size="sm"
                className="flex-1 bg-amber-500 hover:bg-amber-600 text-white"
                onClick={() => router.push(`/employer/payment/${job.id}`)}
              >
                <Lock className="h-4 w-4 mr-1 sm:mr-2" />
                <span className="hidden sm:inline">{t('employer.jobs.completePaymentGoLive')}</span>
                <span className="sm:hidden">{t('employer.jobs.completePayment')}</span>
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => router.push(`/employer/jobs/${job.id}`)}
              >
                <Eye className="h-4 w-4 mr-2" />
                {t('common.viewDetails')}
              </Button>
            )}
            {job.status === 'active' && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => router.push(`/employer/jobs/${job.id}/edit`)}
                >
                  <Edit className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPendingDeleteJobId(job.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (loading) {
    return (
      <div className="app-surface">
        <EmployerNav />
        <div className="container mx-auto px-4 py-8 pb-28 md:pb-8">
          <div className="flex justify-between items-center mb-8">
            <div className="space-y-2">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-4 w-72" />
            </div>
            <Skeleton className="h-10 w-36" />
          </div>
          <div className="flex gap-2 mb-6">
            <Skeleton className="h-9 w-24 rounded-md" />
            <Skeleton className="h-9 w-24 rounded-md" />
            <Skeleton className="h-9 w-24 rounded-md" />
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-6 w-48" />
                      <div className="flex gap-2">
                        {[...Array(3)].map((_, j) => <Skeleton key={j} className="h-5 w-20 rounded-full" />)}
                      </div>
                    </div>
                    <Skeleton className="h-6 w-20 rounded-full" />
                  </div>
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-4 w-full mb-2" />
                  <Skeleton className="h-4 w-3/4 mb-4" />
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    {[...Array(4)].map((_, j) => <Skeleton key={j} className="h-4 w-32" />)}
                  </div>
                  <div className="flex gap-2">
                    <Skeleton className="h-9 flex-1 rounded-md" />
                    <Skeleton className="h-9 w-9 rounded-md" />
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
      <EmployerNav />
      
      <main className="container mx-auto px-4 py-8 pb-28 md:pb-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-2">{t('employer.jobs.title')}</h1>
            <p className="text-muted-foreground">{t('employer.jobs.subtitle')}</p>
          </div>
          <Button onClick={() => router.push('/employer/jobs/post')}>
            <Plus className="h-4 w-4 mr-2" />
            {t('employer.jobs.postNew')}
          </Button>
        </div>

        <Tabs defaultValue={draftJobs.length > 0 ? 'draft' : 'active'} className="w-full">
          <TabsList className="mb-6">
            {draftJobs.length > 0 && (
              <TabsTrigger value="draft" className="relative">
                {t('employer.jobs.tab.pendingPayment')}
                <span className="ml-1.5 bg-amber-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                  {draftJobs.length}
                </span>
              </TabsTrigger>
            )}
            <TabsTrigger value="active">
              {t('status.active')} ({activeJobs.length})
            </TabsTrigger>
            <TabsTrigger value="completed">
              {t('status.completed')} ({completedJobs.length})
            </TabsTrigger>
            <TabsTrigger value="cancelled">
              {t('status.cancelled')} ({cancelledJobs.length})
            </TabsTrigger>
          </TabsList>

          {draftJobs.length > 0 && (
            <TabsContent value="draft">
              <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {t('employer.jobs.pendingNote')}
              </div>
              <div className="grid md:grid-cols-2 gap-6">
                {draftJobs.map((job) => (
                  <JobCard key={job.id} job={job} />
                ))}
              </div>
            </TabsContent>
          )}

          <TabsContent value="active">
            {activeJobs.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Briefcase className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-semibold mb-2">{t('employer.jobs.noActive')}</h3>
                  <p className="text-muted-foreground mb-4">{t('employer.jobs.noActiveDesc')}</p>
                  <Button onClick={() => router.push('/employer/jobs/post')}>
                    <Plus className="h-4 w-4 mr-2" />
                    {t('employer.jobs.postJob')}
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid md:grid-cols-2 gap-6">
                {activeJobs.map((job) => (
                  <JobCard key={job.id} job={job} />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="completed">
            {completedJobs.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-muted-foreground">{t('employer.jobs.noCompleted')}</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid md:grid-cols-2 gap-6">
                {completedJobs.map((job) => (
                  <JobCard key={job.id} job={job} />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="cancelled">
            {cancelledJobs.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-muted-foreground">{t('employer.jobs.noCancelled')}</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid md:grid-cols-2 gap-6">
                {cancelledJobs.map((job) => (
                  <JobCard key={job.id} job={job} />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>

      <AlertDialog open={!!pendingDeleteJobId} onOpenChange={(open) => !open && setPendingDeleteJobId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('employer.jobs.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('employer.jobs.deleteDesc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDeleteJobId) {
                  void handleDeleteJob(pendingDeleteJobId)
                }
                setPendingDeleteJobId(null)
              }}
            >
              {t('employer.jobs.deleteAction')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
