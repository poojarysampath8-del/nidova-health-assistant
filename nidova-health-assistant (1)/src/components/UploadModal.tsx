import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Camera,
  FileUp,
  Loader2,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  X,
} from 'lucide-react';
import { apiFetch } from '../api';
import type { Language, PatientProfile, ReadingLevel } from '../types';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  patient: PatientProfile;
  language: Language;
  readingLevel: ReadingLevel;
  onUploaded: (documentId: string) => Promise<void>;
  onAuditRefresh: () => Promise<void>;
}

type UploadSourceMode = 'file' | 'camera';

export function UploadModal({
  isOpen,
  onClose,
  patient,
  language,
  readingLevel,
  onUploaded,
  onAuditRefresh,
}: UploadModalProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraFallbackInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [sourceMode, setSourceMode] = useState<UploadSourceMode>('file');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [capturedPreviewUrl, setCapturedPreviewUrl] = useState<string | null>(null);

  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const stopCameraStream = useCallback(() => {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  }, []);

  const startCameraStream = useCallback(
    async (mode: 'environment' | 'user') => {
      stopCameraStream();
      setCameraError(null);
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError(
          'Live camera preview is not supported in this browser. Use "Device Camera / Photo" below.'
        );
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: mode, width: { ideal: 1600 }, height: { ideal: 1200 } },
          audio: false,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setCameraActive(true);
      } catch {
        setCameraError(
          'Camera permission was declined or no camera hardware is attached. You can still capture a photo using the button below.'
        );
      }
    },
    [stopCameraStream]
  );

  useEffect(() => {
    if (!isOpen) {
      stopCameraStream();
      return;
    }
    if (sourceMode === 'camera' && !capturedPreviewUrl) {
      startCameraStream(facingMode);
    } else {
      stopCameraStream();
    }
  }, [isOpen, sourceMode, facingMode, capturedPreviewUrl, startCameraStream, stopCameraStream]);

  useEffect(() => {
    return () => {
      stopCameraStream();
      if (capturedPreviewUrl) URL.revokeObjectURL(capturedPreviewUrl);
    };
  }, [capturedPreviewUrl, stopCameraStream]);

  if (!isOpen) return null;

  const handleFilePick = (file: File | null, fromCameraFallback = false) => {
    setErrorMsg(null);
    setSelectedFile(file);
    if (capturedPreviewUrl) {
      URL.revokeObjectURL(capturedPreviewUrl);
      setCapturedPreviewUrl(null);
    }
    if (fromCameraFallback && file) {
      setCapturedPreviewUrl(URL.createObjectURL(file));
      stopCameraStream();
    }
  };

  const handleCapturePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.videoWidth === 0) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const fileName = `camera_report_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.jpg`;
        const file = new File([blob], fileName, { type: 'image/jpeg' });
        if (capturedPreviewUrl) URL.revokeObjectURL(capturedPreviewUrl);
        setCapturedPreviewUrl(URL.createObjectURL(blob));
        setSelectedFile(file);
        setErrorMsg(null);
        stopCameraStream();
      },
      'image/jpeg',
      0.92
    );
  };

  const handleRetake = () => {
    if (capturedPreviewUrl) URL.revokeObjectURL(capturedPreviewUrl);
    setCapturedPreviewUrl(null);
    setSelectedFile(null);
    setErrorMsg(null);
    startCameraStream(facingMode);
  };

  const handleModeSwitch = (nextMode: UploadSourceMode) => {
    setSourceMode(nextMode);
    setErrorMsg(null);
    setCameraError(null);
    if (capturedPreviewUrl) {
      URL.revokeObjectURL(capturedPreviewUrl);
      setCapturedPreviewUrl(null);
    }
    setSelectedFile(null);
  };

  const handleClose = () => {
    stopCameraStream();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setErrorMsg(
        sourceMode === 'camera'
          ? 'Please capture or select a camera photo of your report first.'
          : 'Please select a PDF, JPG, or PNG medical document.'
      );
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const formData = new FormData();
      formData.append('document', selectedFile);
      formData.append('patientId', patient.id);
      formData.append('language', language);
      formData.append('readingLevel', readingLevel);
      formData.append('sourceMode', sourceMode);

      const res = await apiFetch('/api/documents/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Document could not be processed.');
        await onAuditRefresh();
        return;
      }

      setSelectedFile(null);
      if (capturedPreviewUrl) {
        URL.revokeObjectURL(capturedPreviewUrl);
        setCapturedPreviewUrl(null);
      }
      stopCameraStream();
      await onUploaded(data.document.id);
      onClose();
    } catch {
      setErrorMsg('Network error while uploading document. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="upload-modal-title"
    >
      <div className="w-full max-w-xl bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2 id="upload-modal-title" className="text-base font-semibold text-slate-900">
              Upload Medical Report
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Patient profile: {patient.name} · PDF, JPG, PNG up to 15 MB
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            className="p-2 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition-colors"
            aria-label="Close upload dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Option 1 (File) vs Option 2 (Camera) */}
          <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => handleModeSwitch('file')}
              disabled={isSubmitting}
              className={`inline-flex items-center justify-center gap-2 py-2 px-3 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                sourceMode === 'file'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileUp className="w-3.5 h-3.5" />
              <span>1. Upload File</span>
            </button>
            <button
              type="button"
              onClick={() => handleModeSwitch('camera')}
              disabled={isSubmitting}
              className={`inline-flex items-center justify-center gap-2 py-2 px-3 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                sourceMode === 'camera'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              <span>2. Upload via Camera</span>
            </button>
          </div>

          {sourceMode === 'file' ? (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                const dropped = e.dataTransfer.files?.[0] || null;
                handleFilePick(dropped);
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                isDragging
                  ? 'border-teal-600 bg-teal-50/50'
                  : 'border-slate-300 hover:border-slate-400 bg-slate-50/60'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                onChange={(e) => handleFilePick(e.target.files?.[0] || null)}
                className="hidden"
              />
              <FileUp className="w-8 h-8 mx-auto text-teal-700 mb-3" />
              {selectedFile ? (
                <div>
                  <p className="text-sm font-medium text-slate-900 truncate max-w-xs mx-auto">
                    {selectedFile.name}
                  </p>
                  <p className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
                    {(selectedFile.size / 1024).toFixed(1)} KB · Click to change file
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-sm font-medium text-slate-900">
                    Drop a lab report, prescription, or discharge summary here
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Or click to browse PDF, JPG, or PNG files from your device
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <canvas ref={canvasRef} className="hidden" />
              <input
                ref={cameraFallbackInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => handleFilePick(e.target.files?.[0] || null, true)}
                className="hidden"
              />

              {capturedPreviewUrl ? (
                <div className="space-y-3">
                  <div className="border border-slate-200 rounded-lg overflow-hidden bg-slate-950 aspect-[4/3] flex items-center justify-center">
                    <img
                      src={capturedPreviewUrl}
                      alt="Captured medical report preview"
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-mono tabular-nums text-slate-600 truncate">
                      {selectedFile?.name} (
                      {selectedFile ? (selectedFile.size / 1024).toFixed(0) : 0} KB)
                    </span>
                    <button
                      type="button"
                      onClick={handleRetake}
                      disabled={isSubmitting}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Retake Photo</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="relative border border-slate-200 rounded-lg overflow-hidden bg-slate-900 aspect-[4/3] flex items-center justify-center">
                    <video
                      ref={videoRef}
                      playsInline
                      autoPlay
                      muted
                      className={`w-full h-full object-cover ${cameraActive ? 'block' : 'hidden'}`}
                    />
                    {!cameraActive && (
                      <div className="p-6 text-center space-y-3 max-w-sm">
                        <Camera className="w-8 h-8 text-slate-400 mx-auto" />
                        <p className="text-xs text-slate-300 leading-relaxed">
                          {cameraError || 'Starting live camera viewfinder...'}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleCapturePhoto}
                        disabled={!cameraActive || isSubmitting}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-teal-700 rounded-lg hover:bg-teal-800 disabled:opacity-50 whitespace-nowrap"
                      >
                        <Camera className="w-3.5 h-3.5" />
                        <span>Capture Photo</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setFacingMode((m) => (m === 'environment' ? 'user' : 'environment'))
                        }
                        disabled={isSubmitting}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Switch Camera</span>
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => cameraFallbackInputRef.current?.click()}
                      disabled={isSubmitting}
                      className="text-xs font-medium text-teal-800 hover:text-teal-950 underline underline-offset-2 whitespace-nowrap"
                    >
                      Use Device Camera App
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex items-start gap-2.5 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-3">
            <ShieldCheck className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
            <p>
              Uploads undergo magic-byte verification and medical-only screening. Non-medical
              documents or unrelated photos are rejected and never stored.
            </p>
          </div>

          {errorMsg && (
            <div className="flex items-start gap-2.5 text-xs text-red-800 bg-red-50 border border-red-200 rounded-lg p-3">
              <AlertCircle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
              <p>{errorMsg}</p>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !selectedFile}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-700 rounded-lg hover:bg-teal-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Analyzing Report...</span>
                </>
              ) : (
                <span>Analyze Report</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
