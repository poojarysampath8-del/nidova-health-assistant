import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';
import type {
  DocumentCategory,
  HealthAlert,
  Language,
  MedicalDocument,
  MedicineRecord,
  PatientProfile,
  ReadingLevel,
  TestResult,
  WorkspaceState,
} from './src/types.js';
import {
  answerReportQuestion,
  extractAndClassifyDocument,
  generateGroundedSummary,
  synthesizeSpeechWav,
} from './server/ai.js';
import {
  createSessionRecord,
  extractTokenFromRequest,
  hashPassword,
  toPublicUser,
  verifyPassword,
  type StoredUser,
} from './server/auth.js';
import {
  RULES_VERSION,
  canonicalizeParameter,
  classifyTestValue,
  evaluateRedFlags,
} from './server/rules.js';
import {
  MEDIA_DIR,
  appendAuditLog,
  loadStore,
  saveStore,
  uid,
  type PersistedDatabase,
} from './server/store.js';
import { validateUploadedBuffer } from './server/validators.js';

const PORT = 3000;
const app = express();
app.use(express.json({ limit: '2mb' }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

interface AuthenticatedRequest extends Request {
  authUser?: StoredUser;
  authToken?: string;
}

function getAuthorizedPatients(state: PersistedDatabase, user: StoredUser): PatientProfile[] {
  const emailLower = user.email.toLowerCase();
  const sharedIds = new Set(
    state.familyAccess
      .filter((f) => f.memberEmail.toLowerCase() === emailLower && f.status === 'accepted')
      .map((f) => f.patientId)
  );
  return state.patients.filter((p) => p.ownerUserId === user.id || sharedIds.has(p.id));
}

function canAccessPatient(
  state: PersistedDatabase,
  user: StoredUser,
  patientId: string,
  action: 'view' | 'upload' | 'delete' | 'manage_family'
): boolean {
  const patient = state.patients.find((p) => p.id === patientId);
  if (!patient) return false;
  if (patient.ownerUserId === user.id) return true;
  if (action === 'delete' || action === 'manage_family') return false;

  const access = state.familyAccess.find(
    (f) =>
      f.patientId === patientId &&
      f.memberEmail.toLowerCase() === user.email.toLowerCase() &&
      f.status === 'accepted'
  );
  if (!access) return false;
  if (action === 'view') return true;
  if (action === 'upload') return access.role === 'caregiver' && access.canUpload;
  return false;
}

function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const token = extractTokenFromRequest(req);
  if (!token) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  const state = loadStore();
  const nowIso = new Date().toISOString();
  const session = state.sessions.find((s) => s.token === token && s.expiresAt > nowIso);
  if (!session) {
    return res.status(401).json({ error: 'Session expired or invalid. Please sign in again.' });
  }
  const user = state.users.find((u) => u.id === session.userId);
  if (!user) {
    return res.status(401).json({ error: 'Account not found.' });
  }
  req.authUser = user;
  req.authToken = token;
  next();
}

function buildFactsForDoc(results: TestResult[], medicines: MedicineRecord[]): string[] {
  const facts: string[] = [];
  for (const r of results) {
    const refStr =
      r.referenceMin !== null || r.referenceMax !== null
        ? `${r.referenceMin ?? '?'} - ${r.referenceMax ?? '?'}`
        : 'Missing';
    facts.push(
      `${r.rawName}: ${r.rawValue} ${r.unit} (Ref: ${refStr}, Deterministic Status: ${r.status.toUpperCase()})`
    );
  }
  for (const m of medicines) {
    facts.push(
      `Medicine: ${m.medicineName} ${m.strength} | Instructions: ${m.instructions || 'Not reliably extracted'}${m.isUnclear ? ' [UNCLEAR - VERIFY]' : ''}`
    );
  }
  return facts;
}

function evaluateExtractedRows(
  state: PersistedDatabase,
  doc: MedicalDocument,
  rawTests: Array<{
    rawName: string;
    value: number | null;
    rawValue: string;
    unit: string;
    referenceMin: number | null;
    referenceMax: number | null;
  }>,
  rawMedicines: Array<{
    medicineName: string;
    strength: string;
    instructions: string;
    isUnclear: boolean;
  }>
): { results: TestResult[]; medicines: MedicineRecord[]; alerts: HealthAlert[] } {
  const results: TestResult[] = [];
  const medicines: MedicineRecord[] = [];
  const alerts: HealthAlert[] = [];

  for (const item of rawTests) {
    const canonicalKey = canonicalizeParameter(item.rawName);
    const classified = classifyTestValue(
      item.value,
      item.referenceMin,
      item.referenceMax,
      doc.isUncertain
    );
    let status = classified.status;
    let reason = classified.reason;

    const flag = evaluateRedFlags(
      item.rawName,
      doc.isUncertain ? null : item.value,
      doc.extractedText
    );
    if (flag) {
      status = 'critical';
      reason = flag.reason;
      const alert: HealthAlert = {
        id: uid('alert'),
        patientId: doc.patientId,
        documentId: doc.id,
        severity: flag.severity,
        source: flag.source,
        reason: flag.reason,
        guidance: flag.guidance,
        acknowledged: false,
        acknowledgedAt: null,
        createdAt: new Date().toISOString(),
      };
      state.alerts.unshift(alert);
      alerts.push(alert);
      appendAuditLog(
        state,
        'System Deterministic Engine',
        `CRITICAL_ALERT_TRIGGERED:${canonicalKey}`,
        'HealthAlert',
        alert.id
      );
    }

    const tr: TestResult = {
      id: uid('res'),
      documentId: doc.id,
      canonicalKey,
      rawName: item.rawName,
      value: item.value,
      rawValue: item.rawValue,
      unit: item.unit,
      referenceMin: item.referenceMin,
      referenceMax: item.referenceMax,
      status,
      flagReason: reason,
      userVerified: !doc.isUncertain,
    };
    state.testResults.push(tr);
    results.push(tr);
  }

  if (alerts.length === 0) {
    const docFlag = evaluateRedFlags('', null, doc.extractedText);
    if (docFlag) {
      const alert: HealthAlert = {
        id: uid('alert'),
        patientId: doc.patientId,
        documentId: doc.id,
        severity: docFlag.severity,
        source: docFlag.source,
        reason: docFlag.reason,
        guidance: docFlag.guidance,
        acknowledged: false,
        acknowledgedAt: null,
        createdAt: new Date().toISOString(),
      };
      state.alerts.unshift(alert);
      alerts.push(alert);
    }
  }

  for (const med of rawMedicines) {
    const mr: MedicineRecord = {
      id: uid('med'),
      documentId: doc.id,
      medicineName: med.medicineName,
      strength: med.strength,
      instructions: med.instructions,
      isUnclear: med.isUnclear,
    };
    state.medicines.push(mr);
    medicines.push(mr);
  }

  return { results, medicines, alerts };
}

// ---------- Authentication Endpoints ----------

app.post('/api/auth/register', (req, res) => {
  const {
    fullName,
    email,
    password,
    phone,
    dateOfBirth,
    bloodGroup,
    emergencyContact,
    preferredLanguage,
    consentAccepted,
  } = req.body as {
    fullName?: string;
    email?: string;
    password?: string;
    phone?: string;
    dateOfBirth?: string;
    bloodGroup?: string;
    emergencyContact?: string;
    preferredLanguage?: Language;
    consentAccepted?: boolean;
  };

  if (!fullName?.trim() || !email?.trim() || !password) {
    return res.status(400).json({ error: 'Full name, email, and password are required.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
  }
  if (!consentAccepted) {
    return res.status(400).json({ error: 'You must accept the privacy and medical disclaimer consent.' });
  }

  const state = loadStore();
  const normalizedEmail = email.trim().toLowerCase();
  if (state.users.some((u) => u.email.toLowerCase() === normalizedEmail)) {
    return res.status(409).json({ error: 'An account with this email already exists.' });
  }

  const now = new Date().toISOString();
  const lang: Language = preferredLanguage === 'kn' ? 'kn' : 'en';
  const newUser: StoredUser = {
    id: uid('usr'),
    fullName: fullName.trim(),
    email: normalizedEmail,
    phone: phone?.trim() || '',
    dateOfBirth: dateOfBirth?.trim() || '',
    bloodGroup: bloodGroup?.trim() || '',
    emergencyContact: emergencyContact?.trim() || '',
    preferredLanguage: lang,
    readingLevel: 'standard',
    consentAccepted: true,
    consentTimestamp: now,
    createdAt: now,
    lastLoginAt: now,
    passwordHash: hashPassword(password),
  };

  state.users.push(newUser);
  state.patients.push({
    id: uid('pat'),
    ownerUserId: newUser.id,
    name: newUser.fullName,
    dob: newUser.dateOfBirth || null,
    relation: 'Self (Primary)',
    language: lang,
    createdAt: now,
  });

  const session = createSessionRecord(newUser.id);
  state.sessions.push(session);
  appendAuditLog(state, newUser.fullName, 'USER_REGISTERED', 'User', newUser.id);
  saveStore(state);

  res.cookie('nidova_session', session.token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
  res.json({ token: session.token, user: toPublicUser(newUser) });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email?.trim() || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const state = loadStore();
  const normalizedEmail = email.trim().toLowerCase();
  const user = state.users.find((u) => u.email.toLowerCase() === normalizedEmail);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  user.lastLoginAt = new Date().toISOString();
  const session = createSessionRecord(user.id);
  state.sessions.push(session);
  appendAuditLog(state, user.fullName, 'USER_LOGIN', 'User', user.id);
  saveStore(state);

  res.cookie('nidova_session', session.token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
  res.json({ token: session.token, user: toPublicUser(user) });
});

app.post('/api/auth/logout', requireAuth, (req: AuthenticatedRequest, res) => {
  const state = loadStore();
  state.sessions = state.sessions.filter((s) => s.token !== req.authToken);
  if (req.authUser) {
    appendAuditLog(state, req.authUser.fullName, 'USER_LOGOUT', 'User', req.authUser.id);
  }
  saveStore(state);
  res.clearCookie('nidova_session');
  res.json({ loggedOut: true });
});

app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
  res.json({ user: toPublicUser(req.authUser!) });
});

app.patch('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
  const state = loadStore();
  const user = state.users.find((u) => u.id === req.authUser!.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  const {
    fullName,
    phone,
    dateOfBirth,
    bloodGroup,
    emergencyContact,
    preferredLanguage,
    readingLevel,
  } = req.body as {
    fullName?: string;
    phone?: string;
    dateOfBirth?: string;
    bloodGroup?: string;
    emergencyContact?: string;
    preferredLanguage?: Language;
    readingLevel?: ReadingLevel;
  };

  if (fullName?.trim()) user.fullName = fullName.trim();
  if (phone !== undefined) user.phone = phone.trim();
  if (dateOfBirth !== undefined) user.dateOfBirth = dateOfBirth.trim();
  if (bloodGroup !== undefined) user.bloodGroup = bloodGroup.trim();
  if (emergencyContact !== undefined) user.emergencyContact = emergencyContact.trim();
  if (preferredLanguage === 'en' || preferredLanguage === 'kn') {
    user.preferredLanguage = preferredLanguage;
  }
  if (readingLevel === 'basic' || readingLevel === 'standard' || readingLevel === 'detailed') {
    user.readingLevel = readingLevel;
  }

  appendAuditLog(state, user.fullName, 'USER_PROFILE_UPDATED', 'User', user.id);
  saveStore(state);
  res.json({ user: toPublicUser(user) });
});

// ---------- Protected Clinical Workspace Endpoints ----------

app.get('/api/workspace', requireAuth, (req: AuthenticatedRequest, res) => {
  const state = loadStore();
  const user = req.authUser!;
  const authorizedPatients = getAuthorizedPatients(state, user);
  const patientIds = new Set(authorizedPatients.map((p) => p.id));

  const documents = state.documents.filter((d) => patientIds.has(d.patientId));
  const docIds = new Set(documents.map((d) => d.id));

  const payload: WorkspaceState = {
    currentUser: toPublicUser(user),
    patients: authorizedPatients,
    familyAccess: state.familyAccess.filter((f) => patientIds.has(f.patientId)),
    documents,
    testResults: state.testResults.filter((r) => docIds.has(r.documentId)),
    medicines: state.medicines.filter((m) => docIds.has(m.documentId)),
    alerts: state.alerts.filter((a) => patientIds.has(a.patientId)),
    analyses: state.analyses.filter((a) => docIds.has(a.documentId)),
    chatMessages: state.chatMessages.filter((c) => docIds.has(c.documentId)),
    doctorQuestions: state.doctorQuestions.filter((q) => patientIds.has(q.patientId)),
    auditLogs: state.auditLogs,
    rulesVersion: state.rulesVersion,
  };
  res.json(payload);
});

app.post('/api/patients', requireAuth, (req: AuthenticatedRequest, res) => {
  const { name, dob, relation, language } = req.body as {
    name?: string;
    dob?: string;
    relation?: string;
    language?: Language;
  };
  if (!name?.trim()) {
    return res.status(400).json({ error: 'Patient name is required.' });
  }
  const state = loadStore();
  const patient: PatientProfile = {
    id: uid('pat'),
    ownerUserId: req.authUser!.id,
    name: name.trim(),
    dob: dob || null,
    relation: relation?.trim() || 'Family Member',
    language: language === 'kn' ? 'kn' : 'en',
    createdAt: new Date().toISOString(),
  };
  state.patients.push(patient);
  appendAuditLog(
    state,
    req.authUser!.fullName,
    `PATIENT_CREATED:${patient.name}`,
    'PatientProfile',
    patient.id
  );
  saveStore(state);
  res.json(patient);
});

app.post('/api/family', requireAuth, (req: AuthenticatedRequest, res) => {
  const { patientId, memberName, memberEmail, role, canUpload, canEditProfile } = req.body as {
    patientId?: string;
    memberName?: string;
    memberEmail?: string;
    role?: 'viewer' | 'caregiver';
    canUpload?: boolean;
    canEditProfile?: boolean;
  };
  if (!patientId || !memberName?.trim() || !memberEmail?.trim()) {
    return res.status(400).json({ error: 'Patient, member name, and email are required.' });
  }
  const state = loadStore();
  if (!canAccessPatient(state, req.authUser!, patientId, 'manage_family')) {
    return res.status(403).json({ error: 'Only the patient owner can manage family access.' });
  }

  const access = {
    id: uid('fam'),
    patientId,
    memberName: memberName.trim(),
    memberEmail: memberEmail.trim().toLowerCase(),
    role: role === 'caregiver' ? ('caregiver' as const) : ('viewer' as const),
    canUpload: role === 'caregiver' && Boolean(canUpload),
    canEditProfile: role === 'caregiver' && Boolean(canEditProfile),
    status: 'accepted' as const,
    createdAt: new Date().toISOString(),
  };
  state.familyAccess.push(access);
  appendAuditLog(
    state,
    req.authUser!.fullName,
    `FAMILY_ACCESS_GRANTED:${access.memberEmail}:${access.role}`,
    'FamilyAccess',
    access.id
  );
  saveStore(state);
  res.json(access);
});

app.patch('/api/family/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  const state = loadStore();
  const item = state.familyAccess.find((f) => f.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Family access record not found.' });
  if (!canAccessPatient(state, req.authUser!, item.patientId, 'manage_family')) {
    return res.status(403).json({ error: 'Only the patient owner can modify family access.' });
  }

  const { status, role, canUpload } = req.body as {
    status?: 'pending' | 'accepted' | 'revoked';
    role?: 'viewer' | 'caregiver';
    canUpload?: boolean;
  };
  if (status) item.status = status;
  if (role) {
    item.role = role;
    item.canUpload = role === 'caregiver' ? Boolean(canUpload) : false;
  }
  appendAuditLog(
    state,
    req.authUser!.fullName,
    `FAMILY_ACCESS_UPDATED:${item.status}`,
    'FamilyAccess',
    item.id
  );
  saveStore(state);
  res.json(item);
});

// Real multipart medical document upload (supports both file upload & camera photo capture)
app.post(
  '/api/documents/upload',
  requireAuth,
  upload.single('document'),
  async (req: AuthenticatedRequest, res) => {
    try {
      const file = req.file;
      const patientId = req.body.patientId as string;
      const sourceMode = req.body.sourceMode === 'camera' ? 'CAMERA' : 'FILE';
      const language = (req.body.language === 'kn' ? 'kn' : 'en') as Language;
      const readingLevel = (
        ['basic', 'standard', 'detailed'].includes(req.body.readingLevel)
          ? req.body.readingLevel
          : 'standard'
      ) as ReadingLevel;

      if (!file) {
        return res.status(400).json({ error: 'No file or camera image attached.' });
      }

      const state = loadStore();
      if (!canAccessPatient(state, req.authUser!, patientId, 'upload')) {
        return res
          .status(403)
          .json({ error: 'You do not have upload permission for this patient profile.' });
      }

      let detectedType: 'pdf' | 'png' | 'jpeg';
      try {
        detectedType = validateUploadedBuffer(file.buffer, file.originalname);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Invalid file format.';
        appendAuditLog(
          state,
          req.authUser!.fullName,
          `UPLOAD_REJECTED_FORMAT:${file.originalname}`,
          'MedicalDocument',
          'none'
        );
        saveStore(state);
        return res.status(400).json({ error: msg, rejected: true });
      }

      const extraction = await extractAndClassifyDocument(
        file.buffer,
        detectedType,
        file.originalname
      );
      if (!extraction.isMedical) {
        appendAuditLog(
          state,
          req.authUser!.fullName,
          `DOCUMENT_REJECTED_NON_MEDICAL:${file.originalname}`,
          'MedicalDocument',
          'rejected'
        );
        saveStore(state);
        return res.status(422).json({
          error: `Rejected non-medical document: ${extraction.rejectionReason}`,
          rejected: true,
        });
      }

      const ext = detectedType === 'pdf' ? '.pdf' : detectedType === 'png' ? '.png' : '.jpg';
      const storedFilename = `${uid('file')}${ext}`;
      fs.writeFileSync(path.join(MEDIA_DIR, storedFilename), file.buffer);

      const doc: MedicalDocument = {
        id: uid('doc'),
        patientId,
        filename: file.originalname,
        fileType: detectedType,
        storedFilename,
        documentCategory: extraction.category,
        status: extraction.needsConfirmation ? 'needs_confirmation' : 'analyzed',
        statusMessage: extraction.needsConfirmation
          ? 'Please confirm the document category.'
          : 'Analyzed with deterministic clinical rules.',
        reportDate: extraction.reportDate,
        extractedText: extraction.extractedText,
        ocrConfidence: extraction.ocrConfidence,
        isUncertain: extraction.isUncertain,
        uploadedAt: new Date().toISOString(),
      };
      state.documents.unshift(doc);
      appendAuditLog(
        state,
        req.authUser!.fullName,
        `DOCUMENT_UPLOADED_${sourceMode}:${doc.filename}`,
        'MedicalDocument',
        doc.id
      );

      const { results, medicines, alerts } = evaluateExtractedRows(
        state,
        doc,
        extraction.testResults,
        extraction.medicines
      );

      const facts = buildFactsForDoc(results, medicines);
      const summaryResult = await generateGroundedSummary({
        extractedText: doc.extractedText,
        deterministicFacts: facts,
        criticalAlerts: alerts.map((a) => `${a.reason} (${a.source})`),
        language,
        readingLevel,
      });

      state.analyses.unshift({
        id: uid('ana'),
        documentId: doc.id,
        summary: summaryResult.summary,
        suggestedQuestions: summaryResult.suggestedQuestions,
        language,
        readingLevel,
        modelVersion: summaryResult.modelVersion,
        createdAt: new Date().toISOString(),
      });

      saveStore(state);
      res.json({ document: doc, results, medicines, alerts });
    } catch (err) {
      console.error('Upload processing error:', err);
      const message = err instanceof Error ? err.message : 'Unable to process uploaded report.';
      res.status(500).json({ error: message });
    }
  }
);

app.post('/api/documents/verify-fixture', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { patientId, fixtureType, language, readingLevel } = req.body as {
      patientId: string;
      fixtureType: 'critical_hb' | 'missing_range' | 'non_medical_disguised';
      language?: Language;
      readingLevel?: ReadingLevel;
    };

    const state = loadStore();
    if (!canAccessPatient(state, req.authUser!, patientId, 'upload')) {
      return res.status(403).json({ error: 'Upload permission required for this profile.' });
    }

    if (fixtureType === 'non_medical_disguised') {
      const fakePdfBuffer = Buffer.from(
        'Software Engineer Resume\nExperience: Full Stack Developer\nSkills: React, Python',
        'utf-8'
      );
      try {
        validateUploadedBuffer(fakePdfBuffer, 'resume_disguised_as_report.pdf');
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Rejected disguised file.';
        appendAuditLog(
          state,
          req.authUser!.fullName,
          'DOCUMENT_REJECTED_DISGUISED_FILE:resume_disguised_as_report.pdf',
          'MedicalDocument',
          'rejected'
        );
        saveStore(state);
        return res.status(400).json({ error: msg, rejected: true });
      }
    }

    const lang: Language = language === 'kn' ? 'kn' : 'en';
    const level: ReadingLevel = ['basic', 'standard', 'detailed'].includes(readingLevel || '')
      ? (readingLevel as ReadingLevel)
      : 'standard';

    const doc: MedicalDocument =
      fixtureType === 'critical_hb'
        ? {
            id: uid('doc'),
            patientId,
            filename: 'Emergency_CBC_Check_Nov2026.pdf',
            fileType: 'pdf',
            storedFilename: null,
            documentCategory: 'lab_report',
            status: 'analyzed',
            statusMessage: `Critical threshold triggered (${RULES_VERSION}).`,
            reportDate: new Date().toISOString().slice(0, 10),
            extractedText:
              'Acute Care Lab Report\nHemoglobin: 6.2 g/dL (Ref: 13.0 - 17.0)\nSerum Potassium: 6.7 mmol/L (Ref: 3.5 - 5.1)',
            ocrConfidence: 97.4,
            isUncertain: false,
            uploadedAt: new Date().toISOString(),
          }
        : {
            id: uid('doc'),
            patientId,
            filename: 'Incomplete_Ferritin_Scan_Nov2026.png',
            fileType: 'png',
            storedFilename: null,
            documentCategory: 'lab_report',
            status: 'analyzed',
            statusMessage: 'Missing reference range marked Unable to Classify (SR-03).',
            reportDate: new Date().toISOString().slice(0, 10),
            extractedText:
              'Diagnostic Lab Scan\nSerum Ferritin: 42 ng/mL (Reference range cut off / not printed)\nTSH: 2.4 mIU/L (Ref: 0.4 - 4.5)',
            ocrConfidence: 82.0,
            isUncertain: false,
            uploadedAt: new Date().toISOString(),
          };

    const rawTests =
      fixtureType === 'critical_hb'
        ? [
            {
              rawName: 'Hemoglobin',
              value: 6.2,
              rawValue: '6.2',
              unit: 'g/dL',
              referenceMin: 13.0,
              referenceMax: 17.0,
            },
            {
              rawName: 'Potassium',
              value: 6.7,
              rawValue: '6.7',
              unit: 'mmol/L',
              referenceMin: 3.5,
              referenceMax: 5.1,
            },
          ]
        : [
            {
              rawName: 'Serum Ferritin',
              value: 42,
              rawValue: '42',
              unit: 'ng/mL',
              referenceMin: null,
              referenceMax: null,
            },
            {
              rawName: 'TSH',
              value: 2.4,
              rawValue: '2.4',
              unit: 'mIU/L',
              referenceMin: 0.4,
              referenceMax: 4.5,
            },
          ];

    state.documents.unshift(doc);
    appendAuditLog(
      state,
      req.authUser!.fullName,
      `FIXTURE_ANALYZED:${fixtureType}`,
      'MedicalDocument',
      doc.id
    );

    const { results, medicines, alerts } = evaluateExtractedRows(state, doc, rawTests, []);
    const facts = buildFactsForDoc(results, medicines);
    const summaryResult = await generateGroundedSummary({
      extractedText: doc.extractedText,
      deterministicFacts: facts,
      criticalAlerts: alerts.map((a) => `${a.reason} (${a.source})`),
      language: lang,
      readingLevel: level,
    });

    state.analyses.unshift({
      id: uid('ana'),
      documentId: doc.id,
      summary: summaryResult.summary,
      suggestedQuestions: summaryResult.suggestedQuestions,
      language: lang,
      readingLevel: level,
      modelVersion: summaryResult.modelVersion,
      createdAt: new Date().toISOString(),
    });

    saveStore(state);
    res.json({ document: doc });
  } catch (err) {
    console.error('Fixture error:', err);
    res.status(500).json({ error: 'Unable to run verification scenario.' });
  }
});

app.get('/api/documents/:id/file', requireAuth, (req: AuthenticatedRequest, res) => {
  const state = loadStore();
  const doc = state.documents.find((d) => d.id === req.params.id);
  if (!doc) return res.status(404).json({ error: 'Document not found.' });
  if (!canAccessPatient(state, req.authUser!, doc.patientId, 'view')) {
    return res.status(403).json({ error: 'Permission denied.' });
  }
  if (!doc.storedFilename) {
    return res.status(404).json({ error: 'Original binary file not available for seeded preview.' });
  }
  const fullPath = path.join(MEDIA_DIR, doc.storedFilename);
  if (!fs.existsSync(fullPath)) {
    return res.status(404).json({ error: 'Stored file missing.' });
  }
  appendAuditLog(
    state,
    req.authUser!.fullName,
    `DOCUMENT_VIEWED:${doc.filename}`,
    'MedicalDocument',
    doc.id
  );
  saveStore(state);
  res.sendFile(fullPath);
});

app.post('/api/documents/:id/confirm', requireAuth, (req: AuthenticatedRequest, res) => {
  const state = loadStore();
  const doc = state.documents.find((d) => d.id === req.params.id);
  if (!doc) return res.status(404).json({ error: 'Document not found.' });
  if (!canAccessPatient(state, req.authUser!, doc.patientId, 'upload')) {
    return res.status(403).json({ error: 'Permission denied.' });
  }
  const { category } = req.body as { category: DocumentCategory };
  if (['lab_report', 'prescription', 'discharge_summary'].includes(category)) {
    doc.documentCategory = category;
    doc.status = 'analyzed';
    doc.statusMessage = 'Category confirmed by user.';
    appendAuditLog(
      state,
      req.authUser!.fullName,
      `CATEGORY_CONFIRMED:${category}`,
      'MedicalDocument',
      doc.id
    );
    saveStore(state);
  }
  res.json(doc);
});

app.delete('/api/documents/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  const state = loadStore();
  const idx = state.documents.findIndex((d) => d.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Document not found.' });
  const doc = state.documents[idx];
  if (!canAccessPatient(state, req.authUser!, doc.patientId, 'delete')) {
    return res.status(403).json({ error: 'Only the patient owner can delete documents.' });
  }
  if (doc.storedFilename) {
    const filePath = path.join(MEDIA_DIR, doc.storedFilename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
  state.documents.splice(idx, 1);
  state.testResults = state.testResults.filter((r) => r.documentId !== doc.id);
  state.medicines = state.medicines.filter((m) => m.documentId !== doc.id);
  state.alerts = state.alerts.filter((a) => a.documentId !== doc.id);
  state.analyses = state.analyses.filter((a) => a.documentId !== doc.id);
  state.chatMessages = state.chatMessages.filter((c) => c.documentId !== doc.id);
  appendAuditLog(
    state,
    req.authUser!.fullName,
    `DOCUMENT_DELETED:${doc.filename}`,
    'MedicalDocument',
    doc.id
  );
  saveStore(state);
  res.json({ deleted: true });
});

app.patch('/api/test-results/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  const state = loadStore();
  const result = state.testResults.find((r) => r.id === req.params.id);
  if (!result) return res.status(404).json({ error: 'Test result not found.' });
  const doc = state.documents.find((d) => d.id === result.documentId);
  if (!doc || !canAccessPatient(state, req.authUser!, doc.patientId, 'upload')) {
    return res.status(403).json({ error: 'Permission denied.' });
  }

  const { value } = req.body as { value: number };
  const numericVal = Number(value);
  if (Number.isNaN(numericVal)) {
    return res.status(400).json({ error: 'Numeric value required.' });
  }

  result.value = numericVal;
  result.rawValue = String(numericVal);
  result.userVerified = true;

  const classified = classifyTestValue(numericVal, result.referenceMin, result.referenceMax, false);
  let status = classified.status;
  let reason = classified.reason;

  const flag = evaluateRedFlags(result.rawName, numericVal);
  if (flag) {
    status = 'critical';
    reason = flag.reason;
    const alert: HealthAlert = {
      id: uid('alert'),
      patientId: doc.patientId,
      documentId: result.documentId,
      severity: flag.severity,
      source: flag.source,
      reason: flag.reason,
      guidance: flag.guidance,
      acknowledged: false,
      acknowledgedAt: null,
      createdAt: new Date().toISOString(),
    };
    state.alerts.unshift(alert);
  }

  result.status = status;
  result.flagReason = reason;
  appendAuditLog(
    state,
    req.authUser!.fullName,
    `TEST_VALUE_VERIFIED:${result.rawName}=${numericVal}`,
    'TestResult',
    result.id
  );
  saveStore(state);
  res.json(result);
});

app.post('/api/alerts/:id/acknowledge', requireAuth, (req: AuthenticatedRequest, res) => {
  const state = loadStore();
  const alert = state.alerts.find((a) => a.id === req.params.id);
  if (!alert) return res.status(404).json({ error: 'Alert not found.' });
  if (!canAccessPatient(state, req.authUser!, alert.patientId, 'view')) {
    return res.status(403).json({ error: 'Permission denied.' });
  }
  alert.acknowledged = true;
  alert.acknowledgedAt = new Date().toISOString();
  appendAuditLog(state, req.authUser!.fullName, 'ALERT_ACKNOWLEDGED', 'HealthAlert', alert.id);
  saveStore(state);
  res.json(alert);
});

app.post('/api/documents/:id/regenerate', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const state = loadStore();
    const doc = state.documents.find((d) => d.id === req.params.id);
    if (!doc) return res.status(404).json({ error: 'Document not found.' });
    if (!canAccessPatient(state, req.authUser!, doc.patientId, 'view')) {
      return res.status(403).json({ error: 'Permission denied.' });
    }

    const { language, readingLevel } = req.body as {
      language: Language;
      readingLevel: ReadingLevel;
    };
    const lang: Language = language === 'kn' ? 'kn' : 'en';
    const level: ReadingLevel = ['basic', 'standard', 'detailed'].includes(readingLevel)
      ? readingLevel
      : 'standard';

    const results = state.testResults.filter((r) => r.documentId === doc.id);
    const medicines = state.medicines.filter((m) => m.documentId === doc.id);
    const alerts = state.alerts.filter((a) => a.documentId === doc.id);

    const summaryResult = await generateGroundedSummary({
      extractedText: doc.extractedText,
      deterministicFacts: buildFactsForDoc(results, medicines),
      criticalAlerts: alerts.map((a) => `${a.reason} (${a.source})`),
      language: lang,
      readingLevel: level,
    });

    const analysis = {
      id: uid('ana'),
      documentId: doc.id,
      summary: summaryResult.summary,
      suggestedQuestions: summaryResult.suggestedQuestions,
      language: lang,
      readingLevel: level,
      modelVersion: summaryResult.modelVersion,
      createdAt: new Date().toISOString(),
    };
    state.analyses.unshift(analysis);
    appendAuditLog(
      state,
      req.authUser!.fullName,
      `SUMMARY_REGENERATED:${lang}:${level}`,
      'ReportAnalysis',
      analysis.id
    );
    saveStore(state);
    res.json(analysis);
  } catch (err) {
    console.error('Regenerate summary error:', err);
    res.status(500).json({ error: 'Unable to regenerate explanation.' });
  }
});

app.post('/api/documents/:id/chat', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const state = loadStore();
    const doc = state.documents.find((d) => d.id === req.params.id);
    if (!doc) return res.status(404).json({ error: 'Document not found.' });
    if (!canAccessPatient(state, req.authUser!, doc.patientId, 'view')) {
      return res.status(403).json({ error: 'Permission denied.' });
    }

    const { question, language, readingLevel } = req.body as {
      question?: string;
      language?: Language;
      readingLevel?: ReadingLevel;
    };
    if (!question?.trim()) {
      return res.status(400).json({ error: 'Question cannot be empty.' });
    }

    const userMsg = {
      id: uid('msg'),
      documentId: doc.id,
      role: 'user' as const,
      content: question.trim(),
      createdAt: new Date().toISOString(),
    };
    state.chatMessages.push(userMsg);

    const results = state.testResults.filter((r) => r.documentId === doc.id);
    const medicines = state.medicines.filter((m) => m.documentId === doc.id);
    const history = state.chatMessages
      .filter((m) => m.documentId === doc.id)
      .map((m) => ({ role: m.role, content: m.content }));

    const answerText = await answerReportQuestion({
      question: question.trim(),
      extractedText: doc.extractedText,
      deterministicFacts: buildFactsForDoc(results, medicines),
      history,
      language: language === 'kn' ? 'kn' : 'en',
      readingLevel: readingLevel || 'standard',
    });

    const assistantMsg = {
      id: uid('msg'),
      documentId: doc.id,
      role: 'assistant' as const,
      content: answerText,
      createdAt: new Date().toISOString(),
    };
    state.chatMessages.push(assistantMsg);
    saveStore(state);
    res.json({ userMsg, assistantMsg });
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: 'Unable to answer question right now.' });
  }
});

app.post('/api/doctor-questions', requireAuth, (req: AuthenticatedRequest, res) => {
  const { patientId, documentId, question } = req.body as {
    patientId: string;
    documentId?: string | null;
    question: string;
  };
  if (!patientId || !question?.trim()) {
    return res.status(400).json({ error: 'Question is required.' });
  }
  const state = loadStore();
  if (!canAccessPatient(state, req.authUser!, patientId, 'view')) {
    return res.status(403).json({ error: 'Permission denied.' });
  }
  const item = {
    id: uid('dq'),
    patientId,
    documentId: documentId || null,
    question: question.trim(),
    completed: false,
    createdAt: new Date().toISOString(),
  };
  state.doctorQuestions.unshift(item);
  saveStore(state);
  res.json(item);
});

app.patch('/api/doctor-questions/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  const state = loadStore();
  const item = state.doctorQuestions.find((q) => q.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Question not found.' });
  if (!canAccessPatient(state, req.authUser!, item.patientId, 'view')) {
    return res.status(403).json({ error: 'Permission denied.' });
  }
  item.completed = Boolean(req.body.completed);
  saveStore(state);
  res.json(item);
});

app.delete('/api/doctor-questions/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  const state = loadStore();
  const item = state.doctorQuestions.find((q) => q.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Question not found.' });
  if (!canAccessPatient(state, req.authUser!, item.patientId, 'view')) {
    return res.status(403).json({ error: 'Permission denied.' });
  }
  state.doctorQuestions = state.doctorQuestions.filter((q) => q.id !== req.params.id);
  saveStore(state);
  res.json({ deleted: true });
});

app.post('/api/tts', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { text, language } = req.body as { text?: string; language?: Language };
    if (!text?.trim()) {
      return res.status(400).json({ error: 'Text is required for audio synthesis.' });
    }
    const wavBuffer = await synthesizeSpeechWav(text, language === 'kn' ? 'kn' : 'en');
    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Content-Length', wavBuffer.length);
    res.send(wavBuffer);
  } catch (err) {
    console.error('TTS error:', err);
    const msg = err instanceof Error ? err.message : 'Unable to generate audio.';
    res.status(500).json({ error: msg });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Nidova Health running on http://localhost:${PORT}`);
  });
}

startServer();
