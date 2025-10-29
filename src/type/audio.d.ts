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
  transcriptPath?: string;
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

export interface Recording {
  id: string;
  fileName: string;
  date: string;
  title: string;
}

export interface RecordingsAPI {
  getRecordings: () => Promise<Recording[]>;
  getRecordingTranscript: (recordingId: string) => Promise<string>;
}

declare global {
  interface Window {
    audioCapture: AudioCaptureAPI;
    recordings: RecordingsAPI;
  }
}
