import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  CheckSquare,
  ChevronRight,
  FileCheck2,
  FlaskConical,
  Loader2,
  LogOut,
  Plus,
  ShieldAlert,
  Square,
  Trash2,
  Upload,
  User,
  UserPlus,
  Users,
} from 'lucide-react';
import { apiFetch, clearAuthToken } from './api';
import type {
  DocumentCategory,
  Language,
  MedicalDocument,
  ReadingLevel,
  UserDetails,
  WorkspaceState,
} from './types';
import { AuthScreen } from './components/AuthScreen';
import { FamilyView } from './components/FamilyView';
import { ReportDetailView } from './components/ReportDetailView';
import { TrendsView } from './components/TrendsView';
import { UploadModal } from './components/UploadModal';
import { UserProfileView } from './components/UserProfileView';

type ActiveTab = 'overview' | 'reports' | 'trends' | 'family' | 'account';

const CATEGORY_TEXT: Record<DocumentCategory, string> = {
  lab_report: 'Lab Report',
  prescription: 'Prescription',
  discharge_summary: 'Discharge Summary',
  unknown: 'Needs Confirmation',
};

export default function App() {
  const [authChecked, setAuthChecked] = useState(false);
  const [currentUser, setCurrentUser] = useState<UserDetails | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceState | null>(null);
  const [loading, setLoading] = useState(true);

  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');
  const [selectedPatientId, setSelectedPatientId] = useState<string>('');
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);

  const [language, setLanguage] = useState<Language>('en');
  const [readingLevel, setReadingLevel] = useState<ReadingLevel>('standard');

  const [uploadOpen, setUploadOpen] = useState(false);
  const [addingPatient, setAddingPatient] = useState(false);
  const [newPatientName, setNewPatientName] = useState('');
  const [newPatientRelation, setNewPatientRelation] = useState('');
  const [newQuestionText, setNewQuestionText] = useState('');

  const [fixtureBusy, setFixtureBusy] = useState<string | null>(null);
  const [fixtureNotice, setFixtureNotice] = useState<{ type: 'error' | 'info'; text: string } | null>(
    null
  );

  const fetchWorkspace = useCallback(async () => {
    try {
      const res = await apiFetch('/api/workspace');
      if (res.status === 401) {
        clearAuthToken();
        setCurrentUser(null);
        setWorkspace(null);
        return;
      }
      const data = (await res.json()) as WorkspaceState;
      setWorkspace(data);
      setCurrentUser(data.currentUser);
      setLanguage(data.currentUser.preferredLanguage);
      setReadingLevel(data.currentUser.readingLevel);
      setSelectedPatientId((prev) => {
        if (prev && data.patients.some((p) => p.id === prev)) return prev;
        return data.patients[0]?.id || '';
      });
    } finally {
      setLoading(false);
      setAuthChecked(true);
    }
  }, []);

  useEffect(() => {
    fetchWorkspace();
  }, [fetchWorkspace]);

  const handleLogout = async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' });
    clearAuthToken();
    setCurrentUser(null);
    setWorkspace(null);
    setSelectedDocumentId(null);
    setActiveTab('overview');
  };

  const activePatient = useMemo(
    () =>
      workspace?.patients.find((p) => p.id === selectedPatientId) || workspace?.patients[0] || null,
    [workspace, selectedPatientId]
  );

  const patientDocuments = useMemo(
    () => (workspace?.documents || []).filter((d) => d.patientId === activePatient?.id),
    [workspace, activePatient]
  );

  const patientAlerts = useMemo(
    () => (workspace?.alerts || []).filter((a) => a.patientId === activePatient?.id),
    [workspace, activePatient]
  );

  const unacknowledgedAlerts = useMemo(
    () => patientAlerts.filter((a) => !a.acknowledged),
    [patientAlerts]
  );

  const patientDoctorQuestions = useMemo(
    () => (workspace?.doctorQuestions || []).filter((q) => q.patientId === activePatient?.id),
    [workspace, activePatient]
  );

  const patientFamilyCount = useMemo(
    () =>
      (workspace?.familyAccess || []).filter(
        (f) => f.patientId === activePatient?.id && f.status === 'accepted'
      ).length,
    [workspace, activePatient]
  );

  const selectedDocument: MedicalDocument | null = useMemo(() => {
    if (!selectedDocumentId || !workspace) return null;
    return workspace.documents.find((d) => d.id === selectedDocumentId) || null;
  }, [selectedDocumentId, workspace]);

  const handleCreatePatient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPatientName.trim()) return;
    const res = await apiFetch('/api/patients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newPatientName.trim(),
        relation: newPatientRelation.trim() || 'Family Member',
        language,
      }),
    });
    if (res.ok) {
      const created = await res.json();
      setNewPatientName('');
      setNewPatientRelation('');
      setAddingPatient(false);
      await fetchWorkspace();
      setSelectedPatientId(created.id);
      setSelectedDocumentId(null);
    }
  };

  const handleAckAlert = async (alertId: string) => {
    await apiFetch(`/api/alerts/${alertId}/acknowledge`, { method: 'POST' });
    await fetchWorkspace();
  };

  const handleAddDoctorQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePatient || !newQuestionText.trim()) return;
    await apiFetch('/api/doctor-questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        patientId: activePatient.id,
        question: newQuestionText.trim(),
      }),
    });
    setNewQuestionText('');
    await fetchWorkspace();
  };

  const handleToggleDoctorQuestion = async (id: string, completed: boolean) => {
    await apiFetch(`/api/doctor-questions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: !completed }),
    });
    await fetchWorkspace();
  };

  const handleDeleteDoctorQuestion = async (id: string) => {
    await apiFetch(`/api/doctor-questions/${id}`, { method: 'DELETE' });
    await fetchWorkspace();
  };

  const handleRunVerificationFixture = async (
    fixtureType: 'critical_hb' | 'missing_range' | 'non_medical_disguised'
  ) => {
    if (!activePatient) return;
    setFixtureBusy(fixtureType);
    setFixtureNotice(null);
    try {
      const res = await apiFetch('/api/documents/verify-fixture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId: activePatient.id,
          fixtureType,
          language,
          readingLevel,
        }),
      });
      const data = await res.json();
      await fetchWorkspace();
      if (!res.ok) {
        setFixtureNotice({
          type: 'error',
          text: data.error || 'Non-medical file rejected by content validator.',
        });
        return;
      }
      setSelectedDocumentId(data.document.id);
      setActiveTab('reports');
    } finally {
      setFixtureBusy(null);
    }
  };

  if (!authChecked || (loading && currentUser)) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex items-center gap-2.5 text-sm text-slate-600">
          <Loader2 className="w-4 h-4 animate-spin text-teal-700" />
          <span>Loading clinical workspace...</span>
        </div>
      </div>
    );
  }

  if (!currentUser || !workspace || !activePatient) {
    return (
      <AuthScreen
        onAuthenticated={async (user) => {
          setCurrentUser(user);
          setLoading(true);
          await fetchWorkspace();
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* 3-Zone Top Bar Contract */}
      <header className="bg-white border-b border-slate-200 px-6 py-3.5">
        <div className="max-w-[1440px] mx-auto flex items-center justify-between gap-8">
          <button
            type="button"
            onClick={() => {
              setSelectedDocumentId(null);
              setActiveTab('overview');
            }}
            className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            Nidova Health
          </button>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
            {(
              [
                { id: 'overview', label: 'Overview' },
                { id: 'reports', label: 'Reports' },
                { id: 'trends', label: 'Trends' },
                { id: 'family', label: 'Family' },
                { id: 'account', label: 'Account' },
              ] as const
            ).map((item) => {
              const isActive = activeTab === item.id && !selectedDocument;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setSelectedDocumentId(null);
                    setActiveTab(item.id);
                  }}
                  className={`whitespace-nowrap shrink-0 pb-0.5 transition-colors border-b-2 ${
                    isActive
                      ? 'text-teal-800 border-teal-700'
                      : 'border-transparent hover:text-slate-900 hover:border-slate-300'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() => setUploadOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-teal-700 rounded-lg hover:bg-teal-800 transition-colors whitespace-nowrap shrink-0"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Upload Report</span>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile secondary nav */}
      <div className="md:hidden bg-white border-b border-slate-200 px-4 py-2 flex items-center gap-2 overflow-x-auto">
        {(
          [
            { id: 'overview', label: 'Overview' },
            { id: 'reports', label: 'Reports' },
            { id: 'trends', label: 'Trends' },
            { id: 'family', label: 'Family' },
            { id: 'account', label: 'Account' },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setSelectedDocumentId(null);
              setActiveTab(item.id);
            }}
            className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 ${
              activeTab === item.id ? 'bg-teal-50 text-teal-800' : 'text-slate-600'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Main Workspace */}
      <div className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 py-6 flex flex-col lg:flex-row gap-6">
        {/* Left Workspace Sidebar */}
        <aside className="w-full lg:w-64 shrink-0 space-y-6">
          {/* Signed-in User Card */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-900 truncate">
                  {currentUser.fullName}
                </div>
                <div className="text-xs text-slate-500 truncate">{currentUser.email}</div>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                title="Sign Out"
                className="p-1.5 text-slate-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors shrink-0"
                aria-label="Sign out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
            <div className="text-xs text-slate-600 flex flex-wrap items-center gap-1.5">
              <span>{currentUser.bloodGroup ? `Blood ${currentUser.bloodGroup}` : 'Profile active'}</span>
              <span aria-hidden="true">·</span>
              <button
                type="button"
                onClick={() => {
                  setSelectedDocumentId(null);
                  setActiveTab('account');
                }}
                className="inline-flex items-center gap-1 font-medium text-teal-700 hover:text-teal-900"
              >
                <User className="w-3 h-3" />
                <span>User Details</span>
              </button>
            </div>
          </div>

          {/* Patient Switcher */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold text-slate-600">Patient Profiles</h2>
              <button
                type="button"
                onClick={() => setAddingPatient((v) => !v)}
                className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:text-teal-900"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Add</span>
              </button>
            </div>

            <div className="space-y-1.5">
              {workspace.patients.map((p) => {
                const selected = p.id === activePatient.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setSelectedPatientId(p.id);
                      setSelectedDocumentId(null);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${
                      selected
                        ? 'bg-teal-50/70 border-teal-300 text-slate-900'
                        : 'bg-white border-transparent hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="text-sm font-medium truncate">{p.name}</div>
                    <div className="text-xs text-slate-500 truncate">{p.relation}</div>
                  </button>
                );
              })}
            </div>

            {addingPatient && (
              <form onSubmit={handleCreatePatient} className="pt-3 border-t border-slate-200 space-y-2">
                <input
                  type="text"
                  required
                  value={newPatientName}
                  onChange={(e) => setNewPatientName(e.target.value)}
                  placeholder="Patient full name"
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg"
                />
                <input
                  type="text"
                  value={newPatientRelation}
                  onChange={(e) => setNewPatientRelation(e.target.value)}
                  placeholder="Relation (e.g., Father)"
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="submit"
                    className="flex-1 py-1.5 text-xs font-medium text-white bg-teal-700 rounded-lg hover:bg-teal-800"
                  >
                    Create
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddingPatient(false)}
                    className="px-2.5 py-1.5 text-xs text-slate-600 border border-slate-300 rounded-lg"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Language & Reading Level Preferences */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
            <div>
              <h2 className="text-xs font-semibold text-slate-600 mb-2">Summary Language</h2>
              <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg">
                {(
                  [
                    { id: 'en', label: 'English' },
                    { id: 'kn', label: 'ಕನ್ನಡ' },
                  ] as const
                ).map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => setLanguage(l.id)}
                    className={`py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                      language === l.id
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <h2 className="text-xs font-semibold text-slate-600 mb-2">Reading Complexity</h2>
              <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-lg">
                {(['basic', 'standard', 'detailed'] as ReadingLevel[]).map((lvl) => (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => setReadingLevel(lvl)}
                    className={`py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                      readingLevel === lvl
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {lvl.charAt(0).toUpperCase() + lvl.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Doctor Visit Checklist */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold text-slate-600">Doctor Visit Checklist</h2>
              <span className="text-xs font-mono tabular-nums text-slate-500">
                {patientDoctorQuestions.length}
              </span>
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto">
              {patientDoctorQuestions.length === 0 ? (
                <p className="text-xs text-slate-500">
                  Save questions from any report or add one below for your next doctor visit.
                </p>
              ) : (
                patientDoctorQuestions.map((dq) => (
                  <div
                    key={dq.id}
                    className="flex items-start gap-2 text-xs text-slate-700 pb-2 border-b border-slate-100 last:border-b-0 last:pb-0"
                  >
                    <button
                      type="button"
                      onClick={() => handleToggleDoctorQuestion(dq.id, dq.completed)}
                      className="mt-0.5 text-teal-700 shrink-0"
                      aria-label="Toggle doctor question"
                    >
                      {dq.completed ? (
                        <CheckSquare className="w-4 h-4" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-400" />
                      )}
                    </button>
                    <span
                      className={`flex-1 leading-relaxed ${dq.completed ? 'line-through text-slate-400' : ''}`}
                    >
                      {dq.question}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDeleteDoctorQuestion(dq.id)}
                      className="text-slate-400 hover:text-red-700 shrink-0"
                      aria-label="Delete question"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>

            <form onSubmit={handleAddDoctorQuestion} className="flex items-center gap-1.5 pt-1">
              <input
                type="text"
                value={newQuestionText}
                onChange={(e) => setNewQuestionText(e.target.value)}
                placeholder="Add visit question..."
                className="flex-1 min-w-0 px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg"
              />
              <button
                type="submit"
                disabled={!newQuestionText.trim()}
                className="p-1.5 text-white bg-teal-700 rounded-lg hover:bg-teal-800 disabled:opacity-50 shrink-0"
                aria-label="Add doctor question"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>
        </aside>

        {/* Main Viewport */}
        <main className="flex-1 min-w-0 space-y-6">
          {/* Persistent Medical Disclaimer */}
          <div className="bg-amber-50/75 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-950 leading-relaxed">
            <span className="font-semibold">Medical Disclaimer:</span> Nidova Health is an
            informational report assistant. It does not diagnose diseases, prescribe or alter
            medicines, or replace a qualified physician. Always confirm values against your original
            laboratory sheet.
          </div>

          {selectedDocument ? (
            <ReportDetailView
              key={selectedDocument.id}
              document={selectedDocument}
              results={workspace.testResults.filter((r) => r.documentId === selectedDocument.id)}
              medicines={workspace.medicines.filter((m) => m.documentId === selectedDocument.id)}
              alerts={workspace.alerts.filter((a) => a.documentId === selectedDocument.id)}
              analysis={workspace.analyses.find((a) => a.documentId === selectedDocument.id)}
              chatMessages={workspace.chatMessages.filter(
                (m) => m.documentId === selectedDocument.id
              )}
              doctorQuestions={patientDoctorQuestions}
              language={language}
              readingLevel={readingLevel}
              onLanguageChange={setLanguage}
              onReadingLevelChange={setReadingLevel}
              onBack={() => setSelectedDocumentId(null)}
              onRefresh={fetchWorkspace}
              onDeleted={async () => {
                setSelectedDocumentId(null);
                await fetchWorkspace();
              }}
            />
          ) : activeTab === 'trends' ? (
            <TrendsView
              patient={activePatient}
              documents={workspace.documents}
              testResults={workspace.testResults}
              onOpenUpload={() => setUploadOpen(true)}
            />
          ) : activeTab === 'family' ? (
            <FamilyView
              patient={activePatient}
              familyAccess={workspace.familyAccess}
              onRefresh={fetchWorkspace}
            />
          ) : activeTab === 'account' ? (
            <UserProfileView
              user={currentUser}
              auditLogs={workspace.auditLogs}
              rulesVersion={workspace.rulesVersion}
              onUpdated={fetchWorkspace}
              onLogout={handleLogout}
            />
          ) : (
            <div className="space-y-6">
              {/* Unacknowledged Critical Alerts Banner */}
              {unacknowledgedAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className="bg-red-50 border border-red-300 rounded-xl p-5 flex flex-wrap items-start justify-between gap-4"
                >
                  <div className="space-y-1 max-w-2xl">
                    <div className="flex items-center gap-2 text-sm font-semibold text-red-900">
                      <AlertTriangle className="w-4 h-4 text-red-700 shrink-0" />
                      <span>Critical Health Alert — {activePatient.name}</span>
                      <span className="text-xs font-normal font-mono text-red-700">
                        ({alert.source})
                      </span>
                    </div>
                    <p className="text-sm font-medium text-red-950">{alert.reason}</p>
                    <p className="text-xs text-red-900">{alert.guidance}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setSelectedDocumentId(alert.documentId)}
                      className="px-3 py-2 text-xs font-medium text-red-900 bg-white border border-red-200 rounded-lg hover:bg-red-100 whitespace-nowrap"
                    >
                      Open Report
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAckAlert(alert.id)}
                      className="px-3.5 py-2 text-xs font-medium text-white bg-red-700 rounded-lg hover:bg-red-800 whitespace-nowrap"
                    >
                      Acknowledge
                    </button>
                  </div>
                </div>
              ))}

              {/* Summary Strip (Overview only) */}
              {activeTab === 'overview' && (
                <div className="bg-white border border-slate-200 rounded-xl grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
                  <div className="p-5">
                    <div className="text-xs text-slate-500">Medical Reports</div>
                    <div className="text-2xl font-semibold font-mono tabular-nums text-slate-900 mt-1">
                      {patientDocuments.length}
                    </div>
                  </div>
                  <div className="p-5">
                    <div className="text-xs text-slate-500">Unacknowledged Alerts</div>
                    <div
                      className={`text-2xl font-semibold font-mono tabular-nums mt-1 ${
                        unacknowledgedAlerts.length > 0 ? 'text-red-700' : 'text-slate-900'
                      }`}
                    >
                      {unacknowledgedAlerts.length}
                    </div>
                  </div>
                  <div className="p-5">
                    <div className="text-xs text-slate-500">Visit Questions</div>
                    <div className="text-2xl font-semibold font-mono tabular-nums text-slate-900 mt-1">
                      {patientDoctorQuestions.filter((q) => !q.completed).length}
                    </div>
                  </div>
                  <div className="p-5">
                    <div className="text-xs text-slate-500">Authorized Family</div>
                    <div className="text-2xl font-semibold font-mono tabular-nums text-slate-900 mt-1">
                      {patientFamilyCount}
                    </div>
                  </div>
                </div>
              )}

              {/* Reports Table */}
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h1 className="text-base font-semibold text-slate-900">
                      Medical Documents — {activePatient.name}
                    </h1>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Upload via file or camera to inspect deterministic range classifications,
                      medicines, audio playback, and Q&amp;A
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setUploadOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-teal-800 bg-teal-50 border border-teal-200 rounded-lg hover:bg-teal-100 whitespace-nowrap"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>File or Camera Upload</span>
                  </button>
                </div>

                {patientDocuments.length === 0 ? (
                  <div className="p-10 text-center">
                    <FileCheck2 className="w-8 h-8 text-slate-400 mx-auto mb-3" />
                    <h3 className="text-sm font-semibold text-slate-900">
                      No Reports Uploaded for {activePatient.name}
                    </h3>
                    <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                      Upload a PDF, JPG, or PNG lab report, prescription, or capture one with your
                      camera.
                    </p>
                    <button
                      type="button"
                      onClick={() => setUploadOpen(true)}
                      className="mt-4 px-4 py-2 text-xs font-medium text-white bg-teal-700 rounded-lg hover:bg-teal-800"
                    >
                      Upload or Scan First Report
                    </button>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                          <th className="py-2.5 px-4">Document</th>
                          <th className="py-2.5 px-4">Category</th>
                          <th className="py-2.5 px-4">Report Date</th>
                          <th className="py-2.5 px-4">Findings</th>
                          <th className="py-2.5 px-4 text-right">Open</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 text-sm">
                        {patientDocuments.map((doc) => {
                          const docResults = workspace.testResults.filter(
                            (r) => r.documentId === doc.id
                          );
                          const docAlerts = workspace.alerts.filter(
                            (a) => a.documentId === doc.id
                          );
                          const abnormalCount = docResults.filter(
                            (r) => r.status === 'high' || r.status === 'low'
                          ).length;
                          const unclassifiedCount = docResults.filter(
                            (r) => r.status === 'unclassified'
                          ).length;

                          return (
                            <tr
                              key={doc.id}
                              onClick={() => setSelectedDocumentId(doc.id)}
                              className="hover:bg-slate-50 cursor-pointer transition-colors"
                            >
                              <td className="py-3 px-4">
                                <div className="font-medium text-slate-900">{doc.filename}</div>
                                <div className="text-xs text-slate-500 mt-0.5">
                                  {doc.fileType.toUpperCase()} · OCR {doc.ocrConfidence.toFixed(0)}%
                                </div>
                              </td>
                              <td className="py-3 px-4 text-xs text-slate-700">
                                {CATEGORY_TEXT[doc.documentCategory]}
                              </td>
                              <td className="py-3 px-4 font-mono tabular-nums text-xs text-slate-600">
                                {doc.reportDate || doc.uploadedAt.slice(0, 10)}
                              </td>
                              <td className="py-3 px-4 text-xs">
                                {docAlerts.length > 0 ? (
                                  <span className="font-semibold text-red-700">
                                    {docAlerts.length} critical alert
                                  </span>
                                ) : abnormalCount > 0 ? (
                                  <span className="font-medium text-amber-800">
                                    {abnormalCount} out of range
                                  </span>
                                ) : unclassifiedCount > 0 ? (
                                  <span className="text-slate-600">
                                    {unclassifiedCount} unclassified
                                  </span>
                                ) : (
                                  <span className="text-emerald-700 font-medium">
                                    {docResults.length > 0 ? 'All in range' : 'Processed'}
                                  </span>
                                )}
                              </td>
                              <td className="py-3 px-4 text-right">
                                <span className="inline-flex items-center gap-1 text-xs font-medium text-teal-700">
                                  <span>Inspect</span>
                                  <ChevronRight className="w-3.5 h-3.5" />
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Safety Verification Scenarios on Overview */}
              {activeTab === 'overview' && (
                <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">
                      Clinical Safety Verification Scenarios
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Test deterministic safety rules and file rejection gates directly against{' '}
                      {activePatient.name}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <button
                      type="button"
                      disabled={fixtureBusy !== null}
                      onClick={() => handleRunVerificationFixture('critical_hb')}
                      className="text-left p-4 border border-slate-200 rounded-lg hover:border-slate-300 hover:bg-slate-50 transition-colors disabled:opacity-50"
                    >
                      <div className="flex items-center gap-2 text-xs font-semibold text-red-800">
                        <ShieldAlert className="w-4 h-4 shrink-0" />
                        <span>Critical Red-Flag Rule</span>
                      </div>
                      <p className="text-xs text-slate-600 mt-1.5">
                        Simulate Hemoglobin 6.2 g/dL &amp; Potassium 6.7 mmol/L to verify
                        deterministic critical alert triggering.
                      </p>
                    </button>

                    <button
                      type="button"
                      disabled={fixtureBusy !== null}
                      onClick={() => handleRunVerificationFixture('missing_range')}
                      className="text-left p-4 border border-slate-200 rounded-lg hover:border-slate-300 hover:bg-slate-50 transition-colors disabled:opacity-50"
                    >
                      <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                        <FlaskConical className="w-4 h-4 text-teal-700 shrink-0" />
                        <span>Missing Reference Range</span>
                      </div>
                      <p className="text-xs text-slate-600 mt-1.5">
                        Verify that a test without a printed reference range is marked Unable to
                        Classify and never assumed normal.
                      </p>
                    </button>

                    <button
                      type="button"
                      disabled={fixtureBusy !== null}
                      onClick={() => handleRunVerificationFixture('non_medical_disguised')}
                      className="text-left p-4 border border-slate-200 rounded-lg hover:border-slate-300 hover:bg-slate-50 transition-colors disabled:opacity-50"
                    >
                      <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                        <Users className="w-4 h-4 text-amber-700 shrink-0" />
                        <span>Disguised File Rejection</span>
                      </div>
                      <p className="text-xs text-slate-600 mt-1.5">
                        Send a plain-text resume renamed as .pdf through magic-byte inspection to
                        verify immediate rejection.
                      </p>
                    </button>
                  </div>

                  {fixtureBusy && (
                    <div className="flex items-center gap-2 text-xs text-slate-600">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-700" />
                      <span>Running verification scenario...</span>
                    </div>
                  )}

                  {fixtureNotice && (
                    <div className="text-xs text-red-800 bg-red-50 border border-red-200 rounded-lg px-3.5 py-2.5">
                      {fixtureNotice.text}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      <UploadModal
        isOpen={uploadOpen}
        onClose={() => setUploadOpen(false)}
        patient={activePatient}
        language={language}
        readingLevel={readingLevel}
        onUploaded={async (docId) => {
          await fetchWorkspace();
          setSelectedDocumentId(docId);
          setActiveTab('reports');
        }}
        onAuditRefresh={fetchWorkspace}
      />
    </div>
  );
}
