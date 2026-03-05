'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { db } from '@/lib/api'
import { Job } from '@/lib/types'
import { useI18n } from '@/contexts/I18nContext'
import {
  CheckCircle2,
  Copy,
  Briefcase,
  ArrowRight,
  Shield,
  Calendar,
  Download,
} from 'lucide-react'
import Link from 'next/link'

function generateTxnId() {
  return 'HLP' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase()
}

export default function PaymentSuccessPage() {
  const params = useParams()
  const router = useRouter()
  const jobId = params.jobId as string
  const calledRef = useRef(false)

  const [job, setJob] = useState<Job | null>(null)
  const [txnId, setTxnId] = useState('')
  const [paidAt, setPaidAt] = useState('')
  const [copied, setCopied] = useState(false)
  const [activating, setActivating] = useState(true)
  const { t } = useI18n()

  useEffect(() => {
    if (calledRef.current) return
    calledRef.current = true
    setTxnId(generateTxnId())
    setPaidAt(new Date().toLocaleString('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }))
    activateJob()
  }, [jobId])

  const activateJob = async () => {
    try {
      const jobData = await db.getJobById(jobId)
      if (!jobData) return

      // Lock payment at job level; transaction row is created when a worker is selected.
      await db.updateJob(jobId, { status: 'active', paymentStatus: 'locked' })

      const updatedJob = await db.getJobById(jobId)
      setJob(updatedJob)
    } catch (err) {
      console.error('Failed to activate job', err)
    } finally {
      setActivating(false)
    }
  }

  const handleCopy = () => {
    if (!txnId) return
    navigator.clipboard.writeText(txnId)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const amount = (job?.payAmount ?? job?.pay ?? 0)
  const platformFee = Math.round(amount * 0.02)
  const total = amount + platformFee

  if (activating) {
    return (
      <div className="app-surface flex items-center justify-center flex-col gap-4">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-muted-foreground">{t('employer.paymentSuccess.activating')}</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-green-50 to-emerald-50 flex items-start justify-center pt-12 pb-16 px-4">
      <div className="max-w-md w-full space-y-4">
        {/* Success header */}
        <div className="text-center space-y-2">
          <div className="relative inline-flex">
            <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="w-10 h-10 text-green-600" />
            </div>
            {/* Pulse ring */}
            <span className="absolute inset-0 rounded-full animate-ping bg-green-200 opacity-40" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">{t('employer.paymentSuccess.title')}</h1>
          <p className="text-slate-500 text-sm">{t('employer.paymentSuccess.subtitle')}</p>
        </div>

        {/* Transaction card */}
        <Card className="border-green-200 shadow-lg">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">{t('employer.paymentSuccess.amountPaid')}</span>
              <span className="text-2xl font-bold text-green-700">₹{total.toLocaleString()}</span>
            </div>

            <Separator />

            <div className="space-y-2.5 text-sm">
              <div className="flex justify-between text-slate-600">
                <span>{t('employer.paymentSuccess.transactionId')}</span>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-xs font-semibold text-slate-800">{txnId}</span>
                  <button onClick={handleCopy} className="text-primary hover:text-primary/80">
                    {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>{t('employer.paymentSuccess.dateTime')}</span>
                <span className="text-slate-800">{paidAt}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>{t('employer.paymentSuccess.paymentFor')}</span>
                <span className="text-slate-800 text-right max-w-[55%] truncate">{job?.title}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>{t('employer.paymentSuccess.escrowStatus')}</span>
                <Badge className="bg-green-100 text-green-800 border-green-200 text-xs">
                  🔒 {t('employer.paymentSuccess.locked')}
                </Badge>
              </div>
            </div>

            <Separator />

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800 space-y-1">
              <p className="font-semibold flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5" /> {t('employer.paymentSuccess.nextTitle')}
              </p>
              <ol className="list-decimal list-inside space-y-0.5 text-blue-700">
                <li>{t('employer.paymentSuccess.next1')}</li>
                <li>{t('employer.paymentSuccess.next2')}</li>
                <li>{t('employer.paymentSuccess.next3')}</li>
                <li>{t('employer.paymentSuccess.next4')}</li>
              </ol>
            </div>
          </CardContent>
        </Card>

        {/* Receipt download hint */}
        <div className="flex items-center justify-center gap-2 text-xs text-slate-400">
          <Calendar className="w-3 h-3" />
          <span>{t('employer.paymentSuccess.receiptSent')}</span>
        </div>

        {/* CTAs */}
        <div className="flex flex-col gap-3">
          <Link href={`/employer/jobs/${jobId}`}>
            <Button className="w-full gap-2 bg-primary hover:bg-primary/90">
              <Briefcase className="w-4 h-4" />
              {t('employer.paymentSuccess.viewJob')}
              <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
          <Link href="/employer/jobs/post">
            <Button variant="outline" className="w-full gap-2">
              {t('employer.paymentSuccess.postAnother')}
            </Button>
          </Link>
          <Link href="/employer/dashboard">
            <Button variant="ghost" className="w-full text-slate-500">
              {t('employer.paymentSuccess.goDashboard')}
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}
