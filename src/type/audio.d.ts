export interface AudioSource {
  id: string;
  name: string;
  thumbnail: string;
}

export interface RecordingState {
  isRecording: boolean;
  isTranscribing: boolean;
  recordingDuration: number;
}

export interface TranscriptionResult {
  text: string;
  error?: string;
}

export interface TranscriptionProgress {
  status: "downloading" | "transcribing" | "complete" | "error";
  progress?: number;
  message?: string;
}

export interface AudioCaptureAPI {
  getAudioSources: () => Promise<AudioSource[]>;
  saveAudioFile: (audioBuffer: ArrayBuffer) => Promise<string>;
  transcribeAudio: (filePath: string) => Promise<TranscriptionResult>;
  onTranscriptionProgress: (
    callback: (progress: TranscriptionProgress) => void
  ) => void;
  removeTranscriptionProgressListener: () => void;
}

declare global {
  interface Window {
    audioCapture: AudioCaptureAPI;
  }
}
