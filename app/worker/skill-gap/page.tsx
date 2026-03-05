'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import WorkerNav from '@/components/worker/WorkerNav'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'
import { useAuth } from '@/contexts/AuthContext'
import { useI18n } from '@/contexts/I18nContext'
import { workerProfileOps, jobOps, trustScoreOps } from '@/lib/api'
import {
  analyzeSkillGap,
  generateLearningPlan,
  generateSkillAssessment,
  SkillGapResult,
  AILearningPlan,
  SkillAssessment,
  AssessmentQuestion,
  SupportedLocale,
} from '@/lib/gemini'
import { WorkerProfile, Job } from '@/lib/types'
import {
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Lightbulb,
  RefreshCw,
  ArrowRight,
  Target,
  TrendingUp,
  BookOpen,
  ExternalLink,
  Play,
  GraduationCap,
  FileText,
  Users,
  Zap,
  Loader2,
  ClipboardCheck,
  Trophy,
  XCircle,
  ChevronRight,
  Award,
  Star,
} from 'lucide-react'

// ── Assessment state type ───────────────────────────────────────────────────
interface AssessmentState {
  assessment: SkillAssessment
  currentQ: number
  answers: (number | null)[]
  submitted: boolean
  score: number
  passed: boolean
}

export default function SkillGapPage() {
  const { user, loading: authLoading } = useAuth()
  const { t, locale } = useI18n()
  const router = useRouter()

  const [profile, setProfile] = useState<WorkerProfile | null>(null)
  const [demandedSkills, setDemandedSkills] = useState<string[]>([])
  const [analysis, setAnalysis] = useState<SkillGapResult | null>(null)
  const [learningPlan, setLearningPlan] = useState<AILearningPlan | null>(null)
  const [loadingPlan, setLoadingPlan] = useState(false)
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)

  // Assessment state
  const [assessmentLoading, setAssessmentLoading] = useState<string | null>(null)
  const [activeAssessment, setActiveAssessment] = useState<AssessmentState | null>(null)
  const [completedAssessments, setCompletedAssessments] = useState<Map<string, { passed: boolean; score: number; total: number }>>(new Map())
  const [profileUpdating, setProfileUpdating] = useState(false)

  // Auth guard
  useEffect(() => {
    if (!authLoading && (!user || user.role !== 'worker')) router.replace('/login')
  }, [authLoading, user, router])

  // Load profile & demanded skills
  useEffect(() => {
    if (!user) return
    ;(async () => {
      try {
        const [prof, allJobs] = await Promise.all([
          workerProfileOps.findByUserId(user.id),
          jobOps.getAll({ status: 'active' }),
        ])
        setProfile(prof)

        const freq = new Map<string, number>()
        allJobs.forEach((j) =>
          j.requiredSkills.forEach((s) => {
            const key = s.toLowerCase().trim()
            freq.set(key, (freq.get(key) ?? 0) + 1)
          }),
        )
        const ranked = [...freq.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 20)
          .map(([skill]) => skill.charAt(0).toUpperCase() + skill.slice(1))
        setDemandedSkills(ranked)
      } catch (e) {
        console.error('Failed to load skill gap data', e)
      } finally {
        setLoading(false)
      }
    })()
  }, [user, locale])

  // ── Run AI analysis (always fresh — no session cache) ────────────────────
  const runAnalysis = useCallback(async (forceRefresh = false) => {
    if (!profile || demandedSkills.length === 0) return
    setAnalyzing(true)
    setLearningPlan(null)
    setActiveAssessment(null)
    try {
      if (forceRefresh && user) {
        sessionStorage.removeItem(`skill_gap_${user.id}_${locale}`)
        sessionStorage.removeItem(`learning_plan_${user.id}_${locale}`)
      }
      const result = await analyzeSkillGap(
        profile.skills ?? [],
        demandedSkills,
        locale as SupportedLocale,
      )
      setAnalysis(result)
    } catch (e) {
      console.error('Skill gap analysis failed', e)
    } finally {
      setAnalyzing(false)
    }
  }, [profile, demandedSkills, user, locale])

  // Fetch learning plan
  const fetchLearningPlan = useCallback(async () => {
    if (!profile || !analysis || analysis.gapSkills.length === 0) return
    setLoadingPlan(true)
    try {
      const plan = await generateLearningPlan(
        'In-demand skills',
        demandedSkills,
        profile.skills ?? [],
        profile.experience ?? 'not specified',
        locale as SupportedLocale,
      )
      setLearningPlan(plan)
    } catch (e) {
      console.error('Learning plan generation failed', e)
    } finally {
      setLoadingPlan(false)
    }
  }, [profile, analysis, demandedSkills, locale])

  // Auto-fetch learning plan when analysis completes
  useEffect(() => {
    if (analysis && !learningPlan && !loadingPlan && profile) {
      fetchLearningPlan()
    }
  }, [analysis, learningPlan, loadingPlan, profile, fetchLearningPlan])

  // Auto-analyze on first load
  useEffect(() => {
    if (!loading && profile && demandedSkills.length > 0 && !analysis) {
      runAnalysis()
    }
  }, [loading, profile, demandedSkills, analysis, runAnalysis])

  // ── Re-analyze — always fresh from AI ────────────────────────────────────
  const handleReAnalyze = () => {
    setCompletedAssessments(new Map())
    runAnalysis(true)
  }

  // ── Start assessment for a skill ─────────────────────────────────────────
  const startAssessment = async (skill: string) => {
    setAssessmentLoading(skill)
    try {
      const assessment = await generateSkillAssessment(skill, 'beginner', locale as SupportedLocale, 5)
      setActiveAssessment({
        assessment,
        currentQ: 0,
        answers: new Array(assessment.questions.length).fill(null),
        submitted: false,
        score: 0,
        passed: false,
      })
    } catch (e) {
      console.error('Assessment generation failed', e)
    } finally {
      setAssessmentLoading(null)
    }
  }

  // ── Select answer ────────────────────────────────────────────────────────
  const selectAnswer = (qIndex: number, optionIndex: number) => {
    if (!activeAssessment || activeAssessment.submitted) return
    setActiveAssessment((prev) => {
      if (!prev) return prev
      const answers = [...prev.answers]
      answers[qIndex] = optionIndex
      return { ...prev, answers }
    })
  }

  // ── Submit assessment ────────────────────────────────────────────────────
  const submitAssessment = async () => {
    if (!activeAssessment || !user) return
    const { assessment, answers } = activeAssessment
    let score = 0
    answers.forEach((a, i) => {
      if (a === assessment.questions[i].correctIndex) score++
    })
    const passed = score >= assessment.passingScore
    setActiveAssessment((prev) => prev ? { ...prev, submitted: true, score, passed } : prev)

    setCompletedAssessments((prev) => {
      const next = new Map(prev)
      next.set(assessment.skill.toLowerCase(), { passed, score, total: assessment.questions.length })
      return next
    })

    // If passed → update worker profile + boost trust score
    if (passed && profile) {
      setProfileUpdating(true)
      try {
        const currentSkills = profile.skills ?? []
        const skillLower = assessment.skill.toLowerCase()
        const alreadyHas = currentSkills.some((s) => s.toLowerCase() === skillLower)
        if (!alreadyHas) {
          const newSkills = [...currentSkills, assessment.skill]
          const updatedProfile = await workerProfileOps.update(user.id, { skills: newSkills })
          if (updatedProfile) setProfile(updatedProfile)
          else setProfile({ ...profile, skills: newSkills })
        }
        try {
          const trust = await trustScoreOps.findByUserId(user.id)
          if (trust) {
            const newRating = Math.min(5, (trust.averageRating || 4) + 0.1)
            const newScore = Math.min(100, (trust.score || 50) + 2)
            await trustScoreOps.update(user.id, {
              averageRating: Math.round(newRating * 10) / 10,
              score: Math.round(newScore),
              totalRatings: (trust.totalRatings || 0) + 1,
            })
          }
        } catch { /* trust update best-effort */ }
      } catch (e) {
        console.error('Profile update failed', e)
      } finally {
        setProfileUpdating(false)
      }
    }
  }

  const closeAssessment = () => setActiveAssessment(null)

  // Passed assessment count
  const passedCount = useMemo(
    () => [...completedAssessments.values()].filter((r) => r.passed).length,
    [completedAssessments],
  )

  // Market Readiness % — grows as assessments are passed
  const matchPct = useMemo(() => {
    if (!analysis || demandedSkills.length === 0) return 0
    const effective = analysis.strongSkills.length + passedCount
    return Math.min(100, Math.round((effective / demandedSkills.length) * 100))
  }, [analysis, demandedSkills, passedCount])

  // AI Learning Plan readiness — base score from AI, boosted per passed assessment
  const dynamicReadinessScore = useMemo(() => {
    if (!learningPlan) return 0
    const base = learningPlan.readinessScore
    const totalGap = analysis?.gapSkills.length ?? 1
    const bonus = passedCount > 0
      ? Math.round((passedCount / totalGap) * (100 - base))
      : 0
    return Math.min(100, base + bonus)
  }, [learningPlan, passedCount, analysis])

  // ── Loading / auth skeleton ──────────────────────────────────────────────
  // ── Loading / auth skeleton ──────────────────────────────────────────────
  if (authLoading || !user) {
    return (
      <div className="min-h-screen bg-background">
        <WorkerNav />
        <main className="container mx-auto px-4 py-8">
          <Skeleton className="h-10 w-64 mb-6" />
          <div className="grid md:grid-cols-3 gap-4 mb-8">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-32 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-64 rounded-xl" />
        </main>
      </div>
    )
  }

  // ── Active Assessment View ────────────────────────────────────────────────
  if (activeAssessment) {
    const { assessment, currentQ, answers, submitted, score, passed } = activeAssessment
    const q: AssessmentQuestion = assessment.questions[currentQ]
    const totalQ = assessment.questions.length
    const answeredCount = answers.filter((a) => a !== null).length

    return (
      <div className="min-h-screen bg-background">
        <WorkerNav />
        <main className="container mx-auto px-4 py-8 max-w-3xl space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold flex items-center gap-2">
                <ClipboardCheck className="h-5 w-5 text-primary" />
                {assessment.skill} {t('skillGap.assessmentTitle')}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                {submitted ? t('skillGap.results') : `${t('skillGap.questionOf')} ${currentQ + 1} ${t('skillGap.of')} ${totalQ}`}
                {' · '}
                <Badge variant="outline" className="text-xs ml-1">{assessment.difficulty}</Badge>
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={closeAssessment}>
              {submitted ? t('skillGap.backToSkills') : t('common.cancel')}
            </Button>
          </div>

          <Progress value={submitted ? 100 : ((currentQ + 1) / totalQ) * 100} className="h-2" />

          {submitted ? (
            <Card className={passed ? 'border-green-300 bg-green-50/50 dark:bg-green-950/20' : 'border-red-300 bg-red-50/50 dark:bg-red-950/20'}>
              <CardContent className="pt-8 pb-8 text-center space-y-4">
                {passed ? (
                  <>
                    <div className="h-20 w-20 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center mx-auto">
                      <Trophy className="h-10 w-10 text-green-600" />
                    </div>
                    <h2 className="text-2xl font-bold text-green-700 dark:text-green-400">{t('skillGap.assessmentPassed')}</h2>
                    <p className="text-lg font-semibold">{score} / {totalQ} correct</p>
                    <div className="bg-green-100 dark:bg-green-900/50 rounded-lg p-4 max-w-md mx-auto space-y-2">
                      <p className="flex items-center gap-2 text-sm text-green-800 dark:text-green-300">
                        <CheckCircle2 className="h-4 w-4 shrink-0" />
                        <strong>{assessment.skill}</strong> {t('skillGap.skillAdded')}
                      </p>
                      <p className="flex items-center gap-2 text-sm text-green-800 dark:text-green-300">
                        <Star className="h-4 w-4 shrink-0" />
                        {t('skillGap.trustBoosted')}
                      </p>
                      <p className="flex items-center gap-2 text-sm text-green-800 dark:text-green-300">
                        <Award className="h-4 w-4 shrink-0" />
                        {t('skillGap.ratingBoosted')}
                      </p>
                    </div>
                    {profileUpdating && (
                      <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" /> {t('skillGap.updatingProfile')}
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <div className="h-20 w-20 rounded-full bg-red-100 dark:bg-red-900 flex items-center justify-center mx-auto">
                      <XCircle className="h-10 w-10 text-red-600" />
                    </div>
                    <h2 className="text-2xl font-bold text-red-700 dark:text-red-400">{t('skillGap.keepLearning')}</h2>
                    <p className="text-lg font-semibold">{score} / {totalQ} correct</p>
                    <p className="text-sm text-muted-foreground">
                      {t('skillGap.needMoreCorrect')} {assessment.passingScore} {t('skillGap.correctAnswers')}
                    </p>
                  </>
                )}

                <div className="text-left space-y-4 mt-6 max-w-lg mx-auto">
                  <h3 className="font-semibold text-sm text-muted-foreground">{t('skillGap.reviewAnswers')}</h3>
                  {assessment.questions.map((rq, qi) => {
                    const userAns = answers[qi]
                    const isCorrect = userAns === rq.correctIndex
                    return (
                      <div key={qi} className={`rounded-lg border p-4 ${isCorrect ? 'border-green-200 bg-green-50/50 dark:bg-green-950/10' : 'border-red-200 bg-red-50/50 dark:bg-red-950/10'}`}>
                        <p className="text-sm font-medium mb-2 flex items-start gap-2">
                          {isCorrect ? <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0 mt-0.5" /> : <XCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />}
                          Q{qi + 1}: {rq.question}
                        </p>
                        <div className="space-y-1 ml-6">
                          {rq.options.map((opt, oi) => (
                            <p key={oi} className={`text-xs px-2 py-1 rounded ${
                              oi === rq.correctIndex ? 'bg-green-100 dark:bg-green-900/50 font-semibold text-green-800 dark:text-green-300'
                              : oi === userAns && oi !== rq.correctIndex ? 'bg-red-100 dark:bg-red-900/50 line-through text-red-700'
                              : 'text-muted-foreground'
                            }`}>
                              {String.fromCharCode(65 + oi)}. {opt}
                            </p>
                          ))}
                        </div>
                        <p className="text-xs text-muted-foreground mt-2 ml-6 italic">{rq.explanation}</p>
                      </div>
                    )
                  })}
                </div>

                <div className="flex gap-3 justify-center mt-6">
                  <Button variant="outline" onClick={closeAssessment}>{t('skillGap.backToSkills')}</Button>
                  {!passed && (
                    <Button onClick={() => startAssessment(assessment.skill)}>
                      <RefreshCw className="h-4 w-4 mr-2" /> {t('skillGap.retakeAssessment')}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="pt-6 space-y-6">
                <div>
                  <p className="text-xs text-muted-foreground mb-2">{t('skillGap.questionOf')} {currentQ + 1} {t('skillGap.of')} {totalQ}</p>
                  <h3 className="text-lg font-semibold leading-snug">{q.question}</h3>
                </div>
                <div className="space-y-3">
                  {q.options.map((option, oi) => (
                    <button
                      key={oi}
                      onClick={() => selectAnswer(currentQ, oi)}
                      className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                        answers[currentQ] === oi
                          ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                          : 'border-muted hover:border-primary/40 hover:bg-muted/50'
                      }`}
                    >
                      <span className="flex items-center gap-3">
                        <span className={`h-7 w-7 rounded-full border-2 flex items-center justify-center text-sm font-semibold shrink-0 ${
                          answers[currentQ] === oi
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-muted-foreground/40'
                        }`}>
                          {String.fromCharCode(65 + oi)}
                        </span>
                        <span className="text-sm">{option}</span>
                      </span>
                    </button>
                  ))}
                </div>
                <div className="flex items-center justify-between pt-2">
                  <Button variant="outline" size="sm" disabled={currentQ === 0} onClick={() => setActiveAssessment((p) => p ? { ...p, currentQ: p.currentQ - 1 } : p)}>
                    {t('skillGap.previous')}
                  </Button>
                  <p className="text-xs text-muted-foreground">{answeredCount}/{totalQ} {t('skillGap.answered')}</p>
                  {currentQ < totalQ - 1 ? (
                    <Button size="sm" onClick={() => setActiveAssessment((p) => p ? { ...p, currentQ: p.currentQ + 1 } : p)}>
                      {t('skillGap.next')} <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  ) : (
                    <Button size="sm" disabled={answeredCount < totalQ} onClick={submitAssessment} className="bg-green-600 hover:bg-green-700">
                      <ClipboardCheck className="h-4 w-4 mr-1" /> {t('skillGap.submit')}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <WorkerNav />
      <main className="container mx-auto px-4 py-8 space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Target className="h-6 w-6 text-primary" />
              {t('skillGap.title')}
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              {t('skillGap.subtitle')}
            </p>
          </div>
          <Button
            onClick={handleReAnalyze}
            disabled={analyzing || !profile || demandedSkills.length === 0}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${analyzing ? 'animate-spin' : ''}`} />
            {analyzing ? t('skillGap.analyzing') : t('skillGap.reAnalyze')}
          </Button>
        </div>

        {loading || analyzing ? (
          <div className="space-y-4">
            <div className="grid md:grid-cols-3 gap-4">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-32 rounded-xl" />
              ))}
            </div>
            <Skeleton className="h-48 rounded-xl" />
          </div>
        ) : !profile?.skills?.length ? (
          /* No skills on profile */
          <Card>
            <CardContent className="py-12 text-center">
              <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-yellow-500" />
              <h3 className="text-lg font-semibold mb-2">{t('skillGap.noProfile')}</h3>
              <p className="text-muted-foreground mb-4">
                {t('skillGap.noProfileDesc')}
              </p>
              <Button onClick={() => router.push('/worker/profile')}>
                <ArrowRight className="h-4 w-4 mr-2" /> {t('skillGap.goToProfile')}
              </Button>
            </CardContent>
          </Card>
        ) : analysis ? (
          <>
            {/* Summary Cards */}
            <div className="grid sm:grid-cols-3 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm text-muted-foreground">{t('skillGap.marketReadiness')}</p>
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <TrendingUp className="h-5 w-5 text-primary" />
                    </div>
                  </div>
                  <div className="text-3xl font-bold mb-2">
                    {matchPct}%
                    {passedCount > 0 && (
                      <span className="ml-2 text-sm font-normal text-green-600">
                        +{passedCount} {t('skillGap.assessed')}
                      </span>
                    )}
                  </div>
                  <Progress value={matchPct} className="h-2" />
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm text-muted-foreground">{t('skillGap.strongSkills')}</p>
                    <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                    </div>
                  </div>
                  <div className="text-3xl font-bold">{analysis.strongSkills.length + passedCount}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t('skillGap.inDemandDesc')}{passedCount > 0 ? ` (+${passedCount} ${t('skillGap.assessed')})` : ''}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm text-muted-foreground">{t('skillGap.skillGaps')}</p>
                    <div className="h-10 w-10 rounded-full bg-orange-100 flex items-center justify-center">
                      <AlertTriangle className="h-5 w-5 text-orange-600" />
                    </div>
                  </div>
                  <div className="text-3xl font-bold">{Math.max(0, analysis.gapSkills.length - passedCount)}</div>
                  <p className="text-xs text-muted-foreground mt-1">{t('skillGap.skillsToLearnDesc')}</p>
                </CardContent>
              </Card>
            </div>

            {/* AI Summary */}
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <Sparkles className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium mb-1">{t('skillGap.aiAssessment')}</p>
                    <p className="text-sm text-muted-foreground">{analysis.summary}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Strong Skills */}
            {analysis.strongSkills.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                    {t('skillGap.yourStrongSkills')}
                  </CardTitle>
                  <CardDescription>{t('skillGap.strongSkillsDesc')}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {[...new Set(analysis.strongSkills)].map((skill) => (
                      <Badge key={skill} variant="outline" className="bg-green-50 text-green-700 border-green-200 py-1.5 px-3">
                        <CheckCircle2 className="h-3 w-3 mr-1.5" />
                        {skill}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Skill Gaps + Tips */}
            {analysis.tips.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <BookOpen className="h-5 w-5 text-orange-600" />
                    {t('skillGap.skillsToLearn')}
                  </CardTitle>
                  <CardDescription>{t('skillGap.skillsToLearnCardDesc')}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {analysis.tips.map((tip, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                      >
                        <div className="h-8 w-8 rounded-full bg-orange-100 flex items-center justify-center shrink-0 mt-0.5">
                          <Lightbulb className="h-4 w-4 text-orange-600" />
                        </div>
                        <div>
                          <p className="font-medium">{tip.skill}</p>
                          <p className="text-sm text-muted-foreground mt-0.5">{tip.suggestion}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* AI Learning Resources */}
            {(learningPlan || loadingPlan) && (
              <Card className="border-blue-200/50">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <GraduationCap className="h-5 w-5 text-blue-600" />
                        {t('skillGap.learningPlan')}
                      </CardTitle>
                      <CardDescription>{t('skillGap.learningPlanDesc')}</CardDescription>
                    </div>
                    {learningPlan && (
                      <div className="text-right">
                        <div className="text-2xl font-bold text-blue-600">
                          {dynamicReadinessScore}%
                          {passedCount > 0 && (
                            <span className="ml-1 text-xs font-normal text-green-600">
                              +{dynamicReadinessScore - learningPlan.readinessScore}%
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">{t('skillGap.readiness')}</p>
                        {passedCount > 0 && (
                          <p className="text-[10px] text-green-600 mt-0.5">{passedCount} {passedCount > 1 ? t('skillGap.skillsAssessedPlural') : t('skillGap.skillsAssessed')}</p>
                        )}
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  {loadingPlan ? (
                    <div className="flex items-center justify-center py-8 gap-3">
                      <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                      <p className="text-sm text-muted-foreground">{t('skillGap.generatingPlan')}</p>
                    </div>
                  ) : learningPlan ? (
                    <>
                      {/* Quick Wins */}
                      {learningPlan.quickWins.length > 0 && (
                        <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-4">
                          <h4 className="font-medium flex items-center gap-2 mb-3">
                            <Zap className="h-4 w-4 text-blue-600" />
                            {t('skillGap.quickWins')}
                          </h4>
                          <ul className="space-y-2">
                            {learningPlan.quickWins.map((win, i) => (
                              <li key={i} className="flex items-start gap-2 text-sm">
                                <span className="h-5 w-5 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                                  {i + 1}
                                </span>
                                {win}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Per-skill resources */}
                      {learningPlan.resources
                        .filter((r) => !r.hasSkill)
                        .map((lr) => (
                          <div key={lr.skill} className="border rounded-lg p-4">
                            <div className="flex items-center justify-between mb-3">
                              <h4 className="font-semibold text-base">{lr.skill}</h4>
                              <div className="flex items-center gap-2">
                                {completedAssessments.get(lr.skill.toLowerCase())?.passed && (
                                  <Badge className="bg-green-100 text-green-700 text-[10px]">
                                    <Trophy className="h-3 w-3 mr-1" /> {t('skillGap.assessedBadge')}
                                  </Badge>
                                )}
                                <Badge variant="outline" className="text-xs">
                                  {lr.estimatedTime}
                                </Badge>
                              </div>
                            </div>
                            <div className="space-y-2">
                              {lr.resources.map((res, ri) => {
                                const TypeIcon =
                                  res.type === 'video' ? Play
                                  : res.type === 'course' ? GraduationCap
                                  : res.type === 'community' ? Users
                                  : res.type === 'practice' ? Target
                                  : FileText
                                return (
                                  <a
                                    key={ri}
                                    href={res.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-start gap-3 p-2.5 rounded-md border hover:bg-muted/50 transition-colors group"
                                  >
                                    <div className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center shrink-0 mt-0.5">
                                      <TypeIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="font-medium text-sm group-hover:text-blue-600 transition-colors flex items-center gap-1.5">
                                        {res.title}
                                        <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                                      </p>
                                      <p className="text-xs text-muted-foreground mt-0.5">{res.description}</p>
                                      <div className="flex items-center gap-2 mt-1">
                                        <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                                          {res.platform}
                                        </Badge>
                                        {res.free && (
                                          <Badge variant="secondary" className="text-[10px] h-4 px-1.5 bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                                            Free
                                          </Badge>
                                        )}
                                      </div>
                                    </div>
                                  </a>
                                )
                              })}
                            </div>
                            {!completedAssessments.get(lr.skill.toLowerCase())?.passed && (
                              <Button size="sm" variant="outline" className="mt-3 w-full border-dashed" disabled={assessmentLoading === lr.skill} onClick={() => startAssessment(lr.skill)}>
                                {assessmentLoading === lr.skill
                                  ? <><Loader2 className="h-3 w-3 animate-spin mr-1" /> {t('skillGap.generatingQuiz')}</>
                                  : <><ClipboardCheck className="h-3 w-3 mr-1" /> {t('skillGap.takeAssessmentFor')} {lr.skill}</>}
                              </Button>
                            )}
                          </div>
                        ))}

                      {/* Skills you already have (level-up) */}
                      {learningPlan.resources.filter((r) => r.hasSkill).length > 0 && (
                        <div>
                          <h4 className="font-medium text-sm text-muted-foreground mb-3 flex items-center gap-2">
                            <TrendingUp className="h-4 w-4" />
                            {t('skillGap.levelUp')}
                          </h4>
                          <div className="grid sm:grid-cols-2 gap-3">
                            {learningPlan.resources
                              .filter((r) => r.hasSkill)
                              .map((lr) => (
                                <div key={lr.skill} className="border rounded-lg p-3">
                                  <p className="font-medium text-sm mb-2 flex items-center gap-1.5">
                                    <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                                    {lr.skill}
                                  </p>
                                  {lr.resources.map((res, ri) => (
                                    <a
                                      key={ri}
                                      href={res.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                                    >
                                      <ExternalLink className="h-3 w-3" />
                                      {res.title}
                                    </a>
                                  ))}
                                </div>
                              ))}
                          </div>
                        </div>
                      )}

                      {/* Career Path */}
                      {learningPlan.careerPath && (
                        <div className="bg-gradient-to-r from-primary/5 to-blue-50 dark:from-primary/10 dark:to-blue-950/30 rounded-lg p-4">
                          <h4 className="font-medium flex items-center gap-2 mb-2">
                            <TrendingUp className="h-4 w-4 text-primary" />
                            {t('skillGap.careerPath')}
                          </h4>
                          <p className="text-sm text-muted-foreground">{learningPlan.careerPath}</p>
                        </div>
                      )}
                    </>
                  ) : null}
                </CardContent>
              </Card>
            )}

            {/* ── Skill Assessments — appears after learning resources so users study first ── */}
            {analysis.gapSkills.length > 0 && (
              <Card className="border-purple-200/50">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <ClipboardCheck className="h-5 w-5 text-purple-600" />
                    {t('skillGap.skillAssessments')}
                  </CardTitle>
                  <CardDescription>
                    {t('skillGap.skillAssessmentsDesc')}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid sm:grid-cols-2 gap-3">
                    {analysis.gapSkills.map((skill) => {
                      const completed = completedAssessments.get(skill.toLowerCase())
                      const isLoading = assessmentLoading === skill
                      return (
                        <div key={skill} className={`border rounded-lg p-4 flex items-center justify-between gap-3 ${
                          completed?.passed ? 'border-green-200 bg-green-50/50 dark:bg-green-950/20'
                          : completed && !completed.passed ? 'border-red-200 bg-red-50/50 dark:bg-red-950/20'
                          : ''
                        }`}>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm flex items-center gap-2">
                              {completed?.passed ? <Trophy className="h-4 w-4 text-green-600 shrink-0" />
                               : completed ? <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                               : <Target className="h-4 w-4 text-purple-600 shrink-0" />}
                              {skill}
                            </p>
                            {completed && (
                              <p className={`text-xs mt-1 ${completed.passed ? 'text-green-600' : 'text-red-500'}`}>
                                {completed.passed ? t('skillGap.passedLabel') : t('skillGap.failedLabel')} — {completed.score}/{completed.total} {t('skillGap.correct')}
                              </p>
                            )}
                          </div>
                          <Button size="sm" variant={completed?.passed ? 'outline' : 'default'} disabled={isLoading} onClick={() => startAssessment(skill)}
                            className={`shrink-0 ${completed?.passed ? 'border-green-300 text-green-700' : ''}`}>
                            {isLoading ? <><Loader2 className="h-3 w-3 animate-spin mr-1" /> {t('skillGap.loading')}</>
                             : completed?.passed ? <><Award className="h-3 w-3 mr-1" /> {t('skillGap.retake')}</>
                             : completed ? <><RefreshCw className="h-3 w-3 mr-1" /> {t('skillGap.retry')}</>
                             : <><ClipboardCheck className="h-3 w-3 mr-1" /> {t('skillGap.takeQuiz')}</>}
                          </Button>
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Top Demanded Skills overview */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t('skillGap.topDemanded')}</CardTitle>
                <CardDescription>{t('skillGap.topDemandedDesc')} {demandedSkills.length} {t('skillGap.topDemandedDesc2')}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {demandedSkills.map((skill) => {
                    const hasSkill = analysis.strongSkills
                      .map((s) => s.toLowerCase())
                      .includes(skill.toLowerCase())
                    const assessed = completedAssessments.get(skill.toLowerCase())?.passed
                    return (
                      <Badge
                        key={skill}
                        variant="outline"
                        className={
                          hasSkill || assessed
                            ? 'bg-green-50 text-green-700 border-green-200'
                            : 'bg-muted text-muted-foreground'
                        }
                      >
                        {(hasSkill || assessed) && <CheckCircle2 className="h-3 w-3 mr-1" />}
                        {skill}
                      </Badge>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          </>
        ) : null}
      </main>
    </div>
  )
}
