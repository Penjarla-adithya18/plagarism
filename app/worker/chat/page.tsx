'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import WorkerNav from '@/components/worker/WorkerNav'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/contexts/AuthContext'
import { db, jobOps, reportOps, userOps } from '@/lib/api'
import { ChatConversation, ChatMessage, Job, User } from '@/lib/types'
import { Send, Search, MessageCircle, Flag, AlertCircle, Mic, MicOff, ChevronLeft } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useToast } from '@/hooks/use-toast'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Textarea } from '@/components/ui/textarea'
import { filterChatMessage, maskSensitiveContent } from '@/lib/chatFilter'
import { useI18n } from '@/contexts/I18nContext'
import { Skeleton } from '@/components/ui/skeleton'

export default function WorkerChatPage() {
  const router = useRouter()
  const { user } = useAuth()
  const { toast } = useToast()
  const { t, locale } = useI18n()
  const [conversations, setConversations] = useState<ChatConversation[]>([])
  const [selectedConversation, setSelectedConversation] = useState<ChatConversation | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [usersById, setUsersById] = useState<Record<string, User>>({})
  const [jobsById, setJobsById] = useState<Record<string, Job>>({})
  const [newMessage, setNewMessage] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [reportDialogOpen, setReportDialogOpen] = useState(false)
  const [reportReason, setReportReason] = useState('spam')
  const [reportDescription, setReportDescription] = useState('')
  const [submittingReport, setSubmittingReport] = useState(false)
  const [voiceListening, setVoiceListening] = useState(false)
  const [loadingConvs, setLoadingConvs] = useState(true)
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const isAtBottomRef = useRef(true)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const activeConvIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (user) {
      loadConversations()
    }
  }, [user])

  // Poll for new messages every 1.5s
  useEffect(() => {
    if (!selectedConversation) return

    // Clear messages immediately when switching conversations
    setMessages([])
    setLoadingMsgs(true)
    isAtBottomRef.current = true
    activeConvIdRef.current = selectedConversation.id
    loadMessages(selectedConversation.id)

    const interval = setInterval(() => {
      loadMessages(selectedConversation.id)
    }, 1500) // 1.5s polling for fast message delivery

    return () => clearInterval(interval)
  }, [selectedConversation?.id])

  // Poll for new conversations every 10s
  useEffect(() => {
    if (!user) return
    const convInterval = setInterval(() => {
      loadConversations()
    }, 10000)
    return () => clearInterval(convInterval)
  }, [user])

  // Only auto-scroll on poll if user is already at the bottom
  useEffect(() => {
    if (isAtBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  // Track scroll position on the message container
  const handleMessagesScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    const threshold = 80 // px from bottom
    isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight <= threshold
  }

  const loadConversations = async () => {
    if (!user) return
    setLoadingConvs(true)
    try {
      const userConvs = await db.getConversationsByUser(user.id)
      setConversations(userConvs)
      const participantIds = [...new Set(
        userConvs
          .flatMap((conversation) => conversation.participants)
          .filter((participantId) => participantId !== user.id)
      )]
      if (participantIds.length > 0) {
        const fetchedUsers = await Promise.all(participantIds.map((id) => userOps.findById(id)))
        setUsersById((previous) => {
          const next = { ...previous }
          for (const fetched of fetchedUsers) {
            if (fetched) next[fetched.id] = fetched
          }
          return next
        })
      }

      // Check sessionStorage for navigation target (from job application button)
      const targetConvId = sessionStorage.getItem('targetChatConvId')
      const targetEmployerId = sessionStorage.getItem('targetChatEmployerId')
      const targetJobId = sessionStorage.getItem('targetChatJobId')
      sessionStorage.removeItem('targetChatConvId')
      sessionStorage.removeItem('targetChatEmployerId')
      sessionStorage.removeItem('targetChatJobId')

      let selected = false
      // 1. Try exact conv ID
      if (targetConvId) {
        const targetConv = userConvs.find(c => c.id === targetConvId)
        if (targetConv) {
          setSelectedConversation(targetConv)
          selected = true
        }
      }
      // 2. Fall back to employer + job lookup
      if (!selected && targetEmployerId) {
        const found = userConvs.find(c =>
          c.participants.includes(targetEmployerId) &&
          (!targetJobId || c.jobId === targetJobId)
        )
        if (found) {
          setSelectedConversation(found)
          selected = true
        }
      }
      // 3. Only auto-select first if no target was requested
      if (!selected && !targetConvId && !targetEmployerId && userConvs.length > 0 && !selectedConversation) {
        setSelectedConversation(userConvs[0])
      }

      // Load jobs for all conversations (to check completion status)
      const jobIds = [...new Set(userConvs.map(c => c.jobId).filter(Boolean) as string[])]
      if (jobIds.length > 0) {
        const allJobs = await jobOps.getAll()
        const jMap: Record<string, Job> = {}
        for (const j of allJobs) {
          if (jobIds.includes(j.id)) jMap[j.id] = j
        }
        setJobsById(jMap)
      }
    } finally {
      setLoadingConvs(false)
    }
  }

  const loadMessages = async (conversationId: string) => {
    try {
      const convMessages = await db.getMessagesByConversation(conversationId)
      // Stale-fetch guard: discard response if conversation changed while fetching
      if (activeConvIdRef.current !== conversationId) return
      setMessages(convMessages)
      setLoadingMsgs(false)
      if (user) {
        setConversations((prev) =>
          prev.map((conv) => {
            if (conv.id !== conversationId || !conv.lastMessage) return conv
            if (conv.lastMessage.senderId === user.id || conv.lastMessage.read) return conv
            return {
              ...conv,
              lastMessage: { ...conv.lastMessage, read: true },
            }
          })
        )
      }
    } catch {
      // Silently swallow timeout/network errors during polling — the next poll will retry
      setLoadingMsgs(false)
    }
  }

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedConversation || !user) return

    // Safety filter — block unsafe content before sending
    const filterResult = filterChatMessage(newMessage.trim())
    if (filterResult.blocked) {
      toast({
        title: t('worker.chat.messageBlocked'),
        description: filterResult.reason,
        variant: 'destructive',
      })
      return
    }

    let tempMessage: ChatMessage | undefined
    try {
      tempMessage = {
        id: `temp-${Date.now()}`,
        conversationId: selectedConversation.id,
        senderId: user.id,
        message: newMessage.trim(),
        createdAt: new Date().toISOString(),
        read: false,
      }
      setMessages((prev) => [...prev, tempMessage!])
      setNewMessage('')
      scrollToBottom(true)

      const message = await db.sendMessage({
        conversationId: selectedConversation.id,
        senderId: user.id,
        message: tempMessage!.message,
      })
      setMessages((prev) => prev.map(m => m.id === tempMessage!.id ? message : m))
      loadConversations()
    } catch (error) {
      if (tempMessage) setMessages((prev) => prev.filter(m => m.id !== tempMessage!.id))
      toast({
        title: t('worker.chat.failedToSend'),
        description: error instanceof Error ? error.message : t('worker.chat.pleaseTryAgain'),
        variant: 'destructive'
      })
    }
  }

  const scrollToBottom = (force = false) => {
    if (force || isAtBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
      isAtBottomRef.current = true
    }
  }

  const handleReportAbuse = async () => {
    if (!user || !selectedConversation) return
    const otherUser = getOtherUser(selectedConversation)
    if (!otherUser) return
    setSubmittingReport(true)
    try {
      await reportOps.create({
        reporterId: user.id,
        reportedUserId: otherUser.id,
        type: 'chat_abuse',
        reason: reportReason,
        description: reportDescription || reportReason,
        status: 'pending',
      })
      toast({ title: t('worker.chat.reportSubmitted'), description: t('worker.chat.reportSubmittedDesc') })
      setReportDialogOpen(false)
      setReportReason('spam')
      setReportDescription('')
    } catch {
      toast({ title: t('worker.chat.reportFailed'), variant: 'destructive' })
    } finally {
      setSubmittingReport(false)
    }
  }

  const toggleVoiceInput = () => {
    if (voiceListening) {
      recognitionRef.current?.stop()
      setVoiceListening(false)
      return
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const win = window as any
    const SpeechRecognitionAPI = win.SpeechRecognition ?? win.webkitSpeechRecognition

    if (!SpeechRecognitionAPI) {
      toast({ title: t('worker.chat.voiceNotSupported'), variant: 'destructive' })
      return
    }

    const recognition = new SpeechRecognitionAPI()
    const localeToSpeechLang: Record<string, string> = {
      en: 'en-IN',
      hi: 'hi-IN',
      te: 'te-IN',
    }
    recognition.lang = localeToSpeechLang[locale] ?? 'en-IN'
    recognition.continuous = false
    recognition.interimResults = false
    recognition.maxAlternatives = 1

    recognition.onstart = () => setVoiceListening(true)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      const transcript = event.results[0]?.[0]?.transcript ?? ''
      if (transcript) {
        setNewMessage((prev: string) => (prev ? prev + ' ' + transcript : transcript))
      }
      setVoiceListening(false)
    }

    recognition.onerror = () => setVoiceListening(false)
    recognition.onend = () => setVoiceListening(false)

    recognitionRef.current = recognition
    recognition.start()
  }

  const getOtherUser = (conversation: ChatConversation): User | null => {
    if (!user) return null
    const otherUserId = conversation.participants.find(id => id !== user.id)
    return otherUserId ? usersById[otherUserId] || null : null
  }

  const filteredConversations = conversations.filter(conv => {
    const otherUser = getOtherUser(conv)
    if (!otherUser) return false
    return (
      otherUser.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      otherUser.companyName?.toLowerCase().includes(searchQuery.toLowerCase())
    )
  })

  return (
    <div className="app-surface flex flex-col h-screen">
      <WorkerNav />
      
      <main className="flex-1 flex flex-col overflow-hidden pb-28 md:pb-8">
        {/* Mobile: Show conversation list or chat */}
        <div className="lg:hidden flex flex-col h-full">
          {!selectedConversation ? (
            <div className="flex flex-col h-full">
              <div className="px-4 py-4 border-b">
                <h1 className="text-2xl font-bold text-foreground mb-2" suppressHydrationWarning>{t('worker.chat.title')}</h1>
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={t('worker.chat.searchPlaceholder')}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto">
                {loadingConvs ? (
                  <div className="p-4 space-y-1">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="flex items-center gap-3 p-3">
                        <Skeleton className="h-12 w-12 rounded-full shrink-0" />
                        <div className="flex-1 space-y-2">
                          <Skeleton className="h-4 w-32" />
                          <Skeleton className="h-3 w-48" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : filteredConversations.length === 0 ? (
                  <div className="text-center py-12">
                    <MessageCircle className="h-16 w-16 mx-auto mb-3 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">No conversations yet</p>
                  </div>
                ) : (
                  <div className="p-2 space-y-1">
                    {filteredConversations.map((conv) => {
                      const otherUser = getOtherUser(conv)
                      if (!otherUser) return null

                      const unreadCount = conv.lastMessage?.senderId !== user?.id && 
                                         !conv.lastMessage?.read ? 1 : 0

                      return (
                        <div
                          key={conv.id}
                          className="card-modern p-3 cursor-pointer active:scale-[0.98] transition-all hover:shadow-soft"
                          onClick={() => setSelectedConversation(conv)}
                        >
                          <div className="flex items-center gap-3">
                            <Avatar className="h-12 w-12">
                              <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                                {otherUser.fullName.charAt(0)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <div className="flex justify-between items-center mb-0.5">
                                <p className="font-semibold text-base truncate">
                                  {otherUser.fullName}
                                </p>
                                {conv.lastMessage && (
                                  <span className="text-xs text-muted-foreground ml-2">
                                    {new Date(conv.lastMessage.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                )}
                              </div>
                              {conv.jobId && jobsById[conv.jobId] && (
                                <p
                                  className="text-xs text-primary truncate mb-0.5 hover:underline cursor-pointer"
                                  onClick={(e) => { e.stopPropagation(); router.push(`/worker/jobs/${conv.jobId}`) }}
                                >
                                  {jobsById[conv.jobId].title}
                                </p>
                              )}
                              <div className="flex items-center justify-between">
                                <p className="text-sm text-muted-foreground truncate" suppressHydrationWarning>
                                  {conv.lastMessage?.message || t('worker.chat.startConversation')}
                                </p>
                                {unreadCount > 0 && (
                                  <Badge variant="default" className="ml-2 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs">
                                    {unreadCount}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col h-full">
              <div className="flex items-center gap-3 px-4 py-3 border-b bg-background/95 backdrop-blur">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSelectedConversation(null)}
                  className="shrink-0"
                >
                  <ChevronLeft className="h-5 w-5" />
                </Button>
                <Avatar className="h-10 w-10">
                  <AvatarFallback className="bg-primary/10 text-primary">
                    {getOtherUser(selectedConversation)?.fullName.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p
                    className={`font-semibold text-base truncate ${selectedConversation.jobId ? 'cursor-pointer hover:text-primary transition-colors' : ''}`}
                    onClick={() => selectedConversation.jobId && router.push(`/worker/jobs/${selectedConversation.jobId}`)}
                  >
                    {getOtherUser(selectedConversation)?.fullName}
                  </p>
                  <p
                    className={`text-xs text-muted-foreground truncate ${selectedConversation.jobId ? 'cursor-pointer hover:text-primary transition-colors' : ''}`}
                    onClick={() => selectedConversation.jobId && router.push(`/worker/jobs/${selectedConversation.jobId}`)}
                  >
                    {selectedConversation.jobId && jobsById[selectedConversation.jobId]
                      ? jobsById[selectedConversation.jobId].title
                      : (getOtherUser(selectedConversation)?.companyName || '')}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setReportDialogOpen(true)}
                  className="shrink-0"
                >
                  <Flag className="h-4 w-4" />
                </Button>
              </div>
              <div
                className="flex-1 overflow-y-auto p-4 bg-background"
                onScroll={handleMessagesScroll}
              >
                <div className="space-y-2">
                  {loadingMsgs ? (
                    <div className="space-y-4 pt-2">
                      {[true, false, true, false, true].map((isSent, i) => (
                        <div key={i} className={`flex items-end gap-2 ${isSent ? 'justify-end' : 'justify-start'}`}>
                          {!isSent && <Skeleton className="h-7 w-7 rounded-full shrink-0" />}
                          <Skeleton className={`h-10 rounded-2xl ${isSent ? 'w-40' : 'w-52'}`} />
                          {isSent && <div className="w-7" />}
                        </div>
                      ))}
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="text-center py-12">
                      <MessageCircle className="h-16 w-16 mx-auto mb-3 text-muted-foreground/40" />
                      <p className="text-muted-foreground" suppressHydrationWarning>{t('worker.chat.noMessages')}</p>
                    </div>
                  ) : (
                    messages.map((message, idx) => {
                      const isSent = message.senderId === user?.id
                      const showAvatar = !isSent && (idx === 0 || messages[idx - 1].senderId !== message.senderId)
                      return (
                        <div
                          key={message.id}
                          className={`flex items-end gap-2 ${isSent ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}
                        >
                          {!isSent && (
                            <Avatar className={`h-7 w-7 shrink-0 ${showAvatar ? 'opacity-100' : 'opacity-0'}`}>
                              <AvatarFallback className="bg-primary/10 text-primary text-xs">
                                {getOtherUser(selectedConversation)?.fullName.charAt(0)}
                              </AvatarFallback>
                            </Avatar>
                          )}
                          <div
                            className={`max-w-[75%] sm:max-w-[60%] px-4 py-2.5 shadow-sm transition-all hover:shadow-md ${
                              isSent
                                ? 'bg-gradient-to-br from-primary to-primary/90 text-primary-foreground rounded-[20px] rounded-br-md'
                                : 'bg-muted/80 text-foreground rounded-[20px] rounded-bl-md'
                            }`}
                          >
                            {message.message && (
                              <p className="text-[15px] leading-relaxed break-words">{isSent ? message.message : maskSensitiveContent(message.message)}</p>
                            )}
                            <p className={`text-[11px] mt-1.5 ${
                              isSent ? 'text-primary-foreground/60' : 'text-muted-foreground/60'
                            }`}>
                              {new Date(message.createdAt).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </p>
                          </div>
                          {isSent && <div className="w-7" />}
                        </div>
                      )
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>
              </div>
              <div className="border-t p-4 bg-background/95 backdrop-blur">
                {selectedConversation.jobId && jobsById[selectedConversation.jobId]?.status === 'completed' ? (
                  <div className="flex items-center gap-2 p-3 bg-muted/60 rounded-2xl text-sm text-muted-foreground">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    This conversation is closed — job has been completed.
                  </div>
                ) : (
                  <div className="flex gap-2 items-end">
                    <div className="flex-1 relative">
                      <Input
                        placeholder={t('worker.chat.messagePlaceholder')}
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSendMessage())}
                        className="rounded-full border-2 pr-12 h-11 focus-visible:ring-primary/30 transition-all"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={toggleVoiceInput}
                        title={voiceListening ? t('worker.chat.stopRecording') : t('worker.chat.voiceInput')}
                        className={`absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full ${voiceListening ? 'text-red-500 animate-pulse bg-red-50' : 'text-muted-foreground hover:text-primary'}`}
                      >
                        {voiceListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                      </Button>
                    </div>
                    <Button 
                      onClick={handleSendMessage} 
                      size="icon" 
                      className="h-11 w-11 rounded-full shadow-md hover:shadow-lg transition-all"
                      disabled={!newMessage.trim()}
                    >
                      <Send className="h-5 w-5" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Desktop: Show both panels */}
        <div className="hidden lg:block container mx-auto px-4 py-4 h-full">
          <div className="mb-4">
            <h1 className="text-2xl font-bold text-foreground mb-1" suppressHydrationWarning>{t('worker.chat.title')}</h1>
            <p className="text-sm text-muted-foreground" suppressHydrationWarning>{t('worker.chat.subtitle')}</p>
          </div>

          <div className="grid lg:grid-cols-3 gap-6 h-[calc(100vh-240px)]">
            <Card className="lg:col-span-1 flex flex-col overflow-hidden">
              <CardHeader className="pb-3">
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={t('worker.chat.searchPlaceholder')}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </CardHeader>
              <div className="flex-1 overflow-y-auto">
                <CardContent className="space-y-2">
                  {loadingConvs ? (
                    <div className="space-y-1 pt-2">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="flex items-center gap-3 p-3">
                          <Skeleton className="h-10 w-10 rounded-full shrink-0" />
                          <div className="flex-1 space-y-2">
                            <Skeleton className="h-4 w-28" />
                            <Skeleton className="h-3 w-40" />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : filteredConversations.length === 0 ? (
                    <div className="text-center py-8">
                      <MessageCircle className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">No conversations yet</p>
                    </div>
                  ) : (
                    filteredConversations.map((conv) => {
                      const otherUser = getOtherUser(conv)
                      if (!otherUser) return null

                      const isSelected = selectedConversation?.id === conv.id
                      const unreadCount = conv.lastMessage?.senderId !== user?.id && 
                                         !conv.lastMessage?.read ? 1 : 0

                      return (
                        <div
                          key={conv.id}
                          className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-all ${
                            isSelected ? 'bg-primary/10 shadow-sm' : 'hover:bg-muted'
                          }`}
                          onClick={() => setSelectedConversation(conv)}
                        >
                          <Avatar>
                            <AvatarFallback className="bg-primary text-primary-foreground">
                              {otherUser.fullName.charAt(0)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-start mb-1">
                              <p className="font-semibold text-sm truncate">
                                {otherUser.fullName}
                              </p>
                              {unreadCount > 0 && (
                                <Badge variant="default" className="ml-2">
                                  {unreadCount}
                                </Badge>
                              )}
                            </div>
                            {conv.lastMessage && (
                              <p className="text-xs text-muted-foreground truncate">
                                {conv.lastMessage.message}
                              </p>
                            )}
                          </div>
                        </div>
                      )
                    })
                  )}
                </CardContent>
              </div>
            </Card>

            <Card className="lg:col-span-2 flex flex-col overflow-hidden">
              {selectedConversation ? (
                <>
                  <CardHeader className="border-b">
                    <div className="flex items-center gap-3">
                      <Avatar>
                        <AvatarFallback className="bg-primary text-primary-foreground">
                          {getOtherUser(selectedConversation)?.fullName.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <CardTitle className="text-lg">
                          {getOtherUser(selectedConversation)?.fullName}
                        </CardTitle>
                        <p
                          className={`text-sm text-muted-foreground ${selectedConversation.jobId ? 'cursor-pointer hover:text-primary transition-colors' : ''}`}
                          onClick={() => selectedConversation.jobId && router.push(`/worker/jobs/${selectedConversation.jobId}`)}
                        >
                          {selectedConversation.jobId && jobsById[selectedConversation.jobId]
                            ? jobsById[selectedConversation.jobId].title
                            : (getOtherUser(selectedConversation)?.companyName || 'Employer')}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive"
                        title="Report abuse"
                        onClick={() => setReportDialogOpen(true)}
                      >
                        <Flag className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardHeader>
                <div
                  className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6 bg-background"
                  onScroll={handleMessagesScroll}
                >
                  <div className="space-y-2">
                    {loadingMsgs ? (
                      <div className="space-y-4 pt-2">
                        {[true, false, true, false, true].map((isSent, i) => (
                          <div key={i} className={`flex items-end gap-2 ${isSent ? 'justify-end' : 'justify-start'}`}>
                            {!isSent && <Skeleton className="h-7 w-7 rounded-full shrink-0" />}
                            <Skeleton className={`h-10 rounded-2xl ${isSent ? 'w-40' : 'w-52'}`} />
                            {isSent && <div className="w-7" />}
                          </div>
                        ))}
                      </div>
                    ) : messages.length === 0 ? (
                      <div className="text-center py-12">
                        <MessageCircle className="h-16 w-16 mx-auto mb-3 text-muted-foreground/40" />
                        <p className="text-muted-foreground" suppressHydrationWarning>{t('worker.chat.noMessages')}</p>
                      </div>
                    ) : (
                      messages.map((message, idx) => {
                        const isSent = message.senderId === user?.id
                        const showAvatar = !isSent && (idx === 0 || messages[idx - 1].senderId !== message.senderId)
                        return (
                          <div
                            key={message.id}
                            className={`flex items-end gap-2 ${isSent ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}
                          >
                            {!isSent && (
                              <Avatar className={`h-7 w-7 shrink-0 ${showAvatar ? 'opacity-100' : 'opacity-0'}`}>
                                <AvatarFallback className="bg-primary/10 text-primary text-xs">
                                  {getOtherUser(selectedConversation)?.fullName.charAt(0)}
                                </AvatarFallback>
                              </Avatar>
                            )}
                            <div
                              className={`max-w-[75%] sm:max-w-[60%] px-4 py-2.5 shadow-sm transition-all hover:shadow-md ${
                                isSent
                                  ? 'bg-gradient-to-br from-primary to-primary/90 text-primary-foreground rounded-[20px] rounded-br-md'
                                  : 'bg-muted/80 text-foreground rounded-[20px] rounded-bl-md'
                              }`}
                            >
                              <p className="text-[15px] leading-relaxed break-words">{isSent ? message.message : maskSensitiveContent(message.message)}</p>
                              <p className={`text-[11px] mt-1.5 ${
                                isSent ? 'text-primary-foreground/60' : 'text-muted-foreground/60'
                              }`}>
                                {new Date(message.createdAt).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </p>
                            </div>
                            {isSent && <div className="w-7" />}
                          </div>
                        )
                      })
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                </div>
                <CardContent className="border-t pt-4 pb-4 bg-background">
                  {selectedConversation.jobId && jobsById[selectedConversation.jobId]?.status === 'completed' ? (
                    <div className="flex items-center gap-2 p-3 bg-muted/60 rounded-2xl text-sm text-muted-foreground">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      This conversation is closed — job has been completed.
                    </div>
                  ) : (
                    <div className="flex gap-2 items-end">
                      <div className="flex-1 relative">
                        <Input
                          placeholder={t('worker.chat.messagePlaceholder')}
                          value={newMessage}
                          onChange={(e) => setNewMessage(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSendMessage())}
                          className="rounded-full border-2 pr-12 h-11 focus-visible:ring-primary/30 transition-all"
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={toggleVoiceInput}
                          title={voiceListening ? t('worker.chat.stopRecording') : t('worker.chat.voiceInput')}
                          className={`absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full ${voiceListening ? 'text-red-500 animate-pulse bg-red-50' : 'text-muted-foreground hover:text-primary'}`}
                        >
                          {voiceListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                        </Button>
                      </div>
                      <Button 
                        onClick={handleSendMessage} 
                        size="icon" 
                        className="h-11 w-11 rounded-full shadow-md hover:shadow-lg transition-all"
                        disabled={!newMessage.trim()}
                      >
                        <Send className="h-5 w-5" />
                      </Button>
                    </div>
                  )}
                </CardContent>
              </>
            ) : (
              <CardContent className="flex items-center justify-center h-full">
                {loadingConvs ? (
                  <div className="flex flex-col items-center gap-4 w-full max-w-xs">
                    <Skeleton className="h-16 w-16 rounded-full" />
                    <Skeleton className="h-5 w-48" />
                    <Skeleton className="h-4 w-64" />
                  </div>
                ) : (
                  <div className="text-center">
                    <MessageCircle className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                    <h3 className="text-lg font-semibold mb-2" suppressHydrationWarning>{t('worker.chat.selectConversation')}</h3>
                    <p className="text-muted-foreground" suppressHydrationWarning>
                      {t('worker.chat.selectPrompt')}
                    </p>
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        </div>
        </div>
      </main>

      {/* Report Abuse Dialog */}
      <Dialog open={reportDialogOpen} onOpenChange={setReportDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle suppressHydrationWarning>{t('worker.chat.reportAbuse')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-sm font-medium mb-3 block" suppressHydrationWarning>{t('worker.chat.reportReason')}</Label>
              <RadioGroup value={reportReason} onValueChange={setReportReason} className="space-y-2">
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="spam" id="r-spam" />
                  <Label htmlFor="r-spam" suppressHydrationWarning>{t('worker.chat.reportSpam')}</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="inappropriate" id="r-inappropriate" />
                  <Label htmlFor="r-inappropriate" suppressHydrationWarning>{t('worker.chat.reportInappropriate')}</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="payment_outside_platform" id="r-payment" />
                  <Label htmlFor="r-payment" suppressHydrationWarning>{t('worker.chat.reportPayment')}</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="harassment" id="r-harassment" />
                  <Label htmlFor="r-harassment" suppressHydrationWarning>{t('worker.chat.reportHarassment')}</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="scam" id="r-scam" />
                  <Label htmlFor="r-scam" suppressHydrationWarning>{t('worker.chat.reportScam')}</Label>
                </div>
              </RadioGroup>
            </div>
            <div>
              <Label htmlFor="report-desc" className="text-sm font-medium mb-1 block">
                Additional details <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Textarea
                id="report-desc"
                placeholder={t('worker.chat.reportDetailsPlaceholder')}
                rows={3}
                value={reportDescription}
                onChange={(e) => setReportDescription(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReportDialogOpen(false)} suppressHydrationWarning>
              {t('worker.chat.cancel')}
            </Button>
            <Button variant="destructive" onClick={handleReportAbuse} disabled={submittingReport} suppressHydrationWarning>
              {submittingReport ? t('worker.chat.submitting') : t('worker.chat.submitReport')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
