'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { WorkerNav } from '@/components/worker/WorkerNav';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useAuth } from '@/contexts/AuthContext';
import { useI18n } from '@/contexts/I18nContext';
import {
  Briefcase,
  TrendingUp,
  Star,
  Clock,
  MapPin,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { workerProfileOps, jobOps, applicationOps, trustScoreOps } from '@/lib/api';
import { WorkerProfile, Job, Application, TrustScore } from '@/lib/types';
import { getRecommendedJobs, getBasicRecommendations } from '@/lib/aiMatching';
import { getWorkerProfileCompletion } from '@/lib/profileCompletion';
import { SimpleLineChart, StatsCard } from '@/components/ui/charts';
import { Skeleton } from '@/components/ui/skeleton';

export default function WorkerDashboardPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { t } = useI18n();
  const [workerProfile, setWorkerProfile] = useState<WorkerProfile | null>(null);
  const [trustScore, setTrustScore] = useState<TrustScore | null>(null);
  const [recommendedJobs, setRecommendedJobs] = useState<Array<{ job: Job; matchScore: number }>>([]);
  const [applications, setApplications] = useState<Application[]>([]);  const [jobsMap, setJobsMap] = useState<Record<string, Job>>({});  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user || user.role !== 'worker') {
      router.replace('/login');
      return;
    }

    loadDashboardData();
  }, [user, authLoading, router]);

  const loadDashboardData = async () => {
    if (!user) return;

    try {
      const findWorkerProfileByUserId = workerProfileOps?.findByUserId;
      if (!findWorkerProfileByUserId) {
        throw new Error('Worker profile API is unavailable. Please refresh and try again.');
      }

      const [profile, trust, apps, allJobs] = await Promise.allSettled([
        findWorkerProfileByUserId(user.id),
        trustScoreOps.findByUserId(user.id),
        applicationOps.findByWorkerId(user.id),
        jobOps.getAll({ status: 'active' }),
      ]);

      const profileVal = profile.status === 'fulfilled' ? profile.value : null;
      const trustVal = trust.status === 'fulfilled' ? trust.value : null;
      const appsVal = apps.status === 'fulfilled' ? apps.value : [];
      const allJobsVal = allJobs.status === 'fulfilled' ? allJobs.value : [];

      setWorkerProfile(profileVal);
      setTrustScore(trustVal);
      setApplications(appsVal || []);

      // Build a quick-lookup map of jobId → Job for the recent applications display
      const map: Record<string, Job> = {}
      allJobsVal.forEach((j: Job) => { map[j.id] = j })
      setJobsMap(map)

      // Get job recommendations
      if (profileVal && profileVal.profileCompleted) {
        const recommended = getRecommendedJobs(profileVal, allJobsVal, 5);
        setRecommendedJobs(recommended);
      } else if (profileVal) {
        const basic = getBasicRecommendations(profileVal.categories, allJobsVal, 5, profileVal.skills || []);
        setRecommendedJobs(basic.map((job) => ({ job, matchScore: 0 })));
      } else {
        const basic = getBasicRecommendations([], allJobsVal, 5);
        setRecommendedJobs(basic.map((job) => ({ job, matchScore: 0 })));
      }
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const profileCompleteness = workerProfile ? getWorkerProfileCompletion(workerProfile) : 0;

  // Analytics data for charts (deterministic from actual applications)
  const applicationTrendData = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const days = Array.from({ length: 7 }, (_, i) => {
      const day = new Date(now);
      day.setDate(now.getDate() - (6 - i));
      return day;
    });

    const countsByDay = new Map<string, number>();
    for (const application of applications) {
      const created = new Date(application.createdAt);
      created.setHours(0, 0, 0, 0);
      const key = created.toISOString().slice(0, 10);
      countsByDay.set(key, (countsByDay.get(key) ?? 0) + 1);
    }

    return days.map((day) => {
      const key = day.toISOString().slice(0, 10);
      return {
        label: day.toLocaleDateString('en-US', { weekday: 'short' }),
        value: countsByDay.get(key) ?? 0,
      };
    });
  }, [applications]);

  if (authLoading || loading) {
    return (
      <div className="app-surface">
        <WorkerNav />
        <div className="container mx-auto px-4 py-8 pb-28 md:pb-8 space-y-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <Skeleton className="h-8 w-64" />
              <Skeleton className="h-4 w-48" />
            </div>
            <Skeleton className="h-10 w-40 rounded-md" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="card-modern p-5">
                <Skeleton className="h-10 w-10 rounded-xl mb-3" />
                <Skeleton className="h-7 w-12 mb-1" />
                <Skeleton className="h-3 w-20" />
              </div>
            ))}
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} className="p-6 space-y-4">
                <div className="flex justify-between">
                  <div className="space-y-2">
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                  <Skeleton className="h-6 w-20 rounded-full" />
                </div>
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-10 w-full rounded-md" />
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-surface">
      <WorkerNav />

      <main className="container mx-auto px-4 py-8 pb-28 md:pb-8 space-y-8">
        {/* Welcome Section */}
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold mb-2 break-words" suppressHydrationWarning>
            {t('worker.dashboard.welcome', { name: user?.fullName || '' })}
          </h1>
          <p className="text-muted-foreground" suppressHydrationWarning>
            {t('worker.dashboard.subtitle')}
          </p>
        </div>

        {/* Profile Completion Alert */}
        {profileCompleteness < 100 && (
          <Card className="border-accent/20 bg-accent/10 p-6 transition-all duration-200 hover:shadow-md">
            <div className="flex flex-col sm:flex-row items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0">
                <AlertCircle className="w-5 h-5 text-accent" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold mb-1" suppressHydrationWarning>
                  {t('worker.dashboard.completeProfile')}
                </h3>
                <p className="text-sm text-muted-foreground mb-3" suppressHydrationWarning>
                  {t('worker.dashboard.completeProfileDesc')}
                </p>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground" suppressHydrationWarning>
                      {t('worker.dashboard.profileCompleteness')}
                    </span>
                    <span className="font-semibold">{profileCompleteness}%</span>
                  </div>
                  <Progress value={profileCompleteness} className="h-2" />
                </div>
                <Link href="/worker/profile">
                  <Button size="sm" className="mt-4" suppressHydrationWarning>
                    {t('worker.dashboard.completeProfileBtn')}
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
              </div>
            </div>
          </Card>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { icon: Briefcase, labelKey: 'worker.dashboard.stats.applications', value: applications.length, iconBg: 'bg-blue-500/10', iconColor: 'text-blue-600 dark:text-blue-400' },
            { icon: Star, labelKey: 'worker.dashboard.stats.trustScore', value: trustScore?.score || 50, iconBg: 'bg-amber-500/10', iconColor: 'text-amber-600 dark:text-amber-400' },
            { icon: TrendingUp, labelKey: 'worker.dashboard.stats.avgRating', value: trustScore?.averageRating.toFixed(1) || 'N/A', iconBg: 'bg-emerald-500/10', iconColor: 'text-emerald-600 dark:text-emerald-400' },
            { icon: CheckCircle2, labelKey: 'worker.dashboard.stats.completedJobs', value: applications.filter(a => a.status === 'completed').length, iconBg: 'bg-indigo-500/10', iconColor: 'text-indigo-600 dark:text-indigo-400' },
          ].map(({ icon: Icon, labelKey, value, iconBg, iconColor }) => (
            <div key={labelKey} className="card-modern p-5 transition-smooth hover:-translate-y-0.5 hover:shadow-soft-lg">
              <div className={`inline-flex h-10 w-10 items-center justify-center rounded-xl mb-3 ${iconBg}`}>
                <Icon className={`w-5 h-5 ${iconColor}`} />
              </div>
              <div className="text-2xl font-extrabold">{value}</div>
              <div className="text-sm text-muted-foreground mt-0.5" suppressHydrationWarning>
                {t(labelKey)}
              </div>
            </div>
          ))}
        </div>

        {/* Application Activity Chart */}
        {applications.length > 0 && (
          <Card className="card-modern p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2" suppressHydrationWarning>
              <TrendingUp className="w-5 h-5 text-primary" />
              {t('worker.dashboard.activity')}
            </h3>
            <SimpleLineChart data={applicationTrendData} color="#6366f1" />
          </Card>
        )}

        {/* AI Recommendations */}
        <div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold flex items-center gap-2" suppressHydrationWarning>
                <Sparkles className="w-6 h-6 text-primary" />
                {profileCompleteness === 100 ? t('worker.dashboard.aiRecommendations') : t('worker.dashboard.recommendedJobs')}
              </h2>
              <p className="text-sm text-muted-foreground mt-1" suppressHydrationWarning>
                {profileCompleteness === 100
                  ? t('worker.dashboard.aiRecommendationsDesc')
                  : t('worker.dashboard.recommendedJobsDesc')}
              </p>
            </div>
            <Link href="/worker/jobs">
              <Button variant="outline" size="sm" suppressHydrationWarning>
                {t('worker.dashboard.viewAllJobs')}
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {recommendedJobs.length === 0 ? (
              <Card className="p-8 col-span-full text-center">
                <Briefcase className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="font-semibold mb-2" suppressHydrationWarning>
                  {t('worker.dashboard.noJobs')}
                </h3>
                <p className="text-sm text-muted-foreground" suppressHydrationWarning>
                  {t('worker.dashboard.noJobsDesc')}
                </p>
              </Card>
            ) : (
              recommendedJobs.map(({ job, matchScore }) => (
                <Card key={job.id} className="card-modern p-6 hover:shadow-soft-lg transition-smooth hover:border-primary/50">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="font-semibold mb-1 text-balance">{job.title}</h3>
                      <p className="text-sm text-muted-foreground flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {job.location.split(',')[0]}
                      </p>
                    </div>
                    {matchScore > 0 && (
                      <Badge variant="secondary" className="bg-primary/10 text-primary" suppressHydrationWarning>
                        {matchScore}% {t('worker.dashboard.match')}
                      </Badge>
                    )}
                  </div>

                  <div className="space-y-2 mb-4">
                    <div className="flex items-center gap-2 text-sm">
                      <Badge variant="outline">{job.jobType}</Badge>
                      <Badge variant="outline">{job.category}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2">{job.description}</p>
                  </div>

                  <div className="flex items-center justify-between pt-4 border-t">
                    <div>
                      <div className="text-xl font-bold text-primary">₹{(job.pay ?? 0).toLocaleString()}</div>
                      <div className="text-xs text-muted-foreground">{job.timing}</div>
                    </div>
                    <Link href={`/worker/jobs/${job.id}`}>
                      <Button size="sm" suppressHydrationWarning>
                        {t('worker.dashboard.viewDetails')}
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </Button>
                    </Link>
                  </div>
                </Card>
              ))
            )}
          </div>
        </div>

        {/* Recent Applications */}
        {applications.length > 0 && (
          <div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
              <h2 className="text-2xl font-bold" suppressHydrationWarning>
                {t('worker.dashboard.recentApplications')}
              </h2>
              <Link href="/worker/applications">
                <Button variant="outline" size="sm" suppressHydrationWarning>
                  {t('worker.dashboard.viewAll')}
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
            </div>

            <div className="grid gap-4">
              {applications.slice(0, 3).map((app) => (
                <Card key={app.id} className="card-modern p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold mb-1" suppressHydrationWarning>
                        {t('worker.dashboard.application')} #{app.id.slice(-8)}
                      </h3>
                      <p className="text-sm text-muted-foreground" suppressHydrationWarning>
                        {t('worker.dashboard.applied')} {new Date(app.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge
                      variant={
                        app.status === 'accepted'
                          ? 'default'
                          : app.status === 'rejected'
                          ? 'destructive'
                          : 'secondary'
                      }
                    >
                      {app.status}
                    </Badge>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
