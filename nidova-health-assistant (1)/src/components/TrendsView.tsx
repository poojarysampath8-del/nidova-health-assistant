import { useMemo, useState } from 'react';
import { LineChart } from 'lucide-react';
import type { MedicalDocument, PatientProfile, TestResult, TrendPoint } from '../types';
import { TrendChart } from './TrendChart';

interface TrendsViewProps {
  patient: PatientProfile;
  documents: MedicalDocument[];
  testResults: TestResult[];
  onOpenUpload: () => void;
}

const DISPLAY_LABELS: Record<string, string> = {
  hemoglobin: 'Hemoglobin (Hb)',
  potassium: 'Potassium (K+)',
  sodium: 'Sodium (Na+)',
  glucose: 'Blood Glucose',
  platelets: 'Platelet Count',
  creatinine: 'Serum Creatinine',
  wbc: 'WBC Count',
  hba1c: 'HbA1c',
  tsh: 'TSH',
};

export function TrendsView({ patient, documents, testResults, onOpenUpload }: TrendsViewProps) {
  const docMap = useMemo(() => new Map(documents.map((d) => [d.id, d])), [documents]);

  const seriesByParam = useMemo(() => {
    const grouped = new Map<string, { label: string; points: TrendPoint[] }>();

    for (const r of testResults) {
      if (r.value === null) continue;
      const doc = docMap.get(r.documentId);
      if (!doc || doc.patientId !== patient.id) continue;

      const dateStr = doc.reportDate || doc.uploadedAt.slice(0, 10);
      const label = DISPLAY_LABELS[r.canonicalKey] || r.rawName;
      const existing = grouped.get(r.canonicalKey) || { label, points: [] };
      existing.points.push({
        date: dateStr,
        value: r.value,
        unit: r.unit,
        status: r.status,
        referenceMin: r.referenceMin,
        referenceMax: r.referenceMax,
        documentId: doc.id,
        filename: doc.filename,
      });
      grouped.set(r.canonicalKey, existing);
    }

    // Sort points chronologically and retain series with >= 1 measurement (highlight >= 2 for trends)
    const entries = Array.from(grouped.entries()).map(([key, data]) => {
      data.points.sort((a, b) => a.date.localeCompare(b.date));
      return { key, ...data };
    });

    entries.sort((a, b) => b.points.length - a.points.length);
    return entries;
  }, [docMap, patient.id, testResults]);

  const [selectedKey, setSelectedKey] = useState<string>(() => seriesByParam[0]?.key || '');

  const activeSeries =
    seriesByParam.find((s) => s.key === selectedKey) || seriesByParam[0] || null;

  if (seriesByParam.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
        <LineChart className="w-8 h-8 text-slate-400 mx-auto mb-3" />
        <h2 className="text-base font-semibold text-slate-900">No Longitudinal Lab Data Yet</h2>
        <p className="text-sm text-slate-600 max-w-md mx-auto mt-1.5">
          Upload two or more lab reports for {patient.name} to track how values such as Hemoglobin,
          Blood Glucose, or HbA1c change over time.
        </p>
        <button
          type="button"
          onClick={onOpenUpload}
          className="mt-5 px-4 py-2 text-sm font-medium text-white bg-teal-700 rounded-lg hover:bg-teal-800 transition-colors"
        >
          Upload Lab Report
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-slate-200">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Longitudinal Trends — {patient.name}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Compare normalized lab values across dates against printed reference intervals
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {seriesByParam.map((series) => {
              const active = series.key === activeSeries?.key;
              return (
                <button
                  key={series.key}
                  type="button"
                  onClick={() => setSelectedKey(series.key)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {series.label} ({series.points.length})
                </button>
              );
            })}
          </div>
        </div>

        {activeSeries && (
          <div className="pt-6 space-y-6">
            <TrendChart parameterLabel={activeSeries.label} points={activeSeries.points} />

            {activeSeries.points.length < 2 && (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3.5 py-2.5">
                Only 1 measurement is currently recorded for {activeSeries.label}. Upload an
                additional report from another date to plot a trend line.
              </p>
            )}

            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                    <th className="py-2.5 px-4">Report Date</th>
                    <th className="py-2.5 px-4">Source Document</th>
                    <th className="py-2.5 px-4 text-right">Measured Value</th>
                    <th className="py-2.5 px-4 text-right">Reference Range</th>
                    <th className="py-2.5 px-4">Deterministic Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-sm">
                  {activeSeries.points.map((pt, idx) => (
                    <tr key={`${pt.documentId}-${idx}`} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-4 font-mono tabular-nums text-xs text-slate-700">
                        {pt.date}
                      </td>
                      <td className="py-2.5 px-4 text-slate-900">{pt.filename}</td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums font-medium text-slate-900">
                        {pt.value} {pt.unit}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-xs text-slate-600">
                        {pt.referenceMin !== null || pt.referenceMax !== null
                          ? `${pt.referenceMin ?? '?'} – ${pt.referenceMax ?? '?'}`
                          : 'Missing'}
                      </td>
                      <td className="py-2.5 px-4 text-xs font-medium">
                        <span
                          className={
                            pt.status === 'normal'
                              ? 'text-emerald-700'
                              : pt.status === 'critical'
                                ? 'text-red-700'
                                : pt.status === 'unclassified'
                                  ? 'text-slate-600'
                                  : 'text-amber-700'
                          }
                        >
                          {pt.status === 'unclassified'
                            ? 'Unable to Classify'
                            : pt.status.charAt(0).toUpperCase() + pt.status.slice(1)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
