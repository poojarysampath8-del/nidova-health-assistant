export type DetectedFileType = 'pdf' | 'png' | 'jpeg';

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15 MB

export function validateUploadedBuffer(buffer: Buffer, originalName: string): DetectedFileType {
  if (!buffer || buffer.length === 0) {
    throw new Error('Uploaded file is empty.');
  }
  if (buffer.length > MAX_UPLOAD_BYTES) {
    throw new Error('File exceeds the 15 MB upload limit.');
  }

  // Magic-byte inspection (never trust file extensions alone — FR-03 / US-02)
  const isPdf = buffer.subarray(0, 5).toString('ascii') === '%PDF-';
  const isPng =
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a;
  const isJpeg =
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff;

  if (isPdf) return 'pdf';
  if (isPng) return 'png';
  if (isJpeg) return 'jpeg';

  throw new Error(
    `Rejected "${originalName}": unsupported or disguised file format. Only authentic PDF, JPG, JPEG, and PNG documents are accepted.`
  );
}
