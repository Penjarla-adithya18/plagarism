'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import EmployerNav from '@/components/employer/EmployerNav'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'
import { workerProfileOps, userOps, jobOps, applicationOps } from '@/lib/api'
import { ragStore, ragSearch, parseRAGQuery, type RAGSearchResult } from '@/lib/ragEngine'
import { extractTextFromDataUrl } from '@/lib/resumeParser'
import type { Application, ResumeData, User } from '@/lib/types'
import { useI18n } from '@/contexts/I18nContext'
import {
  Search, Send, Bot, User as UserIcon, FileText, Briefcase,
  Star, ChevronRight, Loader2, Database, Sparkles
} from 'lucide-react'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  results?: RAGSearchResult[]
  timestamp: Date
}

export default function ResumeSearchPage() {
  const router = useRouter()
  const { user } = useAuth()
  const { toast } = useToast()
  const { t } = useI18n()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [searching, setSearching] = useState(false)
  const [indexing, setIndexing] = useState(false)
  const [indexedCount, setIndexedCount] = useState(0)
  const chatEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Index all worker resumes on page load
  useEffect(() => {
    if (!user || user.role !== 'employer') return
    indexWorkerResumes()
  }, [user])

  const indexWorkerResumes = async () => {
    if (!user) return
    setIndexing(true)
    ragStore.clear()
    try {
      // Step 1: Get only this employer's jobs
      const jobs = await jobOps.findByEmployerId(user.id)

      if (jobs.length === 0) {
        setIndexedCount(0)
        setMessages([{
          id: 'welcome',
          role: 'assistant',
          content: t('employer.resume.welcomeNoJobs'),
          timestamp: new Date(),
        }])
        return
      }

      // Step 2: Fetch all applications for each job in parallel
      const appArrays = await Promise.all(
        jobs.map((j) => applicationOps.findByJobId(j.id).catch(() => [] as Application[]))
      )
      const allApps = appArrays.flat()

      if (allApps.length === 0) {
        setIndexedCount(0)
        setMessages([{
          id: 'welcome',
          role: 'assistant',
          content: t('employer.resume.welcomeNoApplicants'),
          timestamp: new Date(),
        }])
        return
      }

      // Step 3: Deduplicate by worker — prefer the application that has a resumeUrl
      const workerAppMap = new Map<string, Application>()
      for (const app of allApps) {
        const existing = workerAppMap.get(app.workerId)
        if (!existing || (app.resumeUrl && !existing.resumeUrl)) {
          workerAppMap.set(app.workerId, app)
        }
      }

      // Step 4: Build index from profile skills/bio + cover letter (no AI parsing)
      let count = 0
      const uniqueWorkerIds = Array.from(workerAppMap.keys())
      const BATCH = 6
      for (let i = 0; i < uniqueWorkerIds.length; i += BATCH) {
        await Promise.all(
          uniqueWorkerIds.slice(i, i + BATCH).map(async (workerId) => {
            try {
              const app = workerAppMap.get(workerId)!
              const appliedJob = jobs.find((j) => j.id === app.jobId)

              const [wUser, profile] = await Promise.all([
                userOps.findById(workerId).catch(() => null),
                workerProfileOps.findByUserId(workerId).catch(() => null),
              ])
              if (!wUser) return

              // Try to extract actual resume text from the stored data URL
              // Priority: apply-time resumeUrl > profile resumeUrl
              const resumeDataUrl = app.resumeUrl || profile?.resumeUrl || ''
              const resumeText = resumeDataUrl.startsWith('data:')
                ? await extractTextFromDataUrl(resumeDataUrl).catch(() => '')
                : ''

              // Build searchable text: resume content first, then profile fields
              const parts: string[] = []
              if (resumeText.length > 50) {
                parts.push(resumeText)
              }
              // Always include profile fields for structured skill matching
              if (profile?.bio) parts.push(`About: ${profile.bio}`)
              if (profile?.skills?.length) parts.push(`Skills: ${profile.skills.join(', ')}`)
              if (profile?.categories?.length) parts.push(`Work types: ${profile.categories.join(', ')}`)
              if (profile?.experience) parts.push(`Experience: ${profile.experience}`)
              if (profile?.location) parts.push(`Location: ${profile.location}`)
              if (profile?.availability) parts.push(`Availability: ${profile.availability}`)
              if (app.coverLetter) parts.push(`Cover letter: ${app.coverLetter}`)
              if (appliedJob) parts.push(`Applied for: ${appliedJob.title} (${appliedJob.category})`)

              if (parts.length === 0) return

              const syntheticParsed: ResumeData = {
                summary: profile?.bio,
                skills: [...(profile?.skills ?? []), ...(profile?.categories ?? [])],
                experience: [],
                education: [],
                projects: [],
              }

              ragStore.index({
                workerId,
                workerName: wUser.fullName,
                phone: wUser.phoneNumber,
                text: parts.join('\n'),
                parsed: syntheticParsed,
              })
              count++
            } catch {
              // Skip workers we can't load
            }
          })
        )
      }

      setIndexedCount(count)
      setMessages([{
        id: 'welcome',
        role: 'assistant',
        content: count > 0
          ? t('employer.resume.welcomeIndexed', { count, jobs: jobs.length })
          : t('employer.resume.couldNotLoad'),
        timestamp: new Date(),
      }])
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('employer.resume.couldNotLoadApplicants')
      toast({ title: t('employer.resume.errorLoadingApplicants'), description: msg, variant: 'destructive' })
      setMessages([{
        id: 'error',
        role: 'assistant',
        content: t('employer.resume.failedToLoadMessage', { message: msg }),
        timestamp: new Date(),
      }])
    } finally {
      setIndexing(false)
    }
  }

  const handleSearch = async () => {
    const query = input.trim()
    if (!query) return

    // Add user message
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: query,
      timestamp: new Date(),
    }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setSearching(true)

    try {
      // Parse query into structured filters (fast, no AI)
      const parsedQuery = await parseRAGQuery(query)

      // Search with RAG engine — falls back to all applicants if no keyword match
      const results = await ragSearch(parsedQuery)

      // Detect whether we got real keyword matches or the fallback "show all"
      const hasMatches = results.some((r) => r.score > 0)

      let response = ''
      if (results.length === 0) {
        response = t('employer.resume.noApplicantsIndexed')
      } else if (hasMatches) {
        response = t('employer.resume.foundMatches', { count: results.length, query })
      } else {
        response = t('employer.resume.noExactMatches', { query, count: results.length })
      }

      const assistantMsg: ChatMessage = {
        id: `asst-${Date.now()}`,
        role: 'assistant',
        content: response,
        results: results.length > 0 ? results : undefined,
        timestamp: new Date(),
      }
      setMessages(prev => [...prev, assistantMsg])
    } catch (err) {
      const errorMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: t('employer.resume.searchError'),
        timestamp: new Date(),
      }
      setMessages(prev => [...prev, errorMsg])
    } finally {
      setSearching(false)
    }
  }

  if (!user || user.role !== 'employer') {
    return (
      <div className="min-h-screen bg-background">
        <EmployerNav />
        <div className="container mx-auto px-4 py-12 text-center">
          <p className="text-muted-foreground">{t('employer.resume.accessRestricted')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <EmployerNav />

      <main className="flex-1 container mx-auto px-4 py-6 max-w-4xl flex flex-col">
        {/* Header */}
        <div className="mb-4">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            {t('employer.resume.title')}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t('employer.resume.subtitle')}
          </p>
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="outline" className="gap-1">
              <Database className="h-3 w-3" />
              {t('employer.resume.resumeIndexed', { count: indexedCount })}
            </Badge>
            {indexing && (
              <Badge variant="secondary" className="gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                {t('employer.resume.indexing')}
              </Badge>
            )}
          </div>
        </div>

        {/* Chat Area */}
        <Card className="flex-1 flex flex-col overflow-hidden">
          <CardContent className="flex-1 overflow-y-auto p-4 space-y-4 min-h-64 max-h-[calc(100vh-320px)]">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role === 'assistant' && (
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                      <Bot className="h-4 w-4" />
                    </AvatarFallback>
                  </Avatar>
                )}
                <div className={`max-w-[85%] space-y-3 ${msg.role === 'user' ? 'items-end' : ''}`}>
                  <div className={`rounded-lg px-4 py-2.5 text-sm ${
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  }`}>
                    <p className="whitespace-pre-line">{msg.content}</p>
                  </div>

                  {/* Search Results */}
                  {msg.results && msg.results.length > 0 && (
                    <div className="space-y-2">
                      {msg.results.map((result, idx) => (
                        <Card key={result.workerId} className="border shadow-sm">
                          <CardContent className="p-3 space-y-2">
                            <div className="flex items-start justify-between">
                              <div className="flex items-center gap-2">
                                <Avatar className="h-9 w-9">
                                  <AvatarFallback className="bg-primary/10 text-primary text-sm">
                                    {result.workerName.charAt(0)}
                                  </AvatarFallback>
                                </Avatar>
                                <div>
                                  <p className="font-medium text-sm">{result.workerName}</p>
                                  {result.phone && (
                                    <p className="text-xs text-muted-foreground">{result.phone}</p>
                                  )}
                                </div>
                              </div>
                              <Badge variant="outline" className="text-xs">
                                {t('employer.resume.score', { score: result.score })}
                              </Badge>
                            </div>

                            {/* Matched Skills */}
                            {result.matchedSkills.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {result.matchedSkills.map((skill) => (
                                  <Badge key={skill} variant="default" className="text-xs py-0">{skill}</Badge>
                                ))}
                              </div>
                            )}

                            {/* Experience summary */}
                            {result.parsed.experience.length > 0 && (
                              <div className="text-xs text-muted-foreground">
                                <strong>{t('employer.resume.experience')}:</strong>{' '}
                                {result.parsed.experience.slice(0, 2).map(e =>
                                  `${e.title} at ${e.company}`
                                ).join('; ')}
                                {result.parsed.experience.length > 2 && ` +${result.parsed.experience.length - 2} more`}
                              </div>
                            )}

                            {/* Projects */}
                            {result.parsed.projects.length > 0 && (
                              <div className="text-xs text-muted-foreground">
                                <strong>{t('employer.resume.projects')}:</strong>{' '}
                                {result.parsed.projects.slice(0, 2).map(p =>
                                  `${p.name} [${p.technologies.slice(0, 3).join(', ')}]`
                                ).join('; ')}
                              </div>
                            )}

                            {/* AI Explanation */}
                            {result.explanation && (
                              <p className="text-xs text-primary/80 italic border-l-2 border-primary/30 pl-2">
                                {result.explanation}
                              </p>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
                {msg.role === 'user' && (
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarFallback className="bg-secondary text-xs">
                      <UserIcon className="h-4 w-4" />
                    </AvatarFallback>
                  </Avatar>
                )}
              </div>
            ))}

            {searching && (
              <div className="flex gap-3 justify-start">
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                    <Bot className="h-4 w-4" />
                  </AvatarFallback>
                </Avatar>
                <div className="bg-muted rounded-lg px-4 py-2.5 text-sm flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('employer.resume.searching')}
                </div>
              </div>
            )}

            <div ref={chatEndRef} />
          </CardContent>

          {/* Input Bar */}
          <div className="border-t p-3">
            <form
              onSubmit={(e) => { e.preventDefault(); handleSearch() }}
              className="flex gap-2"
            >
              <Input
                placeholder={indexedCount > 0 ? t('employer.resume.inputPlaceholderReady') : t('employer.resume.inputPlaceholderLoading')}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={searching || indexing}
                className="flex-1"
              />
              <Button
                type="submit"
                disabled={searching || !input.trim() || indexing}
              >
                {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </form>
          </div>
        </Card>

        {/* Quick Search Suggestions */}
        {messages.length <= 1 && indexedCount > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            <p className="text-sm text-muted-foreground w-full mb-1">{t('employer.resume.quickSearches')}</p>
            {[
              t('employer.resume.suggestion1'),
              t('employer.resume.suggestion2'),
              t('employer.resume.suggestion3'),
              t('employer.resume.suggestion4'),
              t('employer.resume.suggestion5'),
              t('employer.resume.suggestion6'),
            ].map((suggestion) => (
              <Button
                key={suggestion}
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => { setInput(suggestion); }}
              >
                <Search className="h-3 w-3 mr-1" />
                {suggestion}
              </Button>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
