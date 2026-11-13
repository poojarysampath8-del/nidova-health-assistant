import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type {
  AuditLog,
  DoctorQuestion,
  FamilyAccess,
  HealthAlert,
  MedicalDocument,
  MedicineRecord,
  PatientProfile,
  ReportAnalysis,
  TestResult,
  ChatMessage,
} from '../src/types.js';
import { hashPassword, type SessionRecord, type StoredUser } from './auth.js';
import {
  RULES_VERSION,
  canonicalizeParameter,
  classifyTestValue,
  evaluateRedFlags,
} from './rules.js';

const DATA_DIR = path.resolve(process.cwd(), 'private_data');
export const MEDIA_DIR = path.resolve(process.cwd(), 'private_media');
const STORE_PATH = path.join(DATA_DIR, 'store.json');

export interface PersistedDatabase {
  users: StoredUser[];
  sessions: SessionRecord[];
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

function ensureDirs() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR, { recursive: true });
}

export function uid(prefix = ''): string {
  return prefix ? `${prefix}_${crypto.randomUUID().slice(0, 8)}` : crypto.randomUUID();
}

function createSeedUsers(): StoredUser[] {
  const now = new Date('2026-11-10T09:30:00.000Z').toISOString();
  return [
    {
      id: 'usr_aarav',
      fullName: 'Aarav Rao',
      email: 'aarav.rao@example.com',
      phone: '+91 98450 22190',
      dateOfBirth: '1988-04-12',
      bloodGroup: 'O+',
      emergencyContact: 'Priya Rao (+91 98450 22191)',
      preferredLanguage: 'en',
      readingLevel: 'standard',
      consentAccepted: true,
      consentTimestamp: now,
      createdAt: now,
      lastLoginAt: now,
      passwordHash: hashPassword('NidovaDemo2026!'),
    },
    {
      id: 'usr_priya',
      fullName: 'Priya Rao',
      email: 'priya.rao@example.com',
      phone: '+91 98450 22191',
      dateOfBirth: '1990-07-19',
      bloodGroup: 'A+',
      emergencyContact: 'Aarav Rao (+91 98450 22190)',
      preferredLanguage: 'en',
      readingLevel: 'standard',
      consentAccepted: true,
      consentTimestamp: now,
      createdAt: now,
      lastLoginAt: now,
      passwordHash: hashPassword('NidovaDemo2026!'),
    },
  ];
}

function createInitialDatabase(): PersistedDatabase {
  const now = new Date('2026-11-10T09:30:00.000Z').toISOString();

  const p1Id = 'pat_aarav';
  const p2Id = 'pat_lakshmi';

  const doc1Id = 'doc_cbc_nov';
  const doc2Id = 'doc_cbc_aug';
  const doc3Id = 'doc_rx_nov';
  const doc4Id = 'doc_lakshmi_lab';

  const rawSeedDocs: Array<{
    doc: MedicalDocument;
    tests: Array<{
      rawName: string;
      value: number | null;
      rawValue: string;
      unit: string;
      referenceMin: number | null;
      referenceMax: number | null;
    }>;
  }> = [
    {
      doc: {
        id: doc2Id,
        patientId: p1Id,
        filename: 'Aarav_Metabolic_CBC_Aug2026.pdf',
        fileType: 'pdf',
        storedFilename: null,
        documentCategory: 'lab_report',
        status: 'analyzed',
        statusMessage: 'Analyzed with deterministic range checks.',
        reportDate: '2026-08-14',
        extractedText:
          'Nidova Diagnostic Centre\nPatient: Aarav Rao | Date: 2026-08-14\nHemoglobin: 13.4 g/dL (Ref: 13.0 - 17.0)\nFasting Blood Glucose: 118 mg/dL (Ref: 70 - 99)\nHbA1c: 6.4 % (Ref: 4.0 - 5.6)\nSerum Potassium: 4.2 mmol/L (Ref: 3.5 - 5.1)\nSerum Creatinine: 0.9 mg/dL (Ref: 0.7 - 1.3)',
        ocrConfidence: 98.5,
        isUncertain: false,
        uploadedAt: '2026-08-14T10:15:00.000Z',
      },
      tests: [
        { rawName: 'Hemoglobin', value: 13.4, rawValue: '13.4', unit: 'g/dL', referenceMin: 13.0, referenceMax: 17.0 },
        { rawName: 'Fasting Blood Glucose', value: 118, rawValue: '118', unit: 'mg/dL', referenceMin: 70, referenceMax: 99 },
        { rawName: 'HbA1c', value: 6.4, rawValue: '6.4', unit: '%', referenceMin: 4.0, referenceMax: 5.6 },
        { rawName: 'Potassium', value: 4.2, rawValue: '4.2', unit: 'mmol/L', referenceMin: 3.5, referenceMax: 5.1 },
        { rawName: 'Serum Creatinine', value: 0.9, rawValue: '0.9', unit: 'mg/dL', referenceMin: 0.7, referenceMax: 1.3 },
      ],
    },
    {
      doc: {
        id: doc1Id,
        patientId: p1Id,
        filename: 'Aarav_Followup_Panel_Nov2026.pdf',
        fileType: 'pdf',
        storedFilename: null,
        documentCategory: 'lab_report',
        status: 'analyzed',
        statusMessage: 'Analyzed with deterministic range checks.',
        reportDate: '2026-11-08',
        extractedText:
          'Nidova Diagnostic Centre\nPatient: Aarav Rao | Date: 2026-11-08\nHemoglobin: 12.1 g/dL (Ref: 13.0 - 17.0)\nFasting Blood Glucose: 106 mg/dL (Ref: 70 - 99)\nHbA1c: 6.1 % (Ref: 4.0 - 5.6)\nPotassium: 4.3 mmol/L (Ref: 3.5 - 5.1)\nVitamin B12: 285 pg/mL (Ref range not printed on lab sheet)',
        ocrConfidence: 96.2,
        isUncertain: false,
        uploadedAt: '2026-11-08T11:20:00.000Z',
      },
      tests: [
        { rawName: 'Hemoglobin', value: 12.1, rawValue: '12.1', unit: 'g/dL', referenceMin: 13.0, referenceMax: 17.0 },
        { rawName: 'Fasting Blood Glucose', value: 106, rawValue: '106', unit: 'mg/dL', referenceMin: 70, referenceMax: 99 },
        { rawName: 'HbA1c', value: 6.1, rawValue: '6.1', unit: '%', referenceMin: 4.0, referenceMax: 5.6 },
        { rawName: 'Potassium', value: 4.3, rawValue: '4.3', unit: 'mmol/L', referenceMin: 3.5, referenceMax: 5.1 },
        { rawName: 'Vitamin B12', value: 285, rawValue: '285', unit: 'pg/mL', referenceMin: null, referenceMax: null },
      ],
    },
    {
      doc: {
        id: doc3Id,
        patientId: p1Id,
        filename: 'Dr_Mehta_Prescription_Nov2026.jpg',
        fileType: 'jpeg',
        storedFilename: null,
        documentCategory: 'prescription',
        status: 'analyzed',
        statusMessage: 'Prescription medicines extracted.',
        reportDate: '2026-11-09',
        extractedText:
          'Dr. S. Mehta, MD (Internal Medicine)\nRx:\n1. Tab. Metformin 500 mg — 1-0-1 after meals\n2. Tab. Cyanocobalamin 1500 mcg — Once daily after breakfast for 30 days',
        ocrConfidence: 88.4,
        isUncertain: false,
        uploadedAt: '2026-11-09T14:00:00.000Z',
      },
      tests: [],
    },
    {
      doc: {
        id: doc4Id,
        patientId: p2Id,
        filename: 'Lakshmi_Renal_Electrolytes_Nov2026.pdf',
        fileType: 'pdf',
        storedFilename: null,
        documentCategory: 'lab_report',
        status: 'analyzed',
        statusMessage: 'Critical rule triggered during deterministic check.',
        reportDate: '2026-11-11',
        extractedText:
          'City Clinical Labs\nPatient: Lakshmi Rao | Date: 2026-11-11\nHemoglobin: 6.4 g/dL (Ref: 12.0 - 15.5) — CRITICAL LOW\nSerum Potassium: 4.6 mmol/L (Ref: 3.5 - 5.1)\nSerum Creatinine: 1.1 mg/dL (Ref: 0.6 - 1.1)',
        ocrConfidence: 97.0,
        isUncertain: false,
        uploadedAt: '2026-11-11T08:40:00.000Z',
      },
      tests: [
        { rawName: 'Hemoglobin', value: 6.4, rawValue: '6.4', unit: 'g/dL', referenceMin: 12.0, referenceMax: 15.5 },
        { rawName: 'Potassium', value: 4.6, rawValue: '4.6', unit: 'mmol/L', referenceMin: 3.5, referenceMax: 5.1 },
        { rawName: 'Serum Creatinine', value: 1.1, rawValue: '1.1', unit: 'mg/dL', referenceMin: 0.6, referenceMax: 1.1 },
      ],
    },
  ];

  const documents: MedicalDocument[] = [];
  const testResults: TestResult[] = [];
  const alerts: HealthAlert[] = [];

  for (const entry of rawSeedDocs) {
    documents.push(entry.doc);
    for (const item of entry.tests) {
      const canonicalKey = canonicalizeParameter(item.rawName);
      const classified = classifyTestValue(
        item.value,
        item.referenceMin,
        item.referenceMax,
        entry.doc.isUncertain
      );
      let status = classified.status;
      let reason = classified.reason;

      const flag = evaluateRedFlags(item.rawName, item.value, entry.doc.extractedText);
      if (flag) {
        status = 'critical';
        reason = flag.reason;
        alerts.push({
          id: uid('alert'),
          patientId: entry.doc.patientId,
          documentId: entry.doc.id,
          severity: flag.severity,
          source: flag.source,
          reason: flag.reason,
          guidance: flag.guidance,
          acknowledged: false,
          acknowledgedAt: null,
          createdAt: entry.doc.uploadedAt,
        });
      }

      testResults.push({
        id: uid('res'),
        documentId: entry.doc.id,
        canonicalKey,
        rawName: item.rawName,
        value: item.value,
        rawValue: item.rawValue,
        unit: item.unit,
        referenceMin: item.referenceMin,
        referenceMax: item.referenceMax,
        status,
        flagReason: reason,
        userVerified: true,
      });
    }
  }

  return {
    users: createSeedUsers(),
    sessions: [],
    patients: [
      {
        id: p1Id,
        ownerUserId: 'usr_aarav',
        name: 'Aarav Rao',
        dob: '1988-04-12',
        relation: 'Self (Primary)',
        language: 'en',
        createdAt: now,
      },
      {
        id: p2Id,
        ownerUserId: 'usr_aarav',
        name: 'Lakshmi Rao',
        dob: '1958-09-23',
        relation: 'Mother (Caregiver Access)',
        language: 'kn',
        createdAt: now,
      },
    ],
    familyAccess: [
      {
        id: 'fam_1',
        patientId: p1Id,
        memberName: 'Priya Rao',
        memberEmail: 'priya.rao@example.com',
        role: 'viewer',
        canUpload: false,
        canEditProfile: false,
        status: 'accepted',
        createdAt: now,
      },
      {
        id: 'fam_2',
        patientId: p2Id,
        memberName: 'Aarav Rao',
        memberEmail: 'aarav.rao@example.com',
        role: 'caregiver',
        canUpload: true,
        canEditProfile: true,
        status: 'accepted',
        createdAt: now,
      },
    ],
    documents,
    testResults,
    medicines: [
      {
        id: 'med_1',
        documentId: doc3Id,
        medicineName: 'Metformin',
        strength: '500 mg',
        instructions: '1-0-1 after meals (as written on prescription)',
        isUnclear: false,
      },
      {
        id: 'med_2',
        documentId: doc3Id,
        medicineName: 'Cyanocobalamin (Vitamin B12)',
        strength: '1500 mcg',
        instructions: 'Once daily after breakfast for 30 days',
        isUnclear: false,
      },
    ],
    alerts,
    analyses: [
      {
        id: 'ana_1',
        documentId: doc1Id,
        summary:
          'What your report states:\nYour November 2026 panel lists Hemoglobin at 12.1 g/dL (reference 13.0–17.0 g/dL, marked Low), Fasting Blood Glucose at 106 mg/dL (reference 70–99 mg/dL, marked High), HbA1c at 6.1% (reference 4.0–5.6%, marked High), and Potassium at 4.3 mmol/L (within 3.5–5.1 mmol/L, Normal). Vitamin B12 is 285 pg/mL with no printed reference range, so it is marked Unable to Classify.\n\nPlain-language explanation:\nCompared to your August 2026 report, Fasting Glucose (118 to 106 mg/dL) and HbA1c (6.4% to 6.1%) moved lower while remaining above the printed reference limit. Hemoglobin is slightly below the lab reference minimum. Because Vitamin B12 lacks a printed reference range on this sheet, it is not assumed normal. Please review all findings with your physician.',
        suggestedQuestions: [
          'My Hemoglobin moved from 13.4 to 12.1 g/dL — should we check iron or ferritin levels?',
          'What target range for HbA1c and Fasting Glucose do you recommend before my next checkup?',
          'Which reference range applies to my Vitamin B12 result of 285 pg/mL?',
        ],
        language: 'en',
        readingLevel: 'standard',
        modelVersion: 'gemini-4-hydrogen',
        createdAt: '2026-11-08T11:21:00.000Z',
      },
      {
        id: 'ana_2',
        documentId: doc2Id,
        summary:
          'What your report states:\nYour August 2026 panel shows Hemoglobin (13.4 g/dL), Potassium (4.2 mmol/L), and Serum Creatinine (0.9 mg/dL) within printed reference ranges. Fasting Blood Glucose (118 mg/dL) and HbA1c (6.4%) are above the printed reference limits.\n\nPlain-language explanation:\nHbA1c reflects average blood sugar over roughly 2–3 months. Discussing these baseline values with your doctor helps plan nutrition, exercise, or follow-up testing.',
        suggestedQuestions: [
          'How often should I repeat my HbA1c and Fasting Glucose tests?',
        ],
        language: 'en',
        readingLevel: 'standard',
        modelVersion: 'gemini-4-hydrogen',
        createdAt: '2026-08-14T10:16:00.000Z',
      },
      {
        id: 'ana_3',
        documentId: doc3Id,
        summary:
          'What your report states:\nThis prescription from Dr. S. Mehta lists Tab. Metformin 500 mg (1-0-1 after meals) and Tab. Cyanocobalamin 1500 mcg (once daily after breakfast for 30 days).\n\nPlain-language explanation:\nThese entries reflect the exact medicine names, strengths, and schedules printed on your prescription. Do not alter your dosage or stop any medicine without consulting your prescribing doctor.',
        suggestedQuestions: [
          'Should I repeat Vitamin B12 or HbA1c tests after finishing the 30-day course?',
        ],
        language: 'en',
        readingLevel: 'standard',
        modelVersion: 'gemini-4-hydrogen',
        createdAt: '2026-11-09T14:01:00.000Z',
      },
      {
        id: 'ana_4',
        documentId: doc4Id,
        summary:
          'CRITICAL SAFETY NOTICE: Hemoglobin is 6.4 g/dL, which triggers the deterministic critical low alert threshold (<= 7.0 g/dL). Please contact a physician or seek prompt medical evaluation.\n\nWhat your report states:\nHemoglobin is 6.4 g/dL (reference 12.0–15.5 g/dL, Critical). Serum Potassium (4.6 mmol/L) and Serum Creatinine (1.1 mg/dL) fall within the printed reference ranges.\n\nPlain-language explanation:\nHemoglobin carries oxygen through the bloodstream. A value of 6.4 g/dL is substantially below the printed reference range and requires timely clinician review.',
        suggestedQuestions: [
          'Does this Hemoglobin result of 6.4 g/dL require urgent medical evaluation or repeat testing today?',
          'What additional evaluation is needed to understand the low hemoglobin?',
        ],
        language: 'en',
        readingLevel: 'standard',
        modelVersion: 'gemini-4-hydrogen',
        createdAt: '2026-11-11T08:41:00.000Z',
      },
    ],
    chatMessages: [
      {
        id: 'msg_1',
        documentId: doc1Id,
        role: 'user',
        content: 'Why is Vitamin B12 marked Unable to Classify?',
        createdAt: '2026-11-08T11:25:00.000Z',
      },
      {
        id: 'msg_2',
        documentId: doc1Id,
        role: 'assistant',
        content:
          'Your Vitamin B12 result is listed as 285 pg/mL, but no reference range was printed on the lab sheet. Under our safety rules, values without a printed reference range are never assumed normal and are marked "Unable to Classify" so you can confirm the lab’s reference interval with your doctor.',
        createdAt: '2026-11-08T11:25:05.000Z',
      },
    ],
    doctorQuestions: [
      {
        id: 'dq_1',
        patientId: p1Id,
        documentId: doc1Id,
        question: 'My Hemoglobin dropped from 13.4 to 12.1 g/dL — should we check iron or ferritin levels?',
        completed: false,
        createdAt: '2026-11-08T11:30:00.000Z',
      },
      {
        id: 'dq_2',
        patientId: p2Id,
        documentId: doc4Id,
        question: 'Urgent review needed for Hemoglobin 6.4 g/dL flagged on Nov 11 report.',
        completed: false,
        createdAt: '2026-11-11T08:45:00.000Z',
      },
    ],
    auditLogs: [
      {
        id: 'aud_1',
        actor: 'Aarav Rao',
        action: 'DOCUMENT_ANALYZED',
        targetType: 'MedicalDocument',
        targetId: doc1Id,
        timestamp: '2026-11-08T11:21:00.000Z',
      },
      {
        id: 'aud_2',
        actor: 'System Deterministic Engine',
        action: 'CRITICAL_ALERT_TRIGGERED:hemoglobin',
        targetType: 'HealthAlert',
        targetId: doc4Id,
        timestamp: '2026-11-11T08:40:30.000Z',
      },
    ],
    rulesVersion: RULES_VERSION,
  };
}

export function loadStore(): PersistedDatabase {
  ensureDirs();
  if (!fs.existsSync(STORE_PATH)) {
    const initial = createInitialDatabase();
    saveStore(initial);
    return initial;
  }
  const raw = fs.readFileSync(STORE_PATH, 'utf-8');
  const parsed = JSON.parse(raw) as Partial<PersistedDatabase>;

  let migrated = false;
  if (!Array.isArray(parsed.users) || parsed.users.length === 0) {
    parsed.users = createSeedUsers();
    migrated = true;
  }
  if (!Array.isArray(parsed.sessions)) {
    parsed.sessions = [];
    migrated = true;
  }
  if (Array.isArray(parsed.patients)) {
    for (const p of parsed.patients) {
      if (!p.ownerUserId) {
        p.ownerUserId = 'usr_aarav';
        migrated = true;
      }
    }
  }
  if (migrated) {
    saveStore(parsed as PersistedDatabase);
  }
  return parsed as PersistedDatabase;
}

export function saveStore(state: PersistedDatabase): void {
  ensureDirs();
  fs.writeFileSync(STORE_PATH, JSON.stringify(state, null, 2), 'utf-8');
}

export function appendAuditLog(
  state: PersistedDatabase,
  actor: string,
  action: string,
  targetType: string,
  targetId: string
): AuditLog {
  const entry: AuditLog = {
    id: uid('aud'),
    actor,
    action,
    targetType,
    targetId,
    timestamp: new Date().toISOString(),
  };
  state.auditLogs.unshift(entry);
  if (state.auditLogs.length > 200) {
    state.auditLogs = state.auditLogs.slice(0, 200);
  }
  return entry;
}
