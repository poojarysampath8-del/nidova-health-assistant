import { GoogleGenAI, Type } from '@google/genai';
import type { DocumentCategory, Language, ReadingLevel } from '../src/types.js';

function getAiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export interface ExtractedTestItem {
  rawName: string;
  value: number | null;
  rawValue: string;
  unit: string;
  referenceMin: number | null;
  referenceMax: number | null;
}

export interface ExtractedMedicineItem {
  medicineName: string;
  strength: string;
  instructions: string;
  isUnclear: boolean;
}

export interface DocumentExtractionResult {
  isMedical: boolean;
  category: DocumentCategory;
  needsConfirmation: boolean;
  rejectionReason: string;
  reportDate: string | null;
  ocrConfidence: number;
  isUncertain: boolean;
  extractedText: string;
  testResults: ExtractedTestItem[];
  medicines: ExtractedMedicineItem[];
}

const MIME_MAP = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpeg: 'image/jpeg',
} as const;

export async function extractAndClassifyDocument(
  buffer: Buffer,
  fileType: 'pdf' | 'png' | 'jpeg',
  filename: string
): Promise<DocumentExtractionResult> {
  const ai = getAiClient();
  if (!ai) {
    throw new Error('AI extraction service is unavailable because GEMINI_API_KEY is not configured.');
  }

  const base64Data = buffer.toString('base64');

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: MIME_MAP[fileType],
            data: base64Data,
          },
        },
        {
          text: `Analyze this uploaded file ("${filename}") for a medical report understanding system.
1. Determine if it is a genuine medical document (laboratory report, medical prescription, or hospital discharge summary). If it is a resume, invoice, receipt, random photo, ID card, or non-medical text, set isMedical to false and explain why in rejectionReason.
2. If medical, set category to "lab_report", "prescription", or "discharge_summary". Set needsConfirmation to true only if the medical category is ambiguous.
3. Transcribe the visible text faithfully into extractedText, estimate ocrConfidence (0-100), and set isUncertain to true if handwriting or scan quality makes numbers/names hard to read.
4. Extract reportDate in YYYY-MM-DD format if clearly printed, otherwise null.
5. Extract every lab test row into testResults. CRITICAL: Never invent referenceMin or referenceMax if they are not printed on the document — leave them null. Never invent missing numbers.
6. Extract any prescribed medicines into medicines. Mark isUnclear true if the medicine name or dosage is hard to read.`,
        },
      ],
    },
    config: {
      systemInstruction:
        'You are a strict clinical document parser. Extract only facts explicitly printed in the document. Never guess missing reference ranges or numeric values.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          isMedical: { type: Type.BOOLEAN },
          category: { type: Type.STRING },
          needsConfirmation: { type: Type.BOOLEAN },
          rejectionReason: { type: Type.STRING },
          reportDate: { type: Type.STRING, nullable: true },
          ocrConfidence: { type: Type.NUMBER },
          isUncertain: { type: Type.BOOLEAN },
          extractedText: { type: Type.STRING },
          testResults: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                rawName: { type: Type.STRING },
                value: { type: Type.NUMBER, nullable: true },
                rawValue: { type: Type.STRING },
                unit: { type: Type.STRING },
                referenceMin: { type: Type.NUMBER, nullable: true },
                referenceMax: { type: Type.NUMBER, nullable: true },
              },
              required: ['rawName', 'rawValue', 'unit'],
            },
          },
          medicines: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                medicineName: { type: Type.STRING },
                strength: { type: Type.STRING },
                instructions: { type: Type.STRING },
                isUnclear: { type: Type.BOOLEAN },
              },
              required: ['medicineName', 'strength', 'instructions', 'isUnclear'],
            },
          },
        },
        required: [
          'isMedical',
          'category',
          'needsConfirmation',
          'rejectionReason',
          'ocrConfidence',
          'isUncertain',
          'extractedText',
          'testResults',
          'medicines',
        ],
      },
    },
  });

  const parsed = JSON.parse(response.text ?? '{}') as Partial<DocumentExtractionResult>;
  const validCats: DocumentCategory[] = ['lab_report', 'prescription', 'discharge_summary', 'unknown'];
  const category: DocumentCategory = validCats.includes(parsed.category as DocumentCategory)
    ? (parsed.category as DocumentCategory)
    : 'unknown';

  return {
    isMedical: Boolean(parsed.isMedical),
    category,
    needsConfirmation: Boolean(parsed.needsConfirmation),
    rejectionReason: parsed.rejectionReason || 'Document does not contain supported medical content.',
    reportDate: parsed.reportDate && /^\d{4}-\d{2}-\d{2}$/.test(parsed.reportDate) ? parsed.reportDate : null,
    ocrConfidence: typeof parsed.ocrConfidence === 'number' ? parsed.ocrConfidence : 85,
    isUncertain: Boolean(parsed.isUncertain),
    extractedText: parsed.extractedText || '',
    testResults: Array.isArray(parsed.testResults) ? parsed.testResults : [],
    medicines: Array.isArray(parsed.medicines) ? parsed.medicines : [],
  };
}

const SYSTEM_SAFETY_PROMPT = `You are Nidova Health Assistant, a patient-friendly medical information explainer.
MANDATORY SAFETY RULES:
1. NEVER diagnose a disease or claim a test result confirms a condition (SR-01).
2. NEVER prescribe, discontinue, or change medication dosages or timings (SR-02).
3. ONLY use facts explicitly present in the extracted report text and deterministic rules output provided below.
4. NEVER invent missing numbers, units, or reference ranges. Preserve exact numbers and units (SR-07, SR-09).
5. Clearly separate "What your report states" from "Plain-language explanation".
6. If a reference range is missing or an OCR value is uncertain, state clearly that it cannot be automatically classified and advise checking the original document with a doctor.
7. Keep critical warnings prominent at every reading level.`;

const READING_LEVEL_GUIDE: Record<ReadingLevel, string> = {
  basic: 'Use simple, everyday words and short clear sentences. Avoid medical jargon.',
  standard: 'Use clear plain language while keeping original clinical parameter names in parentheses.',
  detailed: 'Provide structured educational explanations describing what each parameter measures and why clinicians review it.',
};

export async function generateGroundedSummary(params: {
  extractedText: string;
  deterministicFacts: string[];
  criticalAlerts: string[];
  language: Language;
  readingLevel: ReadingLevel;
}): Promise<{ summary: string; suggestedQuestions: string[]; modelVersion: string }> {
  const ai = getAiClient();
  const factsText =
    params.deterministicFacts.length > 0
      ? params.deterministicFacts.join('\n')
      : 'No structured numeric lab rows were extracted.';
  const alertsText =
    params.criticalAlerts.length > 0
      ? `CRITICAL ALERTS DETECTED BY DETERMINISTIC RULES:\n${params.criticalAlerts.join('\n')}\n`
      : '';

  if (!ai) {
    const fallbackSummary = `${alertsText}What your report states:\n${factsText}\n\nSimple explanation:\nAutomated AI narrative generation is currently offline, so only verified deterministic report facts and range flags are shown above. Please review these values with your doctor.`;
    return {
      summary: fallbackSummary,
      suggestedQuestions: [
        'Which of these results require follow-up or repeat testing?',
        'How do these values relate to my current symptoms or medicines?',
      ],
      modelVersion: 'deterministic-fallback',
    };
  }

  const languageInstruction =
    params.language === 'kn'
      ? 'Write the explanation in clear, natural Kannada (ಕನ್ನಡ), while preserving exact numeric values, units (e.g., g/dL, mg/dL, mmol/L), and English medicine/parameter names in parentheses for clarity.'
      : 'Write in clear, patient-friendly English.';

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `${alertsText}Reading Level: ${READING_LEVEL_GUIDE[params.readingLevel]}
Language: ${languageInstruction}

DETERMINISTIC EXTRACTED FACTS (AUTHORITATIVE):
${factsText}

ORIGINAL REPORT TEXT EXCERPT:
${params.extractedText.slice(0, 4000)}

Return JSON with:
- summary: Structured explanation containing "What your report states" and "Plain-language explanation" (keep within ~250-350 words).
- suggestedQuestions: 3 practical, non-diagnostic questions the patient can ask their doctor at their next visit.`,
    config: {
      systemInstruction: SYSTEM_SAFETY_PROMPT,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          summary: { type: Type.STRING },
          suggestedQuestions: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
        },
        required: ['summary', 'suggestedQuestions'],
      },
    },
  });

  const parsed = JSON.parse(response.text ?? '{}') as {
    summary?: string;
    suggestedQuestions?: string[];
  };

  return {
    summary: parsed.summary || factsText,
    suggestedQuestions: Array.isArray(parsed.suggestedQuestions) ? parsed.suggestedQuestions : [],
    modelVersion: 'gemini-4-hydrogen',
  };
}

export async function answerReportQuestion(params: {
  question: string;
  extractedText: string;
  deterministicFacts: string[];
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  language: Language;
  readingLevel: ReadingLevel;
}): Promise<string> {
  const ai = getAiClient();
  if (!ai) {
    return 'The AI assistant is currently unavailable because GEMINI_API_KEY is not configured. Please review the deterministic values and alerts directly.';
  }

  const historyLines = params.history
    .slice(-6)
    .map((m) => `${m.role === 'user' ? 'Patient' : 'Assistant'}: ${m.content}`)
    .join('\n');

  const languageInstruction =
    params.language === 'kn'
      ? 'Respond in Kannada (ಕನ್ನಡ) while keeping exact numeric values, units, and medicine names readable in English alongside.'
      : 'Respond in clear English.';

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `Reading Level: ${READING_LEVEL_GUIDE[params.readingLevel]}
Language: ${languageInstruction}

DETERMINISTIC REPORT FACTS:
${params.deterministicFacts.join('\n') || 'None extracted.'}

REPORT TEXT:
${params.extractedText.slice(0, 3500)}

CONVERSATION HISTORY:
${historyLines || 'No prior messages.'}

PATIENT QUESTION:
${params.question}

Answer strictly using the report context above. End with a brief reminder to consult their doctor for medical decisions.`,
    config: {
      systemInstruction: SYSTEM_SAFETY_PROMPT,
    },
  });

  return (
    response.text?.trim() ||
    'I could not generate an answer from the report context. Please verify this question with your doctor.'
  );
}

export async function synthesizeSpeechWav(text: string, language: Language): Promise<Buffer> {
  const ai = getAiClient();
  if (!ai) {
    throw new Error('Speech synthesis requires GEMINI_API_KEY to be configured.');
  }

  const cleanText = text.replace(/---/g, '').trim().slice(0, 2200);
  const style =
    language === 'kn'
      ? 'Calm, warm, clear healthcare narrator speaking Kannada and English medical terms clearly'
      : 'Calm, warm, clear healthcare narrator';

  const response = await ai.models.generateContent({
    model: 'gemini-3.8-flash-lite-tts',
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: cleanText,
            speechMetadata: { style },
          },
        ],
      },
    ],
    config: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: 'Kore' },
        },
      },
    },
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) {
    throw new Error('Speech model returned no audio data.');
  }

  return Buffer.from(base64Audio, 'base64');
}
