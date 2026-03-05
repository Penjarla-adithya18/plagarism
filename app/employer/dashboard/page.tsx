'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { EmployerNav } from '@/components/employer/EmployerNav';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import {
  Briefcase,
  Users,
  Star,
  TrendingUp,
  PlusCircle,
  ArrowRight,
  Eye,
  Clock,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { employerProfileOps, jobOps, applicationOps, trustScoreOps } from '@/lib/api';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { EmployerProfile, Job, Application, TrustScore } from '@/lib/types';
import { SimpleLineChart, SimpleBarChart } from '@/components/ui/charts';
import { getEmployerProfileCompletion } from '@/lib/profileCompletion';
import { useI18n } from '@/contexts/I18nContext';

export default function EmployerDashboardPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { t } = useI18n();
  const [employerProfile, setEmployerProfile] = useState<EmployerProfile | null>(null);
  const [trustScore, setTrustScore] = useState<TrustScore | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [appCountByJob, setAppCountByJob] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user || user.role !== 'employer') {
      router.replace('/login');
      return;
    }

    let cancelled = false;

    async function loadDashboardData() {
      try {
        const findEmployerProfileByUserId = employerProfileOps?.findByUserId;
        if (!findEmployerProfileByUserId) {
          throw new Error('Employer profile API is unavailable. Please refresh and try again.');
        }

        const [profileResult, trustResult, jobsResult] = await Promise.allSettled([
          findEmployerProfileByUserId(user!.id),
          trustScoreOps.findByUserId(user!.id),
          jobOps.findByEmployerId(user!.id),
        ]);
        if (cancelled) return;

        const profile = profileResult.status === 'fulfilled' ? profileResult.value : null;
        const trust = trustResult.status === 'fulfilled' ? trustResult.value : null;
        const employerJobs = jobsResult.status === 'fulfilled' ? (jobsResult.value ?? []) : [];

        if (jobsResult.status === 'rejected') {
          console.error('Failed to load jobs:', jobsResult.reason);
        }

        setEmployerProfile(profile);
        setTrustScore(trust);
        setJobs(employerJobs);

        // Fetch applications per job in parallel (N+1 – acceptable since no bulk endpoint exists)
        const jobIds = employerJobs.map((j) => j.id);
        const allApps = await Promise.all(jobIds.map((id) => applicationOps.findByJobId(id)));
        if (cancelled) return;
        const flatApps = allApps.flat();
        setApplications(flatApps);

        const countMap: Record<string, number> = {};
        for (const app of flatApps) {
          countMap[app.jobId] = (countMap[app.jobId] || 0) + 1;
        }
        setAppCountByJob(countMap);
      } catch (error) {
        console.error('Failed to load dashboard data:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadDashboardData();
    return () => { cancelled = true; };
  }, [user, authLoading, router]);

  // Memoized derived stats
  const activeJobs = useMemo(() => jobs.filter((j) => j.status === 'active').length, [jobs]);
  const totalApplications = applications.length;
  const pendingApplications = useMemo(() => applications.filter((a) => a.status === 'pending').length, [applications]);

  // Calculate employer profile completeness
  const profileCompleteness = useMemo(() => {
    if (!employerProfile) return 0;
    return getEmployerProfileCompletion(employerProfile);
  }, [employerProfile]);

  // Analytics data (deterministic from actual applications)
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

  const jobPerformanceData = jobs.slice(0, 5).map((job) => ({
    label: job.title.slice(0, 15) + (job.title.length > 15 ? '...' : ''),
    value: appCountByJob[job.id] || 0
  }));

  if (authLoading || loading) {
    return (
      <div className="app-surface">
        <EmployerNav />
        <div className="container mx-auto px-4 py-8 space-y-8">
          <div className="flex flex-col sm:flex-row gap-4 sm:items-start sm:justify-between">
            <div className="space-y-2">
              <Skeleton className="h-8 w-64" />
              <Skeleton className="h-4 w-48" />
            </div>
            <Skeleton className="h-10 w-36" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="p-6">
                <Skeleton className="h-4 w-24 mb-3" />
                <Skeleton className="h-8 w-16 mb-1" />
                <Skeleton className="h-3 w-20" />
              </Card>
            ))}
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            {Array.from({ length: 2 }).map((_, i) => (
              <Card key={i} className="p-6 space-y-4">
                <Skeleton className="h-6 w-32" />
                {Array.from({ length: 3 }).map((_, j) => (
                  <Skeleton key={j} className="h-16 w-full rounded-lg" />
                ))}
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-linear-to-b from-background to-secondary/20">
      <EmployerNav />

      <div className="container mx-auto px-4 py-8 pb-28 md:pb-8 space-y-8">
        {/* Welcome Section */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold mb-2 break-words">{t('employer.dash.welcome', { name: employerProfile?.businessName || user?.fullName || '' })}</h1>
            <p className="text-muted-foreground">{t('employer.dash.subtitle')}</p>
          </div>
          <Link href="/employer/jobs/post">
            <Button size="lg" className="w-full sm:w-auto bg-accent hover:bg-accent/90 gap-2">
              <PlusCircle className="w-5 h-5" />
              {t('employer.dash.postJob')}
            </Button>
          </Link>
        </div>

        {/* Profile Completion Alert */}
        {profileCompleteness < 100 && (
          <Card className="border-accent/20 bg-accent/10 p-6 transition-all duration-200 hover:shadow-md">
            <div className="flex flex-col sm:flex-row items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0">
                <AlertCircle className="w-5 h-5 text-accent" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold mb-1">{t('employer.dash.completeProfileTitle')}</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  {t('employer.dash.completeProfileDesc')}
                </p>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{t('employer.dash.profileCompleteness')}</span>
                    <span className="font-semibold">{profileCompleteness}%</span>
                  </div>
                  <Progress value={profileCompleteness} className="h-2" />
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="p-6 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
            <div className="flex items-center justify-between mb-2">
              <Briefcase className="w-8 h-8 text-accent" />
            </div>
            <div className="text-2xl font-bold">{activeJobs}</div>
            <div className="text-sm text-muted-foreground">{t('employer.dash.activeJobs')}</div>
          </Card>

          <Card className="p-6 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
            <div className="flex items-center justify-between mb-2">
              <Users className="w-8 h-8 text-primary" />
            </div>
            <div className="text-2xl font-bold">{totalApplications}</div>
            <div className="text-sm text-muted-foreground">{t('employer.dash.totalApps')}</div>
          </Card>

          <Card className="p-6 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
            <div className="flex items-center justify-between mb-2">
              <Clock className="w-8 h-8 text-accent" />
            </div>
            <div className="text-2xl font-bold">{pendingApplications}</div>
            <div className="text-sm text-muted-foreground">{t('employer.dash.pendingApps')}</div>
          </Card>

          <Card className="p-6 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
            <div className="flex items-center justify-between mb-2">
              <Star className="w-8 h-8 text-primary" />
            </div>
            <div className="text-2xl font-bold">{trustScore?.score || 50}</div>
            <div className="text-sm text-muted-foreground">{t('worker.dash.trustScore')}</div>
          </Card>
        </div>

        {/* Quick Actions */}
        <Card className="p-6 transition-all duration-200 hover:shadow-md">
          <h2 className="text-xl font-semibold mb-4">{t('employer.dash.quickActions')}</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Link href="/employer/jobs/post">
              <Button variant="outline" className="w-full justify-start gap-3 h-auto py-4">
                <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                  <PlusCircle className="w-5 h-5 text-accent" />
                </div>
                <div className="text-left">
                  <div className="font-semibold">{t('employer.dash.postJob')}</div>
                  <div className="text-xs text-muted-foreground">{t('employer.dash.subtitle')}</div>
                </div>
              </Button>
            </Link>

            <Link href="/employer/jobs">
              <Button variant="outline" className="w-full justify-start gap-3 h-auto py-4">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Users className="w-5 h-5 text-primary" />
                </div>
                <div className="text-left">
                  <div className="font-semibold">{t('employer.dash.pendingApps')}</div>
                  <div className="text-xs text-muted-foreground">{t('employer.dash.applicants', { count: pendingApplications })}</div>
                </div>
              </Button>
            </Link>

            <Link href="/employer/chat">
              <Button variant="outline" className="w-full justify-start gap-3 h-auto py-4">
                <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-accent" />
                </div>
                <div className="text-left">
                  <div className="font-semibold">{t('nav.messages')}</div>
                  <div className="text-xs text-muted-foreground">{t('employer.dash.chatApplicants')}</div>
                </div>
              </Button>
            </Link>
          </div>
        </Card>

        {/* Analytics Charts */}
        <div className="grid md:grid-cols-2 gap-6">
          <Card className="p-6 card-modern">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold">{t('employer.dash.appsReceived')}</h3>
                <p className="text-xs text-muted-foreground">{t('employer.dash.last7Days')}</p>
              </div>
            </div>
            <SimpleLineChart data={applicationTrendData} />
          </Card>

          <Card className="p-6 card-modern">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                <Briefcase className="w-5 h-5 text-accent" />
              </div>
              <div>
                <h3 className="font-semibold">{t('employer.dash.topJobs')}</h3>
                <p className="text-xs text-muted-foreground">{t('employer.dash.byApplications')}</p>
              </div>
            </div>
            <SimpleBarChart data={jobPerformanceData} />
          </Card>
        </div>

        {/* Recent Jobs */}
        <div>
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-2xl font-bold">{t('employer.dash.recentJobs')}</h2>
            <Link href="/employer/jobs">
              <Button variant="outline" size="sm">
                {t('employer.dash.viewAllJobs')}
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </div>

          {jobs.length === 0 ? (
            <Card className="p-12 text-center transition-all duration-200 hover:shadow-md">
              <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-4">
                <Briefcase className="w-8 h-8 text-accent" />
              </div>
              <h3 className="text-xl font-semibold mb-2">{t('employer.dash.noJobs')}</h3>
              <p className="text-muted-foreground mb-6">
                {t('employer.dash.postFirst')}
              </p>
              <Link href="/employer/jobs/post">
                <Button className="bg-accent hover:bg-accent/90">
                  <PlusCircle className="w-4 h-4 mr-2" />
                  {t('employer.dash.postFirstCta')}
                </Button>
              </Link>
            </Card>
          ) : (
            <div className="grid md:grid-cols-2 gap-6">
              {jobs.slice(0, 4).map((job) => (
                <Card key={job.id} className="card-modern p-6 hover:shadow-soft-lg transition-smooth hover:border-accent/50">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <h3 className="font-semibold mb-1 text-balance">{job.title}</h3>
                      <p className="text-sm text-muted-foreground">{job.category}</p>
                    </div>
                    <Badge
                      variant={
                        job.status === 'active'
                          ? 'default'
                          : job.status === 'filled'
                          ? 'secondary'
                          : 'outline'
                      }
                      className={job.status === 'active' ? 'bg-accent' : ''}
                    >
                      {t(`job.status.${job.status}`) || job.status}
                    </Badge>
                  </div>

                  <div className="space-y-2 mb-4">
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Users className="w-4 h-4" />
                        {t('employer.dash.applicants', { count: appCountByJob[job.id] ?? 0 })}
                      </div>
                      <div className="flex items-center gap-1">
                        <Eye className="w-4 h-4" />
                        {t('employer.dash.views', { count: job.views ?? 0 })}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-4 border-t">
                    <div>
                      <div className="text-xl font-bold text-accent">₹{(job.pay ?? 0).toLocaleString()}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        {job.paymentStatus === 'locked' ? (
                          <>
                            <CheckCircle2 className="w-3 h-3 text-green-500" />
                            {t('payment.escrowSecured')}
                          </>
                        ) : (
                          <>
                            <Clock className="w-3 h-3" />
                            {t('job.status.draft')}
                          </>
                        )}
                      </div>
                    </div>
                    <Link href={`/employer/jobs/${job.id}`}>
                      <Button size="sm" variant="outline">
                        {t('common.viewDetails')}
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </Button>
                    </Link>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Trust Score Info */}
        {trustScore && (
          <Card className="bg-linear-to-br from-primary/5 to-accent/5 p-6 transition-all duration-200 hover:shadow-md">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Star className="w-6 h-6 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold mb-2">Your Trust Score: {trustScore.score}</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  {trustScore.level === 'trusted'
                    ? 'Excellent! You have a trusted reputation.'
                    : trustScore.level === 'active'
                    ? 'Good! Keep completing jobs to increase your score.'
                    : 'Build your reputation by completing jobs successfully.'}
                </p>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <div className="text-muted-foreground">Completion Rate</div>
                    <div className="font-semibold">{trustScore.jobCompletionRate}%</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Average Rating</div>
                    <div className="font-semibold">{trustScore.averageRating.toFixed(1)} / 5.0</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Total Ratings</div>
                    <div className="font-semibold">{trustScore.totalRatings}</div>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
