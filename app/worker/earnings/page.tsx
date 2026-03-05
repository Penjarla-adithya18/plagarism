'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import WorkerNav from '@/components/worker/WorkerNav'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuth } from '@/contexts/AuthContext'
import { useI18n } from '@/contexts/I18nContext'
import { escrowOps, applicationOps, jobOps } from '@/lib/api'
import { EscrowTransaction, Job } from '@/lib/types'
import {
  IndianRupee,
  TrendingUp,
  Clock,
  CheckCircle2,
  ArrowUpRight,
  ArrowDownRight,
  Wallet,
  Calendar,
  Briefcase,
  Download,
} from 'lucide-react'

// ── helpers ────────────────────────────────────────────────────────────────
function fmtCurrency(n: number) {
  return `₹${n.toLocaleString('en-IN')}`
}

function monthKey(dateStr: string) {
  const d = new Date(dateStr)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(key: string) {
  const [y, m] = key.split('-')
  return new Date(Number(y), Number(m) - 1).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
  })
}

const STATUS_COLOR: Record<string, string> = {
  released: 'bg-green-100 text-green-700',
  held: 'bg-yellow-100 text-yellow-700',
  pending: 'bg-blue-100 text-blue-700',
  refunded: 'bg-red-100 text-red-700',
}

// ────────────────────────────────────────────────────────────────────────────
export default function WorkerEarningsPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const { t } = useI18n()

  const [escrowTxns, setEscrowTxns] = useState<EscrowTransaction[]>([])
  const [jobsById, setJobsById] = useState<Record<string, Job>>({})
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<'all' | 'month' | '3months' | '6months'>('all')

  // ── Auth guard ──
  useEffect(() => {
    if (!authLoading && (!user || user.role !== 'worker')) router.replace('/login')
  }, [authLoading, user, router])

  // ── Fetch data ──
  useEffect(() => {
    if (!user) return
    ;(async () => {
      try {
        const txns = await escrowOps.findByUser(user.id, 'worker')
        setEscrowTxns(txns)

        // Batch-fetch unique job info
        const jobIds = [...new Set(txns.map((t) => t.jobId))]
        const jobResults = await Promise.all(jobIds.map((id) => jobOps.findById(id)))
        const map: Record<string, Job> = {}
        jobResults.forEach((j: Job | null) => {
          if (j) map[j.id] = j
        })
        setJobsById(map)
      } catch (e) {
        console.error('Failed to load earnings data', e)
      } finally {
        setLoading(false)
      }
    })()
  }, [user])

  // ── Filtered transactions based on period ──
  const filteredTxns = useMemo(() => {
    if (period === 'all') return escrowTxns
    const now = Date.now()
    const months = period === 'month' ? 1 : period === '3months' ? 3 : 6
    const cutoff = now - months * 30 * 24 * 60 * 60 * 1000
    return escrowTxns.filter((t) => new Date(t.createdAt).getTime() >= cutoff)
  }, [escrowTxns, period])

  // ── Summary metrics ──
  const metrics = useMemo(() => {
    const released = filteredTxns.filter((t) => t.status === 'released')
    const held = filteredTxns.filter((t) => t.status === 'held')
    const pending = filteredTxns.filter((t) => t.status === 'pending')

    const totalEarned = released.reduce((s, t) => s + t.amount - (t.commission ?? 0), 0)
    const totalHeld = held.reduce((s, t) => s + t.amount, 0)
    const totalPending = pending.reduce((s, t) => s + t.amount, 0)
    const totalCommission = released.reduce((s, t) => s + (t.commission ?? 0), 0)

    // Month-over-month comparison
    const now = new Date()
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`

    const thisMonthEarned = released
      .filter((t) => monthKey(t.releasedAt ?? t.createdAt) === thisMonth)
      .reduce((s, t) => s + t.amount - (t.commission ?? 0), 0)
    const prevMonthEarned = released
      .filter((t) => monthKey(t.releasedAt ?? t.createdAt) === prevMonth)
      .reduce((s, t) => s + t.amount - (t.commission ?? 0), 0)

    const growthPct = prevMonthEarned > 0 ? ((thisMonthEarned - prevMonthEarned) / prevMonthEarned) * 100 : 0

    return { totalEarned, totalHeld, totalPending, totalCommission, thisMonthEarned, growthPct, jobCount: released.length }
  }, [filteredTxns])

  // ── Monthly breakdown ──
  const monthlyBreakdown = useMemo(() => {
    const map = new Map<string, { earned: number; commission: number; count: number }>()
    filteredTxns
      .filter((t) => t.status === 'released')
      .forEach((t) => {
        const key = monthKey(t.releasedAt ?? t.createdAt)
        const prev = map.get(key) ?? { earned: 0, commission: 0, count: 0 }
        map.set(key, {
          earned: prev.earned + t.amount - (t.commission ?? 0),
          commission: prev.commission + (t.commission ?? 0),
          count: prev.count + 1,
        })
      })
    return [...map.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([key, data]) => ({ month: key, label: monthLabel(key), ...data }))
  }, [filteredTxns])

  // ── Loading / Auth guard ──
  if (authLoading || !user) {
    return (
      <div className="min-h-screen bg-background">
        <WorkerNav />
        <main className="container mx-auto px-4 py-8">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-32 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-64 rounded-xl" />
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <WorkerNav />
      <main className="container mx-auto px-4 py-8 space-y-8">
        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Wallet className="h-6 w-6 text-primary" />
              <span suppressHydrationWarning>{t('worker.earnings.title')}</span>
            </h1>
            <p className="text-muted-foreground text-sm mt-1" suppressHydrationWarning>{t('worker.earnings.subtitle')}</p>
          </div>
          <Select value={period} onValueChange={(v) => setPeriod(v as typeof period)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Time period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('worker.earnings.allTime')}</SelectItem>
              <SelectItem value="month">{t('worker.earnings.thisMonth')}</SelectItem>
              <SelectItem value="3months">{t('worker.earnings.last3Months')}</SelectItem>
              <SelectItem value="6months">{t('worker.earnings.last6Months')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-32 rounded-xl" />
            ))}
          </div>
        ) : (
          <>
            {/* ── Summary Cards ── */}
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground" suppressHydrationWarning>{t('worker.earnings.totalEarned')}</p>
                      <p className="text-2xl font-bold">{fmtCurrency(metrics.totalEarned)}</p>
                    </div>
                    <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
                      <IndianRupee className="h-6 w-6 text-green-600" />
                    </div>
                  </div>
                  {metrics.growthPct !== 0 && (
                    <div className={`flex items-center gap-1 mt-2 text-xs ${metrics.growthPct > 0 ? 'text-green-600' : 'text-red-600'}`} suppressHydrationWarning>
                      {metrics.growthPct > 0 ? (
                        <ArrowUpRight className="h-3 w-3" />
                      ) : (
                        <ArrowDownRight className="h-3 w-3" />
                      )}
                      {Math.abs(metrics.growthPct).toFixed(1)}% {t('worker.earnings.vsLastMonth')}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground" suppressHydrationWarning>{t('worker.earnings.thisMonthCard')}</p>
                      <p className="text-2xl font-bold">{fmtCurrency(metrics.thisMonthEarned)}</p>
                    </div>
                    <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
                      <Calendar className="h-6 w-6 text-blue-600" />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2" suppressHydrationWarning>{metrics.jobCount} {t(metrics.jobCount === 1 ? 'worker.earnings.jobCompleted' : 'worker.earnings.jobsCompleted')}</p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground" suppressHydrationWarning>{t('worker.earnings.inEscrow')}</p>
                      <p className="text-2xl font-bold">{fmtCurrency(metrics.totalHeld)}</p>
                    </div>
                    <div className="h-12 w-12 rounded-full bg-yellow-100 flex items-center justify-center">
                      <Clock className="h-6 w-6 text-yellow-600" />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2" suppressHydrationWarning>{t('worker.earnings.escrowNote')}</p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground" suppressHydrationWarning>{t('worker.earnings.platformCommission')}</p>
                      <p className="text-2xl font-bold">{fmtCurrency(metrics.totalCommission)}</p>
                    </div>
                    <div className="h-12 w-12 rounded-full bg-purple-100 flex items-center justify-center">
                      <TrendingUp className="h-6 w-6 text-purple-600" />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2" suppressHydrationWarning>
                    {metrics.totalEarned + metrics.totalCommission > 0
                      ? `${((metrics.totalCommission / (metrics.totalEarned + metrics.totalCommission)) * 100).toFixed(1)}% ${t('worker.earnings.effectiveRate')}`
                      : t('worker.earnings.noCommissions')}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* ── Tabs: Transactions / Monthly Breakdown ── */}
            <Tabs defaultValue="transactions" className="w-full">
              <TabsList>
                <TabsTrigger value="transactions">{t('worker.earnings.recentTransactions')}</TabsTrigger>
                <TabsTrigger value="monthly">{t('worker.earnings.monthlyBreakdown')}</TabsTrigger>
              </TabsList>

              {/* ── Transactions Table ── */}
              <TabsContent value="transactions">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg" suppressHydrationWarning>{t('worker.earnings.paymentHistory')}</CardTitle>
                    <CardDescription suppressHydrationWarning>{filteredTxns.length} {t(filteredTxns.length === 1 ? 'worker.earnings.transaction' : 'worker.earnings.transactions')}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {filteredTxns.length === 0 ? (
                      <div className="py-12 text-center">
                        <Wallet className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                        <h3 className="text-lg font-semibold mb-2" suppressHydrationWarning>{t('worker.earnings.noTransactions')}</h3>
                        <p className="text-muted-foreground mb-4" suppressHydrationWarning>{t('worker.earnings.noTransactionsDesc')}</p>
                        <Button onClick={() => router.push('/worker/jobs')}>
                          <Briefcase className="h-4 w-4 mr-2" /> <span suppressHydrationWarning>{t('worker.earnings.browseJobs')}</span>
                        </Button>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b text-left text-muted-foreground">
                              <th className="pb-3 font-medium" suppressHydrationWarning>{t('worker.earnings.job')}</th>
                              <th className="pb-3 font-medium" suppressHydrationWarning>{t('worker.earnings.amount')}</th>
                              <th className="pb-3 font-medium" suppressHydrationWarning>{t('worker.earnings.commission')}</th>
                              <th className="pb-3 font-medium" suppressHydrationWarning>{t('worker.earnings.net')}</th>
                              <th className="pb-3 font-medium" suppressHydrationWarning>{t('worker.earnings.status')}</th>
                              <th className="pb-3 font-medium" suppressHydrationWarning>{t('worker.earnings.date')}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredTxns
                              .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                              .map((txn) => {
                                const job = jobsById[txn.jobId]
                                const commission = txn.commission ?? 0
                                const net = txn.amount - commission
                                return (
                                  <tr key={txn.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                                    <td className="py-3 pr-4 max-w-[200px] truncate font-medium">
                                      {job?.title ?? txn.jobId.slice(0, 8) + '...'}
                                    </td>
                                    <td className="py-3 pr-4">{fmtCurrency(txn.amount)}</td>
                                    <td className="py-3 pr-4 text-muted-foreground">
                                      {commission > 0 ? `-${fmtCurrency(commission)}` : '—'}
                                    </td>
                                    <td className="py-3 pr-4 font-semibold">{fmtCurrency(net)}</td>
                                    <td className="py-3 pr-4">
                                      <Badge variant="outline" className={STATUS_COLOR[txn.status] ?? ''} suppressHydrationWarning>
                                        {t(`worker.earnings.${txn.status}`)}
                                      </Badge>
                                    </td>
                                    <td className="py-3 text-muted-foreground whitespace-nowrap">
                                      {new Date(txn.releasedAt ?? txn.createdAt).toLocaleDateString('en-IN', {
                                        day: 'numeric',
                                        month: 'short',
                                        year: 'numeric',
                                      })}
                                    </td>
                                  </tr>
                                )
                              })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* ── Monthly Breakdown ── */}
              <TabsContent value="monthly">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg" suppressHydrationWarning>{t('worker.earnings.monthlyBreakdownTitle')}</CardTitle>
                    <CardDescription suppressHydrationWarning>{t('worker.earnings.monthlyBreakdownDesc')}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {monthlyBreakdown.length === 0 ? (
                      <div className="py-12 text-center">
                        <Calendar className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                        <h3 className="text-lg font-semibold mb-2" suppressHydrationWarning>{t('worker.earnings.noEarningsData')}</h3>
                        <p className="text-muted-foreground" suppressHydrationWarning>{t('worker.earnings.noEarningsDataDesc')}</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {monthlyBreakdown.map((m) => (
                          <div
                            key={m.month}
                            className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                          >
                            <div>
                              <p className="font-medium">{m.label}</p>
                              <p className="text-xs text-muted-foreground" suppressHydrationWarning>{m.count} {t(m.count === 1 ? 'worker.earnings.jobCompleted' : 'worker.earnings.jobsCompleted')}</p>
                            </div>
                            <div className="text-right">
                              <p className="font-bold text-lg">{fmtCurrency(m.earned)}</p>
                              {m.commission > 0 && (
                                <p className="text-xs text-muted-foreground" suppressHydrationWarning>{t('worker.earnings.commissionLabel')} {fmtCurrency(m.commission)}</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </>
        )}
      </main>
    </div>
  )
}
