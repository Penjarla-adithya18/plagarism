'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { WorkerNav } from '@/components/worker/WorkerNav';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { Progress } from '@/components/ui/progress';
import { User, Loader2, X, Plus, Star, Sparkles, Shield, TrendingUp, Trash2, Camera, FileText, Upload, Check, ChevronDown, ChevronUp, CheckCircle2, AlertTriangle } from 'lucide-react';
import { VideoSkillAssessment, VideoAssessmentResult } from '@/components/ui/video-skill-assessment';
import { workerProfileOps, userOps, db, loginUser } from '@/lib/api';
import { resetPassword, sendOTP, verifyOTP, sendEmailOtp, verifyEmailOtp } from '@/lib/auth';
import { WorkerProfile, ResumeData } from '@/lib/types';
import { extractSkills, extractSkillsWithAI, JOB_CATEGORIES } from '@/lib/aiMatching';
import { getWorkerProfileCompletion, isWorkerProfileComplete } from '@/lib/profileCompletion';
import { VoiceInput } from '@/components/ui/voice-input';
import { LocationInput } from '@/components/ui/location-input';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { useI18n } from '@/contexts/I18nContext';
import { localeLabels, localeNames, locales, SupportedLocale } from '@/i18n';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export default function WorkerProfilePage() {
  const router = useRouter();
  const { user, updateUser, logout } = useAuth();
  const [deletingAccount, setDeletingAccount] = useState(false);
  const { toast } = useToast();
  const { t, locale, setLocale } = useI18n();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [extractingSkills, setExtractingSkills] = useState(false);
  const [profile, setProfile] = useState<WorkerProfile | null>(null);
  const [formData, setFormData] = useState({
    skills: [] as string[],
    skillInput: '',
    availability: '',
    experience: '',
    categories: [] as string[],
    location: '',
    bio: '',
    profileImage: '',
    resumeUrl: '',
    resumeFileName: '',
  });
  const [resumeUploading, setResumeUploading] = useState(false);
  const [pwForm, setPwForm] = useState({ current: '', newPw: '', confirm: '' });
  const [pwLoading, setPwLoading] = useState(false);
  const [phoneForm, setPhoneForm] = useState({ phone: user?.phoneNumber ?? '', otp: '' });
  const [otpSent, setOtpSent] = useState(false);
  const [displayOtp, setDisplayOtp] = useState<string | null>(null);
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [emailForm, setEmailForm] = useState({ email: user?.email ?? '', otp: '' });
  const [emailOtpSent, setEmailOtpSent] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [assessmentOpen, setAssessmentOpen] = useState(false);
  const [verifiedSkills, setVerifiedSkills] = useState<string[]>([]);
  const [pendingReviewSkills, setPendingReviewSkills] = useState<string[]>([]);
  const [pendingSkills, setPendingSkills] = useState<string[]>([]);
  const [resumeRawText, setResumeRawText] = useState<string>('');
  const [extractedFromResume, setExtractedFromResume] = useState<ResumeData | null>(null);

  useEffect(() => {
    if (!user || user.role !== 'worker') {
      router.push('/login');
      return;
    }

    loadProfile();
  }, [user, router]);

  const loadProfile = async () => {
    if (!user) return;

    try {
      const findByUserId = workerProfileOps?.findByUserId;
      if (!findByUserId) {
        throw new Error('Worker profile API is unavailable. Please refresh and try again.');
      }

      const workerProfile = await findByUserId(user.id);
      if (workerProfile) {
        setProfile(workerProfile);
        setFormData({
          skills: workerProfile.skills || [],
          skillInput: '',
          availability: workerProfile.availability || '',
          experience: workerProfile.experience || '',
          categories: workerProfile.categories || [],
          location: workerProfile.location || '',
          bio: workerProfile.bio || '',
          profileImage: workerProfile.profilePictureUrl || '',
          resumeUrl: workerProfile.resumeUrl || '',
          resumeFileName: workerProfile.resumeUrl ? 'Resume uploaded' : '',
        });
        // Existing profile skills are already verified
        const existingSkills = workerProfile.skills || [];
        const storedVerified = JSON.parse(localStorage.getItem(`verifiedSkills_${user.id}`) || '[]') as string[];
        const storedPending = JSON.parse(localStorage.getItem(`pendingReviewSkills_${user.id}`) || '[]') as string[];
        setVerifiedSkills([...new Set([...existingSkills, ...storedVerified])]);
      }
    } catch (error) {
      console.error('Failed to load profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleExtractSkills = async () => {
    if (!formData.experience) {
      toast({
        title: t('profile.noExperience'),
        description: t('profile.noExperienceDesc'),
        variant: 'destructive',
      });
      return;
    }

    setExtractingSkills(true);
    try {
      const extracted = await extractSkillsWithAI(formData.experience);
      const newSkills = [...new Set([...formData.skills, ...extracted])];
      setFormData({ ...formData, skills: newSkills });
      toast({
        title: t('profile.skillsExtracted'),
        description: `${t('profile.skillsExtractedDesc')} (${extracted.length})`,
      });
    } catch {
      // fallback
      const extracted = extractSkills(formData.experience);
      const newSkills = [...new Set([...formData.skills, ...extracted])];
      setFormData({ ...formData, skills: newSkills });
      toast({ title: t('profile.skillsExtracted'), description: `${t('profile.skillsExtractedDesc')} (${extracted.length})` });
    } finally {
      setExtractingSkills(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: t('profile.imageTooLarge'), description: t('profile.imageTooLargeDesc'), variant: 'destructive' });
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const src = ev.target?.result as string;
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 200;
        canvas.height = 200;
        const ctx = canvas.getContext('2d')!;
        // Cover-crop to square
        const size = Math.min(img.width, img.height);
        const sx = (img.width - size) / 2;
        const sy = (img.height - size) / 2;
        ctx.drawImage(img, sx, sy, size, size, 0, 0, 200, 200);
        setFormData(prev => ({ ...prev, profileImage: canvas.toDataURL('image/jpeg', 0.85) }));
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  };

  const handleResumeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedExtensions = ['.pdf', '.txt', '.doc', '.docx'];
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!allowedExtensions.includes(ext)) {
      toast({ title: t('profile.invalidFileType'), description: t('profile.invalidFileTypeDesc'), variant: 'destructive' });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: t('profile.fileTooLarge'), description: t('profile.fileTooLargeDesc'), variant: 'destructive' });
      return;
    }

    setResumeUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        setFormData(prev => ({ ...prev, resumeUrl: dataUrl, resumeFileName: file.name }));
        toast({ title: t('profile.resumeUploadedToast'), description: `${file.name} — ${t('profile.resumeUploadedDesc')}` });
        setResumeUploading(false);
      };
      reader.onerror = () => {
        setResumeUploading(false);
        toast({ title: t('profile.uploadFailed'), description: t('profile.uploadFailedDesc'), variant: 'destructive' });
      };
      reader.readAsDataURL(file);
    } catch {
      toast({ title: t('profile.uploadFailed'), description: t('profile.uploadFailedDesc2'), variant: 'destructive' });
      setResumeUploading(false);
    }
  };

  const addSkill = () => {
    if (!formData.skillInput.trim()) return;

    const skill = formData.skillInput.trim();
    if (!formData.skills.includes(skill)) {
      setFormData({
        ...formData,
        skills: [...formData.skills, skill],
        skillInput: '',
      });
    } else {
      setFormData({ ...formData, skillInput: '' });
    }
  };

  const removeSkill = (skill: string) => {
    setFormData(prev => ({ ...prev, skills: prev.skills.filter((s) => s !== skill) }));
    // Also remove from verified list so re-adding requires re-assessment
    setVerifiedSkills(prev => prev.filter(s => s !== skill));
    setPendingReviewSkills(prev => prev.filter(s => s !== skill));
    if (user) {
      const updated = verifiedSkills.filter(s => s !== skill);
      localStorage.setItem(`verifiedSkills_${user.id}`, JSON.stringify(updated));
      const updatedPending = pendingReviewSkills.filter(s => s !== skill);
      localStorage.setItem(`pendingReviewSkills_${user.id}`, JSON.stringify(updatedPending));
    }
  };

  const toggleCategory = (category: string) => {
    setFormData(prev => ({
      ...prev,
      categories: prev.categories.includes(category)
        ? prev.categories.filter((c) => c !== category)
        : [...prev.categories, category],
    }));
  };

  const handleDeleteAccount = async () => {
    if (!user) return;
    setDeletingAccount(true);
    try {
      await db.deleteAccount(user.id);
      logout();
      router.push('/login');
    } catch {
      toast({ title: t('profile.error'), description: t('profile.deleteError'), variant: 'destructive' });
    } finally {
      setDeletingAccount(false);
    }
  };

  const handleChangePassword = async () => {
    if (pwForm.newPw !== pwForm.confirm) {
      toast({ title: t('profile.passwordMismatch'), variant: 'destructive' });
      return;
    }
    if (pwForm.newPw.length < 8) {
      toast({ title: t('profile.passwordTooShort'), variant: 'destructive' });
      return;
    }
    setPwLoading(true);
    try {
      const result = await resetPassword(pwForm.current, pwForm.newPw);
      if (result.success) {
        try {
          const loginResult = await loginUser(user!.phoneNumber, pwForm.newPw);
          if (loginResult.success && loginResult.user) {
            updateUser(loginResult.user);
          }
        } catch {}
        toast({ title: t('profile.passwordUpdated') });
        setPwForm({ current: '', newPw: '', confirm: '' });
      } else {
        toast({ title: result.message, variant: 'destructive' });
      }
    } finally {
      setPwLoading(false);
    }
  };

  const handleSendOtp = async () => {
    if (!phoneForm.phone.match(/^[6-9]\d{9}$/)) {
      toast({ title: t('profile.invalidPhone'), variant: 'destructive' });
      return;
    }
    setPhoneLoading(true);
    try {
      const res = await sendOTP(phoneForm.phone);
      if (res.success) {
        setOtpSent(true);
        setDisplayOtp(res.otp ?? null);
        toast({ title: t('profile.otpSent'), description: t('profile.otpSentPhoneDesc') });
      } else {
        toast({ title: res.message ?? 'Failed to generate OTP', variant: 'destructive' });
      }
    } finally {
      setPhoneLoading(false);
    }
  };

  const handleVerifyAndUpdatePhone = async () => {
    setPhoneLoading(true);
    try {
      const verifyData = await verifyOTP(phoneForm.phone, phoneForm.otp);
      if (!verifyData.success) {
        toast({ title: verifyData.message ?? 'Invalid OTP', variant: 'destructive' });
        return;
      }

      const result = await userOps.update(user!.id, { phoneNumber: phoneForm.phone });
      if (result) {
        updateUser({ phoneNumber: phoneForm.phone });
        toast({ title: t('profile.phoneUpdated') });
        setOtpSent(false);
        setDisplayOtp(null);
        setPhoneForm((prev) => ({ ...prev, otp: '' }));
      }
    } finally {
      setPhoneLoading(false);
    }
  };

  const handleSendEmailOtp = async () => {
    if (!emailForm.email.includes('@')) {
      toast({ title: t('profile.invalidEmail'), variant: 'destructive' });
      return;
    }
    setEmailLoading(true);
    try {
      const res = await sendEmailOtp(emailForm.email, 'phone-change');
      if (res.success) {
        setEmailOtpSent(true);
        toast({ title: t('profile.otpSent'), description: t('profile.otpSentEmailDesc') });
      } else {
        toast({ title: res.message || t('profile.sendOtpFailed'), variant: 'destructive' });
      }
    } catch {
      toast({ title: t('profile.sendOtpFailed'), variant: 'destructive' });
    } finally {
      setEmailLoading(false);
    }
  };

  const handleVerifyAndUpdateEmail = async () => {
    if (emailForm.otp.length !== 6) {
      toast({ title: t('profile.enterOtp'), variant: 'destructive' });
      return;
    }
    setEmailLoading(true);
    try {
      const verifyData = await verifyEmailOtp(emailForm.email, emailForm.otp);
      if (!verifyData.success) {
        toast({ title: verifyData.message ?? 'Invalid OTP', variant: 'destructive' });
        return;
      }
      const result = await userOps.update(user!.id, { email: emailForm.email });
      if (result) {
        updateUser({ email: emailForm.email });
        toast({ title: t('profile.emailUpdated') });
        setEmailOtpSent(false);
        setEmailForm((prev) => ({ ...prev, otp: '' }));
      }
    } catch {
      toast({ title: t('profile.updateFailed'), variant: 'destructive' });
    } finally {
      setEmailLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  const handleAssessmentComplete = (results: VideoAssessmentResult[]) => {
    const approved = results.filter(r => r.verdict === 'approved').map(r => r.skill);
    const rejected = results.filter(r => r.verdict === 'rejected');
    const pending = results.filter(r => r.submitted && r.verdict === 'pending').map(r => r.skill);
    const failed = results.filter(r => !r.submitted).map(r => r.skill);

    // Auto-approved skills → verified immediately
    if (approved.length > 0) {
      const newVerified = [...new Set([...verifiedSkills, ...approved])];
      setVerifiedSkills(newVerified);
      if (user) {
        localStorage.setItem(`verifiedSkills_${user.id}`, JSON.stringify(newVerified));
      }
      toast({
        title: `${approved.length} Skill${approved.length > 1 ? 's' : ''} Verified! ✓`,
        description: `${approved.join(', ')} — ${t('profile.skillsVerifiedMsg')}`,
      });
    }

    // Pending (borderline) → pending review
    if (pending.length > 0) {
      const newPendingReview = [...new Set([...pendingReviewSkills, ...pending])];
      setPendingReviewSkills(newPendingReview);
      if (user) {
        localStorage.setItem(`pendingReviewSkills_${user.id}`, JSON.stringify(newPendingReview));
      }
      toast({
        title: t('profile.skillsUnderReview'),
        description: `${pending.join(', ')} — ${t('profile.skillsUnderReviewDesc')}`,
      });
    }

    // Auto-rejected → show reason, remove from skills
    if (rejected.length > 0) {
      const rejectedSkillNames = rejected.map(r => r.skill);
      setFormData(prev => ({
        ...prev,
        skills: prev.skills.filter(s => !rejectedSkillNames.includes(s)),
      }));
      const reasons = rejected.map(r => `${r.skill}: ${r.verdictReason || t('profile.skillsNotPassedDefault')}`).join('\n');
      toast({
        title: `${rejected.length} ${t('profile.skillsNotPassed')}`,
        description: reasons,
        variant: 'destructive',
      });
    }

    // Submission failures → keep skills as unassessed (don't remove)
    if (failed.length > 0) {
      toast({
        title: t('profile.assessmentIncomplete'),
        description: `${failed.join(', ')} — ${t('profile.assessmentIncompleteDesc')}`,
        variant: 'destructive',
      });
    }

    setAssessmentOpen(false);
    setPendingSkills([]);

    // Save profile with valid skills (approved + pending + existing verified + unrejected)
    const rejectedNames = rejected.map(r => r.skill);
    const keepSkills = formData.skills.filter(s => !rejectedNames.includes(s));
    doSaveProfile(keepSkills);
  };

  const doSaveProfile = async (skillsToSave?: string[]) => {
    const finalSkills = skillsToSave ?? formData.skills;
    setSaving(true);
    try {
      const isComplete = isWorkerProfileComplete({ ...formData, skills: finalSkills });

      const profileData: WorkerProfile = {
        userId: user!.id,
        skills: finalSkills,
        availability: formData.availability,
        experience: formData.experience,
        categories: formData.categories,
        location: formData.location,
        bio: formData.bio,
        profilePictureUrl: formData.profileImage || undefined,
        resumeUrl: formData.resumeUrl || undefined,
        profileCompleted: !!isComplete,
      };

      if (profile) {
        await workerProfileOps.update(user!.id, profileData);
      } else {
        await workerProfileOps.create(profileData);
      }

      await userOps.update(user!.id, { profileCompleted: !!isComplete });
      updateUser({ profileCompleted: !!isComplete });

      toast({
        title: t('profile.profileUpdated'),
        description: t('profile.profileUpdatedDesc'),
      });

      router.push('/worker/dashboard');
    } catch (error) {
      toast({
        title: t('profile.error'),
        description: t('profile.saveError'),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.categories.length === 0) {
      toast({
        title: t('profile.categoriesRequired'),
        description: t('profile.categoriesRequiredDesc'),
        variant: 'destructive',
      });
      return;
    }

    // Check for skills that haven't been assessed yet (not verified AND not pending review)
    const unassessed = formData.skills.filter(s => !verifiedSkills.includes(s) && !pendingReviewSkills.includes(s));
    if (unassessed.length > 0) {
      setPendingSkills(unassessed);
      setAssessmentOpen(true);
      return;
    }

    // All skills verified — save directly
    doSaveProfile();
  };



  // -- Live profile completeness: must be above early-return to satisfy Rules of Hooks --
  const profileCompleteness = useMemo(
    () => getWorkerProfileCompletion(formData),
    [formData.skills, formData.categories, formData.availability, formData.experience, formData.location],
  );

  if (loading) {
    return (
      <div className="app-surface">
        <WorkerNav />
        <div className="container mx-auto px-4 py-8 pb-28 md:pb-8 max-w-4xl">
          <div className="mb-8 space-y-2">
            <Skeleton className="h-7 w-36 opacity-40" />
            <Skeleton className="h-3.5 w-48 opacity-30" />
          </div>
          <div className="space-y-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="rounded-xl border border-border/40 bg-card/40 p-5 space-y-4">
                <Skeleton className="h-4 w-28 opacity-40" />
                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Skeleton className="h-3 w-16 opacity-30" />
                    <Skeleton className="h-9 w-full rounded-md opacity-30" />
                  </div>
                  <div className="space-y-2">
                    <Skeleton className="h-3 w-16 opacity-30" />
                    <Skeleton className="h-9 w-full rounded-md opacity-30" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-3 w-20 opacity-30" />
                  <Skeleton className="h-16 w-full rounded-md opacity-25" />
                </div>
              </div>
            ))}
            <Skeleton className="h-10 w-40 rounded-lg opacity-35" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-surface">
      <WorkerNav />

      <main className="container mx-auto px-4 py-6 md:py-8 pb-28 md:pb-8 max-w-4xl">
        <div className="mb-6 md:mb-8">
          <h1 className="text-2xl md:text-3xl font-bold mb-2">{t('profile.title')}</h1>
          <p className="text-sm md:text-base text-muted-foreground">
            {t('profile.subtitle')}
          </p>
          {/* Live Profile Completeness */}
          <div className="mt-4 rounded-lg border bg-card p-4 transition-all duration-200 hover:shadow-md">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">{t('profile.completeness')}</span>
              <span className="text-sm font-bold text-primary">{profileCompleteness}%</span>
            </div>
            <Progress value={profileCompleteness} className="h-2" />
            {profileCompleteness < 100 && (
              <p className="text-xs text-muted-foreground mt-1">
                {profileCompleteness < 50 ? t('profile.completenessHintLow') : t('profile.completenessHintHigh')}
              </p>
            )}
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-6">
          {/* Personal Information */}
          <Card className="p-6 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <User className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-semibold">{t('profile.personalInfo')}</h2>
                <p className="text-sm text-muted-foreground">{t('profile.personalInfoDesc')}</p>
              </div>
            </div>

            <div className="space-y-4">
              {/* Profile Photo */}
              <div className="flex items-center gap-4">
                <div className="h-20 w-20 shrink-0 overflow-hidden rounded-full border-2 border-border bg-muted transition-all duration-200 hover:scale-[1.03] hover:shadow-md flex items-center justify-center">
                  {formData.profileImage ? (
                    <img src={formData.profileImage} className="w-full h-full object-cover" alt="Profile" />
                  ) : (
                    <User className="w-9 h-9 text-muted-foreground" />
                  )}
                </div>
                <div>
                  <input
                    type="file"
                    accept="image/*"
                    id="profile-image-input"
                    className="hidden"
                    onChange={handleImageUpload}
                  />
                  <label htmlFor="profile-image-input">
                    <Button type="button" variant="outline" size="sm" asChild>
                      <span className="cursor-pointer flex items-center gap-1">
                        <Camera className="w-4 h-4" />
                        {formData.profileImage ? t('common.change') || 'Change Photo' : t('common.upload') || 'Upload Photo'}
                      </span>
                    </Button>
                  </label>
                  <p className="text-xs text-muted-foreground mt-1">{t('profile.photoHint')}</p>
                </div>
              </div>

              {/* Resume Upload */}
              <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-primary" />
                  <div>
                    <h3 className="text-sm font-semibold">{t('profile.resumeSection')}</h3>
                    <p className="text-xs text-muted-foreground">{t('profile.resumeHint')}</p>
                  </div>
                </div>
                {formData.resumeUrl ? (
                  <div className="flex items-center gap-3 rounded-md border bg-background px-3 py-2">
                    <FileText className="h-5 w-5 text-green-600 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{formData.resumeFileName || t('profile.resumeUploadedLabel')}</p>
                      <p className="text-xs text-muted-foreground">{t('profile.resumeReady')}</p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setFormData(prev => ({ ...prev, resumeUrl: '', resumeFileName: '' }))}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div>
                    <input
                      type="file"
                      accept=".pdf,.doc,.docx,.txt"
                      id="resume-upload-input"
                      className="hidden"
                      onChange={handleResumeUpload}
                      disabled={resumeUploading}
                    />
                    <label htmlFor="resume-upload-input">
                      <Button type="button" variant="outline" size="sm" asChild disabled={resumeUploading}>
                        <span className="cursor-pointer flex items-center gap-1.5">
                          {resumeUploading ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              {t('profile.processing')}
                            </>
                          ) : (
                            <>
                              <Upload className="w-4 h-4" />
                              {t('profile.uploadResume')}
                            </>
                          )}
                        </span>
                      </Button>
                    </label>
                    <p className="text-xs text-muted-foreground mt-1">{t('profile.resumeFormat')}</p>
                  </div>
                )}
              </div>



              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t('profile.fullName')}</Label>
                  <Input value={user?.fullName ?? ''} disabled />
                </div>
                <div className="space-y-2">
                  <Label>{t('profile.phoneLbl')}</Label>
                  <Input value={user?.phoneNumber ?? ''} disabled />
                </div>
              </div>

              <div className="space-y-2">              {/* Trust Score Banner */}
              {user && (
                <div className={`flex items-center gap-3 rounded-lg border p-3 transition-all duration-200 hover:shadow-sm ${
                  user.trustLevel === 'trusted' ? 'bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800' :
                  user.trustLevel === 'active' ? 'bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800' :
                  'bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800'
                }`}>
                  <Shield className={`h-5 w-5 shrink-0 ${
                    user.trustLevel === 'trusted' ? 'text-green-600' :
                    user.trustLevel === 'active' ? 'text-blue-600' : 'text-amber-600'
                  }`} />
                  <div className="flex-1">
                    <p className="text-sm font-semibold capitalize">
                      {user.trustLevel === 'trusted' ? t('profile.trustTrusted') :
                       user.trustLevel === 'active' ? t('profile.trustActive') : t('profile.trustNew')}
                    </p>
                    <p className="text-xs text-muted-foreground">{t('profile.trustScore')}: {user.trustScore.toFixed(1)} / 100</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                    <span className="text-sm font-bold">{user.trustScore.toFixed(1)}</span>
                  </div>
                </div>
              )}                <Label htmlFor="location">{t('profile.locationLbl')}</Label>
                <LocationInput
                  id="location"
                  placeholder={t('profile.locationPh')}
                  value={formData.location}
                  onChange={(val) => setFormData((prev) => ({ ...prev, location: val }))}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="bio">{t('profile.bioLbl')}</Label>
                <Textarea
                  id="bio"
                  placeholder={t('profile.bioPh')}
                  value={formData.bio}
                  onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                  rows={3}
                />
              </div>
            </div>
          </Card>

          {/* Job Categories */}
          <Card className="p-6 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Star className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-semibold">{t('profile.categoriesRequired2')}</h2>
                <p className="text-sm text-muted-foreground">{t('profile.categoriesDesc')}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {JOB_CATEGORIES.map((category) => (
                <Badge
                  key={category}
                  variant={formData.categories.includes(category) ? 'default' : 'outline'}
                  className="cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary/90"
                  onClick={() => toggleCategory(category)}
                >
                  {category}
                  {formData.categories.includes(category) && <X className="w-3 h-3 ml-1" />}
                </Badge>
              ))}
            </div>
          </Card>

          {/* Work Experience & Skills */}
          <Card className="p-6 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-semibold">{t('profile.experienceSection')}</h2>
                <p className="text-sm text-muted-foreground">{t('profile.experienceSectionDesc')}</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="experience">{t('profile.experienceLbl')}</Label>
                <div className="flex gap-2 items-start">
                  <Textarea
                    id="experience"
                    placeholder={t('profile.experiencePh')}
                    value={formData.experience}
                    onChange={(e) => setFormData({ ...formData, experience: e.target.value })}
                    rows={4}
                    className="flex-1"
                  />
                  <VoiceInput
                    onResult={(t) => setFormData(prev => ({ ...prev, experience: prev.experience ? prev.experience + ' ' + t : t }))}
                    lang="en-IN"
                    append
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleExtractSkills}
                  disabled={!formData.experience || extractingSkills}
                >
                  {extractingSkills ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t('profile.extracting')}</>
                  ) : (
                    <><Sparkles className="w-4 h-4 mr-2" />{t('profile.extractSkills')}</>
                  )}
                </Button>
              </div>

              <div className="space-y-2">
                <Label htmlFor="skillInput">{t('profile.skillsLbl')}</Label>
                <div className="flex gap-2">
                  <Input
                    id="skillInput"
                    placeholder={t('profile.skillPh')}
                    value={formData.skillInput}
                    onChange={(e) => setFormData({ ...formData, skillInput: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addSkill();
                      }
                    }}
                  />
                  <Button type="button" size="icon" onClick={addSkill}>
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Shield className="w-3 h-3" />
                  {t('profile.skillsVerifiedHint')}
                </p>
                {formData.skills.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {formData.skills.map((skill) => (
                      <Badge key={skill} variant={verifiedSkills.includes(skill) ? 'default' : pendingReviewSkills.includes(skill) ? 'outline' : 'secondary'} className={`gap-1 pr-1 ${verifiedSkills.includes(skill) ? 'bg-green-600 hover:bg-green-700 text-white' : pendingReviewSkills.includes(skill) ? 'border-blue-400 bg-blue-50 dark:bg-blue-950' : 'border-dashed border-amber-400'}`}>
                        {verifiedSkills.includes(skill) ? (
                          <CheckCircle2 className="w-3 h-3 mr-0.5" />
                        ) : pendingReviewSkills.includes(skill) ? (
                          <Loader2 className="w-3 h-3 mr-0.5 text-blue-500 animate-spin" />
                        ) : (
                          <AlertTriangle className="w-3 h-3 mr-0.5 text-amber-500" />
                        )}
                        {skill}
                        {verifiedSkills.includes(skill) && (
                          <span className="text-[10px] ml-1 opacity-80">{t('profile.skillVerified')}</span>
                        )}
                        {pendingReviewSkills.includes(skill) && (
                          <span className="text-[10px] ml-1 text-blue-600 dark:text-blue-400">{t('profile.skillPending')}</span>
                        )}
                        <button
                          type="button"
                          className="ml-1 rounded-full p-0.5 hover:bg-destructive/20 focus:outline-none cursor-pointer"
                          onClick={(e) => { e.stopPropagation(); removeSkill(skill); }}
                          aria-label={`Remove ${skill}`}
                        >
                          <X className="w-3 h-3 hover:text-destructive" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* Availability */}
          <Card className="p-6 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
            <div className="mb-6">
              <h2 className="text-xl font-semibold mb-2">{t('profile.availabilityTitle')}</h2>
              <p className="text-sm text-muted-foreground">{t('profile.availabilityDesc')}</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="availability">{t('profile.workPreference')}</Label>
              <select
                id="availability"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={formData.availability}
                onChange={(e) => setFormData({ ...formData, availability: e.target.value })}
              >
                <option value="">{t('profile.selectAvailability')}</option>
                <option value="Full-time">{t('profile.fullTime')}</option>
                <option value="Part-time">{t('profile.partTime')}</option>
                <option value="Weekends">{t('profile.weekendsOnly')}</option>
                <option value="Flexible">{t('profile.flexible')}</option>
                <option value="Evening">{t('profile.eveningShifts')}</option>
                <option value="Morning">{t('profile.morningShifts')}</option>
              </select>
            </div>
          </Card>

          {/* Actions */}
          <div className="flex gap-4">
            <Button type="submit" disabled={saving} className="flex-1">
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {t('common.loading')}
                </>
              ) : (
                t('profile.saveProfile')
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push('/worker/dashboard')}
            >
              {t('common.cancel')}
            </Button>
          </div>
        </form>

          {/* Account & Security — outside the profile form to prevent interference */}
          <Card className="border-destructive/40 p-6 transition-all duration-200 hover:shadow-md mt-6">
            <div className="mb-6 space-y-8 border-b border-destructive/20 pb-6">
              <div>
                <h2 className="text-base font-semibold text-muted-foreground uppercase tracking-wide mb-3">{t('profile.langRegion')}</h2>
                <div className="grid grid-cols-3 gap-2">
                  {(locales as readonly SupportedLocale[]).map((code) => {
                    const [flag, ...rest] = localeLabels[code].split(' ');
                    return (
                      <button
                        key={code}
                        type="button"
                        onClick={() => setLocale(code)}
                        className={[
                          'flex flex-col items-center gap-1 rounded-lg border-2 p-2 text-xs transition-all hover:border-primary',
                          locale === code ? 'border-primary bg-primary/5' : 'border-border',
                        ].join(' ')}
                      >
                        <span className="text-lg">{flag}</span>
                        <span className={`font-medium ${locale === code ? 'text-primary' : ''}`}>{localeNames[code]}</span>
                        <span className="text-[10px] text-muted-foreground">{rest.join(' ')}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <h2 className="text-base font-semibold text-muted-foreground uppercase tracking-wide mb-3">{t('settings.changePw')}</h2>
                <div className="rounded-lg bg-muted/30 p-4 space-y-3">
                  <Input
                    type="password"
                    placeholder={t('settings.currentPw')}
                    value={pwForm.current}
                    onChange={(e) => setPwForm((p) => ({ ...p, current: e.target.value }))}
                    autoComplete="off"
                  />
                  <Input
                    type="password"
                    placeholder={t('settings.newPw')}
                    value={pwForm.newPw}
                    onChange={(e) => setPwForm((p) => ({ ...p, newPw: e.target.value }))}
                    autoComplete="new-password"
                  />
                  <Input
                    type="password"
                    placeholder={t('settings.confirmPw')}
                    value={pwForm.confirm}
                    onChange={(e) => setPwForm((p) => ({ ...p, confirm: e.target.value }))}
                    autoComplete="new-password"
                  />
                  <Button type="button" size="sm" onClick={handleChangePassword} disabled={pwLoading}>
                    {pwLoading ? t('profile.pwUpdating') : t('settings.updatePw')}
                  </Button>
                </div>
              </div>

              <div>
                <h2 className="text-base font-semibold text-muted-foreground uppercase tracking-wide mb-3">{t('profile.updatePhone')}</h2>
                <div className="rounded-lg bg-muted/30 p-4 space-y-3">
                  <div className="flex gap-2">
                    <Input
                      type="tel"
                      maxLength={10}
                      value={phoneForm.phone}
                      onChange={(e) => setPhoneForm((p) => ({ ...p, phone: e.target.value }))}
                      placeholder={t('profile.phonePh')}
                      className="min-w-0"
                    />
                    <Button type="button" variant="outline" size="sm" onClick={handleSendOtp} disabled={phoneLoading} className="shrink-0">
                      {otpSent ? t('profile.resend') : t('profile.sendOtp')}
                    </Button>
                  </div>
                  {displayOtp && <p className="text-xs text-muted-foreground">OTP: {displayOtp}</p>}
                  {otpSent && (
                    <>
                      <Input
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        value={phoneForm.otp}
                        onChange={(e) => setPhoneForm((p) => ({ ...p, otp: e.target.value }))}
                        placeholder={t('profile.otpPh')}
                      />
                      <Button type="button" size="sm" onClick={handleVerifyAndUpdatePhone} disabled={phoneLoading}>
                        {phoneLoading ? t('profile.verifying') : t('profile.verifyUpdate')}
                      </Button>
                    </>
                  )}
                </div>
              </div>

              <div>
                <h2 className="text-base font-semibold text-muted-foreground uppercase tracking-wide mb-3">{t('profile.updateEmail')}</h2>
                <div className="rounded-lg bg-muted/30 p-4 space-y-3">
                  <div className="flex gap-2">
                    <Input
                      type="email"
                      value={emailForm.email}
                      onChange={(e) => setEmailForm((p) => ({ ...p, email: e.target.value.trim() }))}
                      placeholder={t('profile.emailPh')}
                      className="min-w-0"
                    />
                    <Button type="button" variant="outline" size="sm" onClick={handleSendEmailOtp} disabled={emailLoading} className="shrink-0">
                      {emailOtpSent ? t('profile.resend') : t('profile.sendCode')}
                    </Button>
                  </div>
                  {emailOtpSent && (
                    <>
                      <Input
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        value={emailForm.otp}
                        onChange={(e) => setEmailForm((p) => ({ ...p, otp: e.target.value.replace(/\D/g, '').slice(0, 6) }))}
                        placeholder={t('profile.otpPh')}
                      />
                      <Button type="button" size="sm" onClick={handleVerifyAndUpdateEmail} disabled={emailLoading}>
                        {emailLoading ? t('profile.verifying') : t('profile.verifyUpdate')}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 mb-3">
              <Trash2 className="w-4 h-4 text-destructive" />
              <h2 className="text-base font-semibold text-muted-foreground uppercase tracking-wide text-destructive">Danger Zone</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-4">{t('profile.deleteDesc')}</p>
            <Button type="button" variant="outline" onClick={handleLogout} className="mr-2">
              <X className="w-4 h-4 mr-2" />
              {t('settings.signOut')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => setDeleteDialogOpen(true)}
              disabled={deletingAccount}
            >
              {deletingAccount ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t('common.loading')}</> : t('profile.deleteAccount')}
            </Button>
          </Card>

        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('profile.deleteConfirmTitle')}</AlertDialogTitle>
              <AlertDialogDescription>
                {t('profile.deleteConfirmDesc')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deletingAccount}>{t('common.cancel')}</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  void handleDeleteAccount();
                }}
                disabled={deletingAccount}
              >
                {deletingAccount ? t('profile.deleting') : t('profile.deleteAccount')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Video Skill Assessment Dialog */}
        <VideoSkillAssessment
          open={assessmentOpen}
          skills={pendingSkills}
          workerId={user!.id}
          onComplete={handleAssessmentComplete}
          onCancel={() => { setAssessmentOpen(false); setPendingSkills([]); }}
        />
      </main>
    </div>
  );
}

