import type { TestStatus } from '../src/types.js';

export const RULES_VERSION = '1.0.0-draft-requires-clinical-review';

interface ThresholdRule {
  low?: number;
  high?: number;
  unit: string;
}

// Draft clinical thresholds requiring clinician sign-off before real-patient use (SR-04 / SR-11)
export const CRITICAL_THRESHOLDS: Record<string, ThresholdRule> = {
  hemoglobin: { low: 7.0, high: 20.0, unit: 'g/dL' },
  potassium: { low: 2.5, high: 6.5, unit: 'mmol/L' },
  sodium: { low: 120.0, high: 160.0, unit: 'mmol/L' },
  glucose: { low: 45.0, high: 450.0, unit: 'mg/dL' },
  platelets: { low: 20000.0, high: 1000000.0, unit: '/uL' },
  creatinine: { high: 5.0, unit: 'mg/dL' },
  wbc: { low: 1500.0, high: 30000.0, unit: '/uL' },
};

const CANONICAL_ALIASES: Record<string, string> = {
  hb: 'hemoglobin',
  haemoglobin: 'hemoglobin',
  hemoglobin: 'hemoglobin',
  'k+': 'potassium',
  potassium: 'potassium',
  'serum potassium': 'potassium',
  'na+': 'sodium',
  sodium: 'sodium',
  'serum sodium': 'sodium',
  'blood glucose': 'glucose',
  'fasting glucose': 'glucose',
  'fasting blood glucose': 'glucose',
  'random blood sugar': 'glucose',
  rbs: 'glucose',
  fbs: 'glucose',
  glucose: 'glucose',
  'platelet count': 'platelets',
  platelets: 'platelets',
  'serum creatinine': 'creatinine',
  creatinine: 'creatinine',
  wbc: 'wbc',
  'wbc count': 'wbc',
  'total wbc': 'wbc',
  'white blood cell count': 'wbc',
  hba1c: 'hba1c',
  'glycated hemoglobin': 'hba1c',
  tsh: 'tsh',
  'total cholesterol': 'total_cholesterol',
  ldl: 'ldl_cholesterol',
  'ldl cholesterol': 'ldl_cholesterol',
};

export function canonicalizeParameter(name: string): string {
  const clean = name.toLowerCase().trim().replace(/\s+/g, ' ');
  return CANONICAL_ALIASES[clean] ?? clean.replace(/\s+/g, '_');
}

export function formatParameterDisplayName(canonicalKey: string, fallbackRawName: string): string {
  const labels: Record<string, string> = {
    hemoglobin: 'Hemoglobin (Hb)',
    potassium: 'Potassium (K+)',
    sodium: 'Sodium (Na+)',
    glucose: 'Blood Glucose',
    platelets: 'Platelet Count',
    creatinine: 'Serum Creatinine',
    wbc: 'WBC Count',
    hba1c: 'HbA1c',
    tsh: 'TSH',
    total_cholesterol: 'Total Cholesterol',
    ldl_cholesterol: 'LDL Cholesterol',
  };
  return labels[canonicalKey] ?? fallbackRawName;
}

export function classifyTestValue(
  value: number | null,
  refMin: number | null,
  refMax: number | null,
  isUncertain = false
): { status: TestStatus; reason: string } {
  if (isUncertain || value === null || Number.isNaN(value)) {
    return {
      status: 'unclassified',
      reason: 'Extracted value is uncertain or unreadable; please verify against the original report.',
    };
  }

  if (refMin === null && refMax === null) {
    return {
      status: 'unclassified',
      reason: 'No reference range printed on the report. Never assumed normal (SR-03).',
    };
  }

  if (refMin !== null && value < refMin) {
    return {
      status: 'low',
      reason: `Value (${value}) is below the report reference minimum (${refMin}).`,
    };
  }

  if (refMax !== null && value > refMax) {
    return {
      status: 'high',
      reason: `Value (${value}) is above the report reference maximum (${refMax}).`,
    };
  }

  return {
    status: 'normal',
    reason: 'Value falls within the report reference range.',
  };
}

export interface RedFlagResult {
  severity: 'critical' | 'warning';
  source: string;
  reason: string;
  guidance: string;
}

export function evaluateRedFlags(
  rawName: string,
  value: number | null,
  rawText = ''
): RedFlagResult | null {
  if (value !== null && !Number.isNaN(value)) {
    const key = canonicalizeParameter(rawName);
    const rule = CRITICAL_THRESHOLDS[key];
    if (rule) {
      if (rule.low !== undefined && value <= rule.low) {
        return {
          severity: 'critical',
          source: `deterministic_rule:${RULES_VERSION}`,
          reason: `${rawName} is critically low (${value} <= ${rule.low} ${rule.unit}).`,
          guidance:
            'Please seek prompt medical evaluation or urgent care if you feel unwell. Do not wait for automated summaries.',
        };
      }
      if (rule.high !== undefined && value >= rule.high) {
        return {
          severity: 'critical',
          source: `deterministic_rule:${RULES_VERSION}`,
          reason: `${rawName} is critically high (${value} >= ${rule.high} ${rule.unit}).`,
          guidance:
            'Please seek prompt medical evaluation or urgent care if you feel unwell. Do not wait for automated summaries.',
        };
      }
    }
  }

  const lower = rawText.toLowerCase();
  if (
    lower.includes('critical value') ||
    lower.includes('panic value') ||
    lower.includes('critical high') ||
    lower.includes('critical low')
  ) {
    return {
      severity: 'critical',
      source: 'lab_reported',
      reason: 'The laboratory report explicitly states a critical or panic value.',
      guidance: 'Contact your doctor or nearest clinic immediately to review this flagged laboratory result.',
    };
  }

  return null;
}
