// Database types for the Hyperlocal Job Matching Platform

export type UserRole = 'worker' | 'employer' | 'admin';

export type JobType = 'full-time' | 'part-time' | 'gig' | 'freelance';

export type JobStatus = 'draft' | 'active' | 'filled' | 'cancelled' | 'completed';

export type ApplicationStatus = 'pending' | 'accepted' | 'rejected' | 'completed';

export type PaymentStatus = 'pending' | 'locked' | 'released' | 'refunded';

export type TrustLevel = 'basic' | 'active' | 'trusted';

/** Remote vs On-site */
export type JobMode = 'remote' | 'local';

/** Technical (requires resume) vs Non-technical (blue-collar) */
export type JobNature = 'technical' | 'non-technical';

export interface User {
  id: string;
  fullName: string;
  email?: string;
  phone?: string;
  phoneNumber: string;
  role: UserRole;
  createdAt: string;
  profileCompleted: boolean;
  trustScore: number;
  trustLevel: TrustLevel;
  isVerified: boolean;
  companyName?: string;
  companyAddress?: string;
  companyWebsite?: string;
  companyDescription?: string;
  skills?: string[];
  /** GSTIN number for business verification (employer only) */
  gstin?: string;
  /** Whether GSTIN has been verified via ClearTax API */
  gstinVerified?: boolean;
  /** Business details fetched from ClearTax */
  gstinDetails?: GSTINDetails;
  /** PAN card number used for KYC verification */
  panNumber?: string;
  /** Whether PAN has been verified via Sandbox API */
  panVerified?: boolean;
  /** Name as registered on the PAN card */
  panName?: string;
  /** PAN verification timestamp */
  panVerifiedAt?: string;
  /** Aadhaar number used for KYC verification */
  aadhaarNumber?: string;
  /** Whether Aadhaar has been verified */
  aadhaarVerified?: boolean;
  /** Aadhaar verification timestamp */
  aadhaarVerifiedAt?: string;
}

/** GSTIN verification details from ClearTax API */
export interface GSTINDetails {
  tradeName: string;
  legalName: string;
  status: string;        // 'Active' | 'Cancelled' | 'Suspended'
  taxpayerType: string;
  registeredDate?: string;
  address?: string;
  state?: string;
  verified: boolean;
  verifiedAt: string;
}

export interface WorkerProfile {
  userId: string;
  skills: string[];
  availability: string;
  experience?: string;
  categories: string[];
  location?: string;
  profilePictureUrl?: string;
  bio?: string;
  profileCompleted?: boolean;
  /** Resume file URL (required for technical job applications) */
  resumeUrl?: string;
  /** Parsed resume text for RAG indexing */
  resumeText?: string;
  /** Resume parsed metadata (projects, experience, education) */
  resumeParsed?: ResumeData;
}

/** Structured data extracted from a resume */
export interface ResumeData {
  summary?: string;
  skills: string[];
  experience: ResumeExperience[];
  education: ResumeEducation[];
  projects: ResumeProject[];
  certifications?: string[];
}

export interface ResumeExperience {
  title: string;
  company: string;
  duration: string;
  description: string;
}

export interface ResumeEducation {
  degree: string;
  institution: string;
  year?: string;
}

export interface ResumeProject {
  name: string;
  description: string;
  technologies: string[];
}

export interface EmployerProfile {
  userId: string;
  businessName: string;
  organizationName?: string;
  location?: string;
  businessType?: string;
  description?: string;
}

export interface Job {
  id: string;
  employerId: string;
  title: string;
  description: string;
  jobType: JobType;
  /** Remote vs On-site */
  jobMode: JobMode;
  /** Technical (resume required) vs Non-technical */
  jobNature: JobNature;
  category: string;
  requiredSkills: string[];
  location: string;
  latitude?: number;
  longitude?: number;
  pay: number;
  payAmount?: number;
  payType?: 'hourly' | 'fixed';
  paymentStatus: PaymentStatus;
  escrowAmount?: number;
  escrowRequired?: boolean;
  timing: string;
  duration?: string;
  experienceRequired?: 'entry' | 'intermediate' | 'expert';
  requirements?: string;
  benefits?: string;
  slots?: number;
  startDate?: string;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
  applicationCount: number;
  views: number;
}

export interface Application {
  id: string;
  jobId: string;
  workerId: string;
  status: ApplicationStatus;
  matchScore: number;
  coverMessage?: string;
  coverLetter?: string;
  /** Resume URL attached for technical job applications */
  resumeUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatConversation {
  id: string;
  participants: string[];
  jobId?: string;
  applicationId?: string;
  lastMessage?: {
    id: string;
    senderId: string;
    message: string;
    createdAt: string;
    read: boolean;
  };
  updatedAt: string;
}

export interface ChatSession {
  id: string;
  applicationId: string;
  workerId: string;
  employerId: string;
  jobId: string;
  isActive: boolean;
  createdAt: string;
  lastMessageAt?: string;
}

export interface ChatMessage {
  id: string;
  sessionId?: string;
  conversationId?: string;
  senderId: string;
  message: string;
  createdAt: string;
  isRead?: boolean;
  read?: boolean;
  attachmentUrl?: string;
  attachmentName?: string;
  attachmentType?: string;
  attachmentSize?: number;
}

export interface Rating {
  id: string;
  jobId: string;
  applicationId: string;
  fromUserId: string;
  toUserId: string;
  rating: number;
  feedback?: string;
  createdAt: string;
}

export interface TrustScore {
  userId: string;
  score: number;
  level: TrustLevel;
  jobCompletionRate: number;
  averageRating: number;
  totalRatings: number;
  complaintCount: number;
  successfulPayments: number;
  updatedAt: string;
}

export interface Report {
  id: string;
  reporterId: string;
  reportedId?: string;
  reportedUserId?: string;
  reportedJobId?: string;
  type?: string;
  reason: string;
  description: string;
  status: 'pending' | 'reviewing' | 'resolved' | 'dismissed';
  resolution?: string;
  createdAt: string;
  resolvedAt?: string;
}

export interface EscrowTransaction {
  id: string;
  jobId: string;
  employerId: string;
  workerId: string;
  amount: number;
  status: 'pending' | 'held' | 'released' | 'refunded';
  commission?: number;
  createdAt: string;
  releasedAt?: string;
  refundedAt?: string;
}

export interface Notification {
  id: string;
  userId: string;
  type: 'job_match' | 'application' | 'message' | 'payment' | 'rating' | 'system';
  title: string;
  message: string;
  isRead: boolean;
  link?: string;
  createdAt: string;
}
