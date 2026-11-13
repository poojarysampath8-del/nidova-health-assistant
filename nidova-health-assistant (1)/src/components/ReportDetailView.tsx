import { useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  FileText,
  HelpCircle,
  Loader2,
  Pencil,
  Plus,
  Send,
  Trash2,
  Volume2,
} from 'lucide-react';
import { apiFetch } from '../api';
import type {
  ChatMessage,
  DocumentCategory,
  DoctorQuestion,
  HealthAlert,
  Language,
  MedicalDocument,
  MedicineRecord,
  ReadingLevel,
  ReportAnalysis,
  TestResult,
} from '../types';

interface ReportDetailViewProps {
  document: MedicalDocument;
  results: TestResult[];
  medicines: MedicineRecord[];
  alerts: HealthAlert[];
  analysis: ReportAnalysis | undefined;
  chatMessages: ChatMessage[];
  doctorQuestions: DoctorQuestion[];
  language: Language;
  readingLevel: ReadingLevel;
  onLanguageChange: (lang: Language) => void;
  onReadingLevelChange: (level: ReadingLevel) => void;
  onBack: () => void;
  onRefresh: () => Promise<void>;
  onDeleted: () => Promise<void>;
}

const CATEGORY_LABEL: Record<DocumentCategory, string> = {
  lab_report: 'Laboratory Report',
  prescription: 'Prescription',
  discharge_summary: 'Discharge Summary',
  unknown: 'Needs Confirmation',
};

export function ReportDetailView({
  document,
  results,
  medicines,
  alerts,
  analysis,
  chatMessages,
  doctorQuestions,
  language,
  readingLevel,
  onLanguageChange,
  onReadingLevelChange,
  onBack,
  onRefresh,
  onDeleted,
}: ReportDetailViewProps) {
  const [editingResultId, setEditingResultId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [showRawText, setShowRawText] = useState(false);

  const [regenerating, setRegenerating] = useState(false);
  const [audioLoading, setAudioLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);

  const [questionInput, setQuestionInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const savedQuestionSet = new Set(doctorQuestions.map((q) => q.question));

  const handleSaveEdit = async (resultId: string) => {
    const parsed = Number(editValue);
    if (Number.isNaN(parsed)) return;
    await apiFetch(`/api/test-results/${resultId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: parsed }),
    });
    setEditingResultId(null);
    await onRefresh();
  };

  const handleAckAlert = async (alertId: string) => {
    await apiFetch(`/api/alerts/${alertId}/acknowledge`, { method: 'POST' });
    await onRefresh();
  };

  const handleConfirmCategory = async (cat: DocumentCategory) => {
    await apiFetch(`/api/documents/${document.id}/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: cat }),
    });
    await onRefresh();
  };

  const handleRegenerate = async (targetLang = language, targetLevel = readingLevel) => {
    setRegenerating(true);
    setAudioUrl(null);
    try {
      await apiFetch(`/api/documents/${document.id}/regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: targetLang, readingLevel: targetLevel }),
      });
      await onRefresh();
    } finally {
      setRegenerating(false);
    }
  };

  const handleListenAudio = async () => {
    if (!analysis?.summary) return;
    setAudioLoading(true);
    setAudioError(null);
    try {
      const res = await apiFetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: analysis.summary, language: analysis.language }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setAudioError(err.error || 'Audio playback is unavailable.');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
    } catch {
      setAudioError('Unable to synthesize audio right now.');
    } finally {
      setAudioLoading(false);
    }
  };

  const handleAskQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!questionInput.trim() || chatLoading) return;
    setChatLoading(true);
    setChatError(null);
    try {
      const res = await apiFetch(`/api/documents/${document.id}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: questionInput.trim(),
          language,
          readingLevel,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setChatError(err.error || 'Unable to send question.');
        return;
      }
      setQuestionInput('');
      await onRefresh();
    } finally {
      setChatLoading(false);
    }
  };

  const handleSaveDoctorQuestion = async (q: string) => {
    if (savedQuestionSet.has(q)) return;
    await apiFetch('/api/doctor-questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        patientId: document.patientId,
        documentId: document.id,
        question: q,
      }),
    });
    await onRefresh();
  };

  const handleDeleteDocument = async () => {
    await apiFetch(`/api/documents/${document.id}`, { method: 'DELETE' });
    await onDeleted();
  };

  const renderStatus = (status: TestResult['status']) => {
    switch (status) {
      case 'normal':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            <span>Normal</span>
          </span>
        );
      case 'critical':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>Critical</span>
          </span>
        );
      case 'high':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-800">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>High</span>
          </span>
        );
      case 'low':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-800">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>Low</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-600">
            <HelpCircle className="w-3.5 h-3.5 shrink-0" />
            <span>Unable to Classify</span>
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 mb-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Reports</span>
          </button>
          <h1 className="text-xl font-semibold text-slate-900 break-all">{document.filename}</h1>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-1">
            <span>{CATEGORY_LABEL[document.documentCategory]}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              Report date: {document.reportDate || document.uploadedAt.slice(0, 10)}
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              OCR confidence: {document.ocrConfidence.toFixed(0)}%
            </span>
            {document.isUncertain && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-amber-700 font-medium">Low scan clarity — verify values</span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {document.storedFilename && (
            <button
              type="button"
              onClick={async () => {
                const res = await apiFetch(`/api/documents/${document.id}/file`);
                if (!res.ok) return;
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const link = window.document.createElement('a');
                link.href = url;
                link.download = document.filename;
                link.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Download Original</span>
            </button>
          )}
          {!confirmDelete ? (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-red-700 bg-white border border-red-200 rounded-lg hover:bg-red-50 transition-colors whitespace-nowrap"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete</span>
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleDeleteDocument}
                className="px-3 py-2 text-xs font-medium text-white bg-red-700 rounded-lg hover:bg-red-800 whitespace-nowrap"
              >
                Confirm Delete
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="px-3 py-2 text-xs font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Category confirmation if needed */}
      {document.status === 'needs_confirmation' && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
          <div className="text-sm text-amber-950">
            <span className="font-semibold">Confirm document type:</span> Please verify whether this
            file is a Laboratory Report, Prescription, or Discharge Summary.
          </div>
          <div className="flex items-center gap-2">
            {(['lab_report', 'prescription', 'discharge_summary'] as DocumentCategory[]).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => handleConfirmCategory(cat)}
                className="px-3 py-1.5 text-xs font-medium bg-white border border-amber-300 text-amber-950 rounded-lg hover:bg-amber-100 whitespace-nowrap"
              >
                {CATEGORY_LABEL[cat]}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Critical Red-Flag Alerts */}
      {alerts.map((alert) => (
        <div
          key={alert.id}
          className="bg-red-50 border border-red-300 rounded-xl p-5 flex flex-wrap items-start justify-between gap-4"
        >
          <div className="space-y-1 max-w-3xl">
            <div className="flex items-center gap-2 text-sm font-semibold text-red-900">
              <AlertTriangle className="w-4 h-4 text-red-700 shrink-0" />
              <span>Critical Finding</span>
              <span className="text-xs font-normal font-mono text-red-700">({alert.source})</span>
            </div>
            <p className="text-sm font-medium text-red-950">{alert.reason}</p>
            <p className="text-xs text-red-900">{alert.guidance}</p>
          </div>
          {!alert.acknowledged ? (
            <button
              type="button"
              onClick={() => handleAckAlert(alert.id)}
              className="px-3.5 py-2 text-xs font-medium text-white bg-red-700 rounded-lg hover:bg-red-800 transition-colors whitespace-nowrap shrink-0"
            >
              Acknowledge Alert
            </button>
          ) : (
            <span className="text-xs font-medium text-red-800">
              Acknowledged {alert.acknowledgedAt ? alert.acknowledgedAt.slice(0, 10) : ''}
            </span>
          )}
        </div>
      ))}

      {/* Main 2-column balanced clinical view */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left: Deterministic Extracted Tables */}
        <div className="xl:col-span-6 space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Extracted Laboratory Values
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Classified strictly by deterministic range checks · Click edit to verify any value
                </p>
              </div>
            </div>

            {results.length === 0 ? (
              <div className="p-6 text-sm text-slate-500">
                No structured numeric lab table rows were found in this document.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                      <th className="py-2.5 px-4">Test</th>
                      <th className="py-2.5 px-4 text-right">Value</th>
                      <th className="py-2.5 px-4 text-right">Ref Range</th>
                      <th className="py-2.5 px-4">Status</th>
                      <th className="py-2.5 px-4 text-right">Verify</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-sm">
                    {results.map((r) => {
                      const isEditing = editingResultId === r.id;
                      return (
                        <tr key={r.id} className="hover:bg-slate-50/70">
                          <td className="py-2.5 px-4">
                            <div className="font-medium text-slate-900">{r.rawName}</div>
                            {r.status === 'unclassified' && (
                              <div className="text-xs text-slate-500 mt-0.5">{r.flagReason}</div>
                            )}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                            {isEditing ? (
                              <input
                                type="number"
                                step="any"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                className="w-20 px-2 py-1 text-right text-xs border border-teal-600 rounded bg-white"
                                autoFocus
                              />
                            ) : (
                              <span className="font-medium text-slate-900">
                                {r.rawValue} {r.unit}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono tabular-nums text-xs text-slate-600 whitespace-nowrap">
                            {r.referenceMin !== null || r.referenceMax !== null
                              ? `${r.referenceMin ?? '?'} – ${r.referenceMax ?? '?'}`
                              : 'Missing'}
                          </td>
                          <td className="py-2.5 px-4 whitespace-nowrap">{renderStatus(r.status)}</td>
                          <td className="py-2.5 px-4 text-right whitespace-nowrap">
                            {isEditing ? (
                              <div className="inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleSaveEdit(r.id)}
                                  className="p-1 text-teal-700 hover:bg-teal-50 rounded"
                                  aria-label="Save corrected value"
                                >
                                  <Check className="w-4 h-4" />
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingResultId(r.id);
                                  setEditValue(r.value !== null ? String(r.value) : '');
                                }}
                                className="p-1 text-slate-500 hover:text-slate-900 rounded"
                                aria-label={`Edit ${r.rawName} value`}
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Medicines table (if prescription or medicines extracted) */}
          {(medicines.length > 0 || document.documentCategory === 'prescription') && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200">
                <h2 className="text-base font-semibold text-slate-900">
                  Extracted Medicines (Verbatim from Prescription)
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Never modify dosage or stop medications without consulting your prescribing doctor
                </p>
              </div>
              {medicines.length === 0 ? (
                <div className="p-6 text-sm text-slate-500">
                  No structured medicine lines extracted. Review original text below.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                        <th className="py-2.5 px-4">Medicine</th>
                        <th className="py-2.5 px-4">Strength</th>
                        <th className="py-2.5 px-4">Printed Instructions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-sm">
                      {medicines.map((m) => (
                        <tr key={m.id}>
                          <td className="py-2.5 px-4 font-medium text-slate-900">
                            {m.medicineName}
                            {m.isUnclear && (
                              <span className="block text-xs text-amber-700 font-normal">
                                Handwriting unclear — verify with pharmacist
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-4 font-mono tabular-nums text-xs text-slate-700">
                            {m.strength || '—'}
                          </td>
                          <td className="py-2.5 px-4 text-slate-700">{m.instructions || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Raw Extracted Text toggle */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setShowRawText((v) => !v)}
              className="w-full px-5 py-3.5 flex items-center justify-between text-left text-sm font-medium text-slate-800 hover:bg-slate-50 transition-colors"
            >
              <span>Source OCR Extracted Text</span>
              <span className="text-xs text-slate-500">{showRawText ? 'Hide' : 'Show'}</span>
            </button>
            {showRawText && (
              <pre className="px-5 pb-5 pt-2 text-xs font-mono text-slate-700 whitespace-pre-wrap border-t border-slate-200 bg-slate-50/50">
                {document.extractedText || 'No text extracted.'}
              </pre>
            )}
          </div>
        </div>

        {/* Right: Grounded AI Explanation, Audio, Doctor Questions, and Q&A */}
        <div className="xl:col-span-6 space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Plain-Language Explanation
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {analysis
                    ? `${analysis.language === 'kn' ? 'Kannada (ಕನ್ನಡ)' : 'English'} · ${analysis.readingLevel.charAt(0).toUpperCase() + analysis.readingLevel.slice(1)} reading level`
                    : 'Not yet generated'}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleListenAudio}
                  disabled={audioLoading || !analysis}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap"
                >
                  {audioLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Volume2 className="w-3.5 h-3.5 text-teal-700" />
                  )}
                  <span>{audioLoading ? 'Generating Audio...' : 'Listen'}</span>
                </button>
              </div>
            </div>

            {/* Reading level & language controls */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 border border-slate-200 rounded-lg p-3">
              <div className="flex items-center gap-1">
                {(['basic', 'standard', 'detailed'] as ReadingLevel[]).map((lvl) => (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => {
                      onReadingLevelChange(lvl);
                      handleRegenerate(language, lvl);
                    }}
                    disabled={regenerating}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                      readingLevel === lvl
                        ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {lvl.charAt(0).toUpperCase() + lvl.slice(1)}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1">
                {(
                  [
                    { id: 'en', label: 'English' },
                    { id: 'kn', label: 'ಕನ್ನಡ' },
                  ] as const
                ).map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => {
                      onLanguageChange(l.id);
                      handleRegenerate(l.id, readingLevel);
                    }}
                    disabled={regenerating}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                      language === l.id
                        ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </div>

            {audioUrl && (
              <div className="pt-1">
                <audio controls autoPlay src={audioUrl} className="w-full h-10" />
              </div>
            )}
            {audioError && <p className="text-xs text-red-700">{audioError}</p>}

            {regenerating ? (
              <div className="py-8 flex items-center justify-center gap-2 text-sm text-slate-500">
                <Loader2 className="w-4 h-4 animate-spin text-teal-700" />
                <span>Updating explanation for selected language and reading level...</span>
              </div>
            ) : (
              <div className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">
                {analysis?.summary || 'No explanation generated yet.'}
              </div>
            )}

            {/* Suggested Doctor Questions */}
            {analysis && analysis.suggestedQuestions.length > 0 && (
              <div className="pt-4 border-t border-slate-200 space-y-2.5">
                <h3 className="text-xs font-semibold text-slate-700">
                  Suggested Questions for Your Doctor
                </h3>
                <ul className="space-y-2">
                  {analysis.suggestedQuestions.map((q, i) => {
                    const isSaved = savedQuestionSet.has(q);
                    return (
                      <li
                        key={i}
                        className="flex items-start justify-between gap-3 text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-3"
                      >
                        <span className="leading-relaxed">{q}</span>
                        <button
                          type="button"
                          onClick={() => handleSaveDoctorQuestion(q)}
                          disabled={isSaved}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-teal-800 bg-white border border-slate-200 rounded hover:bg-teal-50 disabled:opacity-60 shrink-0 whitespace-nowrap"
                        >
                          {isSaved ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                          <span>{isSaved ? 'Saved' : 'Save'}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>

          {/* Grounded Report Q&A */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Ask About This Report</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Answers are grounded strictly in the extracted values and text of this document
              </p>
            </div>

            {chatMessages.length > 0 && (
              <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                {chatMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`p-3 rounded-lg text-sm leading-relaxed whitespace-pre-wrap ${
                      msg.role === 'user'
                        ? 'bg-slate-100 text-slate-900 ml-6'
                        : 'bg-white border border-slate-200 text-slate-800 mr-6'
                    }`}
                  >
                    <div className="text-xs font-semibold text-slate-500 mb-1">
                      {msg.role === 'user' ? 'You' : 'Nidova Health Assistant'}
                    </div>
                    {msg.content}
                  </div>
                ))}
              </div>
            )}

            <form onSubmit={handleAskQuestion} className="flex items-center gap-2">
              <input
                type="text"
                value={questionInput}
                onChange={(e) => setQuestionInput(e.target.value)}
                placeholder="e.g., What does HbA1c measure in this report?"
                className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
              <button
                type="submit"
                disabled={chatLoading || !questionInput.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-teal-700 rounded-lg hover:bg-teal-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
              >
                {chatLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                <span>Ask</span>
              </button>
            </form>
            {chatError && <p className="text-xs text-red-700">{chatError}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
