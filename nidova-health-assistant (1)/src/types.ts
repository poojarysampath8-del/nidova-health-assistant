export type Language = 'en' | 'kn';
export type ReadingLevel = 'basic' | 'standard' | 'detailed';
export type DocumentCategory = 'lab_report' | 'prescription' | 'discharge_summary' | 'unknown';
export type DocumentStatus =
  | 'uploaded'
  | 'processing'
  | 'needs_confirmation'
  | 'analyzed'
  | 'rejected'
  | 'failed';
export type TestStatus = 'normal' | 'high' | 'low' | 'critical' | 'unclassified';
export type FamilyRole = 'viewer' | 'caregiver';
export type FamilyStatus = 'pending' | 'accepted' | 'revoked';

export interface UserDetails {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  bloodGroup: string;
  emergencyContact: string;
  preferredLanguage: Language;
  readingLevel: ReadingLevel;
  consentAccepted: boolean;
  consentTimestamp: string;
  createdAt: string;
  lastLoginAt: string;
}

export interface PatientProfile {
  id: string;
  ownerUserId: string;
  name: string;
  dob: string | null;
  relation: string;
  language: Language;
  createdAt: string;
}

export interface FamilyAccess {
  id: string;
  patientId: string;
  memberName: string;
  memberEmail: string;
  role: FamilyRole;
  canUpload: boolean;
  canEditProfile: boolean;
  status: FamilyStatus;
  createdAt: string;
}

export interface TestResult {
  id: string;
  documentId: string;
  canonicalKey: string;
  rawName: string;
  value: number | null;
  rawValue: string;
  unit: string;
  referenceMin: number | null;
  referenceMax: number | null;
  status: TestStatus;
  flagReason: string;
  userVerified: boolean;
}

export interface MedicineRecord {
  id: string;
  documentId: string;
  medicineName: string;
  strength: string;
  instructions: string;
  isUnclear: boolean;
}

export interface HealthAlert {
  id: string;
  patientId: string;
  documentId: string;
  severity: 'critical' | 'warning';
  source: string;
  reason: string;
  guidance: string;
  acknowledged: boolean;
  acknowledgedAt: string | null;
  createdAt: string;
}

export interface ReportAnalysis {
  id: string;
  documentId: string;
  summary: string;
  suggestedQuestions: string[];
  language: Language;
  readingLevel: ReadingLevel;
  modelVersion: string;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  documentId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export interface DoctorQuestion {
  id: string;
  patientId: string;
  documentId: string | null;
  question: string;
  completed: boolean;
  createdAt: string;
}

export interface MedicalDocument {
  id: string;
  patientId: string;
  filename: string;
  fileType: 'pdf' | 'png' | 'jpeg';
  storedFilename: string | null;
  documentCategory: DocumentCategory;
  status: DocumentStatus;
  statusMessage: string;
  reportDate: string | null;
  extractedText: string;
  ocrConfidence: number;
  isUncertain: boolean;
  uploadedAt: string;
}

export interface AuditLog {
  id: string;
  actor: string;
  action: string;
  targetType: string;
  targetId: string;
  timestamp: string;
}

export interface TrendPoint {
  date: string;
  value: number;
  unit: string;
  status: TestStatus;
  referenceMin: number | null;
  referenceMax: number | null;
  documentId: string;
  filename: string;
}

export interface WorkspaceState {
  currentUser: UserDetails;
  patients: PatientProfile[];
  familyAccess: FamilyAccess[];
  documents: MedicalDocument[];
  testResults: TestResult[];
  medicines: MedicineRecord[];
  alerts: HealthAlert[];
  analyses: ReportAnalysis[];
  chatMessages: ChatMessage[];
  doctorQuestions: DoctorQuestion[];
  auditLogs: AuditLog[];
  rulesVersion: string;
}
